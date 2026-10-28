/**
 * TodoLite - Tab Navigation Management
 * Maximum 4 tabs allowed, with confirmation modal when closing tabs.
 */

import { store } from './state.js';
import { Bridge } from './bridge.js';
import { showToast } from './app.js';

export const MAX_TABS = 4;

export class TabManager {
  constructor() {
    this.tabsListEl = document.getElementById('tabs-list');
    this.addTabBtn = document.getElementById('btn-add-tab');
    this.currentTabTitleEl = document.getElementById('current-tab-title');

    // Confirm Modal Elements
    this.confirmBackdrop = document.getElementById('tab-confirm-modal-backdrop');
    this.confirmTabName = document.getElementById('confirm-tab-name');
    this.btnCancelClose = document.getElementById('btn-cancel-close-tab');
    this.btnConfirmClose = document.getElementById('btn-confirm-close-tab');

    this.pendingCloseTab = null;

    this.initEvents();
  }

  initEvents() {
    this.addTabBtn.addEventListener('click', () => this.handleCreateTab());

    // Modal Events
    if (this.btnCancelClose) {
      this.btnCancelClose.addEventListener('click', () => this.closeConfirmModal());
    }
    if (this.btnConfirmClose) {
      this.btnConfirmClose.addEventListener('click', () => this.executeDeleteTab());
    }
    if (this.confirmBackdrop) {
      this.confirmBackdrop.addEventListener('click', (e) => {
        if (e.target === this.confirmBackdrop) {
          this.closeConfirmModal();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (this.confirmBackdrop && this.confirmBackdrop.classList.contains('open')) {
        if (e.key === 'Escape') {
          this.closeConfirmModal();
        } else if (e.key === 'Enter') {
          this.executeDeleteTab();
        }
      }
    });

    // Subscribe to state updates
    store.subscribe('tabs', () => this.render());
    store.subscribe('activeTabId', () => {
      this.render();
      this.updateCurrentTabLabel();
    });
    store.subscribe('todos', () => this.render());
    store.subscribe('viewMode', (mode) => {
      if (mode === 'checklist') {
        this.updateCurrentTabLabel();
      }
    });
  }

  showToast(message, type = 'info') {
    showToast(message, type);
  }

  async loadInitialData() {
    await Bridge.syncAndRecoverData();
    const tabs = await Bridge.invoke('get_all_tabs');
    const todos = await Bridge.invoke('get_all_todos');
    const isPinned = JSON.parse(localStorage.getItem('todolite_always_on_top') || 'true');

    store.setState({
      tabs: tabs || [],
      todos: todos || [],
      activeTabId: tabs && tabs.length > 0 ? tabs[0].id : null,
      isPinned
    });
  }

  async handleCreateTab() {
    const tabs = store.getState().tabs;

    // Strict limit: maximum 4 tabs
    if (tabs.length >= MAX_TABS) {
      this.showToast('⚠️ Bạn chỉ có thể mở tối đa 4 tab công việc!', 'error');
      this.addTabBtn.classList.add('shake');
      setTimeout(() => this.addTabBtn.classList.remove('shake'), 400);
      return;
    }

    const defaultName = `Tab ${tabs.length + 1}`;
    const newTab = await Bridge.invoke('create_tab', { name: defaultName });

    const updatedTabs = [...tabs, newTab];
    store.setState({
      tabs: updatedTabs,
      activeTabId: newTab.id
    });
  }

  async handleSwitchTab(tabId) {
    if (store.getState().activeTabId === tabId) return;
    store.setState({ activeTabId: tabId });
  }

  shouldConfirmDelete() {
    try {
      const stored = localStorage.getItem('todolite_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.confirmDelete !== undefined) return Boolean(parsed.confirmDelete);
      }
    } catch (_) {}
    return true;
  }

  promptCloseTab(tab, e) {
    if (e) e.stopPropagation();
    const { tabs } = store.getState();

    if (tabs.length <= 1) {
      this.showToast('⚠️ Cần giữ lại ít nhất 1 tab công việc!', 'error');
      return;
    }

    this.pendingCloseTab = tab;

    if (!this.shouldConfirmDelete()) {
      this.executeDeleteTab();
      return;
    }

    if (this.confirmTabName) {
      this.confirmTabName.textContent = tab.name;
    }

    if (this.confirmBackdrop) {
      this.confirmBackdrop.classList.add('open');
      this.btnCancelClose?.focus();
    }
  }

  closeConfirmModal() {
    this.pendingCloseTab = null;
    if (this.confirmBackdrop) {
      this.confirmBackdrop.classList.remove('open');
    }
  }

  async executeDeleteTab() {
    if (!this.pendingCloseTab) return;
    const tabToDelete = this.pendingCloseTab;
    this.closeConfirmModal();

    const { tabs, activeTabId } = store.getState();
    await Bridge.invoke('delete_tab', { id: tabToDelete.id });

    const remainingTabs = tabs.filter(t => t.id !== tabToDelete.id);
    let nextActiveId = activeTabId;

    if (activeTabId === tabToDelete.id) {
      nextActiveId = remainingTabs.length > 0 ? remainingTabs[0].id : null;
    }

    // Refresh todos as well since todos belonging to deleted tab were removed
    const updatedTodos = await Bridge.invoke('get_all_todos');

    store.setState({
      tabs: remainingTabs,
      todos: updatedTodos,
      activeTabId: nextActiveId
    });

    this.showToast(`Đã đóng tab "${tabToDelete.name}"`, 'info');
  }

  handleStartRename(tab, titleEl) {
    const currentName = tab.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-title-edit';
    input.value = currentName;
    input.maxLength = 30;
    input.style.width = '80px';
    input.style.border = '1px solid var(--accent-color)';
    input.style.borderRadius = '3px';
    input.style.padding = '1px 4px';
    input.style.fontSize = '12px';
    input.style.outline = 'none';

    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const saveName = async () => {
      const newName = input.value.trim() || currentName;
      await Bridge.invoke('update_tab', { id: tab.id, name: newName });
      const { tabs } = store.getState();
      const updated = tabs.map(t => t.id === tab.id ? { ...t, name: newName } : t);
      store.setState({ tabs: updated });
    };

    input.addEventListener('blur', saveName);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = currentName;
        input.blur();
      }
    });
  }

  updateCurrentTabLabel() {
    const { tabs, activeTabId, viewMode } = store.getState();
    if (viewMode !== 'checklist') return;
    const current = tabs.find(t => t.id === activeTabId);
    if (this.currentTabTitleEl && current) {
      this.currentTabTitleEl.textContent = current.name;
    }
  }

  render() {
    const { tabs, activeTabId, todos } = store.getState();
    this.tabsListEl.innerHTML = '';

    // Update '+' button visual state when reaching 4 tabs limit
    if (tabs.length >= MAX_TABS) {
      this.addTabBtn.classList.add('at-limit');
      this.addTabBtn.title = 'Đã đạt tối đa 4 tab (Nhấp để xem thông báo)';
    } else {
      this.addTabBtn.classList.remove('at-limit');
      this.addTabBtn.title = 'Thêm tab mới';
    }

    tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = `tab-item ${tab.id === activeTabId ? 'active' : ''}`;
      tabEl.dataset.tabId = tab.id;

      // Unfinished todo count for this tab
      const uncompletedCount = todos.filter(t => t.tab_id === tab.id && !t.completed).length;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title';
      titleSpan.textContent = tab.name;
      titleSpan.title = 'Nhấp đúp để đổi tên';

      // Double click to rename
      titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.handleStartRename(tab, titleSpan);
      });

      const countBadge = document.createElement('span');
      countBadge.className = 'tab-count';
      countBadge.textContent = uncompletedCount;
      if (uncompletedCount === 0) {
        countBadge.style.opacity = '0.5';
      }

      tabEl.appendChild(titleSpan);
      tabEl.appendChild(countBadge);

      // Close button if more than 1 tab
      if (tabs.length > 1) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tab-close-btn';
        closeBtn.title = 'Đóng tab';
        closeBtn.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `;
        closeBtn.addEventListener('click', (e) => this.promptCloseTab(tab, e));
        tabEl.appendChild(closeBtn);
      }

      // Drag reordering & click to switch
      this.attachTabDragEvents(tabEl, tab);

      this.tabsListEl.appendChild(tabEl);
    });
  }

  attachTabDragEvents(tabEl, tab) {
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    let hasDragged = false;
    let ghostEl = null;
    let targetSlot = null;

    const onPointerMove = (e) => {
      const deltaX = e.clientX - startX;

      if (!isDragging) {
        if (Math.abs(deltaX) < 5) return;
        isDragging = true;
        hasDragged = true;
        tabEl.classList.add('is-dragging-tab');

        ghostEl = tabEl.cloneNode(true);
        ghostEl.className = 'tab-drag-ghost';
        ghostEl.style.width = `${tabEl.offsetWidth}px`;
        ghostEl.style.left = `${e.clientX - 25}px`;
        ghostEl.style.top = `${tabEl.getBoundingClientRect().top}px`;
        document.body.appendChild(ghostEl);
      }

      if (ghostEl) {
        ghostEl.style.left = `${e.clientX - 25}px`;
      }

      // Calculate slot
      const allTabs = Array.from(this.tabsListEl.querySelectorAll('.tab-item:not(.tab-drag-ghost)'));
      let slot = allTabs.length;
      for (let i = 0; i < allTabs.length; i++) {
        const rect = allTabs[i].getBoundingClientRect();
        if (e.clientX < rect.left + rect.width / 2) {
          slot = i;
          break;
        }
      }
      targetSlot = slot;
    };

    const onPointerUp = async (e) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
      tabEl.classList.remove('is-dragging-tab');

      if (isDragging && targetSlot !== null) {
        const { tabs } = store.getState();
        const originIndex = tabs.findIndex(t => t.id === tab.id);

        if (originIndex !== -1 && targetSlot !== originIndex && targetSlot !== originIndex + 1) {
          const reordered = [...tabs];
          const [moved] = reordered.splice(originIndex, 1);
          const insertIndex = targetSlot > originIndex ? targetSlot - 1 : targetSlot;
          reordered.splice(insertIndex, 0, moved);

          const orderMap = reordered.map((t, idx) => ({ id: t.id, sort_order: idx }));

          try {
            await Bridge.invoke('reorder_tabs', { items: orderMap });
          } catch (err) {
            console.error('Failed to persist tab reorder:', err);
          }

          const updatedTabs = reordered.map((t, idx) => ({ ...t, sort_order: idx }));
          store.setState({ tabs: updatedTabs });
        }
      }

      isDragging = false;
      setTimeout(() => {
        hasDragged = false;
      }, 60);
    };

    tabEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.tab-close-btn') || e.target.closest('.tab-title-edit')) return;

      startX = e.clientX;
      startY = e.clientY;
      isDragging = false;
      hasDragged = false;

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });

    tabEl.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      this.handleSwitchTab(tab.id);
    });
  }
}
