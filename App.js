import { useOrganizerApp } from './src/controllers/useOrganizerApp';
import OrganizerScreen from './src/ui/OrganizerScreen';
import SyncProgressScreen from './src/ui/SyncProgressScreen';

export default function App() {
  const app = useOrganizerApp();

  if (app.activeScreen === 'progress') {
    return (
      <SyncProgressScreen
        run={app.syncProgress}
        onSyncNow={app.handleSyncNow}
        onViewLiveLog={app.handleViewLiveLog}
        onBackToMain={app.handleBackToMain}
      />
    );
  }

  return (
    <OrganizerScreen
      sourceFolder={app.sourceFolder}
      targetFolder={app.targetFolder}
      liveApplyReady={app.liveApplyReady}
      sourceMode={app.sourceMode}
      filesWithError={app.filesWithError}
      pendingDeleteCount={app.pendingDeleteCount}
      pendingUpdateCount={app.pendingUpdateCount}
      isStartProcessing={app.isStartProcessing}
      lastRunText={app.lastRunText}
      onSelectFolder={app.handleFolderSelection}
      onPreview={app.handlePreview}
      onApply={app.handleApply}
    />
  );
}
