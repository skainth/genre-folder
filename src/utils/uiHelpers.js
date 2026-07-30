import { Alert } from 'react-native';

export function formatLastRunLabel(log) {
    if (!Array.isArray(log) || log.length === 0) {
        return 'Last run: not executed yet';
    }

    const last = log[log.length - 1];
    const stamp = last.slice(0, 19).replace('T', ' ');
    return `Last run: ${stamp}`;
}

export function notify(message) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function') {
        globalThis.alert(message);
        return;
    }

    if (Alert && typeof Alert.alert === 'function') {
        Alert.alert('Notice', String(message || 'Done.'));
    }
}

export function askPath(label, currentValue) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.prompt === 'function') {
        const next = globalThis.prompt(`Set ${label}`, currentValue);
        return (next || '').trim();
    }
    return '';
}
