import { SOURCE_MODE } from '../logic/appConstants';

export function createHomeScreenController(deps) {
    const {
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
                    notify(`Selected source folder ${picked.rootPath}. Files will be read when Start is pressed.`);
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
        if (!sourceFolderRef.current) {
            notify('No source folder selected. Pick a source folder first.');
            return;
        }

        if (!targetFolderRef.current) {
            notify('No target folder selected. Pick a target folder first.');
            return;
        }

        if ((sourceFiles || []).length === 0) {
            notify('Source files are loaded only when Start is pressed. Press Start to read and process files.');
            return;
        }

        try {
            const planned = scanAndPlan(runtimeConfig, sourceFiles, artifacts);
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
