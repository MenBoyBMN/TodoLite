/**
 * TodoLite - Main Application Bootstrap & Window Control
 */

import { store } from './state.js';
import { Bridge } from './bridge.js';
import { TabManager } from './tabs.js';
import { TodoManager } from './todo.js';
import { DragDropManager } from './dragdrop.js';
import { SearchManager } from './search.js';
import { ThemeManager } from './theme.js';
import { NoteManager } from './note.js';
import { FocusSessionManager } from './focus.js';
import { CalculatorManager } from './calculator.js';
import { SettingsManager, matchesShortcut } from './settings.js';

export function hideToast() {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  if (window._toastTimeout) {
    clearTimeout(window._toastTimeout);
    window._toastTimeout = null;
  }
  toast.classList.remove('show', 'shake');
}
window.hideToast = hideToast;

export function showToast(message, type = 'info') {
  const toast = document.getElementById('app-toast');
  const toastText = document.getElementById('app-toast-text');
  if (!toast || !toastText) return;

  toastText.textContent = message;
  toast.className = `app-toast show ${type}`;
  toast.classList.remove('shake');
  void toast.offsetWidth;
  toast.classList.add('shake');

  if (window._toastTimeout) clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    hideToast();
  }, 3200);
}
window.showToast = showToast;

// Allow instant click-to-dismiss for toast notification
const appToastElement = document.getElementById('app-toast');
if (appToastElement) {
  appToastElement.addEventListener('click', (e) => {
    e.stopPropagation();
    hideToast();
  });
}


class TodoLiteApp {
  constructor() {
    this.appWindow = document.getElementById('app-window');
    this.titlebar = document.getElementById('app-titlebar');
    this.btnPin = document.getElementById('btn-pin-always-on-top');
    this.btnMinimize = document.getElementById('btn-minimize');
    this.btnClose = document.getElementById('btn-close');

    this.tabManager = null;
    this.todoManager = null;
    this.dragDropManager = null;
    this.searchManager = null;
    this.themeManager = null;
    this.noteManager = null;
    this.focusSessionManager = null;
    this.calculatorManager = null;
    this.settingsManager = null;

    this.init();
  }

  async init() {
    // 1. Initialize Managers
    this.themeManager = new ThemeManager();
    this.tabManager = new TabManager();
    this.todoManager = new TodoManager();
    this.dragDropManager = new DragDropManager();
    this.searchManager = new SearchManager();
    this.noteManager = new NoteManager();
    this.focusSessionManager = new FocusSessionManager();
    this.calculatorManager = new CalculatorManager();
    this.settingsManager = new SettingsManager({
      themeManager: this.themeManager,
      focusManager: this.focusSessionManager,
      todoManager: this.todoManager,
      noteManager: this.noteManager
    });

    // Wire up cross-references between managers
    this.searchManager.noteManager = this.noteManager;
    this.searchManager.settingsManager = this.settingsManager;
    this.calculatorManager.todoManager = this.todoManager;
    this.calculatorManager.noteManager = this.noteManager;
    this.focusSessionManager.todoManager = this.todoManager;
    this.noteManager.settingsManager = this.settingsManager;

    // 2. Setup Window Control & Pin Actions & Mode Shortcuts
    this.setupWindowControls();
    this.setupModeShortcuts();

    // 2.1 Setup Guide Modal
    this.setupGuideModal();

    // 3. Load initial data from SQLite / Bridge
    await Promise.all([
      this.tabManager.loadInitialData(),
      this.noteManager.loadInitialData()
    ]);

    // If starting in note mode, load active note tab content
    if (store.getState().viewMode === 'note') {
      this.noteManager.updateCurrentTabLabel();
      this.noteManager.loadActiveNote();
    }

    // 4. Check initial Pin state
    this.updatePinVisuals(store.getState().isPinned);
  }

  setupModeShortcuts() {
    window.addEventListener('keydown', (e) => {
      const shortcuts = this.settingsManager?.settings?.shortcuts || {
        modeChecklist: 'Alt+1',
        modeNote: 'Alt+2',
        modeFocus: 'Alt+3',
        modeCalculator: 'Alt+4'
      };

      let targetMode = null;
      if (matchesShortcut(e, shortcuts.modeChecklist)) targetMode = 'checklist';
      else if (matchesShortcut(e, shortcuts.modeNote)) targetMode = 'note';
      else if (matchesShortcut(e, shortcuts.modeFocus)) targetMode = 'focus';
      else if (matchesShortcut(e, shortcuts.modeCalculator)) targetMode = 'calculator';

      if (targetMode && this.themeManager) {
        e.preventDefault();
        this.themeManager.applyMode(targetMode);
        const labels = {
          checklist: 'Đã chuyển sang chế độ Việc cần làm (CheckList) ☑',
          note: 'Đã chuyển sang chế độ Ghi chú (TakeNote) 📝',
          focus: 'Đã chuyển sang chế độ Phiên tập trung (Focus Session) ⏱️',
          calculator: 'Đã chuyển sang chế độ Máy tính bỏ túi (Calculator) 🧮'
        };
        showToast(labels[targetMode] || 'Đã chuyển chế độ');
      }
    });
  }

  setupGuideModal() {
    const btnInfo = document.getElementById('btn-app-info');
    const guideBackdrop = document.getElementById('guide-modal-backdrop');
    const btnCloseHeader = document.getElementById('btn-close-guide-header');
    const btnCloseFooter = document.getElementById('btn-close-guide');

    if (!btnInfo || !guideBackdrop) return;

    const openGuide = () => guideBackdrop.classList.add('open');
    const closeGuide = () => guideBackdrop.classList.remove('open');

    btnInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      openGuide();
    });

    if (btnCloseHeader) btnCloseHeader.addEventListener('click', closeGuide);
    if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeGuide);

    guideBackdrop.addEventListener('click', (e) => {
      if (e.target === guideBackdrop) {
        closeGuide();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && guideBackdrop.classList.contains('open')) {
        closeGuide();
      }
    });
  }

  setupWindowControls() {
    // Pin (Always on Top) Toggle
    this.btnPin.addEventListener('click', async () => {
      const currentPinned = store.getState().isPinned;
      const nextPinned = !currentPinned;

      await Bridge.setAlwaysOnTop(nextPinned);
      store.setState({ isPinned: nextPinned });
      this.updatePinVisuals(nextPinned);
    });

    // Sync pin state when toggled from System Tray menu
    if (typeof window !== 'undefined') {
      const listenEvent = window.__TAURI__?.event?.listen || window.__TAURI_INTERNALS__?.listen;
      if (typeof listenEvent === 'function') {
        listenEvent('tray_pin_toggled', (event) => {
          const nextPinned = Boolean(event.payload);
          store.setState({ isPinned: nextPinned });
          this.updatePinVisuals(nextPinned);
          localStorage.setItem('todolite_always_on_top', JSON.stringify(nextPinned));
        });
      }
    }

    // Minimize to tray
    this.btnMinimize.addEventListener('click', async () => {
      if (this.noteManager) {
        await this.noteManager.saveCurrentNoteImmediately();
      }
      await Bridge.minimizeWindow();
    });

    // Close window (hides to System Tray or exits based on settings)
    this.btnClose.addEventListener('click', async () => {
      if (this.noteManager) {
        await this.noteManager.saveCurrentNoteImmediately();
      }
      if (this.settingsManager?.settings?.closeAction === 'exit') {
        await Bridge.exitApp();
      } else {
        await Bridge.hideWindow();
      }
    });

    // Listen for tray events
    if (typeof window !== 'undefined') {
      const listenEvent = window.__TAURI__?.event?.listen || window.__TAURI_INTERNALS__?.listen;
      if (typeof listenEvent === 'function') {
        listenEvent('tray_request_quit', async () => {
          if (this.noteManager) {
            await this.noteManager.saveCurrentNoteImmediately();
          }
        });

        listenEvent('tray_open_settings', () => {
          this.settingsManager?.openSettings();
        });
      }
    }

    // Tauri custom drag region for titlebar
    this.titlebar.addEventListener('mousedown', (e) => {
      // Don't drag if clicking buttons, badges or dropdown menu
      if (
        e.target.closest('.action-btn') || 
        e.target.closest('button') || 
        e.target.closest('.app-badge')
      ) {
        return;
      }
      Bridge.startDragging();
    });

    // Guard against any programmatic scrolling on app-window or main viewport
    if (this.appWindow) {
      this.appWindow.addEventListener('scroll', () => {
        if (this.appWindow.scrollTop !== 0) this.appWindow.scrollTop = 0;
        if (this.appWindow.scrollLeft !== 0) this.appWindow.scrollLeft = 0;
      });
    }
    window.addEventListener('scroll', () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    });
  }

  updatePinVisuals(isPinned) {
    if (isPinned) {
      this.btnPin.classList.add('active');
      this.btnPin.setAttribute('data-tooltip', 'Ghim: Đang luôn hiển thị trên cùng');
      this.appWindow.classList.add('is-pinned');
    } else {
      this.btnPin.classList.remove('active');
      this.btnPin.setAttribute('data-tooltip', 'Ghim lên trên tất cả cửa sổ');
      this.appWindow.classList.remove('is-pinned');
    }
  }
}

// Global error logger for WebView2 troubleshooting
window.addEventListener('error', (e) => {
  console.error('[TodoLite Error]:', e.message, e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[TodoLite Unhandled Rejection]:', e.reason);
});

// Bootstrap reliably whether DOM is loading or already parsed
function startTodoLite() {
  if (!window.app) {
    window.app = new TodoLiteApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startTodoLite);
} else {
  startTodoLite();
}

