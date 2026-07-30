function fileNameFromPath(filePath) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const chunks = normalized.split('/');
    return chunks[chunks.length - 1] || normalized;
}

function toPathLines(targets) {
    return (targets || []).map((path) => String(path));
}

function nowIso() {
    return new Date().toISOString();
}

function makeLogFileName() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(
        now.getMinutes()
    )}${pad(now.getSeconds())}`;
    return `sync_log_${stamp}.txt`;
}

export function mapFilesWithError(parseStatErrors) {
    return Object.entries(parseStatErrors || {}).map(([path, error]) => ({
        path,
        name: fileNameFromPath(path),
        error: String(error),
    }));
}

export function buildSyncDraft(currentArtifacts) {
    const copyEntries = Object.values(currentArtifacts.toupdate || {});
    const deleteEntries = Object.values(currentArtifacts.todelete || {});

    const copyItems = [];
    copyEntries.forEach((entry, index) => {
        copyItems.push({
            id: `copy-${index}`,
            fileName: entry.metadata?.title ? `${entry.metadata.title}.mp3` : fileNameFromPath(entry.filepath),
            sourcePath: entry.filepath,
            destinationPaths: toPathLines(entry.targets),
            totalTargets: (entry.targets || []).length,
            completedTargets: 0,
            failedTargets: 0,
            multiTarget: (entry.targets || []).length > 1,
            status: 'queued',
            errors: [],
        });
    });

    const deletedFromSource = currentArtifacts.stats?.filesToDeleteFromTarget || {};
    const deleteItems = [];
    deleteEntries.forEach((entry, index) => {
        const sourcePath = entry.filepath;
        const reason = deletedFromSource[sourcePath] ? 'Gone in source / source deleted' : 'Genre mapping changed';
        const targetPaths = toPathLines(entry.targets);

        if (targetPaths.length === 0) {
            deleteItems.push({
                id: `delete-${index}-0`,
                fileName: entry.metadata?.title ? `${entry.metadata.title}.mp3` : fileNameFromPath(sourcePath),
                removedFromPath: sourcePath,
                reason,
                status: 'pending',
                error: '',
            });
            return;
        }

        targetPaths.forEach((path, targetIndex) => {
            deleteItems.push({
                id: `delete-${index}-${targetIndex}`,
                fileName: entry.metadata?.title ? `${entry.metadata.title}.mp3` : fileNameFromPath(sourcePath),
                removedFromPath: path,
                reason,
                status: 'pending',
                error: '',
            });
        });
    });

    const totalOperations = copyItems.length + deleteItems.length;
    return {
        runId: `sync-${Date.now()}`,
        startedAt: new Date().toISOString(),
        logFileName: makeLogFileName(),
        totalOperations,
        completedOperations: 0,
        percentComplete: 0,
        etaSeconds: totalOperations,
        isRunning: true,
        copyItems,
        deleteItems,
        liveLogLines: [],
    };
}

function updateProgressMeta(run, event) {
    return {
        ...run,
        completedOperations: event.completedOperations,
        totalOperations: event.totalOperations,
        percentComplete: event.percentComplete,
        etaSeconds: event.etaSeconds,
    };
}

function progressLogLine(event) {
    const prefix = `${nowIso()} ${event.operation.type.toUpperCase()} ${event.operation.sourcePath} -> ${event.operation.targetPath}`;
    if (event.phase === 'start') {
        return `${prefix} [START]`;
    }
    if (event.result === 'failed') {
        return `${prefix} [FAILED] ${event.error || 'operation failed'}`;
    }
    return `${prefix} [OK]`;
}

function updateCopyItemFromEvent(item, event) {
    if (item.sourcePath !== event.operation.sourcePath) {
        return item;
    }

    if (event.phase === 'start') {
        return {
            ...item,
            status: 'syncing',
        };
    }

    if (event.result === 'failed') {
        const failedTargets = item.failedTargets + 1;
        const done = item.completedTargets + failedTargets >= item.totalTargets;
        return {
            ...item,
            failedTargets,
            status: done ? 'failed' : 'syncing',
            errors: [...(item.errors || []), String(event.error || 'operation failed')],
        };
    }

    const completedTargets = item.completedTargets + 1;
    const done = completedTargets + item.failedTargets >= item.totalTargets;
    return {
        ...item,
        completedTargets,
        status: done ? 'completed' : 'syncing',
    };
}

function updateDeleteItemFromEvent(item, event) {
    if (item.removedFromPath !== event.operation.targetPath) {
        return item;
    }

    if (event.phase === 'start') {
        return {
            ...item,
            status: 'pending',
        };
    }

    return {
        ...item,
        status: event.result === 'failed' ? 'failed' : 'deleted',
        error: event.result === 'failed' ? String(event.error || 'operation failed') : '',
    };
}

export function updateRunFromProgressEvent(previous, event) {
    const next = updateProgressMeta(previous, event);

    if (event.operation.type === 'copy') {
        return {
            ...next,
            copyItems: next.copyItems.map((item) => updateCopyItemFromEvent(item, event)),
            liveLogLines: [...next.liveLogLines, progressLogLine(event)],
        };
    }

    return {
        ...next,
        deleteItems: next.deleteItems.map((item) => updateDeleteItemFromEvent(item, event)),
        liveLogLines: [...next.liveLogLines, progressLogLine(event)],
    };
}

export function createActivityLogEntry(run, appliedArtifacts) {
    return {
        id: run.runId,
        timestamp: new Date().toISOString(),
        fileName: run.logFileName,
        summary: `copied=${appliedArtifacts.operations.copy.length}, deleted=${appliedArtifacts.operations.delete.length}, failed=${(
            appliedArtifacts.operations.failed || []
        ).length}`,
        details: run.liveLogLines,
    };
}
