import { Directory, File, Paths } from 'expo-file-system';

const STORAGE_DIR = new Directory(Paths.document, 'mp3-sorter');
const STORAGE_FILE = new File(STORAGE_DIR, 'artifacts.json');
const CONFIG_DIR = new Directory(Paths.document, 'mp3-sorter-config');
const CONFIG_FILE = new File(CONFIG_DIR, 'runtime-config.json');
const LEGACY_RUNTIME_CONFIG_FILE = new File(STORAGE_DIR, 'runtime-config.json');
const CONFIG_PATH_LABEL = 'Documents/mp3-sorter-config/runtime-config.json';

let runtimeConfigReadError = '';
let runtimeConfigWriteError = '';

function createDefaultArtifacts() {
    return {
        db: { files: {} },
        stats: null,
        toupdate: {},
        todelete: {},
        updateFlag: null,
        log: [],
    };
}

function sanitizeArtifacts(artifacts) {
    return {
        db: artifacts?.db || { files: {} },
        stats: artifacts?.stats || null,
        toupdate: artifacts?.toupdate || {},
        todelete: artifacts?.todelete || {},
        updateFlag: artifacts?.updateFlag || null,
        log: artifacts?.log || [],
    };
}

function createDefaultRuntimeConfig() {
    return {
        sourceFolder: '',
        targetFolder: '',
    };
}

function sanitizeRuntimeConfig(config) {
    return {
        sourceFolder: String(config?.sourceFolder || '').trim(),
        targetFolder: String(config?.targetFolder || '').trim(),
    };
}

export function loadArtifacts() {
    try {
        if (!STORAGE_FILE.exists) {
            return createDefaultArtifacts();
        }

        const raw = STORAGE_FILE.textSync();
        if (!raw) {
            return createDefaultArtifacts();
        }

        const parsed = JSON.parse(raw);
        return sanitizeArtifacts(parsed);
    } catch (_error) {
        return createDefaultArtifacts();
    }
}

export function saveArtifacts(artifacts) {
    try {
        const normalized = sanitizeArtifacts(artifacts);

        if (!STORAGE_DIR.exists) {
            STORAGE_DIR.create({ idempotent: true, intermediates: true });
        }

        STORAGE_FILE.write(JSON.stringify(normalized));
    } catch (_error) {
        // Ignore storage errors; app can continue in memory for the current session.
    }
}

export function loadRuntimeConfig() {
    runtimeConfigReadError = '';

    try {
        if (CONFIG_FILE.exists) {
            const raw = CONFIG_FILE.textSync();
            if (!raw) {
                return createDefaultRuntimeConfig();
            }

            const parsed = JSON.parse(raw);
            return sanitizeRuntimeConfig(parsed);
        }

        if (!LEGACY_RUNTIME_CONFIG_FILE.exists) {
            return createDefaultRuntimeConfig();
        }

        const raw = LEGACY_RUNTIME_CONFIG_FILE.textSync();
        if (!raw) {
            return createDefaultRuntimeConfig();
        }

        const parsed = JSON.parse(raw);
        return sanitizeRuntimeConfig(parsed);
    } catch (error) {
        runtimeConfigReadError = `Runtime config is not readable (${CONFIG_PATH_LABEL}). ${String(error?.message || error)}`;
        return createDefaultRuntimeConfig();
    }
}

export function saveRuntimeConfig(config) {
    runtimeConfigWriteError = '';

    try {
        const normalized = sanitizeRuntimeConfig(config);

        if (!CONFIG_DIR.exists) {
            CONFIG_DIR.create({ idempotent: true, intermediates: true });
        }

        CONFIG_FILE.write(JSON.stringify(normalized));
        return true;
    } catch (error) {
        runtimeConfigWriteError = `Runtime config is not writable (${CONFIG_PATH_LABEL}). ${String(error?.message || error)}`;
        return false;
    }
}

export function getRuntimeConfigAccessIssues() {
    return {
        readError: runtimeConfigReadError,
        writeError: runtimeConfigWriteError,
        configPath: CONFIG_PATH_LABEL,
    };
}
