/**
 * TodoLite - High Performance Pointer-Event Drag & Drop Reordering
 * Robust against WebView2 HTML5 DnD limitations, provides silky-smooth floating ghost & indicator line.
 */

import { store } from './state.js';
import { Bridge } from './bridge.js';
import { showToast } from './app.js';

export class DragDropManager {
  constructor() {
    this.container = document.getElementById('todos-container');
    this.scrollArea = document.querySelector('.todo-scroll-area');

    this.activeItem = null;
    this.ghostEl = null;
    this.indicatorLine = null;
    this.isDragging = false;

    this.startY = 0;
    this.startX = 0;
    this.initialRect = null;
    this.activePointerId = null;

    this.targetSlot = null;
    this.targetTabId = null;
    this.currentHoveredTabEl = null;

    this.initEvents();
  }

  initEvents() {
    // Delegated pointerdown on container
    this.container.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
  }

  handlePointerDown(e) {
    if (e.button !== 0) return; // Only primary mouse button

    const handle = e.target.closest('.todo-drag-handle');
    if (!handle) return;

    const item = handle.closest('.todo-item');
    if (!item) return;

    e.preventDefault();

    this.activeItem = item;
    this.activePointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.initialRect = item.getBoundingClientRect();
    this.isDragging = false;
    this.targetSlot = null;

    // Global listeners during drag
    this.onPointerMove = (ev) => this.handlePointerMove(ev);
    this.onPointerUp = (ev) => this.handlePointerUp(ev);

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  handlePointerMove(e) {
    if (!this.activeItem) return;

    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;

    // Threshold of 4px movement before engaging drag mode
    if (!this.isDragging) {
      if (Math.abs(deltaY) < 4 && Math.abs(deltaX) < 4) {
        return;
      }
      this.startDragging();
    }

    // Move ghost element
    if (this.ghostEl) {
      this.ghostEl.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.02) rotate(1.2deg)`;
    }

    // Auto scroll container when near top or bottom edge
    if (this.scrollArea) {
      const scrollRect = this.scrollArea.getBoundingClientRect();
      const edgeThreshold = 40;
      if (e.clientY < scrollRect.top + edgeThreshold) {
        this.scrollArea.scrollTop -= 7;
      } else if (e.clientY > scrollRect.bottom - edgeThreshold) {
        this.scrollArea.scrollTop += 7;
      }
    }

    // Check if hovering over another tab in #tabs-list
    const tabListEl = document.getElementById('tabs-list');
    let hoveredTab = null;
    if (tabListEl) {
      const tabs = Array.from(tabListEl.querySelectorAll('.tab-item'));
      for (const tab of tabs) {
        const tr = tab.getBoundingClientRect();
        if (
          e.clientX >= tr.left &&
          e.clientX <= tr.right &&
          e.clientY >= tr.top - 12 &&
          e.clientY <= tr.bottom + 12
        ) {
          hoveredTab = tab;
          break;
        }
      }
    }

    const currentTabId = store.getState().activeTabId;
    if (hoveredTab && hoveredTab.dataset.tabId && hoveredTab.dataset.tabId !== currentTabId) {
      this.targetTabId = hoveredTab.dataset.tabId;
      if (this.currentHoveredTabEl && this.currentHoveredTabEl !== hoveredTab) {
        this.currentHoveredTabEl.classList.remove('tab-drop-hover');
      }
      this.currentHoveredTabEl = hoveredTab;
      hoveredTab.classList.add('tab-drop-hover');

      // Hide indicator line while hovering over tab
      if (this.indicatorLine) this.indicatorLine.style.display = 'none';
      this.targetSlot = null;
    } else {
      if (this.currentHoveredTabEl) {
        this.currentHoveredTabEl.classList.remove('tab-drop-hover');
        this.currentHoveredTabEl = null;
      }
      this.targetTabId = null;
      // Calculate drop target within list
      this.updateDropTarget(e.clientY);
    }
  }

  startDragging() {
    this.isDragging = true;
    document.body.classList.add('is-reordering-active');
    this.activeItem.classList.add('is-dragging-origin');

    // Create floating ghost
    const rect = this.initialRect;
    this.ghostEl = this.activeItem.cloneNode(true);
    this.ghostEl.classList.add('todo-drag-ghost');
    this.ghostEl.style.width = `${rect.width}px`;
    this.ghostEl.style.height = `${rect.height}px`;
    this.ghostEl.style.left = `${rect.left}px`;
    this.ghostEl.style.top = `${rect.top}px`;
    document.body.appendChild(this.ghostEl);

    // Create indicator line
    this.indicatorLine = document.createElement('div');
    this.indicatorLine.className = 'drop-indicator-line';
    this.container.appendChild(this.indicatorLine);
  }

  updateDropTarget(pointerY) {
    const allItems = Array.from(this.container.querySelectorAll('.todo-item'));
    if (allItems.length === 0) {
      this.targetSlot = null;
      if (this.indicatorLine) this.indicatorLine.style.display = 'none';
      return;
    }

    const containerRect = this.container.getBoundingClientRect();
    const rects = allItems.map(item => item.getBoundingClientRect());

    // Determine target slot (0 to allItems.length)
    // Slot 0 is before item 0; Slot k is between item k-1 and item k; Slot N is after item N-1
    let slot = allItems.length;
    for (let i = 0; i < allItems.length; i++) {
      const midY = rects[i].top + rects[i].height / 2;
      if (pointerY < midY) {
        slot = i;
        break;
      }
    }

    this.targetSlot = slot;

    // Position the indicator line precisely in the gap between tasks
    if (this.indicatorLine) {
      let targetTop = 0;
      if (slot === 0) {
        targetTop = (rects[0].top - containerRect.top) - 4;
      } else if (slot === allItems.length) {
        targetTop = (rects[allItems.length - 1].bottom - containerRect.top) + 4;
      } else {
        const prevBottom = rects[slot - 1].bottom;
        const nextTop = rects[slot].top;
        targetTop = ((prevBottom + nextTop) / 2) - containerRect.top;
      }

      this.indicatorLine.style.display = 'block';
      this.indicatorLine.style.top = `${targetTop}px`;
      this.indicatorLine.style.left = '0px';
      this.indicatorLine.style.width = '100%';
    }
  }

  async handlePointerUp(e) {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);

    document.body.classList.remove('is-reordering-active');

    if (this.ghostEl) {
      this.ghostEl.remove();
      this.ghostEl = null;
    }

    if (this.indicatorLine) {
      this.indicatorLine.remove();
      this.indicatorLine = null;
    }

    if (this.currentHoveredTabEl) {
      this.currentHoveredTabEl.classList.remove('tab-drop-hover');
      this.currentHoveredTabEl = null;
    }

    const draggedItem = this.activeItem;
    if (draggedItem) {
      draggedItem.classList.remove('is-dragging-origin');
    }

    // Dropped onto another task/tab!
    if (this.isDragging && draggedItem && this.targetTabId) {
      const todoId = draggedItem.dataset.id;
      const targetTabId = this.targetTabId;
      const { tabs, todos } = store.getState();
      const targetTab = tabs.find(t => t.id === targetTabId);
      const tabName = targetTab ? targetTab.name : 'Tab mới';

      try {
        await Bridge.invoke('move_todo_to_tab', { id: todoId, tab_id: targetTabId });
      } catch (err) {
        console.error('Failed to move todo to tab:', err);
      }

      // Update state: change tab_id of the moved todo
      const updatedTodos = todos.map(t => t.id === todoId ? { ...t, tab_id: targetTabId } : t);
      store.setState({ todos: updatedTodos });
      showToast(`Đã chuyển note sang tab "${tabName}" ✨`, 'success');

      this.isDragging = false;
      this.activeItem = null;
      this.targetSlot = null;
      this.targetTabId = null;
      return;
    }

    if (this.isDragging && draggedItem && this.targetSlot !== null) {
      const allItems = Array.from(this.container.querySelectorAll('.todo-item'));
      const originIndex = allItems.indexOf(draggedItem);

      // Only reorder if slot represents a changed position
      if (originIndex !== -1 && this.targetSlot !== originIndex && this.targetSlot !== originIndex + 1) {
        const referenceNode = allItems[this.targetSlot] || null;
        this.container.insertBefore(draggedItem, referenceNode);

        // Read new order from DOM
        const itemElements = Array.from(this.container.querySelectorAll('.todo-item'));
        const orderMap = itemElements.map((el, index) => ({
          id: el.dataset.id,
          sort_order: index,
          sortOrder: index
        }));

        // Flash dropped item with confirmation glow
        draggedItem.classList.add('item-dropped-flash');
        setTimeout(() => {
          if (draggedItem) draggedItem.classList.remove('item-dropped-flash');
        }, 500);

        // Invoke backend persist
        try {
          await Bridge.invoke('reorder_todos', { items: orderMap });
        } catch (err) {
          console.error('Failed to persist reorder to SQLite:', err);
        }

        // Update state
        const { todos } = store.getState();
        const lookup = new Map(orderMap.map(x => [x.id, x.sort_order]));
        const updated = todos.map(t => lookup.has(t.id) ? { ...t, sort_order: lookup.get(t.id) } : t);
        store.setState({ todos: updated });
      }
    }

    this.isDragging = false;
    this.activeItem = null;
    this.targetSlot = null;
  }
}
