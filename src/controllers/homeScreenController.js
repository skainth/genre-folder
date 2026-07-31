import { SOURCE_MODE } from '../logic/appConstants';

export function createHomeScreenController(deps) {
    const {
        supportsDirectoryPicker,
        pickDirectoryHandle,
        loadDirectoryTreeFromUri,
        isRemovableStorageRootPath,
        areSameFolderPaths,
        notify,
        sourceFolderRef,
        targetFolderRef,
        artifacts,
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
    } = deps;

    async function handleFolderSelection(kind) {
        if (kind !== 'source' && kind !== 'target') {
            notify('Invalid folder selection request. Please choose source or target.');
            return;
        }

        if (kind === 'source') {
            if (supportsDirectoryPicker()) {
                try {
                    const picked = await pickDirectoryHandle('read');

                    if (isRemovableStorageRootPath(picked.rootPath)) {
                        notify('Source folder cannot be on removable storage. Choose internal phone storage.');
                        return;
                    }

                    if (areSameFolderPaths(picked.rootPath, targetFolderRef.current)) {
                        notify('Source and target folders must be different. Choose another source folder.');
                        return;
                    }

                    setSourceFolderState(picked.rootPath);
                    setSourceFiles([]);
                    setSourceDirectory(picked);
                    setSourceMode(SOURCE_MODE.FILESYSTEM);
                    persistRuntimeFolders(picked.rootPath, targetFolderRef.current);

                    try {
                        const loaded = await loadDirectoryTreeFromUri(picked.rootPath);
                        setSourceFolderState(loaded.rootPath);
                        setSourceFiles(loaded.files);
                        setSourceDirectory({ handle: loaded.handle, rootPath: loaded.rootPath });
                        notify(`Selected ${loaded.files.length} file(s) from ${loaded.rootPath}`);
                    } catch (_loadError) {
                        notify(
                            `Source folder selected: ${picked.rootPath}. Could not read files yet; try selecting it again if needed.`
                        );
                    }
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

                if (areSameFolderPaths(sourceFolderRef.current, picked.rootPath)) {
                    notify('Source and target folders must be different. Choose another target folder.');
                    return;
                }

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

    return {
        handleFolderSelection,
        handlePreview,
        handleScanOnly,
        handleCancelPlan,
    };
}
