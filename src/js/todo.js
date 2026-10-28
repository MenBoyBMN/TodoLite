/**
 * TodoLite - Todo List Item CRUD & Interactivity
 * Includes rich datetime milestone picker with validation and error alerts.
 */

import { store } from './state.js';
import { Bridge } from './bridge.js';
import { confirmDialog } from './dialog.js';
import { showToast } from './app.js';

export class TodoManager {
  constructor() {
    this.container = document.getElementById('todos-container');
    this.emptyState = document.getElementById('empty-state');
    this.input = document.getElementById('todo-input');
    this.btnAdd = document.getElementById('btn-add-todo');
    this.priorityBtn = document.getElementById('btn-picker-priority');
    this.dateBtn = document.getElementById('btn-picker-date');
    this.charCounter = document.getElementById('char-counter');

    // Deadline Popover Elements
    this.popoverBackdrop = document.getElementById('deadline-popover-backdrop');
    this.btnCloseDeadline = document.getElementById('btn-close-deadline');
    this.deadlineDateInput = document.getElementById('deadline-date-input');
    this.deadlineTimeInput = document.getElementById('deadline-time-input');
    this.deadlineError = document.getElementById('deadline-error');
    this.deadlineErrorText = document.getElementById('deadline-error-text');
    this.btnClearDeadline = document.getElementById('btn-clear-deadline');
    this.btnApplyDeadline = document.getElementById('btn-apply-deadline');

    this.selectedPriority = 'none';
    this.selectedDueDate = null;
    this.editingTodoDeadlineId = null;

    this.initEvents();
    this.initDeadlineEvents();
  }

  initEvents() {
    // Add todo button & Enter key
    this.btnAdd.addEventListener('click', () => this.handleAddTodo());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleAddTodo();
      }
    });

    // Character counter listener (Max 200)
    this.input.addEventListener('input', () => this.updateCharCounter());
    this.updateCharCounter();

    // Priority picker cycle on input bar
    this.priorityBtn.addEventListener('click', () => this.cycleInputPriority());

    // Date picker toggle on input bar
    this.dateBtn.addEventListener('click', () => this.openDeadlinePopover(null));

    // Subscribe to state changes
    store.subscribe('activeTabId', () => this.render());
    store.subscribe('todos', () => this.render());
  }

  initDeadlineEvents() {
    if (!this.popoverBackdrop) return;

    // Close button & backdrop click
    this.btnCloseDeadline.addEventListener('click', () => this.closeDeadlinePopover());
    this.popoverBackdrop.addEventListener('click', (e) => {
      if (e.target === this.popoverBackdrop) {
        this.closeDeadlinePopover();
      }
    });

    // Preset Chips
    const presetButtons = this.popoverBackdrop.querySelectorAll('.preset-chip');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.dataset.preset;
        this.applyPresetMilestone(presetKey);
      });
    });

    // Clear and Apply
    this.btnClearDeadline.addEventListener('click', () => this.handleClearDeadline());
    this.btnApplyDeadline.addEventListener('click', () => this.handleApplyDeadline());

    // Clear error on input change
    this.deadlineDateInput.addEventListener('input', () => this.hideDeadlineError());
    this.deadlineTimeInput.addEventListener('input', () => this.hideDeadlineError());
  }

  cycleInputPriority() {
    const sequence = ['none', 'low', 'medium', 'high'];
    const currentIdx = sequence.indexOf(this.selectedPriority);
    this.selectedPriority = sequence[(currentIdx + 1) % sequence.length];

    const colors = {
      none: 'var(--text-muted)',
      low: 'var(--priority-low)',
      medium: 'var(--priority-medium)',
      high: 'var(--priority-high)'
    };
    this.priorityBtn.style.color = colors[this.selectedPriority];
    this.priorityBtn.title = `Ưu tiên: ${this.selectedPriority.toUpperCase()}`;
  }

  openDeadlinePopover(todoId = null) {
    this.editingTodoDeadlineId = todoId;
    this.hideDeadlineError();

    let initialDate = new Date();
    // Default to today + 2 hours or 18:00
    if (initialDate.getHours() >= 18) {
      initialDate.setDate(initialDate.getDate() + 1);
      initialDate.setHours(9, 0, 0, 0);
    } else {
      initialDate.setHours(18, 0, 0, 0);
    }

    if (todoId) {
      const { todos } = store.getState();
      const item = todos.find(t => t.id === todoId);
      if (item && item.due_date) {
        initialDate = new Date(item.due_date);
      }
    } else if (this.selectedDueDate) {
      initialDate = new Date(this.selectedDueDate);
    }

    const yyyy = initialDate.getFullYear();
    const mm = String(initialDate.getMonth() + 1).padStart(2, '0');
    const dd = String(initialDate.getDate()).padStart(2, '0');
    const hh = String(initialDate.getHours()).padStart(2, '0');
    const min = String(initialDate.getMinutes()).padStart(2, '0');

    this.deadlineDateInput.value = `${yyyy}-${mm}-${dd}`;
    this.deadlineTimeInput.value = `${hh}:${min}`;

    this.popoverBackdrop.classList.add('open');
  }

  closeDeadlinePopover() {
    this.popoverBackdrop.classList.remove('open');
    this.editingTodoDeadlineId = null;
    this.hideDeadlineError();
  }

  applyPresetMilestone(presetKey) {
    const now = new Date();
    let target = new Date();

    switch (presetKey) {
      case 'today-18':
        target.setHours(18, 0, 0, 0);
        break;
      case 'today-21':
        target.setHours(21, 0, 0, 0);
        break;
      case 'tomorrow-09':
        target.setDate(target.getDate() + 1);
        target.setHours(9, 0, 0, 0);
        break;
      case 'tomorrow-18':
        target.setDate(target.getDate() + 1);
        target.setHours(18, 0, 0, 0);
        break;
      case 'weekend': {
        // Find next Saturday
        const day = target.getDay(); // 0 is Sunday, 6 is Saturday
        let daysUntilSat = (6 - day + 7) % 7;
        if (daysUntilSat === 0 && target.getHours() >= 18) daysUntilSat = 7;
        target.setDate(target.getDate() + daysUntilSat);
        target.setHours(18, 0, 0, 0);
        break;
      }
      case 'next-week': {
        // Next Monday
        const day = target.getDay();
        let daysUntilMon = (1 - day + 7) % 7;
        if (daysUntilMon === 0) daysUntilMon = 7;
        target.setDate(target.getDate() + daysUntilMon);
        target.setHours(9, 0, 0, 0);
        break;
      }
    }

    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');
    const hh = String(target.getHours()).padStart(2, '0');
    const min = String(target.getMinutes()).padStart(2, '0');

    this.deadlineDateInput.value = `${yyyy}-${mm}-${dd}`;
    this.deadlineTimeInput.value = `${hh}:${min}`;
    this.hideDeadlineError();
  }

  showDeadlineError(msg) {
    this.deadlineErrorText.textContent = msg;
    this.deadlineError.classList.remove('show');
    // Force DOM reflow to re-trigger shake animation
    void this.deadlineError.offsetWidth;
    this.deadlineError.classList.add('show');
  }

  hideDeadlineError() {
    this.deadlineError.classList.remove('show');
  }

  validateDeadlineInputs() {
    const dateVal = this.deadlineDateInput.value;
    const timeVal = this.deadlineTimeInput.value || '18:00';

    if (!dateVal) {
      this.showDeadlineError('⚠️ Vui lòng chọn ngày hết hạn hợp lệ!');
      return null;
    }

    const isoStr = `${dateVal}T${timeVal}:00`;
    const chosenDate = new Date(isoStr);

    if (isNaN(chosenDate.getTime())) {
      this.showDeadlineError('⚠️ Định dạng ngày giờ không hợp lệ!');
      return null;
    }

    // Check if chosen time is in the past (allow 1 minute grace)
    if (chosenDate.getTime() < Date.now() - 60 * 1000) {
      this.showDeadlineError('⚠️ Thời gian hạn chót đã qua! Vui lòng chọn mốc trong tương lai.');
      return null;
    }

    return chosenDate.toISOString();
  }

  async handleApplyDeadline() {
    const validatedIso = this.validateDeadlineInputs();
    if (!validatedIso) return; // Validation failed, error shown

    if (this.editingTodoDeadlineId) {
      // Update existing todo's deadline
      const { todos } = store.getState();
      const current = todos.find(t => t.id === this.editingTodoDeadlineId);
      if (current) {
        current.due_date = validatedIso;
        try {
          await Bridge.invoke('update_todo_deadline', { id: current.id, due_date: validatedIso });
        } catch (err) {
          console.error('Failed to update deadline in SQLite:', err);
        }
        store.setState({ todos: [...todos] });
      }
    } else {
      // Set for upcoming new todo
      this.selectedDueDate = validatedIso;
      const d = new Date(validatedIso);
      const formatted = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} ${d.getDate()}/${d.getMonth()+1}`;
      this.dateBtn.style.color = 'var(--accent-color)';
      this.dateBtn.title = `Hạn: ${formatted} (Nhấp để sửa)`;
    }

    this.closeDeadlinePopover();
  }

  async handleClearDeadline() {
    if (this.editingTodoDeadlineId) {
      const { todos } = store.getState();
      const current = todos.find(t => t.id === this.editingTodoDeadlineId);
      if (current) {
        current.due_date = null;
        try {
          await Bridge.invoke('update_todo_deadline', { id: current.id, due_date: null });
        } catch (err) {
          console.error('Failed to clear deadline in SQLite:', err);
        }
        store.setState({ todos: [...todos] });
      }
    } else {
      this.selectedDueDate = null;
      this.dateBtn.style.color = 'var(--text-muted)';
      this.dateBtn.title = 'Đặt hạn chót';
    }

    this.closeDeadlinePopover();
  }

  updateCharCounter() {
    if (!this.charCounter) return;
    const len = this.input.value.length;
    this.charCounter.textContent = `${len}/200`;

    if (len > 0) {
      this.charCounter.classList.add('active');
    } else {
      this.charCounter.classList.remove('active');
    }

    if (len >= 200) {
      this.charCounter.classList.add('limit');
      this.charCounter.classList.remove('warning');
    } else if (len >= 180) {
      this.charCounter.classList.add('warning');
      this.charCounter.classList.remove('limit');
    } else {
      this.charCounter.classList.remove('warning', 'limit');
    }
  }

  async handleAddTodo() {
    let text = this.input.value.trim();
    if (!text) return;

    // Strict 200 characters limit
    if (text.length > 200) {
      text = text.substring(0, 200);
    }

    const { activeTabId, todos } = store.getState();
    if (!activeTabId) return;

    const newTodo = await Bridge.invoke('create_todo', {
      tab_id: activeTabId,
      text,
      priority: this.selectedPriority,
      due_date: this.selectedDueDate
    });

    // Reset input and counter
    this.input.value = '';
    this.updateCharCounter();
    this.selectedPriority = 'none';
    this.selectedDueDate = null;
    this.priorityBtn.style.color = 'var(--text-muted)';
    this.dateBtn.style.color = 'var(--text-muted)';
    this.dateBtn.title = 'Đặt hạn chót';

    const updatedTodos = [newTodo, ...todos];
    store.setState({ todos: updatedTodos });
    this.input.focus();
  }

  async handleToggle(todoId) {
    const updatedTodo = await Bridge.invoke('toggle_todo', { id: todoId });
    const { todos } = store.getState();
    const updated = todos.map(t => t.id === todoId ? updatedTodo : t);
    store.setState({ todos: updated });
  }

  async handleCyclePriority(todoId) {
    const { todos } = store.getState();
    const current = todos.find(t => t.id === todoId);
    if (!current) return;

    const sequence = ['none', 'low', 'medium', 'high'];
    const currentIdx = sequence.indexOf(current.priority || 'none');
    const nextPriority = sequence[(currentIdx + 1) % sequence.length];

    try {
      await Bridge.invoke('update_todo_priority', { id: current.id, priority: nextPriority });
    } catch (err) {
      console.error('Failed to update todo priority:', err);
    }

    const priorityNames = {
      none: 'Không ưu tiên',
      low: 'Ưu tiên THẤP',
      medium: 'Ưu tiên VỪA',
      high: 'Ưu tiên CAO'
    };

    const updated = todos.map(t => t.id === todoId ? { ...t, priority: nextPriority } : t);
    store.setState({ todos: updated });
    showToast(`Đã đổi mức độ: ${priorityNames[nextPriority]}`, 'info');
  }

  async handleToggleTodo(todoId) {
    return this.handleToggle(todoId);
  }

  async handleCreateTodoDirect(text, priority = 'none', dueDate = null) {
    const { activeTabId, todos, tabs } = store.getState();
    const tabId = activeTabId || (tabs && tabs[0] ? tabs[0].id : null);
    if (!tabId) return null;

    const newTodo = await Bridge.invoke('create_todo', {
      tab_id: tabId,
      text: text.substring(0, 200),
      priority,
      due_date: dueDate
    });

    const updatedTodos = [newTodo, ...todos];
    store.setState({ todos: updatedTodos });
    return newTodo;
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

  async handleDelete(todoId, itemEl) {
    if (this.shouldConfirmDelete()) {
      const confirmed = await confirmDialog({
        title: 'Xóa công việc?',
        message: 'Công việc này sẽ bị xóa khỏi danh sách của bạn.',
        confirmLabel: 'Xóa công việc',
        danger: true
      });
      if (!confirmed) return;
    }

    itemEl.style.transition = 'all 0.2s ease-out';
    itemEl.style.opacity = '0';
    itemEl.style.transform = 'scale(0.9) translateX(20px)';

    setTimeout(async () => {
      await Bridge.invoke('delete_todo', { id: todoId });
      const { todos } = store.getState();
      const updated = todos.filter(t => t.id !== todoId);
      store.setState({ todos: updated });
    }, 180);
  }

  async handleStartEdit(todo, textEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-edit-input';
    input.value = todo.text;
    input.maxLength = 200;

    textEl.replaceWith(input);
    input.focus();
    input.select();

    const saveEdit = async () => {
      const newText = input.value.trim() || todo.text;
      if (newText !== todo.text) {
        const updatedTodo = await Bridge.invoke('update_todo', { id: todo.id, text: newText });
        const { todos } = store.getState();
        const updated = todos.map(t => t.id === todo.id ? updatedTodo : t);
        store.setState({ todos: updated });
      } else {
        this.render();
      }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = todo.text;
        input.blur();
      }
    });
  }

  formatDueBadge(dueDateStr) {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    if (isNaN(due.getTime())) return null;

    const now = new Date();
    const isOverdue = due < now;

    const timePart = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
    const datePart = `${due.getDate()}/${due.getMonth() + 1}`;

    const isToday = due.toDateString() === now.toDateString();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = due.toDateString() === tomorrow.toDateString();

    let text = `${timePart} ${datePart}`;
    let className = 'due-badge';

    if (isOverdue) {
      text = `Quá hạn (${timePart} ${isToday ? 'Hôm nay' : datePart})`;
      className += ' overdue';
    } else if (isToday) {
      text = `${timePart} Hôm nay`;
      className += ' today';
    } else if (isTomorrow) {
      text = `${timePart} Ngày mai`;
      className += ' tomorrow';
    }

    return { text, className };
  }

  render() {
    const { activeTabId, todos } = store.getState();
    const currentTodos = todos
      .filter(t => t.tab_id === activeTabId)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (currentTodos.length === 0) {
      this.container.innerHTML = '';
      this.emptyState.style.display = 'flex';
      return;
    }

    this.emptyState.style.display = 'none';
    this.container.innerHTML = '';

    currentTodos.forEach(todo => {
      const itemEl = document.createElement('div');
      itemEl.className = `todo-item ${todo.completed ? 'completed' : ''}`;
      itemEl.dataset.id = todo.id;
      itemEl.dataset.priority = todo.priority;

      // Drag Handle (Pointer events handled by DragDropManager)
      const dragHandle = document.createElement('div');
      dragHandle.className = 'todo-drag-handle';
      dragHandle.title = 'Nắm kéo để sắp xếp thứ tự';
      dragHandle.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="9" cy="5" r="1.2"></circle>
          <circle cx="9" cy="12" r="1.2"></circle>
          <circle cx="9" cy="19" r="1.2"></circle>
          <circle cx="15" cy="5" r="1.2"></circle>
          <circle cx="15" cy="12" r="1.2"></circle>
          <circle cx="15" cy="19" r="1.2"></circle>
        </svg>
      `;

      // Checkbox
      const checkboxWrapper = document.createElement('label');
      checkboxWrapper.className = 'todo-checkbox-wrapper';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'todo-checkbox';
      checkbox.checked = Boolean(todo.completed);
      checkbox.addEventListener('change', () => this.handleToggle(todo.id));

      const checkIcon = document.createElement('div');
      checkIcon.className = 'todo-checkbox-icon';
      checkIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;

      checkboxWrapper.appendChild(checkbox);
      checkboxWrapper.appendChild(checkIcon);

      // Content Box
      const contentEl = document.createElement('div');
      contentEl.className = 'todo-content';

      const textEl = document.createElement('div');
      textEl.className = 'todo-text';
      textEl.textContent = todo.text;
      textEl.title = 'Nhấp đúp để chỉnh sửa';
      textEl.addEventListener('dblclick', () => this.handleStartEdit(todo, textEl));

      contentEl.appendChild(textEl);

      // Meta elements (priority badge, due date)
      const metaEl = document.createElement('div');
      metaEl.className = 'todo-meta';

      if (todo.priority && todo.priority !== 'none') {
        const priorityTag = document.createElement('span');
        priorityTag.className = `priority-tag ${todo.priority} is-clickable`;
        priorityTag.textContent = todo.priority.toUpperCase();
        priorityTag.title = 'Nhấp để đổi mức độ ưu tiên';
        priorityTag.style.cursor = 'pointer';
        priorityTag.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleCyclePriority(todo.id);
        });
        metaEl.appendChild(priorityTag);
      }

      const dueInfo = this.formatDueBadge(todo.due_date);
      if (dueInfo) {
        const dueBadge = document.createElement('span');
        dueBadge.className = dueInfo.className;
        dueBadge.title = 'Nhấp để sửa hạn chót';
        dueBadge.style.cursor = 'pointer';
        dueBadge.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          ${dueInfo.text}
        `;
        dueBadge.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openDeadlinePopover(todo.id);
        });
        metaEl.appendChild(dueBadge);
      }

      if (metaEl.children.length > 0) {
        contentEl.appendChild(metaEl);
      }

      // Actions
      const actionsEl = document.createElement('div');
      actionsEl.className = 'todo-actions';

      // Priority toggle button
      const priorityBtn = document.createElement('button');
      priorityBtn.className = `todo-btn btn-priority priority-${todo.priority || 'none'}`;
      const priorityTitles = {
        none: 'Chưa ưu tiên (Nhấp để đặt mức độ)',
        low: 'Ưu tiên: THẤP (Nhấp để đổi)',
        medium: 'Ưu tiên: VỪA (Nhấp để đổi)',
        high: 'Ưu tiên: CAO (Nhấp để đổi)'
      };
      priorityBtn.title = priorityTitles[todo.priority || 'none'];
      priorityBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${todo.priority && todo.priority !== 'none' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
          <line x1="4" y1="22" x2="4" y2="15"></line>
        </svg>
      `;
      priorityBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleCyclePriority(todo.id);
      });
      actionsEl.appendChild(priorityBtn);

      // Deadline button (allows adding/editing deadline on any note)
      const deadlineBtn = document.createElement('button');
      deadlineBtn.className = `todo-btn btn-deadline ${todo.due_date ? 'has-deadline' : ''}`;
      deadlineBtn.title = todo.due_date ? 'Chỉnh sửa hạn chót' : 'Thêm thời gian hạn chót (Deadline)';
      deadlineBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      `;
      deadlineBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDeadlinePopover(todo.id);
      });
      actionsEl.appendChild(deadlineBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'todo-btn btn-delete';
      delBtn.title = 'Xóa task';
      delBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      delBtn.addEventListener('click', () => this.handleDelete(todo.id, itemEl));

      actionsEl.appendChild(delBtn);

      // Assembly
      itemEl.appendChild(dragHandle);
      itemEl.appendChild(checkboxWrapper);
      itemEl.appendChild(contentEl);
      itemEl.appendChild(actionsEl);

      this.container.appendChild(itemEl);
    });
  }
}
