import { useEffect, useMemo, useRef, useState } from 'react';
import { applyPlanWithProgress, scanAndPlan } from '../logic/organizer';
import { defaultConfig } from '../logic/defaultConfig';
import { SCREEN, SOURCE_MODE } from '../logic/appConstants';
import { loadArtifacts, loadRuntimeConfig, saveArtifacts, saveRuntimeConfig } from '../logic/storage';
import {
    buildDirectoryHandleFromUri,
    copyFileToTarget,
    deleteFileFromTarget,
    loadDirectoryTreeFromUri,
    pickDirectoryHandle,
    pickDirectoryTree,
    supportsDirectoryPicker,
} from '../logic/fileSystemAccess';
import {
    buildSyncDraft,
    createActivityLogEntry,
    mapFilesWithError,
    updateRunFromProgressEvent,
} from './progressHelpers';
import { formatLastRunLabel, notify } from '../utils/uiHelpers';

function statsCount(stats, key) {
    return Object.keys((stats && stats[key]) || {}).length;
}

export function useOrganizerApp() {
    const initialArtifacts = useMemo(() => loadArtifacts(), []);
    const initialRuntimeConfig = useMemo(() => loadRuntimeConfig(), []);

    const [sourceFolder, setSourceFolder] = useState(initialRuntimeConfig.sourceFolder);
    const [targetFolder, setTargetFolder] = useState(initialRuntimeConfig.targetFolder);
    const sourceFolderRef = useRef(String(initialRuntimeConfig.sourceFolder || '').trim());
    const targetFolderRef = useRef(String(initialRuntimeConfig.targetFolder || '').trim());

    const [sourceFiles, setSourceFiles] = useState([]);
    const [sourceMode, setSourceMode] = useState(SOURCE_MODE.FILESYSTEM);
    const [sourceDirectory, setSourceDirectory] = useState(null);
    const [targetDirectory, setTargetDirectory] = useState(null);
    const [artifacts, setArtifacts] = useState(initialArtifacts);
    const [lastRunText, setLastRunText] = useState(formatLastRunLabel(initialArtifacts.log));
    const [activeScreen, setActiveScreen] = useState(SCREEN.MAIN);
    const [syncProgress, setSyncProgress] = useState(null);
    const [activityLogs, setActivityLogs] = useState([]);
    const [isStartProcessing, setIsStartProcessing] = useState(false);

    const runtimeConfig = useMemo(
        () => ({
            ...defaultConfig,
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

    function persistRuntimeFolders(nextSourceFolder, nextTargetFolder) {
        saveRuntimeConfig({
            sourceFolder: String(nextSourceFolder || '').trim(),
            targetFolder: String(nextTargetFolder || '').trim(),
        });
    }

    function setSourceFolderState(nextSourceFolder) {
        const normalized = String(nextSourceFolder || '').trim();
        sourceFolderRef.current = normalized;
        setSourceFolder(normalized);
    }

    function setTargetFolderState(nextTargetFolder) {
        const normalized = String(nextTargetFolder || '').trim();
        targetFolderRef.current = normalized;
        setTargetFolder(normalized);
    }

    useEffect(() => {
        if (initialRuntimeConfig.sourceFolder) {
            try {
                const restoredSource = buildDirectoryHandleFromUri(initialRuntimeConfig.sourceFolder);
                setSourceDirectory(restoredSource);
                setSourceFolderState(restoredSource.rootPath);
                setSourceMode(SOURCE_MODE.FILESYSTEM);
            } catch (_error) {
                setSourceFolderState('');
            }
        }

        if (initialRuntimeConfig.targetFolder) {
            try {
                const restoredTarget = buildDirectoryHandleFromUri(initialRuntimeConfig.targetFolder);
                setTargetDirectory(restoredTarget);
                setTargetFolderState(restoredTarget.rootPath);
            } catch (_error) {
                setTargetFolderState('');
            }
        }

        persistRuntimeFolders(sourceFolderRef.current, targetFolderRef.current);
    }, [initialRuntimeConfig.sourceFolder, initialRuntimeConfig.targetFolder]);

    function persist(nextArtifacts) {
        setArtifacts(nextArtifacts);
        saveArtifacts(nextArtifacts);
        setLastRunText(formatLastRunLabel(nextArtifacts.log));
    }

    async function ensureSourceFilesLoaded() {
        if (sourceFiles.length > 0) {
            return sourceFiles;
        }

        const sourceRoot = String(sourceFolderRef.current || '').trim();
        if (!sourceRoot) {
            return [];
        }

        try {
            const loaded = await loadDirectoryTreeFromUri(sourceRoot);
            setSourceDirectory({ handle: loaded.handle, rootPath: loaded.rootPath });
            setSourceFolderState(loaded.rootPath);
            setSourceFiles(loaded.files);
            setSourceMode(SOURCE_MODE.FILESYSTEM);
            return loaded.files;
        } catch (_error) {
            return [];
        }
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

    async function runApplyWithProgress(plannedAtStart, sourceFilesAtStart) {
        const sourceHandleMap = new Map(
            sourceFilesAtStart
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
                    setSourceFolderState(picked.rootPath);
                    setSourceFiles(picked.files);
                    setSourceDirectory({ handle: picked.handle, rootPath: picked.rootPath });
                    setSourceMode(SOURCE_MODE.FILESYSTEM);
                    persistRuntimeFolders(picked.rootPath, targetFolderRef.current);
                    notify(`Selected ${picked.files.length} file(s) from ${picked.rootPath}`);
                } catch (error) {
                    if (String(error?.name || '') !== 'AbortError') {
                        notify(String(error?.message || error));
                    }
                }
                return;
            }

            notify('Source folder picking is unavailable on this device.');
            return;
        }

        if (supportsDirectoryPicker()) {
            try {
                const picked = await pickDirectoryHandle('readwrite');
                setTargetFolderState(picked.rootPath);
                setTargetDirectory(picked);
                persistRuntimeFolders(sourceFolderRef.current, picked.rootPath);
                notify(`Selected target folder ${picked.rootPath}`);
            } catch (error) {
                if (String(error?.name || '') !== 'AbortError') {
                    notify(String(error?.message || error));
                }
            }
            return;
        }

        notify('Target folder picking is unavailable on this device.');
    }

    async function handlePreview() {
        const loadedSourceFiles = await ensureSourceFilesLoaded();
        if (loadedSourceFiles.length === 0) {
            notify('No source files loaded. Pick a source folder using the folder picker.');
            return;
        }

        try {
            const planned = scanAndPlan(runtimeConfig, loadedSourceFiles, artifacts);
            persist(planned);

            const toUpdate = Object.keys(planned.toupdate || {}).length;
            const toDelete = Object.keys(planned.todelete || {}).length;
            if (toUpdate === 0 && toDelete === 0) {
                notify('Sync preview complete. No changes were detected.');
            } else {
                notify(`Sync preview complete. Ready to copy ${toUpdate} and delete ${toDelete}.`);
            }
        } catch (error) {
            notify(String(error?.message || error));
        }
    }

    function handleScanOnly() {
        void handlePreview();
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
        if (isStartProcessing) {
            return;
        }

        setIsStartProcessing(true);
        try {
            const loadedSourceFiles = await ensureSourceFilesLoaded();
            if (loadedSourceFiles.length === 0) {
                notify('No source files loaded. Pick a source folder using the folder picker.');
                return;
            }

            if (pendingUpdateCount === 0 && pendingDeleteCount === 0) {
                try {
                    const planned = scanAndPlan(runtimeConfig, loadedSourceFiles, artifacts);
                    persist(planned);

                    const freshUpdates = Object.keys(planned.toupdate || {}).length;
                    const freshDeletes = Object.keys(planned.todelete || {}).length;
                    if (freshUpdates === 0 && freshDeletes === 0) {
                        notify('No pending updates to apply. Nothing changed.');
                        return;
                    }
                } catch (error) {
                    notify(String(error?.message || error));
                    return;
                }
            }

            if (sourceMode !== SOURCE_MODE.FILESYSTEM || !targetDirectory?.handle) {
                notify(
                    'Live file execution requires picker-selected source and destination folders. Select both folders with the picker before starting sync.'
                );
                return;
            }

            const currentArtifacts = loadArtifacts();
            const plannedAtStart = {
                ...currentArtifacts,
                toupdate: { ...(currentArtifacts.toupdate || {}) },
                todelete: { ...(currentArtifacts.todelete || {}) },
            };
            const draft = buildSyncDraft(plannedAtStart);
            setSyncProgress(draft);
            setActiveScreen(SCREEN.PROGRESS);

            try {
                await runApplyWithProgress(plannedAtStart, loadedSourceFiles);
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
        } finally {
            setIsStartProcessing(false);
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
        isStartProcessing,
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
