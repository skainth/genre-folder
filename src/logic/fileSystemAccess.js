import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

function isNativeDirectoryPickerSupported() {
    return Platform.OS === 'android' && typeof Directory.pickDirectoryAsync === 'function';
}

function isDirectoryPickerSupported() {
    return isNativeDirectoryPickerSupported();
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
    const file = entry instanceof File ? entry : await entry.getFile();
    const metadata = {
        title: splitNameAndExt(file.name).title,
        artist: [],
        genre: inferGenreFromPath(relativePath),
        album: '',
    };

    const lastModified = Number(file.lastModified || file.modificationTime || Date.now());

    return {
        filepath: `${rootPath}/${relativePath}`,
        ctime: lastModified,
        mtime: lastModified,
        metadata,
        sourceHandle: entry,
    };
}

async function traverseNativeDirectory(directory, rootPath, currentRelativePath, files) {
    const entries = directory.list();
    for (const entry of entries) {
        const relativePath = currentRelativePath ? `${currentRelativePath}/${entry.name}` : entry.name;

        if (entry instanceof Directory) {
            await traverseNativeDirectory(entry, rootPath, relativePath, files);
            continue;
        }

        const item = await readFileEntry(entry, rootPath, relativePath);
        files.push(item);
    }
}

function directoryDisplayPath(directory) {
    const raw = String(directory?.uri || '');
    if (!raw) {
        return '';
    }
    return raw.replace(/\/+$/, '');
}

export async function pickDirectoryTree() {
    if (!isNativeDirectoryPickerSupported()) {
        throw new Error('Android directory picker is not available in this build.');
    }

    const directory = await Directory.pickDirectoryAsync();
    const rootPath = directoryDisplayPath(directory);
    const files = [];

    await traverseNativeDirectory(directory, rootPath, '', files);

    return {
        handle: directory,
        rootPath,
        files,
    };
}

export async function pickDirectoryHandle(mode = 'readwrite') {
    if (!isNativeDirectoryPickerSupported()) {
        throw new Error('Android directory picker is not available in this build.');
    }

    const directory = await Directory.pickDirectoryAsync();
    return {
        handle: directory,
        rootPath: directoryDisplayPath(directory),
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

    if (targetRootHandle instanceof Directory && sourceFileHandle instanceof File) {
        const relativeTarget = toRelativePath(targetRootPath, targetPath);
        const segments = relativeTarget.split('/').filter(Boolean);
        if (segments.length === 0) {
            throw new Error(`Invalid target path: ${targetPath}`);
        }

        const fileName = segments[segments.length - 1];
        const dirParts = segments.slice(0, -1);
        let targetDirectory = targetRootHandle;
        for (const part of dirParts) {
            targetDirectory = targetDirectory.createDirectory(part);
            targetDirectory.create({ idempotent: true, intermediates: true });
        }

        const destinationFile = new File(targetDirectory, fileName);
        await sourceFileHandle.copy(destinationFile, { overwrite: true });
        return;
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

    if (targetRootHandle instanceof Directory) {
        try {
            let parent = targetRootHandle;
            for (const part of dirParts) {
                parent = new Directory(parent, part);
            }
            const file = new File(parent, fileName);
            if (!file.exists) {
                return false;
            }
            file.delete();
            return true;
        } catch (error) {
            const name = String(error?.name || '');
            if (name === 'NotFoundError') {
                return false;
            }
            throw new Error(`Failed to delete ${targetPath}: ${String(error?.message || error)}`);
        }
    }

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
