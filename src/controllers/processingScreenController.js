export function createProcessingScreenController(deps) {
    const {
        SCREEN,
        SOURCE_MODE,
        isStartProcessing,
        setIsStartProcessing,
        setActiveScreen,
        setSyncProgress,
        syncProgress,
        pendingPlannedArtifactsRef,
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
    } = deps;

    function closePreparingStateWithMessage(message) {
        pendingPlannedArtifactsRef.current = null;
        setSyncProgress((previous) =>
            previous
                ? {
                    ...previous,
                    isRunning: false,
                    isPreparing: false,
                }
                : previous
        );
        notify(message);
    }

    async function handleApply() {
        if (isStartProcessing) {
            return;
        }

        setIsStartProcessing(true);
        setActiveScreen(SCREEN.PROGRESS);
        setSyncProgress(buildPreparingDraft(artifacts));

        await waitForNextFrame();
        await waitForNextFrame();

        try {
            const loadedSourceFiles = await ensureSourceFilesLoaded();
            if (loadedSourceFiles.length === 0) {
                closePreparingStateWithMessage('No source files loaded. Pick a source folder using the folder picker.');
                return;
            }

            let plannedArtifacts = artifacts;
            try {
                if (isRemovableStorageRootPath(sourceFolderRef.current)) {
                    closePreparingStateWithMessage('Source folder cannot be on removable storage. Choose internal phone storage.');
                    return;
                }

                if (areSameFolderPaths(sourceFolderRef.current, targetFolderRef.current)) {
                    closePreparingStateWithMessage('Source and target folders must be different before sync.');
                    return;
                }

                const planned = scanAndPlan(runtimeConfig, loadedSourceFiles, artifacts);
                pendingPlannedArtifactsRef.current = planned;
                plannedArtifacts = planned;

                const freshUpdates = Object.keys(planned.toupdate || {}).length;
                const freshDeletes = Object.keys(planned.todelete || {}).length;
                if (freshUpdates === 0 && freshDeletes === 0) {
                    closePreparingStateWithMessage('No pending updates to apply. Nothing changed.');
                    return;
                }
            } catch (error) {
                closePreparingStateWithMessage(String(error?.message || error));
                return;
            }

            if (sourceMode !== SOURCE_MODE.FILESYSTEM || !targetDirectory?.handle) {
                closePreparingStateWithMessage(
                    'Live file execution requires picker-selected source and destination folders. Select both folders with the picker before starting sync.'
                );
                return;
            }

            const plannedAtStart = {
                ...plannedArtifacts,
                toupdate: { ...(plannedArtifacts.toupdate || {}) },
                todelete: { ...(plannedArtifacts.todelete || {}) },
            };
            const draft = buildSyncDraft(plannedAtStart);
            setSyncProgress(draft);
            notify('Dry run ready. Review changed/deleted/error files, then tap Sync Now to apply changes.');
        } finally {
            setIsStartProcessing(false);
        }
    }

    async function handleSyncNow() {
        if (isStartProcessing) {
            return;
        }

        const currentArtifacts = pendingPlannedArtifactsRef.current || artifacts;
        const pendingUpdates = Object.keys(currentArtifacts.toupdate || {}).length;
        const pendingDeletes = Object.keys(currentArtifacts.todelete || {}).length;
        if (pendingUpdates === 0 && pendingDeletes === 0) {
            notify('No pending operations to sync. Run Start to create a dry-run plan first.');
            return;
        }

        if (sourceMode !== SOURCE_MODE.FILESYSTEM || !targetDirectory?.handle) {
            notify(
                'Live file execution requires picker-selected source and destination folders. Select both folders with the picker before syncing.'
            );
            return;
        }

        setIsStartProcessing(true);
        setSyncProgress((previous) =>
            previous
                ? {
                    ...previous,
                    isRunning: true,
                    isPreparing: false,
                    isDryRun: false,
                    currentOperation: null,
                    completedOperations: 0,
                    percentComplete: 0,
                    etaSeconds: previous.totalOperations,
                }
                : previous
        );

        try {
            const loadedSourceFiles = await ensureSourceFilesLoaded();
            if (loadedSourceFiles.length === 0) {
                closePreparingStateWithMessage('No source files loaded. Pick a source folder using the folder picker.');
                return;
            }

            const plannedAtStart = {
                ...currentArtifacts,
                toupdate: { ...(currentArtifacts.toupdate || {}) },
                todelete: { ...(currentArtifacts.todelete || {}) },
            };

            await runApplyWithProgress(plannedAtStart, loadedSourceFiles);
        } catch (error) {
            closePreparingStateWithMessage(String(error?.message || error));
        } finally {
            setIsStartProcessing(false);
        }
    }

    function handleBackToMain() {
        if (syncProgress?.isRunning) {
            notify('Sync is still in progress.');
            return;
        }
        pendingPlannedArtifactsRef.current = null;
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
        handleApply,
        handleSyncNow,
        handleBackToMain,
        handleViewLiveLog,
    };
}
