import { useMemo, useState } from 'react';
import { applyPlanWithProgress, scanAndPlan } from '../logic/organizer';
import { demoConfig } from '../logic/mockSourceFiles';
import { SCREEN, SOURCE_MODE } from '../logic/appConstants';
import { loadArtifacts, saveArtifacts } from '../logic/storage';
import {
    buildSyncDraft,
    createActivityLogEntry,
    mapFilesWithError,
    updateRunFromProgressEvent,
} from './progressHelpers';
import {
    copyFileToTarget,
    deleteFileFromTarget,
    pickDirectoryHandle,
    pickDirectoryTree,
    supportsDirectoryPicker,
} from '../logic/fileSystemAccess';
import { askPath, formatLastRunLabel, notify } from '../utils/uiHelpers';

function statsCount(stats, key) {
    return Object.keys((stats && stats[key]) || {}).length;
}

export function useOrganizerApp() {
    const initialArtifacts = useMemo(() => loadArtifacts(), []);

    const [sourceFolder, setSourceFolder] = useState('');
    const [targetFolder, setTargetFolder] = useState('');
    const [sourceFiles, setSourceFiles] = useState([]);
    const [sourceMode, setSourceMode] = useState(SOURCE_MODE.FILESYSTEM);
    const [targetDirectory, setTargetDirectory] = useState(null);
    const [artifacts, setArtifacts] = useState(initialArtifacts);
    const [lastRunText, setLastRunText] = useState(formatLastRunLabel(initialArtifacts.log));
    const [activeScreen, setActiveScreen] = useState(SCREEN.MAIN);
    const [syncProgress, setSyncProgress] = useState(null);
    const [activityLogs, setActivityLogs] = useState([]);

    const runtimeConfig = useMemo(
        () => ({
            ...demoConfig,
            source: sourceFolder,
            target: targetFolder,
        }),
        [sourceFolder, targetFolder]
    );

    const filesWithError = useMemo(() => {
        return mapFilesWithError(artifacts.stats?.parseStatErrors);
    }, [artifacts.stats]);

    const totalFilesCount = statsCount(artifacts.stats, 'filesToProcess');
    const changedCount = statsCount(artifacts.stats, 'changedFiles') + statsCount(artifacts.stats, 'newFiles');
    const upToDateCount = statsCount(artifacts.stats, 'unchangedFiles');
    const pendingDeleteCount = Object.keys(artifacts.todelete || {}).length;
    const pendingUpdateCount = Object.keys(artifacts.toupdate || {}).length;
    const liveApplyReady = sourceMode === SOURCE_MODE.FILESYSTEM && Boolean(targetDirectory?.handle);

    function persist(nextArtifacts) {
        setArtifacts(nextArtifacts);
        saveArtifacts(nextArtifacts);
        setLastRunText(formatLastRunLabel(nextArtifacts.log));
    }

    async function executeOperation(operation, sourceHandleMap, selectedTarget) {
        if (!selectedTarget || !selectedTarget.handle) {
            throw new Error('Target folder handle unavailable for filesystem operation.');
        }

        if (operation.type === 'copy') {
            const sourceFileHandle = sourceHandleMap.get(operation.sourcePath);
            if (!sourceFileHandle) {
                throw new Error(`Source handle unavailable for: ${operation.sourcePath}`);
            }

            await copyFileToTarget({
                sourceFileHandle,
                targetRootHandle: selectedTarget.handle,
                targetRootPath: selectedTarget.rootPath,
                targetPath: operation.targetPath,
            });
            return;
        }

        await deleteFileFromTarget({
            targetRootHandle: selectedTarget.handle,
            targetRootPath: selectedTarget.rootPath,
            targetPath: operation.targetPath,
        });
    }

    async function runApplyWithProgress(plannedAtStart) {
        const sourceHandleMap = new Map(
            sourceFiles
                .filter((item) => item?.sourceHandle)
                .map((item) => [item.filepath, item.sourceHandle])
        );

        const applied = await applyPlanWithProgress(artifacts, plannedAtStart, {
            executeOperation: (operation) => executeOperation(operation, sourceHandleMap, targetDirectory),
            onProgress: (event) => {
                setSyncProgress((previous) => {
                    if (!previous) {
                        return previous;
                    }
                    return updateRunFromProgressEvent(previous, event);
                });
            },
        });

        persist(applied);

        setSyncProgress((previous) => {
            if (!previous) {
                return previous;
            }

            const activity = createActivityLogEntry(previous, applied);
            setActivityLogs((previousLogs) => [activity, ...previousLogs].slice(0, 20));

            return {
                ...previous,
                isRunning: false,
                percentComplete: 100,
                completedOperations: previous.totalOperations,
                etaSeconds: 0,
            };
        });

        notify(
            `Apply complete. Copied ${applied.operations.copy.length} target file(s), deleted ${applied.operations.delete.length} target file(s), failed ${(applied.operations.failed || []).length} operation(s).`
        );
    }

    async function handleFolderSelection(kind) {
        if (kind === 'source') {
            if (supportsDirectoryPicker()) {
                try {
                    const picked = await pickDirectoryTree();
                    setSourceFolder(picked.rootPath);
                    setSourceFiles(picked.files);
                    setSourceMode(SOURCE_MODE.FILESYSTEM);
                    notify(`Selected ${picked.files.length} file(s) from ${picked.rootPath}`);
                } catch (error) {
                    if (String(error?.name || '') !== 'AbortError') {
                        notify(String(error?.message || error));
                    }
                }
                return;
            }

            const next = askPath('source folder', sourceFolder);
            if (next) {
                setSourceFolder(next);
                setSourceFiles([]);
                setSourceMode(SOURCE_MODE.MANUAL);
                notify('Manual path was set. Use folder picker mode for live filesystem sync.');
            }
            return;
        }

        if (supportsDirectoryPicker()) {
            try {
                const picked = await pickDirectoryHandle('readwrite');
                setTargetFolder(picked.rootPath);
                setTargetDirectory(picked);
                notify(`Selected target folder ${picked.rootPath}`);
            } catch (error) {
                if (String(error?.name || '') !== 'AbortError') {
                    notify(String(error?.message || error));
                }
            }
            return;
        }

        const next = askPath('target folder', targetFolder);
        if (next) {
            setTargetFolder(next);
            setTargetDirectory(null);
        }
    }

    function handlePreview() {
        if (sourceFiles.length === 0) {
            notify('No source files loaded. Pick a source folder using the folder picker.');
            return;
        }

        try {
            const planned = scanAndPlan(runtimeConfig, sourceFiles, artifacts);
            persist(planned);
        } catch (error) {
            notify(String(error?.message || error));
        }
    }

    function handleScanOnly() {
        handlePreview();
    }

    function handleCancelPlan() {
        const cleared = {
            ...artifacts,
            toupdate: {},
            todelete: {},
            updateFlag: null,
            log: [...(artifacts.log || []), `${new Date().toISOString()} plan cancelled`],
        };
        persist(cleared);
    }

    async function handleApply() {
        if (pendingUpdateCount === 0 && pendingDeleteCount === 0) {
            notify('No pending updates to apply. Run preview first.');
            return;
        }

        if (sourceMode !== SOURCE_MODE.FILESYSTEM || !targetDirectory?.handle) {
            notify(
                'Live file execution requires picker-selected source and destination folders. Select both folders with the picker before starting sync.'
            );
            return;
        }

        const plannedAtStart = {
            ...artifacts,
            toupdate: { ...(artifacts.toupdate || {}) },
            todelete: { ...(artifacts.todelete || {}) },
        };
        const draft = buildSyncDraft(plannedAtStart);
        setSyncProgress(draft);
        setActiveScreen(SCREEN.PROGRESS);

        try {
            await runApplyWithProgress(plannedAtStart);
        } catch (error) {
            setSyncProgress((previous) =>
                previous
                    ? {
                        ...previous,
                        isRunning: false,
                    }
                    : previous
            );
            notify(String(error?.message || error));
        }
    }

    function handleBackToMain() {
        if (syncProgress?.isRunning) {
            notify('Sync is still in progress.');
            return;
        }
        setActiveScreen(SCREEN.MAIN);
    }

    function handleViewLiveLog() {
        if (syncProgress?.isRunning && syncProgress.liveLogLines.length > 0) {
            notify(`${syncProgress.logFileName}\n${syncProgress.liveLogLines.join('\n')}`);
            return;
        }

        const latest = activityLogs[0];
        if (!latest) {
            notify('No sync log available yet.');
            return;
        }

        notify(`${latest.fileName}\n${latest.details.join('\n')}`);
    }

    return {
        activeScreen,
        syncProgress,
        activityLogs,
        sourceFolder,
        targetFolder,
        liveApplyReady,
        sourceMode,
        filesWithError,
        totalFilesCount,
        changedCount,
        upToDateCount,
        pendingDeleteCount,
        pendingUpdateCount,
        lastRunText,
        handleFolderSelection,
        handlePreview,
        handleScanOnly,
        handleCancelPlan,
        handleApply,
        handleBackToMain,
        handleViewLiveLog,
    };
}
