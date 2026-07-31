export function createProcessingScreenController(deps) {
    const {
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
    } = deps;

    async function handleApply() {
        if (isStartProcessing) {
            return;
        }

        setIsStartProcessing(true);
        setActiveScreen(SCREEN.PROGRESS);
        setSyncProgress(buildPreparingDraft(artifacts));

        await waitForNextFrame();

        try {
            const loadedSourceFiles = await ensureSourceFilesLoaded();
            if (loadedSourceFiles.length === 0) {
                setSyncProgress((previous) =>
                    previous
                        ? {
                            ...previous,
                            isRunning: false,
                            isPreparing: false,
                        }
                        : previous
                );
                notify('No source files loaded. Pick a source folder using the folder picker.');
                return;
            }

            let plannedArtifacts = artifacts;
            try {
                if (isRemovableStorageRootPath(sourceFolderRef.current)) {
                    setSyncProgress((previous) =>
                        previous
                            ? {
                                ...previous,
                                isRunning: false,
                                isPreparing: false,
                            }
                            : previous
                    );
                    notify('Source folder cannot be on removable storage. Choose internal phone storage.');
                    return;
                }

                if (areSameFolderPaths(sourceFolderRef.current, targetFolderRef.current)) {
                    setSyncProgress((previous) =>
                        previous
                            ? {
                                ...previous,
                                isRunning: false,
                                isPreparing: false,
                            }
                            : previous
                    );
                    notify('Source and target folders must be different before sync.');
                    return;
                }

                const planned = scanAndPlan(runtimeConfig, loadedSourceFiles, artifacts);
                persist(planned);
                plannedArtifacts = planned;

                const freshUpdates = Object.keys(planned.toupdate || {}).length;
                const freshDeletes = Object.keys(planned.todelete || {}).length;
                if (freshUpdates === 0 && freshDeletes === 0) {
                    setSyncProgress((previous) =>
                        previous
                            ? {
                                ...previous,
                                isRunning: false,
                                isPreparing: false,
                            }
                            : previous
                    );
                    notify('No pending updates to apply. Nothing changed.');
                    return;
                }
            } catch (error) {
                setSyncProgress((previous) =>
                    previous
                        ? {
                            ...previous,
                            isRunning: false,
                            isPreparing: false,
                        }
                        : previous
                );
                notify(String(error?.message || error));
                return;
            }

            if (sourceMode !== SOURCE_MODE.FILESYSTEM || !targetDirectory?.handle) {
                setSyncProgress((previous) =>
                    previous
                        ? {
                            ...previous,
                            isRunning: false,
                            isPreparing: false,
                        }
                        : previous
                );
                notify(
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

            try {
                await runApplyWithProgress(plannedAtStart, loadedSourceFiles);
            } catch (error) {
                setSyncProgress((previous) =>
                    previous
                        ? {
                            ...previous,
                            isRunning: false,
                            isPreparing: false,
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
        handleApply,
        handleBackToMain,
        handleViewLiveLog,
    };
}
