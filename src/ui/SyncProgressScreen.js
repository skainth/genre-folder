import { StatusBar } from 'expo-status-bar';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
    SafeAreaView,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import styles from '../styles/syncProgressStyles';

const STATUS_STYLE = {
    completed: { color: '#11D1A5', label: 'COMPLETED', tone: 'SYNCED' },
    syncing: { color: '#9C6CFF', label: 'SYNCING', tone: 'COPYING' },
    queued: { color: '#7A8AA8', label: 'QUEUED', tone: 'QUEUED' },
    deleted: { color: '#ED5D66', label: 'DELETED', tone: 'REMOVED' },
    failed: { color: '#C7464F', label: 'FAILED', tone: 'FAILED' },
    pending: { color: '#648ED8', label: 'PENDING', tone: 'QUEUED' },
};

function statusColor(status) {
    return STATUS_STYLE[status]?.color || STATUS_STYLE.queued.color;
}

function statusLabel(status) {
    return STATUS_STYLE[status]?.label || STATUS_STYLE.queued.label;
}

function statusTone(status) {
    return STATUS_STYLE[status]?.tone || STATUS_STYLE.queued.tone;
}

function toErrorDetails(item) {
    if (Array.isArray(item.errors) && item.errors.length > 0) {
        return item.errors.join(' | ');
    }
    if (item.error) {
        return String(item.error);
    }
    return 'Operation failed for target location.';
}

export default function SyncProgressScreen(props) {
    const {
        run,
        onSyncNow,
        onViewLiveLog,
        onBackToMain,
    } = props;

    if (!run) {
        return null;
    }

    const progressWidth = `${Math.max(0, Math.min(100, run.percentComplete || 0))}%`;
    const operationErrorItems = [
        ...(run.copyItems || []).filter((item) => item.status === 'failed'),
        ...(run.deleteItems || []).filter((item) => item.status === 'failed'),
    ];
    const errorItems = [...(run.errorItems || []), ...operationErrorItems];
    const changedCount = run.copyItems.length;
    const deletedCount = run.deleteItems.length;
    const subtitle = run.isPreparing
        ? 'Preparing file plan and loading changed/deleted/error files'
        : run.isRunning
            ? `Processing ${run.totalOperations} operations`
            : `Dry run complete. ${run.totalOperations} operations ready`;
    const bottomLabel = run.isRunning ? 'Done (Processing...)' : 'Back to Organizer';
    const currentOperation = run.currentOperation;
    const currentOperationText = currentOperation
        ? `${String(currentOperation.type || '').toUpperCase()} ${currentOperation.fileName || ''}`
        : run.isRunning
            ? 'Waiting for next operation...'
            : 'Not running';

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="dark" />
            <View style={styles.page}>
                <View style={styles.topRow}>
                    <View>
                        <Text style={styles.title}>Syncing Files...</Text>
                        <Text style={styles.subtitle}>{subtitle}</Text>
                    </View>
                    <Text style={styles.percent}>{run.percentComplete}%</Text>
                </View>

                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: progressWidth }]} />
                </View>

                <View style={styles.progressMetaRow}>
                    <Text style={styles.metaLeft}>{run.completedOperations} of {run.totalOperations} completed</Text>
                    <Text style={styles.metaRight}>{errorItems.length} Errors detected</Text>
                </View>

                <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                    <View style={styles.sectionTitleWrap}>
                        <Feather name="activity" size={14} color="#5C63F0" />
                        <Text style={styles.sectionTitle}>CURRENTLY PROCESSING</Text>
                    </View>
                </View>
                <View style={styles.listBoxCleanup}>
                    <Text style={styles.pathLabelMuted}>{currentOperationText}</Text>
                    {currentOperation?.sourcePath ? <Text style={styles.pathLineMuted}>Source: {currentOperation.sourcePath}</Text> : null}
                    {currentOperation?.targetPath ? <Text style={styles.pathLineMuted}>Target: {currentOperation.targetPath}</Text> : null}
                </View>

                {run.isPreparing && (
                    <Text style={styles.emptyState}>Preparing sync details...</Text>
                )}

                <View style={styles.sectionHeaderError}>
                    <View style={styles.sectionTitleWrap}>
                        <MaterialCommunityIcons name="close-circle" size={14} color="#E15252" />
                        <Text style={styles.sectionTitleError}>ERRORS & BLOCKED ({errorItems.length})</Text>
                    </View>
                </View>

                <View style={styles.listBoxError}>
                    <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {errorItems.length === 0 && <Text style={styles.emptyState}>No errors detected.</Text>}
                        {errorItems.map((item) => (
                            <View key={`error-${item.id}`} style={[styles.fileCard, styles.fileCardError]}>
                                <View style={styles.fileTitleRow}>
                                    <Text style={styles.fileName}>{item.fileName}</Text>
                                    <View style={[styles.statusPill, styles.statusPillError]}>
                                        <Text style={styles.statusTextError}>{statusTone(item.status)}</Text>
                                    </View>
                                </View>

                                <Text style={styles.reasonText}>Error: {toErrorDetails(item)}</Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                <View style={[styles.sectionHeader, { marginTop: 14 }]}>
                    <View style={styles.sectionTitleWrap}>
                        <MaterialCommunityIcons name="content-copy" size={14} color="#5C63F0" />
                        <Text style={styles.sectionTitle}>CHANGED FILES ({changedCount})</Text>
                    </View>
                </View>

                <View style={styles.listBox}>
                    <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {run.copyItems.map((item) => (
                            <View key={item.id} style={[styles.fileCard, item.multiTarget && styles.fileCardMulti]}>
                                <View style={styles.fileTitleRow}>
                                    <Text style={styles.fileName}>{item.fileName}</Text>
                                    <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) }]}>
                                        <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
                                    </View>
                                </View>

                                <Text style={styles.pathLabel}>FROM {item.sourcePath}</Text>
                                {item.destinationPaths.map((path) => (
                                    <Text key={`${item.id}-${path}`} style={styles.pathLine}>TO /{path.replace(/^\/+/, '')}</Text>
                                ))}
                            </View>
                        ))}
                        {run.copyItems.length === 0 && <Text style={styles.emptyState}>No changed files queued.</Text>}
                    </ScrollView>
                </View>

                <View style={[styles.sectionHeader, { marginTop: 14 }]}>
                    <View style={styles.sectionTitleWrap}>
                        <Ionicons name="trash-outline" size={14} color="#8C96A8" />
                        <Text style={styles.sectionTitle}>DELETED FILES ({deletedCount})</Text>
                    </View>
                </View>

                <View style={styles.listBoxCleanup}>
                    <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                        {run.deleteItems.map((item) => (
                            <View key={item.id} style={[styles.fileCard, styles.fileCardCleanup]}>
                                <View style={styles.fileTitleRow}>
                                    <Text style={styles.fileNameMuted}>{item.fileName}</Text>
                                    <View style={[styles.statusPill, { backgroundColor: statusColor(item.status) }]}>
                                        <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
                                    </View>
                                </View>
                                <Text style={styles.pathLabelMuted}>REASON: {item.reason}</Text>
                                <Text style={styles.pathLineMuted}>Location: {item.removedFromPath}</Text>
                            </View>
                        ))}
                        {run.deleteItems.length === 0 && <Text style={styles.emptyState}>No deleted files queued.</Text>}
                    </ScrollView>
                </View>

                <TouchableOpacity style={styles.logButton} activeOpacity={0.85} onPress={onViewLiveLog}>
                    <Feather name="file-text" size={16} color="#5E5FF2" />
                    <Text style={styles.logButtonText}>View Sync Log ({errorItems.length} Errors)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.bottomButton, (run.isRunning || run.isPreparing || run.totalOperations === 0) && styles.bottomButtonDisabled]}
                    activeOpacity={0.85}
                    onPress={onSyncNow}
                    disabled={run.isRunning || run.isPreparing || run.totalOperations === 0}
                >
                    <Text style={styles.bottomButtonText}>Sync Now</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.bottomButton, run.isRunning && styles.bottomButtonDisabled]}
                    activeOpacity={0.85}
                    onPress={onBackToMain}
                    disabled={run.isRunning}
                >
                    <Text style={styles.bottomButtonText}>{bottomLabel}</Text>
                </TouchableOpacity>

                <Text style={styles.logRefText}>Log: /logs/sync/{run.logFileName}</Text>
            </View>
        </SafeAreaView>
    );
}
