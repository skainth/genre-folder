const STORAGE_KEY = 'genre2.organizer.artifacts.v1';

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

function hasLocalStorage() {
    return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined';
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
    if (!hasLocalStorage()) {
        return createDefaultArtifacts();
    }

    try {
        const raw = globalThis.localStorage.getItem(STORAGE_KEY);
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
    if (!hasLocalStorage()) {
        return;
    }

    try {
        const normalized = sanitizeArtifacts(artifacts);
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (_error) {
        // Ignore quota/storage errors; app can continue in memory for current session.
    }
}
