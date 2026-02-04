interface SettingsModalProps {
  onClose: () => void;
  onLogout: () => void;
}

export default function SettingsModal(props: SettingsModalProps) {
  return (
    <div class="settings-overlay" onClick={props.onClose}>
      <div class="settings-page" onClick={(e) => e.stopPropagation()}>
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="settings-close" onClick={props.onClose}>×</button>
        </div>
        <button class="logout-btn" onClick={props.onLogout}>Log out</button>
      </div>
    </div>
  );
}
