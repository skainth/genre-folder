function isDirectoryPickerSupported() {
    return (
        typeof globalThis !== 'undefined' &&
        typeof globalThis.showDirectoryPicker === 'function'
    );
}

function splitNameAndExt(filename) {
    const index = filename.lastIndexOf('.');
    if (index <= 0) {
        return { title: filename, ext: '' };
    }
    return {
        title: filename.slice(0, index),
        ext: filename.slice(index + 1).toLowerCase(),
    };
}

function inferGenreFromPath(relativePath) {
    const normalized = String(relativePath || '').toLowerCase();
    if (normalized.includes('hip-hop') || normalized.includes('hiphop') || normalized.includes('rap')) {
        return 'Hip-Hop';
    }
    if (normalized.includes('metal')) {
        return 'Metal';
    }
    if (normalized.includes('rock')) {
        return 'Rock';
    }
    if (normalized.includes('pop')) {
        return 'Pop';
    }
    return '';
}

async function readFileEntry(entry, rootPath, relativePath) {
    const file = await entry.getFile();
    const metadata = {
        title: splitNameAndExt(file.name).title,
        artist: [],
        genre: inferGenreFromPath(relativePath),
        album: '',
    };

    return {
        filepath: `${rootPath}/${relativePath}`,
        ctime: Number(file.lastModified || Date.now()),
        mtime: Number(file.lastModified || Date.now()),
        metadata,
        sourceHandle: entry,
    };
}

async function traverseDirectory(dirHandle, rootPath, currentRelativePath, files) {
    // Uses File System Access API handles to recursively enumerate the selected tree.
    for await (const entry of dirHandle.values()) {
        const relativePath = currentRelativePath
            ? `${currentRelativePath}/${entry.name}`
            : entry.name;

        if (entry.kind === 'directory') {
            await traverseDirectory(entry, rootPath, relativePath, files);
            continue;
        }

        if (entry.kind === 'file') {
            const item = await readFileEntry(entry, rootPath, relativePath);
            files.push(item);
        }
    }
}

export async function pickDirectoryTree() {
    if (!isDirectoryPickerSupported()) {
        throw new Error('Folder picker is not supported in this browser. Use a Chromium-based browser.');
    }

    const handle = await globalThis.showDirectoryPicker({ mode: 'read' });
    const rootPath = `/picked/${handle.name}`;
    const files = [];

    await traverseDirectory(handle, rootPath, '', files);

    return {
        handle,
        rootPath,
        files,
    };
}

export async function pickDirectoryHandle(mode = 'readwrite') {
    if (!isDirectoryPickerSupported()) {
        throw new Error('Folder picker is not supported in this browser. Use a Chromium-based browser.');
    }

    const handle = await globalThis.showDirectoryPicker({ mode });
    return {
        handle,
        rootPath: `/picked/${handle.name}`,
    };
}

function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

function toRelativePath(rootPath, absolutePath) {
    const root = normalizePath(rootPath).replace(/\/+$/, '');
    const full = normalizePath(absolutePath);
    if (!full.startsWith(`${root}/`) && full !== root) {
        throw new Error(`Path is outside selected root: ${absolutePath}`);
    }
    return full.slice(root.length).replace(/^\/+/, '');
}

async function ensureDirectory(rootHandle, parts) {
    let current = rootHandle;
    for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create: true });
    }
    return current;
}

export async function copyFileToTarget(params) {
    const { sourceFileHandle, targetRootHandle, targetRootPath, targetPath } = params;
    if (!sourceFileHandle || !targetRootHandle) {
        throw new Error('Missing source or target handle for copy operation.');
    }

    const relativeTarget = toRelativePath(targetRootPath, targetPath);
    const segments = relativeTarget.split('/').filter(Boolean);
    if (segments.length === 0) {
        throw new Error(`Invalid target path: ${targetPath}`);
    }

    const fileName = segments[segments.length - 1];
    const dirParts = segments.slice(0, -1);
    const targetDir = await ensureDirectory(targetRootHandle, dirParts);
    const targetFileHandle = await targetDir.getFileHandle(fileName, { create: true });

    const sourceFile = await sourceFileHandle.getFile();
    const writable = await targetFileHandle.createWritable();
    try {
        // Write the Blob directly to avoid loading large files fully into JS memory.
        await writable.write(sourceFile);
        await writable.close();
    } catch (error) {
        if (typeof writable.abort === 'function') {
            try {
                await writable.abort();
            } catch (_abortError) {
                // Ignore abort failure; the original write error is still the actionable failure.
            }
        }
        throw new Error(`Failed to copy ${sourceFile.name} to ${targetPath}: ${String(error?.message || error)}`);
    }
}

export async function deleteFileFromTarget(params) {
    const { targetRootHandle, targetRootPath, targetPath } = params;
    if (!targetRootHandle) {
        throw new Error('Missing target handle for delete operation.');
    }

    const relativeTarget = toRelativePath(targetRootPath, targetPath);
    const segments = relativeTarget.split('/').filter(Boolean);
    if (segments.length === 0) {
        return false;
    }

    const fileName = segments[segments.length - 1];
    const dirParts = segments.slice(0, -1);

    try {
        let parent = targetRootHandle;
        for (const part of dirParts) {
            parent = await parent.getDirectoryHandle(part);
        }
        await parent.removeEntry(fileName);
        return true;
    } catch (error) {
        const name = String(error?.name || '');
        if (name === 'NotFoundError') {
            return false;
        }
        throw new Error(`Failed to delete ${targetPath}: ${String(error?.message || error)}`);
    }
}

export function supportsDirectoryPicker() {
    return isDirectoryPickerSupported();
}
