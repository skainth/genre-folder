import { useEffect, useMemo, useRef, useState } from 'react';
import { applyPlanWithProgress, scanAndPlan } from '../logic/organizer';
import { defaultConfig } from '../logic/defaultConfig';
import { SCREEN, SOURCE_MODE } from '../logic/appConstants';
import { loadArtifacts, loadRuntimeConfig, saveArtifacts, saveRuntimeConfig } from '../logic/storage';
import {
    buildDirectoryHandleFromUri,
    copyFileToTarget,
    deleteFileFromTarget,
    isRemovableStorageRootPath,
    loadDirectoryTreeFromUri,
    pickDirectoryHandle,
    supportsDirectoryPicker,
} from '../logic/fileSystemAccess';
import {
    buildPreparingDraft,
    buildSyncDraft,
    createActivityLogEntry,
    mapFilesWithError,
    updateRunFromProgressEvent,
} from './progressHelpers';
import { createHomeScreenController } from './homeScreenController';
import { createProcessingScreenController } from './processingScreenController';
import { formatLastRunLabel, notify } from '../utils/uiHelpers';

function statsCount(stats, key) {
    return Object.keys((stats && stats[key]) || {}).length;
}

function waitForNextFrame() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
    });
}

function normalizeComparablePath(path) {
    return String(path || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/+$/, '')
        .toLowerCase();
}

function areSameFolderPaths(left, right) {
    const a = normalizeComparablePath(left);
    const b = normalizeComparablePath(right);
    return Boolean(a) && a === b;
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

        if (sourceFolderRef.current && isRemovableStorageRootPath(sourceFolderRef.current)) {
            setSourceFolderState('');
            setSourceDirectory(null);
            setSourceFiles([]);
            notify('Source folder cannot be on removable storage. Choose internal phone storage.');
        }

        if (areSameFolderPaths(sourceFolderRef.current, targetFolderRef.current)) {
            setTargetFolderState('');
            setTargetDirectory(null);
            notify('Source and target folders must be different. Target selection was cleared.');
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
            yieldToUI: waitForNextFrame,
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

    const homeController = createHomeScreenController({
        supportsDirectoryPicker,
        pickDirectoryHandle,
        isRemovableStorageRootPath,
        areSameFolderPaths,
        notify,
        sourceFolderRef,
        targetFolderRef,
        artifacts,
        sourceFiles,
        runtimeConfig,
        setSourceFolderState,
        setTargetFolderState,
        setSourceFiles,
        setSourceDirectory,
        setTargetDirectory,
        setSourceMode,
        persistRuntimeFolders,
        persist,
        scanAndPlan,
        ensureSourceFilesLoaded,
    });

    const processingController = createProcessingScreenController({
        SCREEN,
        SOURCE_MODE,
        isStartProcessing,
        setIsStartProcessing,
        setActiveScreen,
        setSyncProgress,
        syncProgress,
        activityLogs,
        artifacts,
        sourceMode,
        targetDirectory,
        sourceFolderRef,
        targetFolderRef,
        runtimeConfig,
        ensureSourceFilesLoaded,
        scanAndPlan,
        persist,
        buildPreparingDraft,
        buildSyncDraft,
        isRemovableStorageRootPath,
        areSameFolderPaths,
        waitForNextFrame,
        runApplyWithProgress,
        notify,
    });

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
        handleFolderSelection: homeController.handleFolderSelection,
        handlePreview: homeController.handlePreview,
        handleScanOnly: homeController.handleScanOnly,
        handleCancelPlan: homeController.handleCancelPlan,
        handleApply: processingController.handleApply,
        handleSyncNow: processingController.handleSyncNow,
        handleBackToMain: processingController.handleBackToMain,
        handleViewLiveLog: processingController.handleViewLiveLog,
    };
}
