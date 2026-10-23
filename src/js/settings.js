/**
 * TodoLite - Centralized Settings Manager
 * Manages all application preferences, live appearance customization,
 * Pomodoro defaults, TakeNote preferences, SQLite data backup & restore.
 */

import { store } from './state.js';
import { showToast } from './app.js';
import { Bridge } from './bridge.js';
import { confirmDialog } from './dialog.js';

export const DEFAULT_SHORTCUTS = {
  globalToggleApp: 'Ctrl+Alt+T',
  openSettings: 'Ctrl+,',
  modeChecklist: 'Alt+1',
  modeNote: 'Alt+2',
  modeFocus: 'Alt+3',
  modeCalculator: 'Alt+4',
  quickSearch: 'Ctrl+F'
};

export const SHORTCUT_LABELS = {
  globalToggleApp: 'Ẩn / Hiện TodoLite (Toàn hệ thống)',
  openSettings: 'Mở Cài đặt hệ thống',
  modeChecklist: 'Chuyển chế độ Việc cần làm',
  modeNote: 'Chuyển chế độ Sổ tay ghi chú',
  modeFocus: 'Chuyển chế độ Phiên tập trung',
  modeCalculator: 'Chuyển chế độ Máy tính bỏ túi',
  quickSearch: 'Tìm kiếm nhanh công việc'
};

export function matchesShortcut(e, shortcutStr) {
  if (!shortcutStr || typeof shortcutStr !== 'string') return false;
  const parts = shortcutStr.split('+').map(p => p.trim().toLowerCase());

  const wantCtrl = parts.includes('ctrl') || parts.includes('control');
  const wantAlt = parts.includes('alt');
  const wantShift = parts.includes('shift');
  const wantMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');

  const hasCtrl = Boolean(e.ctrlKey);
  const hasAlt = Boolean(e.altKey);
  const hasShift = Boolean(e.shiftKey);
  const hasMeta = Boolean(e.metaKey);

  if (wantCtrl !== hasCtrl) return false;
  if (wantAlt !== hasAlt) return false;
  if (wantShift !== hasShift) return false;
  if (wantMeta !== hasMeta) return false;

  const keyPart = parts.find(p => !['ctrl', 'control', 'alt', 'shift', 'meta', 'cmd', 'command'].includes(p));
  if (!keyPart) return false;

  const eventKey = (e.key || '').toLowerCase();
  if (keyPart === eventKey) return true;
  if (keyPart === 'space' && (eventKey === ' ' || eventKey === 'space')) return true;
  if (keyPart === 'esc' && eventKey === 'escape') return true;

  return false;
}

export const DEFAULT_SETTINGS = {
  theme: 'light',
  style: 'glass',
  fontSize: 'normal', // 'small' | 'normal' | 'large'
  glassBlur: true,
  alwaysOnTop: true,
  closeAction: 'tray', // 'tray' | 'exit'
  confirmDelete: true,
  focusWorkMinutes: 25,
  focusBreakMinutes: 5,
  focusAutoNext: true,
  focusSound: true,
  focusAmbient: 'none',
  noteFont: 'sans', // 'sans' | 'mono' | 'serif'
  noteAutosaveDelay: 500,
  noteShowStats: true,
  exportDirectory: '',
  shortcuts: { ...DEFAULT_SHORTCUTS }
};

export class SettingsManager {
  constructor(options = {}) {
    this.themeManager = options.themeManager || null;
    this.focusManager = options.focusManager || null;
    this.todoManager = options.todoManager || null;
    this.noteManager = options.noteManager || null;

    this.settings = { ...DEFAULT_SETTINGS };

    // DOM Elements
    this.modalBackdrop = document.getElementById('settings-modal-backdrop');
    this.btnOpen = document.getElementById('btn-open-settings');
    this.btnCloseHeader = document.getElementById('btn-close-settings-header');
    this.btnCloseFooter = document.getElementById('btn-close-settings-footer');
    this.btnSave = document.getElementById('btn-save-settings');

    this.exportPathInput = document.getElementById('setting-export-path');
    this.btnBrowseExportPath = document.getElementById('btn-browse-export-path');
    this.btnOpenExportFolder = document.getElementById('btn-open-export-folder');

    this.init();
  }

  async init() {
    this.loadSettings();
    await this.resolveExportDirectory();
    await this.syncGlobalShortcut();
    this.applyAllSettings();
    this.initEventListeners();
    this.syncControlsWithState();
  }

  async syncGlobalShortcut() {
    const sc = this.settings?.shortcuts?.globalToggleApp || DEFAULT_SHORTCUTS.globalToggleApp;
    if (sc) {
      try {
        await Bridge.registerGlobalToggleShortcut(sc);
      } catch (e) {
        console.warn('Could not register global toggle shortcut:', e);
      }
    }
  }

  async resolveExportDirectory() {
    if (!this.settings.exportDirectory || typeof this.settings.exportDirectory !== 'string' || !this.settings.exportDirectory.trim()) {
      try {
        const defaultDir = await Bridge.getDefaultExportDirectory();
        if (defaultDir) {
          this.settings.exportDirectory = defaultDir;
          this.saveSettings();
        }
      } catch (e) {
        console.warn('Could not get default export directory:', e);
      }
    }
  }

  loadSettings() {
    try {
      const stored = localStorage.getItem('todolite_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.warn('Error reading todolite_settings:', e);
    }

    this.settings.shortcuts = {
      ...DEFAULT_SHORTCUTS,
      ...(this.settings.shortcuts || {})
    };

    // Sync from existing standalone keys if present
    const storedTheme = localStorage.getItem('todolite_theme');
    if (storedTheme) this.settings.theme = storedTheme;

    const storedStyle = localStorage.getItem('todolite_style');
    if (storedStyle) this.settings.style = storedStyle;

    const storedPin = localStorage.getItem('todolite_always_on_top');
    if (storedPin !== null) {
      this.settings.alwaysOnTop = storedPin === 'true';
    }

    const storedFocus = localStorage.getItem('todolite_focus_settings');
    if (storedFocus) {
      try {
        const pf = JSON.parse(storedFocus);
        if (pf.workIntervalMinutes) this.settings.focusWorkMinutes = pf.workIntervalMinutes;
        if (pf.breakIntervalMinutes) this.settings.focusBreakMinutes = pf.breakIntervalMinutes;
        if (pf.autoNext !== undefined) this.settings.focusAutoNext = pf.autoNext;
        if (pf.soundEnabled !== undefined) this.settings.focusSound = pf.soundEnabled;
        if (pf.ambientSound) this.settings.focusAmbient = pf.ambientSound;
      } catch (e) {}
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('todolite_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.error('Error saving todolite_settings:', e);
    }
  }

  applyAllSettings() {
    const appWindow = document.getElementById('app-window');
    if (!appWindow) return;

    // 1. Font Size Modifier
    appWindow.setAttribute('data-font-size', this.settings.fontSize);

    // 2. Glass Blur Modifier (turn off blur for low-end machines)
    if (!this.settings.glassBlur) {
      appWindow.setAttribute('data-no-blur', 'true');
    } else {
      appWindow.removeAttribute('data-no-blur');
    }

    // 3. Note Font Customization
    const noteContent = document.getElementById('note-editor');
    if (noteContent) {
      noteContent.classList.remove('font-mono', 'font-serif');
      if (this.settings.noteFont === 'mono') {
        noteContent.classList.add('font-mono');
      } else if (this.settings.noteFont === 'serif') {
        noteContent.classList.add('font-serif');
      }
    }

    // 4. Note Word & Char Counter
    const noteCharCounter = document.querySelector('.note-status-info');
    if (noteCharCounter) {
      noteCharCounter.style.display = this.settings.noteShowStats ? '' : 'none';
    }

    // 5. Always on Top Sync
    store.setState({ isPinned: this.settings.alwaysOnTop });
    const btnPin = document.getElementById('btn-pin-always-on-top');
    if (btnPin) {
      btnPin.classList.toggle('active', this.settings.alwaysOnTop);
    }

    // 6. Theme and Style sync
    if (this.themeManager) {
      this.themeManager.applyTheme(this.settings.theme);
      this.themeManager.applyStyle(this.settings.style);
    }
  }

  initEventListeners() {
    // Open modal button
    if (this.btnOpen) {
      this.btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openSettings();
      });
    }

    // Close buttons
    if (this.btnCloseHeader) {
      this.btnCloseHeader.addEventListener('click', () => this.closeSettings());
    }
    if (this.btnCloseFooter) {
      this.btnCloseFooter.addEventListener('click', () => this.closeSettings());
    }
    if (this.btnSave) {
      this.btnSave.addEventListener('click', () => {
        this.closeSettings();
        showToast('Đã lưu các cài đặt hệ thống ✨', 'info');
      });
    }

    // Backdrop click
    if (this.modalBackdrop) {
      this.modalBackdrop.addEventListener('click', (e) => {
        if (e.target === this.modalBackdrop) {
          this.closeSettings();
        }
      });
    }

    // Escape shortcut & Global settings shortcut
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalBackdrop?.classList.contains('open')) {
        this.closeSettings();
        return;
      }
      const openSc = this.settings?.shortcuts?.openSettings || DEFAULT_SHORTCUTS.openSettings;
      if (matchesShortcut(e, openSc) || (e.altKey && (e.key === 's' || e.key === 'S'))) {
        e.preventDefault();
        if (this.modalBackdrop?.classList.contains('open')) {
          this.closeSettings();
        } else {
          this.openSettings();
        }
      }
    });

    // Reset shortcuts button
    const btnResetShortcuts = document.getElementById('btn-reset-shortcuts');
    if (btnResetShortcuts) {
      btnResetShortcuts.addEventListener('click', () => {
        this.resetShortcuts();
      });
    }

    // Nav tabs switching
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // Form inputs change handlers
    this.bindControlEvents();
  }

  bindControlEvents() {
    // Theme Select
    const themeSelect = document.getElementById('setting-theme');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.settings.theme = val;
        this.saveSettings();
        if (this.themeManager) this.themeManager.applyTheme(val);
      });
    }

    // Style Select
    const styleSelect = document.getElementById('setting-style');
    if (styleSelect) {
      styleSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.settings.style = val;
        this.saveSettings();
        if (this.themeManager) this.themeManager.applyStyle(val);
      });
    }

    // Font Size Select
    const fontSizeSelect = document.getElementById('setting-font-size');
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.settings.fontSize = val;
        this.saveSettings();
        const appWindow = document.getElementById('app-window');
        if (appWindow) appWindow.setAttribute('data-font-size', val);
      });
    }

    // Glass Blur Toggle
    const glassBlurToggle = document.getElementById('setting-glass-blur');
    if (glassBlurToggle) {
      glassBlurToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        this.settings.glassBlur = val;
        this.saveSettings();
        const appWindow = document.getElementById('app-window');
        if (appWindow) {
          if (!val) appWindow.setAttribute('data-no-blur', 'true');
          else appWindow.removeAttribute('data-no-blur');
        }
      });
    }

    // Always on Top Toggle
    const pinToggle = document.getElementById('setting-always-on-top');
    if (pinToggle) {
      pinToggle.addEventListener('change', async (e) => {
        const val = e.target.checked;
        this.settings.alwaysOnTop = val;
        this.saveSettings();
        localStorage.setItem('todolite_always_on_top', JSON.stringify(val));
        await Bridge.setAlwaysOnTop(val);
        store.setState({ isPinned: val });
        const btnPin = document.getElementById('btn-pin-always-on-top');
        if (btnPin) btnPin.classList.toggle('active', val);
      });
    }

    // Close Action Select
    const closeActionSelect = document.getElementById('setting-close-action');
    if (closeActionSelect) {
      closeActionSelect.addEventListener('change', (e) => {
        this.settings.closeAction = e.target.value;
        this.saveSettings();
      });
    }

    // Confirm Delete Toggle
    const confirmDeleteToggle = document.getElementById('setting-confirm-delete');
    if (confirmDeleteToggle) {
      confirmDeleteToggle.addEventListener('change', (e) => {
        this.settings.confirmDelete = e.target.checked;
        this.saveSettings();
      });
    }

    // Focus Work Duration Select
    const focusWorkSelect = document.getElementById('setting-focus-work');
    if (focusWorkSelect) {
      focusWorkSelect.addEventListener('change', (e) => {
        const mins = parseInt(e.target.value, 10);
        this.settings.focusWorkMinutes = mins;
        this.saveSettings();
        if (this.focusManager) {
          this.focusManager.workIntervalMinutes = mins;
          this.focusManager.saveSettings();
          this.focusManager.renderSetupChips();
        }
      });
    }

    // Focus Break Duration Select
    const focusBreakSelect = document.getElementById('setting-focus-break');
    if (focusBreakSelect) {
      focusBreakSelect.addEventListener('change', (e) => {
        const mins = parseInt(e.target.value, 10);
        this.settings.focusBreakMinutes = mins;
        this.saveSettings();
        if (this.focusManager) {
          this.focusManager.breakIntervalMinutes = mins;
          this.focusManager.saveSettings();
          this.focusManager.renderSetupChips();
        }
      });
    }

    // Focus Auto Next Toggle
    const focusAutoNextToggle = document.getElementById('setting-focus-auto-next');
    if (focusAutoNextToggle) {
      focusAutoNextToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        this.settings.focusAutoNext = val;
        this.saveSettings();
        if (this.focusManager) {
          this.focusManager.autoNext = val;
          this.focusManager.saveSettings();
          if (this.focusManager.autoNextToggle) this.focusManager.autoNextToggle.checked = val;
        }
      });
    }

    // Focus Sound Toggle
    const focusSoundToggle = document.getElementById('setting-focus-sound');
    if (focusSoundToggle) {
      focusSoundToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        this.settings.focusSound = val;
        this.saveSettings();
        if (this.focusManager) {
          this.focusManager.soundEnabled = val;
          this.focusManager.saveSettings();
          if (this.focusManager.soundToggle) this.focusManager.soundToggle.checked = val;
        }
      });
    }

    // Focus Default Ambient Sound Select
    const focusAmbientSelect = document.getElementById('setting-focus-ambient');
    if (focusAmbientSelect) {
      focusAmbientSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.settings.focusAmbient = val;
        this.saveSettings();
        if (this.focusManager) {
          this.focusManager.ambientSound = val;
          this.focusManager.saveSettings();
          this.focusManager.renderSetupChips();
        }
      });
    }

    // Note Font Select
    const noteFontSelect = document.getElementById('setting-note-font');
    if (noteFontSelect) {
      noteFontSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.settings.noteFont = val;
        this.saveSettings();
        const noteContent = document.getElementById('note-editor');
        if (noteContent) {
          noteContent.classList.remove('font-mono', 'font-serif');
          if (val === 'mono') noteContent.classList.add('font-mono');
          else if (val === 'serif') noteContent.classList.add('font-serif');
        }
      });
    }

    // Note Show Word Stats Toggle
    const noteStatsToggle = document.getElementById('setting-note-show-stats');
    if (noteStatsToggle) {
      noteStatsToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        this.settings.noteShowStats = val;
        this.saveSettings();
        const noteCharCounter = document.querySelector('.note-status-info');
        if (noteCharCounter) {
          noteCharCounter.style.display = val ? '' : 'none';
        }
      });
    }

    // Export Directory Path Input
    if (this.exportPathInput) {
      const handlePathChange = () => {
        const val = this.exportPathInput.value.trim();
        if (val) {
          this.settings.exportDirectory = val;
          this.saveSettings();
        }
      };
      this.exportPathInput.addEventListener('change', handlePathChange);
      this.exportPathInput.addEventListener('blur', handlePathChange);
    }

    // Browse Export Directory Button
    if (this.btnBrowseExportPath) {
      this.btnBrowseExportPath.addEventListener('click', async () => {
        try {
          const selected = await Bridge.pickExportDirectory(this.settings.exportDirectory || '');
          if (selected) {
            this.settings.exportDirectory = selected;
            this.saveSettings();
            if (this.exportPathInput) {
              this.exportPathInput.value = selected;
            }
            showToast('Đã chọn thư mục xuất tệp 📁', 'info');
          }
        } catch (err) {
          console.error('Pick directory error:', err);
          showToast('Không thể mở hộp thoại chọn thư mục: ' + err.message, 'error');
        }
      });
    }

    // Open Export Directory in Explorer Button
    if (this.btnOpenExportFolder) {
      this.btnOpenExportFolder.addEventListener('click', async () => {
        const dir = this.settings.exportDirectory || (this.exportPathInput ? this.exportPathInput.value.trim() : '');
        if (!dir) {
          showToast('Chưa có đường dẫn thư mục xuất tệp!', 'error');
          return;
        }
        try {
          await Bridge.openExportDirectory(dir);
        } catch (err) {
          console.error('Open folder error:', err);
          showToast('Không thể mở thư mục: ' + err.message, 'error');
        }
      });
    }

    // Backup & Restore Actions
    const btnExport = document.getElementById('btn-export-backup');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.exportBackup());
    }

    const importInput = document.getElementById('setting-import-file');
    const btnImport = document.getElementById('btn-import-backup');
    if (btnImport && importInput) {
      btnImport.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.importBackup(file);
          importInput.value = '';
        }
      });
    }

    const btnResetAll = document.getElementById('btn-reset-all-data');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => this.resetAllData());
    }
  }

  syncControlsWithState() {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    const setChecked = (id, bool) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(bool);
    };

    setVal('setting-theme', this.settings.theme);
    setVal('setting-style', this.settings.style);
    setVal('setting-font-size', this.settings.fontSize);
    setChecked('setting-glass-blur', this.settings.glassBlur);

    setChecked('setting-always-on-top', this.settings.alwaysOnTop);
    setVal('setting-close-action', this.settings.closeAction);
    setChecked('setting-confirm-delete', this.settings.confirmDelete);

    setVal('setting-focus-work', this.settings.focusWorkMinutes);
    setVal('setting-focus-break', this.settings.focusBreakMinutes);
    setChecked('setting-focus-auto-next', this.settings.focusAutoNext);
    setChecked('setting-focus-sound', this.settings.focusSound);
    setVal('setting-focus-ambient', this.settings.focusAmbient);

    setVal('setting-note-font', this.settings.noteFont);
    setChecked('setting-note-show-stats', this.settings.noteShowStats);

    if (this.exportPathInput) {
      this.exportPathInput.value = this.settings.exportDirectory || '';
    }

    this.updateStorageStats();
    this.renderShortcutsList();
  }

  switchTab(tabId) {
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabId);
    });
    document.querySelectorAll('.settings-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `settings-tab-${tabId}`);
    });
  }

  openSettings() {
    this.syncControlsWithState();
    if (this.modalBackdrop) {
      this.modalBackdrop.classList.add('open');
    }
  }

  closeSettings() {
    if (this.modalBackdrop) {
      this.modalBackdrop.classList.remove('open');
    }
  }

  updateStorageStats() {
    const { todos, tabs, noteTabs } = store.getState();
    const statsTodos = document.getElementById('settings-stat-todos');
    const statsTabs = document.getElementById('settings-stat-tabs');
    const statsNotes = document.getElementById('settings-stat-notes');

    if (statsTodos) statsTodos.textContent = `${(todos || []).length} mục`;
    if (statsTabs) statsTabs.textContent = `${(tabs || []).length} tab`;
    if (statsNotes) statsNotes.textContent = `${(noteTabs || []).length} ghi chú`;
  }

  // ----------------- BACKUP & RESTORE -----------------
  async exportBackup() {
    try {
      const { tabs, todos, noteTabs } = store.getState();
      
      // Fetch notes content
      let allNotes = {};
      if (noteTabs && noteTabs.length > 0) {
        for (const tab of noteTabs) {
          const noteItem = await Bridge.invoke('get_note_by_tab', { tab_id: tab.id });
          if (noteItem) {
            allNotes[tab.id] = noteItem;
          }
        }
      }

      const backupData = {
        app: 'TodoLite',
        version: '3.0.0',
        exportedAt: new Date().toISOString(),
        settings: this.settings,
        tabs: tabs || [],
        todos: todos || [],
        noteTabs: noteTabs || [],
        notes: allNotes
      };

      const dateTag = new Date().toISOString().slice(0, 10);
      const filename = `todolite_backup_${dateTag}.json`;
      const jsonContent = JSON.stringify(backupData, null, 2);

      // Ensure exportDirectory is available
      if (!this.settings.exportDirectory) {
        await this.resolveExportDirectory();
      }
      const targetDir = this.settings.exportDirectory;

      let savedFilePath = null;
      if (targetDir) {
        try {
          savedFilePath = await Bridge.saveExportedFile(targetDir, filename, jsonContent);
        } catch (saveErr) {
          console.warn('Native saveExportedFile failed, falling back to browser download:', saveErr);
        }
      }

      if (savedFilePath) {
        showToast(`Đã xuất sao lưu vào: ${filename} 📥`, 'info');
      } else {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(jsonContent);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute('download', filename);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast(`Đã xuất file sao lưu: ${filename} 📥`, 'info');
      }
    } catch (err) {
      console.error('Export error:', err);
      showToast('Lỗi khi xuất sao lưu: ' + err.message, 'error');
    }
  }

  async importBackup(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || !data.tabs || !data.todos) {
        throw new Error('Định dạng file sao lưu không hợp lệ!');
      }

      // Convert notes object or array
      let notesList = [];
      if (Array.isArray(data.notes)) {
        notesList = data.notes;
      } else if (data.notes && typeof data.notes === 'object') {
        notesList = Object.values(data.notes);
      }

      // 1. Invoke atomic restore_backup in SQLite backend
      await Bridge.invoke('restore_backup', {
        tabs: data.tabs || [],
        todos: data.todos || [],
        note_tabs: data.noteTabs || [],
        notes: notesList
      });

      // 2. Restore settings
      if (data.settings) {
        this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
        this.saveSettings();
        this.applyAllSettings();
        this.syncControlsWithState();
      }

      // 3. Update active store state
      const notesMap = {};
      notesList.forEach(n => {
        if (n && n.tab_id) notesMap[n.tab_id] = n;
      });

      store.setState({
        tabs: data.tabs || [],
        activeTabId: data.tabs[0]?.id || null,
        todos: data.todos || [],
        noteTabs: data.noteTabs || [],
        activeNoteTabId: data.noteTabs?.[0]?.id || null,
        notes: notesMap
      });

      this.updateStorageStats();
      showToast('Đã phục hồi toàn bộ dữ liệu TodoLite thành công! 📤', 'info');
    } catch (err) {
      console.error('Import error:', err);
      showToast('Không thể phục hồi file: ' + err.message, 'error');
    }
  }

  async resetAllData() {
    const firstCheck = await confirmDialog({
      title: 'Đặt lại toàn bộ dữ liệu?',
      message: 'Tất cả công việc, ghi chú và cài đặt sẽ trở về trạng thái mặc định.',
      confirmLabel: 'Tiếp tục',
      danger: true
    });
    if (!firstCheck) return;

    const secondCheck = await confirmDialog({
      title: 'Xác nhận xóa vĩnh viễn',
      message: 'Dữ liệu chưa sao lưu sẽ không thể khôi phục. Bạn vẫn muốn xóa tất cả?',
      confirmLabel: 'Xóa tất cả',
      danger: true
    });
    if (!secondCheck) return;

    try {
      await Bridge.invoke('reset_database');
      localStorage.clear();
      this.settings = { ...DEFAULT_SETTINGS };
      this.saveSettings();
      this.applyAllSettings();

      showToast('Đang đặt lại toàn bộ hệ thống...', 'info');
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (e) {
      console.error('Reset error:', e);
      showToast('Lỗi khi đặt lại dữ liệu: ' + e.message, 'error');
    }
  }

  // ----------------- SHORTCUTS MANAGEMENT -----------------
  renderShortcutsList() {
    const listEl = document.getElementById('settings-shortcuts-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const shortcuts = this.settings.shortcuts || { ...DEFAULT_SHORTCUTS };

    for (const [actionKey, label] of Object.entries(SHORTCUT_LABELS)) {
      const currentVal = shortcuts[actionKey] || DEFAULT_SHORTCUTS[actionKey] || '';

      const row = document.createElement('div');
      row.className = 'settings-shortcut-item';

      const labelEl = document.createElement('span');
      labelEl.className = 'settings-shortcut-name';
      labelEl.textContent = label;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-kbd-btn';
      btn.dataset.action = actionKey;
      btn.title = 'Nhấp để thay đổi phím tắt';
      btn.textContent = this.formatShortcutDisplay(currentVal);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startRecordingShortcut(actionKey, btn);
      });

      row.appendChild(labelEl);
      row.appendChild(btn);
      listEl.appendChild(row);
    }
  }

  formatShortcutDisplay(str) {
    if (!str) return 'Chưa gán';
    return str.split('+').map(p => p.trim()).join(' + ');
  }

  startRecordingShortcut(actionKey, btn) {
    if (this.recordingCleanup) {
      this.recordingCleanup();
    }

    const originalText = btn.textContent;
    btn.classList.add('recording');
    btn.textContent = 'Nhấn phím mới...';

    const onKeyDown = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === 'Escape') {
        cleanup();
        showToast('Đã hủy đổi phím tắt', 'info');
        return;
      }

      // If user pressed only modifier keys, show progress
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        btn.textContent = parts.length > 0 ? parts.join(' + ') + ' + ...' : 'Nhấn phím mới...';
        return;
      }

      // Non-modifier key pressed!
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let keyName = e.key;
      if (keyName === ' ') keyName = 'Space';
      else if (keyName.length === 1) keyName = keyName.toUpperCase();

      const isFunctionKey = /^F[1-9]|F1[0-2]$/i.test(keyName);
      if (parts.length === 0 && !isFunctionKey) {
        showToast('Vui lòng kết hợp với phím Ctrl, Alt hoặc Shift!', 'warning');
        return;
      }

      parts.push(keyName);
      const newShortcutStr = parts.join('+');

      if (actionKey === 'globalToggleApp') {
        try {
          await Bridge.registerGlobalToggleShortcut(newShortcutStr);
        } catch (regErr) {
          showToast('Lỗi đăng ký phím tắt hệ thống: ' + (regErr.message || regErr), 'error');
          cleanup();
          return;
        }
      }

      if (!this.settings.shortcuts) {
        this.settings.shortcuts = { ...DEFAULT_SHORTCUTS };
      }
      this.settings.shortcuts[actionKey] = newShortcutStr;
      this.saveSettings();

      cleanup();
      this.renderShortcutsList();
      showToast(`Đã lưu phím tắt mới: ${this.formatShortcutDisplay(newShortcutStr)} ✨`, 'info');
    };

    const onClickOutside = (e) => {
      if (!btn.contains(e.target)) {
        cleanup();
      }
    };

    const cleanup = () => {
      btn.classList.remove('recording');
      btn.textContent = originalText;
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClickOutside, true);
      this.recordingCleanup = null;
    };

    this.recordingCleanup = cleanup;
    window.addEventListener('keydown', onKeyDown, true);
    setTimeout(() => {
      document.addEventListener('click', onClickOutside, true);
    }, 50);
  }

  async resetShortcuts() {
    this.settings.shortcuts = { ...DEFAULT_SHORTCUTS };
    this.saveSettings();
    this.renderShortcutsList();
    await this.syncGlobalShortcut();
    showToast('Đã khôi phục tất cả phím tắt mặc định! ↺', 'info');
  }
}
