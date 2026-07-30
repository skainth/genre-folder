const DEFAULT_ALLOWED_EXTENSIONS = ['mp3', 'wma', 'flac', 'wav', 'aac'];

function nowIso() {
    return new Date().toISOString();
}

function normalizeExt(filePath) {
    const parts = String(filePath || '').split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function resolveAllowedExtensions(config) {
    const raw = config.allowedExtensions || config.allowedExtentions || DEFAULT_ALLOWED_EXTENSIONS;
    return raw.map((ext) => String(ext).toLowerCase());
}

function baseName(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const chunks = normalized.split('/');
    return chunks[chunks.length - 1] || normalized;
}

function normalizeFolderPath(pathPart) {
    return String(pathPart || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}

function makeTargetPath(targetRoot, folderPath, filePath) {
    const root = String(targetRoot || '').replace(/\/+$/, '');
    const folder = normalizeFolderPath(folderPath);
    const filename = baseName(filePath);
    if (!folder) {
        return `${root}/${filename}`;
    }
    return `${root}/${folder}/${filename}`;
}

function asArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === undefined || value === null) {
        return [];
    }
    return [value];
}

function makeCaseInsensitiveFolderLookup(genreToFolder) {
    const lookup = new Map();
    Object.entries(genreToFolder || {}).forEach(([key, value]) => {
        lookup.set(String(key).toLowerCase(), asArray(value).map((folder) => String(folder)));
    });
    return lookup;
}

export function parseGenre(rawGenre) {
    const values = asArray(rawGenre);
    const tokens = [];

    values.forEach((value) => {
        if (typeof value !== 'string') {
            return;
        }

        value
            .split(/[,;/]/g)
            .map((token) => token.trim())
            .filter(Boolean)
            .forEach((token) => tokens.push(token));
    });

    const deduped = [];
    const seen = new Set();
    tokens.forEach((token) => {
        const key = token.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(token);
        }
    });

    return deduped;
}

function resolveFoldersByGenreToken(genreToken, folderLookup) {
    const found = folderLookup.get(String(genreToken).toLowerCase());
    if (!found) {
        return [];
    }
    return found;
}

function resolveTargetsWithLookup(filePath, genres, targetRoot, folderLookup, fallbackValue) {
    const fallback = fallbackValue === undefined ? 'others' : fallbackValue;

    const folderTargets = [];
    genres.forEach((genreToken) => {
        const mappedFolders = resolveFoldersByGenreToken(genreToken, folderLookup);
        if (mappedFolders.length === 0) {
            asArray(fallback).forEach((folder) => folderTargets.push(folder));
            return;
        }
        mappedFolders.forEach((folder) => folderTargets.push(folder));
    });

    if (folderTargets.length === 0) {
        asArray(fallback).forEach((folder) => folderTargets.push(folder));
    }

    const uniqueTargets = [];
    const seen = new Set();
    folderTargets.forEach((folder) => {
        const targetPath = makeTargetPath(targetRoot, folder, filePath);
        if (!seen.has(targetPath)) {
            seen.add(targetPath);
            uniqueTargets.push(targetPath);
        }
    });

    return uniqueTargets;
}

export function resolveTargets(filePath, genres, config) {
    const genreToFolder = config.genreToFolder || {};
    const folderLookup = makeCaseInsensitiveFolderLookup(genreToFolder);
    const fallback = genreToFolder.Others || genreToFolder.others || 'others';
    return resolveTargetsWithLookup(filePath, genres, config.target, folderLookup, fallback);
}

export function validateConfig(config, knownSourceFiles = []) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        errors.push('Configuration is required.');
    }

    if (!config?.source || !String(config.source).trim()) {
        errors.push('source is required and must not be empty.');
    }

    if (!config?.target || !String(config.target).trim()) {
        errors.push('target is required and must not be empty.');
    }

    if (config?.source && knownSourceFiles.length === 0) {
        errors.push('source does not contain readable files.');
    }

    if (errors.length > 0) {
        const error = new Error(errors.join(' '));
        error.validationErrors = errors;
        throw error;
    }
}

function createEmptyStats() {
    return {
        filesToProcess: {},
        filesIgnored: {},
        newFiles: {},
        changedFiles: {},
        unchangedFiles: {},
        filesWithNoGenre: {},
        parseStatErrors: {},
        filesToDeleteFromTarget: {},
    };
}

function sortObjectByKey(obj) {
    return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {});
}

function buildMetadata(file) {
    const metadata = file.metadata || {};
    return {
        title: metadata.title || baseName(file.filepath),
        artist: asArray(metadata.artist).filter(Boolean),
        genre: parseGenre(metadata.genre),
        album: metadata.album || '',
    };
}

function createDbEntry(file, metadata, targets) {
    return {
        filepath: file.filepath,
        metadata,
        ctime: Number(file.ctime || 0),
        mtime: Number(file.mtime || file.ctime || 0),
        targets,
    };
}

function normalizeArtifacts(artifacts) {
    return {
        db: artifacts?.db || { files: {} },
        stats: artifacts?.stats || createEmptyStats(),
        toupdate: artifacts?.toupdate || {},
        todelete: artifacts?.todelete || {},
        updateFlag: artifacts?.updateFlag || null,
        log: artifacts?.log || [],
    };
}

function targetsDifference(previousTargets, nextTargets) {
    const nextSet = new Set((nextTargets || []).map((path) => String(path)));
    return (previousTargets || []).filter((path) => !nextSet.has(String(path)));
}

function addDeleteEntry(todelete, sourcePath, sourceEntry, targets) {
    if (!targets || targets.length === 0) {
        return;
    }

    const previous = todelete[sourcePath];
    if (!previous) {
        todelete[sourcePath] = {
            ...sourceEntry,
            targets: [...targets],
        };
        return;
    }

    const mergedTargets = [...(previous.targets || []), ...targets];
    const deduped = [];
    const seen = new Set();
    mergedTargets.forEach((target) => {
        const key = String(target);
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(key);
        }
    });

    todelete[sourcePath] = {
        ...previous,
        targets: deduped,
    };
}

export function scanAndPlan(config, sourceFiles, existingArtifacts) {
    const normalizedExisting = normalizeArtifacts(existingArtifacts);
    validateConfig(config, sourceFiles);

    const stats = createEmptyStats();
    const toupdate = {};
    const todelete = {};
    const nextDbFiles = {};
    const previousDbFiles = normalizedExisting.db.files || {};
    const allowed = resolveAllowedExtensions(config);
    const genreToFolder = config.genreToFolder || {};
    const folderLookup = makeCaseInsensitiveFolderLookup(genreToFolder);
    const fallback = genreToFolder.Others || genreToFolder.others || 'others';

    const discoveredPaths = new Set();
    const sortedSource = [...sourceFiles].sort((a, b) =>
        String(a.filepath).localeCompare(String(b.filepath))
    );

    sortedSource.forEach((file) => {
        const filePath = String(file.filepath || '');
        discoveredPaths.add(filePath);

        const ext = normalizeExt(filePath);
        if (!allowed.includes(ext)) {
            stats.filesIgnored[filePath] = `unsupported extension: ${ext || 'none'}`;
            return;
        }

        if (file.parseError) {
            stats.parseStatErrors[filePath] = String(file.parseError);
            if (previousDbFiles[filePath]) {
                nextDbFiles[filePath] = previousDbFiles[filePath];
            }
            return;
        }

        const metadata = buildMetadata(file);
        if (metadata.genre.length === 0) {
            stats.filesWithNoGenre[filePath] = true;
            if (previousDbFiles[filePath]) {
                nextDbFiles[filePath] = previousDbFiles[filePath];
            }
            return;
        }

        stats.filesToProcess[filePath] = true;

        const targets = resolveTargetsWithLookup(filePath, metadata.genre, config.target, folderLookup, fallback);
        const nextEntry = createDbEntry(file, metadata, targets);
        const prevEntry = previousDbFiles[filePath];

        nextDbFiles[filePath] = nextEntry;

        if (!prevEntry) {
            stats.newFiles[filePath] = true;
            toupdate[filePath] = nextEntry;
            return;
        }

        if (Number(prevEntry.mtime || 0) === nextEntry.mtime) {
            stats.unchangedFiles[filePath] = true;
            return;
        }

        stats.changedFiles[filePath] = true;
        toupdate[filePath] = nextEntry;

        const staleTargets = targetsDifference(prevEntry.targets, nextEntry.targets);
        addDeleteEntry(todelete, filePath, prevEntry, staleTargets);
    });

    Object.keys(previousDbFiles)
        .sort()
        .forEach((filePath) => {
            if (!discoveredPaths.has(filePath)) {
                stats.filesToDeleteFromTarget[filePath] = true;
                addDeleteEntry(todelete, filePath, previousDbFiles[filePath], previousDbFiles[filePath].targets || []);
            }
        });

    const updateCount = Object.keys(toupdate).length;
    const deleteCount = Object.keys(todelete).length;
    const hasPending = updateCount > 0 || deleteCount > 0;

    const logLine = `${nowIso()} scan-plan: process=${Object.keys(stats.filesToProcess).length} new=${Object.keys(
        stats.newFiles
    ).length} changed=${Object.keys(stats.changedFiles).length} unchanged=${Object.keys(
        stats.unchangedFiles
    ).length} ignored=${Object.keys(stats.filesIgnored).length} errors=${Object.keys(
        stats.parseStatErrors
    ).length} toUpdate=${updateCount} toDelete=${deleteCount}`;

    return {
        db: { files: sortObjectByKey(nextDbFiles) },
        stats: {
            filesToProcess: sortObjectByKey(stats.filesToProcess),
            filesIgnored: sortObjectByKey(stats.filesIgnored),
            newFiles: sortObjectByKey(stats.newFiles),
            changedFiles: sortObjectByKey(stats.changedFiles),
            unchangedFiles: sortObjectByKey(stats.unchangedFiles),
            filesWithNoGenre: sortObjectByKey(stats.filesWithNoGenre),
            parseStatErrors: sortObjectByKey(stats.parseStatErrors),
            filesToDeleteFromTarget: sortObjectByKey(stats.filesToDeleteFromTarget),
        },
        toupdate: sortObjectByKey(toupdate),
        todelete: sortObjectByKey(todelete),
        updateFlag: hasPending
            ? `pending updates: copy=${updateCount}, delete=${deleteCount}`
            : null,
        log: [...normalizedExisting.log, logLine],
    };
}

export function applyPlan(existingArtifacts, plannedArtifacts) {
    const previous = normalizeArtifacts(existingArtifacts);
    const planned = normalizeArtifacts(plannedArtifacts);

    const nextDbFiles = { ...(previous.db.files || {}) };
    const deleteOps = [];
    const copyOps = [];

    Object.keys(planned.todelete || {})
        .sort()
        .forEach((sourcePath) => {
            const entry = planned.todelete[sourcePath];
            delete nextDbFiles[sourcePath];
            (entry.targets || []).forEach((targetPath) => {
                deleteOps.push({ sourcePath, targetPath });
            });
        });

    Object.keys(planned.toupdate || {})
        .sort()
        .forEach((sourcePath) => {
            const entry = planned.toupdate[sourcePath];
            nextDbFiles[sourcePath] = entry;
            (entry.targets || []).forEach((targetPath) => {
                copyOps.push({ sourcePath, targetPath });
            });
        });

    const logLine = `${nowIso()} apply: copied=${copyOps.length} deleted=${deleteOps.length}`;

    return {
        db: { files: sortObjectByKey(nextDbFiles) },
        stats: planned.stats,
        toupdate: {},
        todelete: {},
        updateFlag: null,
        operations: {
            copy: copyOps,
            delete: deleteOps,
        },
        log: [...previous.log, logLine],
    };
}

function buildOperationsFromPlan(planned) {
    const operations = [];

    Object.keys(planned.todelete || {})
        .sort()
        .forEach((sourcePath) => {
            const entry = planned.todelete[sourcePath];
            (entry.targets || []).forEach((targetPath) => {
                operations.push({
                    type: 'delete',
                    sourcePath,
                    targetPath,
                });
            });
        });

    Object.keys(planned.toupdate || {})
        .sort()
        .forEach((sourcePath) => {
            const entry = planned.toupdate[sourcePath];
            (entry.targets || []).forEach((targetPath) => {
                operations.push({
                    type: 'copy',
                    sourcePath,
                    targetPath,
                });
            });
        });

    return operations;
}

function isComplete(status) {
    return status.ok >= status.total;
}

export async function applyPlanWithProgress(existingArtifacts, plannedArtifacts, options = {}) {
    const previous = normalizeArtifacts(existingArtifacts);
    const planned = normalizeArtifacts(plannedArtifacts);
    const executeOperation = options.executeOperation;
    const onProgress = options.onProgress;
    const operations = buildOperationsFromPlan(planned);
    const totalOperations = operations.length;
    const startedAt = Date.now();
    let completedOperations = 0;

    const copyStatusBySource = {};
    Object.keys(planned.toupdate || {}).forEach((sourcePath) => {
        const targets = (planned.toupdate[sourcePath]?.targets || []).length;
        copyStatusBySource[sourcePath] = { total: targets, ok: 0 };
    });

    const deleteStatusBySource = {};
    Object.keys(planned.todelete || {}).forEach((sourcePath) => {
        const targets = (planned.todelete[sourcePath]?.targets || []).length;
        deleteStatusBySource[sourcePath] = { total: targets, ok: 0 };
    });

    const copyOps = [];
    const deleteOps = [];
    const failedOps = [];

    for (let index = 0; index < operations.length; index += 1) {
        const operation = operations[index];
        const elapsedBefore = Date.now() - startedAt;
        const avgBefore = completedOperations > 0 ? elapsedBefore / completedOperations : 0;
        const etaBefore = Math.max(0, Math.round((avgBefore * (totalOperations - completedOperations)) / 1000));

        if (onProgress) {
            onProgress({
                phase: 'start',
                operation,
                index,
                completedOperations,
                totalOperations,
                percentComplete: totalOperations === 0 ? 100 : Math.round((completedOperations / totalOperations) * 100),
                etaSeconds: etaBefore,
            });
        }

        try {
            if (executeOperation) {
                await executeOperation(operation);
            }

            if (operation.type === 'copy') {
                copyOps.push({ sourcePath: operation.sourcePath, targetPath: operation.targetPath });
                if (copyStatusBySource[operation.sourcePath]) {
                    copyStatusBySource[operation.sourcePath].ok += 1;
                }
            } else {
                deleteOps.push({ sourcePath: operation.sourcePath, targetPath: operation.targetPath });
                if (deleteStatusBySource[operation.sourcePath]) {
                    deleteStatusBySource[operation.sourcePath].ok += 1;
                }
            }

            completedOperations += 1;
            const elapsedAfter = Date.now() - startedAt;
            const avgAfter = completedOperations > 0 ? elapsedAfter / completedOperations : 0;
            const etaAfter = Math.max(0, Math.round((avgAfter * (totalOperations - completedOperations)) / 1000));

            if (onProgress) {
                onProgress({
                    phase: 'finish',
                    operation,
                    index,
                    result: 'ok',
                    completedOperations,
                    totalOperations,
                    percentComplete: totalOperations === 0 ? 100 : Math.round((completedOperations / totalOperations) * 100),
                    etaSeconds: etaAfter,
                });
            }
        } catch (error) {
            completedOperations += 1;
            failedOps.push({
                ...operation,
                error: String(error?.message || error),
            });

            const elapsedAfter = Date.now() - startedAt;
            const avgAfter = completedOperations > 0 ? elapsedAfter / completedOperations : 0;
            const etaAfter = Math.max(0, Math.round((avgAfter * (totalOperations - completedOperations)) / 1000));

            if (onProgress) {
                onProgress({
                    phase: 'finish',
                    operation,
                    index,
                    result: 'failed',
                    error: String(error?.message || error),
                    completedOperations,
                    totalOperations,
                    percentComplete: totalOperations === 0 ? 100 : Math.round((completedOperations / totalOperations) * 100),
                    etaSeconds: etaAfter,
                });
            }
        }
    }

    const nextDbFiles = { ...(previous.db.files || {}) };
    const remainingToDelete = {};
    const remainingToUpdate = {};

    Object.keys(planned.todelete || {})
        .sort()
        .forEach((sourcePath) => {
            const status = deleteStatusBySource[sourcePath] || { total: 0, ok: 0 };
            if (status.total === 0 || isComplete(status)) {
                delete nextDbFiles[sourcePath];
                return;
            }
            remainingToDelete[sourcePath] = planned.todelete[sourcePath];
        });

    Object.keys(planned.toupdate || {})
        .sort()
        .forEach((sourcePath) => {
            const status = copyStatusBySource[sourcePath] || { total: 0, ok: 0 };
            if (status.total === 0 || isComplete(status)) {
                nextDbFiles[sourcePath] = planned.toupdate[sourcePath];
                return;
            }
            if (previous.db.files[sourcePath]) {
                nextDbFiles[sourcePath] = previous.db.files[sourcePath];
            }
            remainingToUpdate[sourcePath] = planned.toupdate[sourcePath];
        });

    const pendingCopyCount = Object.keys(remainingToUpdate).length;
    const pendingDeleteCount = Object.keys(remainingToDelete).length;
    const hasPending = pendingCopyCount > 0 || pendingDeleteCount > 0;
    const logLine = `${nowIso()} apply: copied=${copyOps.length} deleted=${deleteOps.length} failed=${failedOps.length}`;

    return {
        db: { files: sortObjectByKey(nextDbFiles) },
        stats: planned.stats,
        toupdate: sortObjectByKey(remainingToUpdate),
        todelete: sortObjectByKey(remainingToDelete),
        updateFlag: hasPending ? `pending updates: copy=${pendingCopyCount}, delete=${pendingDeleteCount}` : null,
        operations: {
            copy: copyOps,
            delete: deleteOps,
            failed: failedOps,
        },
        log: [...previous.log, logLine],
    };
}
