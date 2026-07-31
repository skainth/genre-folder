import { StatusBar } from 'expo-status-bar';
import {
    SafeAreaView,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    Feather,
    FontAwesome6,
    Ionicons,
    MaterialCommunityIcons,
    MaterialIcons,
} from '@expo/vector-icons';
import styles from '../styles/appStyles';

export default function OrganizerScreen(props) {
    const {
        sourceFolder,
        targetFolder,
        liveApplyReady,
        sourceMode,
        filesWithError,
        pendingDeleteCount,
        pendingUpdateCount,
        totalFilesCount,
        isStartProcessing,
        lastRunText,
        onSelectFolder,
        onPreview,
        onApply,
    } = props;

    const hasSourceFolder = Boolean(String(sourceFolder || '').trim());
    const hasReadyFolders = hasSourceFolder && Boolean(String(targetFolder || '').trim());
    const hasPendingChanges = pendingUpdateCount + pendingDeleteCount > 0;
    const startLabel = isStartProcessing ? 'PROCESSING...' : hasPendingChanges ? 'START SYNC' : 'START';
    const lastExamined = String(lastRunText || '').replace(/^Last run:\s*/i, '');
    const storageStatusText = liveApplyReady ? 'READY' : 'DENIED';

    function handleStart() {
        onApply();
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.heroWrap}>
                    <View style={styles.musicIconWrap}>
                        <MaterialIcons name="music-note" size={32} color="#FFFFFF" />
                    </View>
                    <Text style={styles.title}>MP3 Sorter</Text>
                    <Text style={styles.subtitle}>SMART SYNC HUB</Text>
                </View>

                <View style={styles.sectionCard}>
                    <View style={styles.cardHeadRow}>
                        <View style={styles.cardHeadLeft}>
                            <View style={styles.cardIconPill}>
                                <FontAwesome6 name="folder-open" size={16} color="#F4B100" />
                            </View>
                            <View>
                                <Text style={styles.sectionLabel}>SOURCE FOLDER</Text>
                                <View style={styles.statusRow}>
                                    <View style={[styles.readyDot, !hasSourceFolder && styles.pendingDot]} />
                                    <Text style={[styles.readyText, !hasSourceFolder && styles.pendingText]}>
                                        {hasSourceFolder ? 'Ready' : 'Not selected'}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <TouchableOpacity style={styles.changeBtn} activeOpacity={0.85} onPress={() => onSelectFolder('source')}>
                            <Text style={styles.changeBtnText}>Change</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.inputRow}>
                        <Text style={styles.inputText}>{sourceFolder || 'No source folder selected'}</Text>
                        <View style={styles.examinedRow}>
                            <View style={styles.lastRunRow}>
                                <Feather name="clock" size={12} color="#8390AB" />
                                <Text style={styles.lastRunLabel}>LAST EXAMINED</Text>
                            </View>
                            <View style={styles.examinedBadge}>
                                <Text style={styles.examinedText}>{lastExamined || 'Never'}</Text>
                                <MaterialCommunityIcons name="open-in-new" size={11} color="#7A61F6" />
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.targetCard}>
                    <View style={styles.targetContentWrap}>
                        <View style={styles.cardHeadLeft}>
                            <View style={styles.cardIconPillAlt}>
                                <Feather name="target" size={14} color="#5E6DFF" />
                            </View>
                            <Text style={styles.sectionLabel}>TARGET FOLDER</Text>
                        </View>
                        <Text style={[styles.targetPathText, !targetFolder && styles.targetPathMuted]}>
                            {targetFolder || 'No target folder selected'}
                        </Text>
                    </View>
                    <TouchableOpacity style={styles.selectBtn} activeOpacity={0.85} onPress={() => onSelectFolder('target')}>
                        <Text style={styles.selectBtnText}>{targetFolder ? 'CHANGE' : 'SELECT'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.summaryCard}>
                    <Text style={styles.sectionLabel}>LAST SCAN SUMMARY</Text>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryValue}>{totalFilesCount || 0}</Text>
                            <Text style={styles.summaryLabel}>TOTAL</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={[styles.summaryValue, styles.summaryValueCopy]}>{pendingUpdateCount || 0}</Text>
                            <Text style={styles.summaryLabel}>TO COPY</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={[styles.summaryValue, styles.summaryValueDelete]}>{pendingDeleteCount || 0}</Text>
                            <Text style={styles.summaryLabel}>TO DELETE</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <Text style={[styles.summaryValue, styles.summaryValueError]}>{filesWithError.length}</Text>
                            <Text style={styles.summaryLabel}>ERRORS</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.storageCard}>
                    <View style={styles.storageHead}>
                        <View style={styles.cardHeadLeft}>
                            <View style={styles.cardIconPillRed}>
                                <Ionicons name="shield-checkmark-outline" size={14} color="#FF5A5A" />
                            </View>
                            <View>
                                <Text style={styles.sectionLabel}>STORAGE ACCESS</Text>
                                <Text style={styles.storageSub}>Removable Drive Permission</Text>
                            </View>
                        </View>
                        <View style={[styles.deniedPill, storageStatusText === 'READY' && styles.readyPill]}>
                            <Text style={[styles.deniedText, storageStatusText === 'READY' && styles.readyPillText]}>
                                {storageStatusText}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.alertCard}>
                        <View style={styles.alertTitleRow}>
                            <Ionicons name="warning-outline" size={16} color="#F14747" />
                            <Text style={styles.alertTitle}>Access Restricted</Text>
                        </View>
                        <Text style={styles.alertBody}>
                            {filesWithError.length > 0
                                ? `Detected ${filesWithError.length} file issue(s). Review and grant required permissions before sync.`
                                : 'Choose the destination folder with the picker to grant write access before sync.'}
                        </Text>
                        <TouchableOpacity onPress={() => onSelectFolder('target')}>
                            <Text style={styles.grantText}>GRANT ACCESS NOW</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.startBtn, (!hasReadyFolders || isStartProcessing) && styles.startBtnDisabled]}
                    activeOpacity={0.9}
                    onPress={handleStart}
                    disabled={!hasReadyFolders || isStartProcessing}
                >
                    <Text style={[styles.startBtnText, (!hasReadyFolders || isStartProcessing) && styles.startBtnTextDisabled]}>{startLabel}</Text>
                </TouchableOpacity>

                <Text style={styles.sourceModeText}>Source mode: {sourceMode}</Text>
            </ScrollView>
        </SafeAreaView>
    );
}
