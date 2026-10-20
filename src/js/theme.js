/**
 * TodoLite - Theme & Aesthetics Manager
 */

import { store } from './state.js';

export class ThemeManager {
  constructor() {
    this.btnTheme = document.getElementById('btn-toggle-theme');
    this.themeIcon = document.getElementById('theme-icon');
    this.btnStyle = document.getElementById('btn-toggle-style');
    this.bottomTabBtns = document.querySelectorAll('.bottom-tab-btn');
    
    this.init();
  }

  init() {
    // Detect stored theme or system preference
    const stored = localStorage.getItem('todolite_theme');
    let theme = stored;
    if (!theme) {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches 
        ? 'dark' 
        : 'light';
    }

    this.applyTheme(theme);

    // Detect stored aesthetic style: 'glass' | 'minimal'
    const storedStyle = localStorage.getItem('todolite_style') || 'glass';
    this.applyStyle(storedStyle);

    // Detect stored view mode: 'checklist' | 'note' | 'focus' | 'calculator'
    const storedMode = localStorage.getItem('todolite_view_mode') || 'checklist';
    this.applyMode(storedMode);

    if (this.btnTheme) {
      this.btnTheme.addEventListener('click', () => {
        const current = store.getState().theme;
        const next = current === 'dark' ? 'light' : 'dark';
        this.applyTheme(next);
      });
    }

    if (this.btnStyle) {
      this.btnStyle.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentStyle = store.getState().style || 'glass';
        const nextStyle = currentStyle === 'glass' ? 'minimal' : 'glass';
        this.applyStyle(nextStyle);

        if (window.showToast) {
          window.showToast(nextStyle === 'minimal'
            ? 'Đã chuyển sang giao diện Minimalist 🌿'
            : 'Đã chuyển sang giao diện Glassmorphism ✨');
        }
      });
    }

    // Direct 4 Bottom Tab Buttons Navigation
    const bottomBtns = document.querySelectorAll('.bottom-tab-btn');
    if (bottomBtns.length > 0) {
      bottomBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetMode = btn.dataset.mode;
          if (targetMode) {
            this.applyMode(targetMode);
            const labels = {
              checklist: 'Đã chuyển sang chế độ Việc cần làm (CheckList) ☑',
              note: 'Đã chuyển sang chế độ Ghi chú (TakeNote) 📝',
              focus: 'Đã chuyển sang chế độ Phiên tập trung (Focus Session) ⏱️',
              calculator: 'Đã chuyển sang chế độ Máy tính bỏ túi (Calculator) 🧮'
            };
            if (window.showToast) {
              window.showToast(labels[targetMode] || 'Đã chuyển chế độ');
            }
          }
        });
      });
    }
  }

  applyMode(mode) {
    const appWindow = document.getElementById('app-window');

    if (appWindow) {
      appWindow.classList.remove('mode-note', 'mode-focus', 'mode-calculator');
      if (mode === 'note') {
        appWindow.classList.add('mode-note');
      } else if (mode === 'focus') {
        appWindow.classList.add('mode-focus');
      } else if (mode === 'calculator') {
        appWindow.classList.add('mode-calculator');
      }
    }

    // Update Bottom Tab Buttons active state
    document.querySelectorAll('.bottom-tab-btn').forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    localStorage.setItem('todolite_view_mode', mode);
    store.setState({ viewMode: mode });
  }

  applyStyle(style) {
    document.documentElement.setAttribute('data-style', style);
    localStorage.setItem('todolite_style', style);
    store.setState({ style });

    if (this.btnStyle) {
      if (style === 'minimal') {
        this.btnStyle.textContent = 'Minimal';
        this.btnStyle.setAttribute('title', 'Đang: Minimalist (Nhấp đổi Glassmorphism)');
        this.btnStyle.setAttribute('data-tooltip', 'Đang: Minimalist (Nhấp đổi Glassmorphism)');
        this.btnStyle.classList.add('is-minimal');
      } else {
        this.btnStyle.textContent = 'Glass';
        this.btnStyle.setAttribute('title', 'Đang: Glassmorphism (Nhấp đổi Minimalist)');
        this.btnStyle.setAttribute('data-tooltip', 'Đang: Glassmorphism (Nhấp đổi Minimalist)');
        this.btnStyle.classList.remove('is-minimal');
      }
    }
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('todolite_theme', theme);
    store.setState({ theme });

    if (this.themeIcon) {
      if (theme === 'dark') {
        // Show Sun icon (to switch to light)
        this.themeIcon.innerHTML = `
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        `;
        this.btnTheme.setAttribute('data-tooltip', 'Chuyển giao diện Sáng');
      } else {
        // Show Moon icon (to switch to dark)
        this.themeIcon.innerHTML = `
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        `;
        this.btnTheme.setAttribute('data-tooltip', 'Chuyển giao diện Tối');
      }
    }
  }
}
