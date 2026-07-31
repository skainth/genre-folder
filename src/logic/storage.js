import { Directory, File, Paths } from 'expo-file-system';

const STORAGE_DIR = new Directory(Paths.document, 'mp3-sorter');
const STORAGE_FILE = new File(STORAGE_DIR, 'artifacts.json');

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
