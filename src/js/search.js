/**
 * TodoLite - Cross-tab Real-time Search
 */

import { store } from './state.js';
import { Bridge } from './bridge.js';
import { showToast } from './app.js';
import { matchesShortcut } from './settings.js';

export class SearchManager {
  constructor() {
    this.overlay = document.getElementById('search-overlay');
    this.searchInput = document.getElementById('search-input');
    this.btnClear = document.getElementById('btn-search-clear');
    this.btnClose = document.getElementById('btn-search-close');
    this.btnToggle = document.getElementById('btn-tool-search');
    this.resultsList = document.getElementById('search-results');

    this.noteManager = null; // Will be set from app.js
    this.settingsManager = null; // Will be set from app.js
    this.debounceTimeout = null;
    this.initEvents();
  }

  initEvents() {
    this.btnToggle.addEventListener('click', () => this.toggleSearch());

    // Nút đóng tìm kiếm
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.closeSearch());
    }

    // Nút xóa nội dung ô tìm kiếm
    if (this.btnClear) {
      this.btnClear.addEventListener('click', () => {
        this.searchInput.value = '';
        this.updateClearBtn();
        this.searchInput.focus();
        this.executeSearch('');
      });
    }

    this.searchInput.addEventListener('input', (e) => {
      this.updateClearBtn();
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = setTimeout(() => {
        this.executeSearch(e.target.value);
      }, 180);
    });

    // Close on escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // If Find Bar is open in note mode, close it
        if (this.noteManager && this.noteManager.isFindBarOpen) {
          this.noteManager.closeFindBar();
          return;
        }
        if (store.getState().isSearchOpen) {
          this.closeSearch();
        }
      }
      // Customizable search shortcut (default: Ctrl+F)
      const searchShortcut = this.settingsManager?.settings?.shortcuts?.quickSearch || 'Ctrl+F';
      if (matchesShortcut(e, searchShortcut)) {
        e.preventDefault();
        const viewMode = store.getState().viewMode || 'checklist';
        if (viewMode === 'note' && this.noteManager) {
          // In Note mode: open inline Find Bar instead of overlay
          if (this.noteManager.isFindBarOpen) {
            // Already open — just refocus input
            this.noteManager.findInput?.focus();
            this.noteManager.findInput?.select();
          } else {
            this.noteManager.openFindBar();
          }
        } else {
          this.openSearch();
        }
      }
    });

    // Close on click outside search box
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.closeSearch();
      }
    });

    store.subscribe('viewMode', () => {
      this.updatePlaceholder();
      if (store.getState().isSearchOpen) {
        this.executeSearch(this.searchInput.value);
      }
    });
  }

  updatePlaceholder() {
    const isNote = store.getState().viewMode === 'note';
    this.searchInput.placeholder = isNote
      ? 'Tìm kiếm nội dung ghi chú trên tất cả các tab...'
      : 'Tìm kiếm việc cần làm trên tất cả các tab...';
  }

  updateClearBtn() {
    if (!this.btnClear) return;
    if (this.searchInput.value.trim().length > 0) {
      this.btnClear.style.display = 'flex';
    } else {
      this.btnClear.style.display = 'none';
    }
  }

  toggleSearch() {
    const viewMode = store.getState().viewMode || 'checklist';

    // In Note mode: toggle Find Bar instead of search overlay
    if (viewMode === 'note' && this.noteManager) {
      if (this.noteManager.isFindBarOpen) {
        this.noteManager.closeFindBar();
      } else {
        this.noteManager.openFindBar();
      }
      return;
    }

    // Checklist mode: toggle search overlay
    if (store.getState().isSearchOpen) {
      this.closeSearch();
    } else {
      this.openSearch();
    }
  }

  openSearch() {
    store.setState({ isSearchOpen: true });
    this.overlay.classList.add('open');
    this.btnToggle.classList.add('active');
    this.updatePlaceholder();
    this.updateClearBtn();
    this.searchInput.focus();
    this.searchInput.select();
    this.executeSearch(this.searchInput.value);
  }

  closeSearch() {
    store.setState({ isSearchOpen: false });
    this.overlay.classList.remove('open');
    this.btnToggle.classList.remove('active');
    this.updateClearBtn();
    
    // Ensure window frame is at top
    const appWin = document.getElementById('app-window');
    if (appWin && appWin.scrollTop !== 0) appWin.scrollTop = 0;
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  }

  async executeSearch(query) {
    const viewMode = store.getState().viewMode || 'checklist';
    if (viewMode === 'note') {
      await this.executeNoteSearch(query);
    } else {
      this.executeChecklistSearch(query);
    }
  }

  async executeNoteSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.resultsList.innerHTML = '<div class="search-no-results">Nhập từ khóa để tìm kiếm nội dung trong sổ tay ghi chú...</div>';
      return;
    }

    const { noteTabs, notes: cachedNotes } = store.getState();
    const fetchedNotes = await Bridge.invoke('get_all_notes') || [];
    
    // Merge database notes with any newer in-memory notes
    const noteMap = new Map();
    fetchedNotes.forEach(n => noteMap.set(n.tab_id, n));
    Object.values(cachedNotes || {}).forEach(n => {
      if (n && n.tab_id) noteMap.set(n.tab_id, n);
    });

    const matches = [];
    noteMap.forEach((note) => {
      const plainText = stripHtml(note.content);
      const lower = plainText.toLowerCase();
      const matchIndex = lower.indexOf(q);
      if (matchIndex !== -1) {
        matches.push({
          note,
          plainText,
          matchIndex
        });
      }
    });

    if (matches.length === 0) {
      this.resultsList.innerHTML = `<div class="search-no-results">Không tìm thấy ghi chú nào khớp với "<b>${escapeHtml(query)}</b>"</div>`;
      return;
    }

    this.resultsList.innerHTML = '';

    // Group by Note Tab
    const grouped = new Map();
    matches.forEach(m => {
      const tabId = m.note.tab_id;
      if (!grouped.has(tabId)) {
        grouped.set(tabId, []);
      }
      grouped.get(tabId).push(m);
    });

    grouped.forEach((items, tabId) => {
      const tabObj = noteTabs.find(t => t.id === tabId);
      const tabName = tabObj ? tabObj.name : 'Ghi chú';

      const groupEl = document.createElement('div');
      groupEl.className = 'search-result-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'search-group-header';
      headerEl.textContent = `📝 ${tabName}`;
      groupEl.appendChild(headerEl);

      items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'search-result-item';

        // Extract context around match
        const start = Math.max(0, item.matchIndex - 35);
        const end = Math.min(item.plainText.length, item.matchIndex + q.length + 55);
        let snippet = item.plainText.substring(start, end).replace(/[\r\n]+/g, ' ').trim();
        if (start > 0) snippet = '...' + snippet;
        if (end < item.plainText.length) snippet = snippet + '...';

        const regex = new RegExp(`(${escapeRegex(q)})`, 'gi');
        const highlightedSnippet = snippet.replace(regex, '<span class="match-highlight">$1</span>');

        itemEl.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
            <div style="font-size: 12px; line-height: 1.4; color: var(--text-primary); word-break: break-word;">
              ${highlightedSnippet}
            </div>
            <div style="font-size: 10.5px; opacity: 0.6; color: var(--text-secondary);">
              Tab: ${escapeHtml(tabName)}
            </div>
          </div>
        `;

        itemEl.addEventListener('click', () => {
          store.setState({ activeNoteTabId: tabId });
          this.closeSearch();
          showToast(`Đã chuyển đến tab ghi chú "${tabName}"`);
          const editor = document.getElementById('note-editor');
          if (editor) editor.focus();
        });

        groupEl.appendChild(itemEl);
      });

      this.resultsList.appendChild(groupEl);
    });
  }

  executeChecklistSearch(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.resultsList.innerHTML = '<div class="search-no-results">Nhập từ khóa để tìm kiếm việc cần làm trên tất cả các tab...</div>';
      return;
    }

    const { tabs, todos } = store.getState();
    const matched = todos.filter(t => t.text.toLowerCase().includes(q));

    if (matched.length === 0) {
      this.resultsList.innerHTML = `<div class="search-no-results">Không tìm thấy công việc nào khớp với "<b>${escapeHtml(query)}</b>"</div>`;
      return;
    }

    this.resultsList.innerHTML = '';

    // Group by tab
    const grouped = new Map();
    matched.forEach(t => {
      if (!grouped.has(t.tab_id)) {
        grouped.set(t.tab_id, []);
      }
      grouped.get(t.tab_id).push(t);
    });

    grouped.forEach((tabTodos, tabId) => {
      const tabObj = tabs.find(t => t.id === tabId);
      const tabName = tabObj ? tabObj.name : 'Khác';

      const groupEl = document.createElement('div');
      groupEl.className = 'search-result-group';

      const headerEl = document.createElement('div');
      headerEl.className = 'search-group-header';
      headerEl.textContent = `📁 ${tabName} (${tabTodos.length})`;
      groupEl.appendChild(headerEl);

      tabTodos.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'search-result-item';

        // Highlight matching text
        const regex = new RegExp(`(${escapeRegex(q)})`, 'gi');
        const highlightedText = item.text.replace(regex, '<span class="match-highlight">$1</span>');

        itemEl.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="opacity: 0.6; font-size: 11px;">${item.completed ? '✓' : '○'}</span>
            <span style="${item.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${highlightedText}</span>
          </div>
          ${item.priority && item.priority !== 'none' ? `<span class="priority-tag ${item.priority}">${item.priority}</span>` : ''}
        `;

        itemEl.addEventListener('click', () => {
          // Switch to this tab if different
          const currentTab = store.getState().activeTabId;
          if (currentTab !== tabId) {
            store.setState({ activeTabId: tabId });
          }
          this.closeSearch();

          const highlightTarget = () => {
            const scrollArea = document.querySelector('.todo-scroll-area');
            const targetEl = document.querySelector(`.todo-item[data-id="${item.id}"]`);
            if (scrollArea && targetEl) {
              const scrollAreaRect = scrollArea.getBoundingClientRect();
              const targetRect = targetEl.getBoundingClientRect();
              const currentScrollTop = scrollArea.scrollTop;
              const relativeTop = targetRect.top - scrollAreaRect.top + currentScrollTop;
              const targetScrollTop = relativeTop - (scrollArea.clientHeight / 2) + (targetRect.height / 2);

              scrollArea.scrollTo({
                top: Math.max(0, targetScrollTop),
                behavior: 'smooth'
              });

              // Clean previous highlights
              document.querySelectorAll('.search-highlight-yellow-glow').forEach(el => {
                el.classList.remove('search-highlight-yellow-glow');
              });

              void targetEl.offsetWidth; // Force DOM reflow
              targetEl.classList.add('search-highlight-yellow-glow');

              // Auto remove after 6 seconds
              if (this.highlightTimer) clearTimeout(this.highlightTimer);
              this.highlightTimer = setTimeout(() => {
                if (targetEl) targetEl.classList.remove('search-highlight-yellow-glow');
              }, 6000);

              return true;
            }
            return false;
          };

          // Try immediately or after render ticks
          setTimeout(() => {
            if (!highlightTarget()) {
              setTimeout(highlightTarget, 150);
            }

            const appWin = document.getElementById('app-window');
            if (appWin && appWin.scrollTop !== 0) appWin.scrollTop = 0;
            if (window.scrollY !== 0) window.scrollTo(0, 0);
          }, 80);
        });

        groupEl.appendChild(itemEl);
      });

      this.resultsList.appendChild(groupEl);
    });
  }
}

function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
