/**
 * TodoLite - Bridge Layer between Frontend and Tauri Backend
 * Provides transparent fallback to localStorage when running in standard browser/preview.
 */

const STORAGE_KEY_TABS = 'todolite_tabs_data';
const STORAGE_KEY_NOTE_TABS = 'todolite_note_tabs_data';
const STORAGE_KEY_TODOS = 'todolite_todos_data';
const STORAGE_KEY_NOTES = 'todolite_notes_data';

// Initial default seed note tabs
const DEFAULT_NOTE_TABS = [
  { id: 'note-tab-1', name: 'Ghi chú 1', sort_order: 0, created_at: new Date().toISOString() },
  { id: 'note-tab-2', name: 'Ý tưởng', sort_order: 1, created_at: new Date().toISOString() }
];

// Initial default seed notes
const DEFAULT_NOTES = {
  'note-tab-1': {
    id: 'note-1',
    tab_id: 'note-tab-1',
    content: '<h2>Chào mừng bạn đến với TakeNote! ✨</h2><p>Đây là sổ tay ghi chú thông minh được tích hợp ngay trong TodoLite.</p><ul><li>Hỗ trợ gõ tiếng Việt có dấu chuẩn xác 🇻🇳</li><li>Có thể <strong>in đậm</strong>, <em>in nghiêng</em>, <u>gạch chân</u></li><li><mark style="background-color: #fef08a;">Highlight màu sắc</mark> để làm nổi bật ý quan trọng</li><li>Chèn biểu tượng cảm xúc 💡 🎯 🚀</li></ul><p>Thử ghi lại những suy nghĩ hay ghi chú công việc của bạn ngay tại đây nhé!</p>',
    updated_at: new Date().toISOString()
  }
};

// Initial default seed data for first launch
const DEFAULT_TABS = [
  { id: 'tab-1', name: 'Công việc', sort_order: 0, created_at: new Date().toISOString() },
  { id: 'tab-2', name: 'Cá nhân', sort_order: 1, created_at: new Date().toISOString() }
];

const DEFAULT_TODOS = [
  {
    id: 'todo-1',
    tab_id: 'tab-1',
    text: 'Hoàn thành báo cáo tiến độ tuần',
    completed: 0,
    priority: 'high',
    sort_order: 0,
    due_date: new Date(Date.now() + 3600 * 1000 * 4).toISOString(),
    created_at: new Date().toISOString()
  },
  {
    id: 'todo-2',
    tab_id: 'tab-1',
    text: 'Gửi email xác nhận kế hoạch cho team',
    completed: 1,
    priority: 'medium',
    sort_order: 1,
    due_date: null,
    created_at: new Date().toISOString()
  },
  {
    id: 'todo-3',
    tab_id: 'tab-2',
    text: 'Mua cuốn sổ tay và bút mực mới',
    completed: 0,
    priority: 'low',
    sort_order: 0,
    due_date: null,
    created_at: new Date().toISOString()
  }
];

export class Bridge {
  static isTauri() {
    return typeof window !== 'undefined' && 
      (Boolean(window.__TAURI_INTERNALS__) || Boolean(window.__TAURI__));
  }

  static formatArgs(command, args = {}) {
    const res = { ...args };
    if (command === 'create_todo') {
      const tabId = args.tab_id || args.tabId;
      const dueDate = args.due_date !== undefined ? args.due_date : (args.dueDate !== undefined ? args.dueDate : null);
      res.tab_id = tabId;
      res.tabId = tabId;
      res.due_date = dueDate;
      res.dueDate = dueDate;
      res.text = args.text || '';
      res.priority = args.priority || 'none';
    } else if (command === 'reorder_todos' || command === 'reorder_tabs' || command === 'reorder_note_tabs') {
      res.items = (args.items || []).map(item => ({
        id: item.id,
        sort_order: item.sort_order ?? item.sortOrder ?? 0,
        sortOrder: item.sort_order ?? item.sortOrder ?? 0
      }));
    } else if (command === 'update_todo_priority') {
      res.id = args.id;
      res.priority = args.priority || 'none';
    } else if (command === 'move_todo_to_tab') {
      const tabId = args.tab_id || args.tabId;
      res.id = args.id;
      res.tab_id = tabId;
      res.tabId = tabId;
    } else if (command === 'update_todo_deadline') {
      const dueDate = args.due_date !== undefined ? args.due_date : (args.dueDate !== undefined ? args.dueDate : null);
      res.id = args.id;
      res.due_date = dueDate;
      res.dueDate = dueDate;
    } else if (command === 'set_always_on_top') {
      const val = args.always_on_top ?? args.alwaysOnTop ?? true;
      res.always_on_top = val;
      res.alwaysOnTop = val;
    } else if (command === 'upsert_note') {
      const tabId = args.tab_id || args.tabId;
      res.tab_id = tabId;
      res.tabId = tabId;
      res.content = args.content ?? '';
    } else if (command === 'get_note_by_tab') {
      const tabId = args.tab_id || args.tabId;
      res.tab_id = tabId;
      res.tabId = tabId;
    } else if (command === 'pick_export_directory') {
      const defaultPath = args.default_path !== undefined ? args.default_path : (args.defaultPath !== undefined ? args.defaultPath : null);
      res.default_path = defaultPath;
      res.defaultPath = defaultPath;
    } else if (command === 'save_exported_file') {
      res.directory = args.directory || '';
      res.filename = args.filename || '';
      res.content = args.content || '';
    } else if (command === 'open_export_directory') {
      res.directory = args.directory || '';
    } else if (command === 'set_autostart') {
      res.enable = Boolean(args.enable);
    } else if (command === 'register_global_toggle_shortcut') {
      res.shortcut = args.shortcut || '';
    } else if (command === 'restore_backup') {
      res.tabs = args.tabs || [];
      res.todos = args.todos || [];
      res.note_tabs = args.note_tabs || args.noteTabs || [];
      res.noteTabs = res.note_tabs;
      res.notes = args.notes || [];
    }
    return res;
  }

  static async rawTauriInvoke(command, formattedArgs = {}) {
    if (typeof window !== 'undefined') {
      if (window.__TAURI__?.core?.invoke) {
        return await window.__TAURI__.core.invoke(command, formattedArgs);
      }
      if (window.__TAURI_INTERNALS__?.invoke) {
        return await window.__TAURI_INTERNALS__.invoke(command, formattedArgs);
      }
    }
    throw new Error('Tauri not available');
  }

  static async invoke(command, args = {}) {
    const formattedArgs = this.formatArgs(command, args);

    if (this.isTauri()) {
      try {
        const result = await this.rawTauriInvoke(command, formattedArgs);
        // Synchronize to localStorage backup
        try {
          this.syncBackup(command, args, result);
        } catch (_) {}
        return result;
      } catch (err) {
        console.warn(`Tauri invoke "${command}" failed, fallback to local store:`, err);
      }
    }

    // Local Storage Fallback Implementation
    return this.fallbackHandler(command, args);
  }

  static syncBackup(command, args, result) {
    if (command === 'create_todo' && result) {
      const todos = this.fallbackHandler('get_all_todos');
      if (!todos.some(t => t.id === result.id)) {
        todos.unshift(result);
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
      }
    } else if (command === 'toggle_todo' && result) {
      const todos = this.fallbackHandler('get_all_todos');
      const idx = todos.findIndex(t => t.id === result.id);
      if (idx !== -1) {
        todos[idx] = result;
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
      }
    } else if (command === 'update_todo' && result) {
      const todos = this.fallbackHandler('get_all_todos');
      const idx = todos.findIndex(t => t.id === result.id);
      if (idx !== -1) {
        todos[idx] = result;
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
      }
    } else if (command === 'update_todo_deadline' && result) {
      const todos = this.fallbackHandler('get_all_todos');
      const idx = todos.findIndex(t => t.id === result.id);
      if (idx !== -1) {
        todos[idx] = result;
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
      }
    } else if (command === 'update_todo_priority' && result) {
      const todos = this.fallbackHandler('get_all_todos');
      const idx = todos.findIndex(t => t.id === result.id);
      if (idx !== -1) {
        todos[idx] = result;
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
      }
    } else if (command === 'move_todo_to_tab' && result) {
      const todos = this.fallbackHandler('get_all_todos');
      const idx = todos.findIndex(t => t.id === result.id);
      if (idx !== -1) {
        todos[idx] = result;
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
      }
    } else if (command === 'delete_todo') {
      let todos = this.fallbackHandler('get_all_todos');
      todos = todos.filter(t => t.id !== args.id);
      localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
    } else if (command === 'reorder_todos') {
      let todos = this.fallbackHandler('get_all_todos');
      const map = new Map((args.items || []).map(item => [item.id, item.sort_order ?? item.sortOrder]));
      todos.forEach(t => {
        if (map.has(t.id)) t.sort_order = map.get(t.id);
      });
      localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
    } else if (command === 'reorder_tabs') {
      let tabs = this.fallbackHandler('get_all_tabs');
      const map = new Map((args.items || []).map(item => [item.id, item.sort_order ?? item.sortOrder]));
      tabs.forEach(t => {
        if (map.has(t.id)) t.sort_order = map.get(t.id);
      });
      tabs.sort((a, b) => a.sort_order - b.sort_order);
      localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
    } else if (command === 'reorder_note_tabs') {
      let noteTabs = this.fallbackHandler('get_all_note_tabs');
      const map = new Map((args.items || []).map(item => [item.id, item.sort_order ?? item.sortOrder]));
      noteTabs.forEach(t => {
        if (map.has(t.id)) t.sort_order = map.get(t.id);
      });
      noteTabs.sort((a, b) => a.sort_order - b.sort_order);
      localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(noteTabs));
    } else if (command === 'create_tab' && result) {
      const tabs = this.fallbackHandler('get_all_tabs');
      if (!tabs.some(t => t.id === result.id)) {
        tabs.push(result);
        localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
      }
    } else if (command === 'update_tab' && result) {
      const tabs = this.fallbackHandler('get_all_tabs');
      const idx = tabs.findIndex(t => t.id === result.id);
      if (idx !== -1) {
        tabs[idx] = result;
        localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
      }
    } else if (command === 'delete_tab') {
      let tabs = this.fallbackHandler('get_all_tabs');
      tabs = tabs.filter(t => t.id !== args.id);
      localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
      let todos = this.fallbackHandler('get_all_todos');
      todos = todos.filter(t => t.tab_id !== args.id);
      localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
    } else if (command === 'create_note_tab' && result) {
      const noteTabs = this.fallbackHandler('get_all_note_tabs');
      if (!noteTabs.some(t => t.id === result.id)) {
        noteTabs.push(result);
        localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(noteTabs));
      }
    } else if (command === 'update_note_tab' && result) {
      const noteTabs = this.fallbackHandler('get_all_note_tabs');
      const idx = noteTabs.findIndex(t => t.id === result.id);
      if (idx !== -1) {
        noteTabs[idx] = result;
        localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(noteTabs));
      }
    } else if (command === 'delete_note_tab') {
      let noteTabs = this.fallbackHandler('get_all_note_tabs');
      noteTabs = noteTabs.filter(t => t.id !== args.id);
      localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(noteTabs));
      let notes = this.fallbackHandler('get_all_notes_internal');
      delete notes[args.id];
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } else if (command === 'upsert_note' && result) {
      let notes = this.fallbackHandler('get_all_notes_internal');
      notes[result.tab_id] = result;
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    } else if (command === 'reset_database') {
      localStorage.removeItem(STORAGE_KEY_TABS);
      localStorage.removeItem(STORAGE_KEY_TODOS);
      localStorage.removeItem(STORAGE_KEY_NOTE_TABS);
      localStorage.removeItem(STORAGE_KEY_NOTES);
    } else if (command === 'restore_backup' && args) {
      const tabs = args.tabs || [];
      const todos = args.todos || [];
      const noteTabs = args.note_tabs || args.noteTabs || [];
      const notesList = args.notes || [];
      localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
      localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
      localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(noteTabs));
      const notesObj = {};
      notesList.forEach(n => {
        if (n && n.tab_id) notesObj[n.tab_id] = n;
      });
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notesObj));
    }
  }

  static async syncAndRecoverData() {
    if (!this.isTauri()) return;
    try {
      const dbTabs = await this.rawTauriInvoke('get_all_tabs').catch(() => []);
      const dbTodos = await this.rawTauriInvoke('get_all_todos').catch(() => []);

      const localTodosRaw = localStorage.getItem(STORAGE_KEY_TODOS);
      const localTabsRaw = localStorage.getItem(STORAGE_KEY_TABS);
      const localTodos = localTodosRaw ? JSON.parse(localTodosRaw) : [];
      const localTabs = localTabsRaw ? JSON.parse(localTabsRaw) : [];

      console.log(`[TodoLite Sync] SQLite: ${dbTabs.length} tabs, ${dbTodos.length} todos | LocalStorage: ${localTabs.length} tabs, ${localTodos.length} todos`);

      // If SQLite has tabs but 0 todos, and localStorage has saved todos: migrate them!
      if (dbTodos.length === 0 && localTodos.length > 0) {
        console.log(`[TodoLite Recovery] Recovering ${localTodos.length} todos into SQLite...`);
        const tabIdMap = new Set(dbTabs.map(t => t.id));
        const firstTabId = dbTabs.length > 0 ? dbTabs[0].id : null;

        for (const todo of localTodos) {
          let targetTabId = todo.tab_id;
          if (!tabIdMap.has(targetTabId)) {
            if (firstTabId) {
              targetTabId = firstTabId;
            } else {
              const newTab = await this.rawTauriInvoke('create_tab', { name: 'Công việc' });
              targetTabId = newTab.id;
              tabIdMap.add(newTab.id);
            }
          }

          try {
            await this.rawTauriInvoke('create_todo', this.formatArgs('create_todo', {
              tab_id: targetTabId,
              text: todo.text,
              priority: todo.priority || 'none',
              due_date: todo.due_date || null
            }));
          } catch (createErr) {
            console.error('Failed to recover todo into SQLite:', createErr);
          }
        }
      }

      // Recover notes into SQLite if SQLite has note_tabs and missing note content
      const dbNoteTabs = await this.rawTauriInvoke('get_all_note_tabs').catch(() => []);
      const dbNotes = await this.rawTauriInvoke('get_all_notes').catch(() => []);
      const localNotesRaw = localStorage.getItem(STORAGE_KEY_NOTES);
      let localNotes = {};
      if (localNotesRaw) {
        try { localNotes = JSON.parse(localNotesRaw); } catch (_) {}
      }

      const dbNotesByTab = new Map(dbNotes.map(n => [n.tab_id, n]));
      for (const noteTab of dbNoteTabs) {
        const existingNote = dbNotesByTab.get(noteTab.id);
        if (!existingNote || !existingNote.content || !existingNote.content.trim()) {
          const localNote = localNotes[noteTab.id] || (dbNoteTabs.length === 1 ? Object.values(localNotes)[0] : null);
          if (localNote && localNote.content && localNote.content.trim()) {
            console.log(`[TodoLite Recovery] Recovering note for tab "${noteTab.name}" into SQLite...`);
            await this.rawTauriInvoke('upsert_note', this.formatArgs('upsert_note', {
              tab_id: noteTab.id,
              content: localNote.content
            })).catch((err) => console.error('Failed to recover note:', err));
          }
        }
      }
    } catch (err) {
      console.warn('Sync and recover check encountered an issue:', err);
    }
  }

  static fallbackHandler(command, args) {
    switch (command) {
      case 'get_all_tabs': {
        const raw = localStorage.getItem(STORAGE_KEY_TABS);
        if (!raw) {
          localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(DEFAULT_TABS));
          return [...DEFAULT_TABS];
        }
        return JSON.parse(raw);
      }

      case 'create_tab': {
        const tabs = this.fallbackHandler('get_all_tabs');
        const newTab = {
          id: 'tab-' + Date.now(),
          name: args.name || 'Tab mới',
          sort_order: tabs.length,
          created_at: new Date().toISOString()
        };
        tabs.push(newTab);
        localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
        return newTab;
      }

      case 'update_tab': {
        const tabs = this.fallbackHandler('get_all_tabs');
        const index = tabs.findIndex(t => t.id === args.id);
        if (index !== -1) {
          tabs[index] = { ...tabs[index], ...args };
          localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
          return tabs[index];
        }
        throw new Error('Tab not found');
      }

      case 'delete_tab': {
        let tabs = this.fallbackHandler('get_all_tabs');
        tabs = tabs.filter(t => t.id !== args.id);
        localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
        // Also remove associated todos
        let todos = this.fallbackHandler('get_all_todos');
        todos = todos.filter(t => t.tab_id !== args.id);
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
        return true;
      }

      case 'reorder_tabs': {
        let tabs = this.fallbackHandler('get_all_tabs');
        const map = new Map((args.items || []).map(item => [item.id, item.sort_order]));
        tabs.forEach(t => {
          if (map.has(t.id)) t.sort_order = map.get(t.id);
        });
        tabs.sort((a, b) => a.sort_order - b.sort_order);
        localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
        return true;
      }

      case 'get_all_todos': {
        const raw = localStorage.getItem(STORAGE_KEY_TODOS);
        if (!raw) {
          localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(DEFAULT_TODOS));
          return [...DEFAULT_TODOS];
        }
        return JSON.parse(raw);
      }

      case 'get_todos_by_tab': {
        const todos = this.fallbackHandler('get_all_todos');
        return todos.filter(t => t.tab_id === args.tab_id);
      }

      case 'create_todo': {
        const todos = this.fallbackHandler('get_all_todos');
        const newTodo = {
          id: 'todo-' + Date.now(),
          tab_id: args.tab_id,
          text: args.text,
          completed: 0,
          priority: args.priority || 'none',
          sort_order: todos.filter(t => t.tab_id === args.tab_id).length,
          due_date: args.due_date || null,
          created_at: new Date().toISOString()
        };
        todos.unshift(newTodo);
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
        return newTodo;
      }

      case 'toggle_todo': {
        const todos = this.fallbackHandler('get_all_todos');
        const todo = todos.find(t => t.id === args.id);
        if (todo) {
          todo.completed = todo.completed ? 0 : 1;
          localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
          return todo;
        }
        throw new Error('Todo not found');
      }

      case 'update_todo': {
        const todos = this.fallbackHandler('get_all_todos');
        const index = todos.findIndex(t => t.id === args.id);
        if (index !== -1) {
          todos[index] = { ...todos[index], ...args };
          localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
          return todos[index];
        }
        throw new Error('Todo not found');
      }

      case 'update_todo_deadline': {
        const todos = this.fallbackHandler('get_all_todos');
        const index = todos.findIndex(t => t.id === args.id);
        if (index !== -1) {
          todos[index].due_date = args.due_date !== undefined ? args.due_date : (args.dueDate !== undefined ? args.dueDate : null);
          localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
          return todos[index];
        }
        throw new Error('Todo not found');
      }

      case 'update_todo_priority': {
        const todos = this.fallbackHandler('get_all_todos');
        const index = todos.findIndex(t => t.id === args.id);
        if (index !== -1) {
          todos[index].priority = args.priority || 'none';
          localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
          return todos[index];
        }
        throw new Error('Todo not found');
      }

      case 'move_todo_to_tab': {
        const todos = this.fallbackHandler('get_all_todos');
        const index = todos.findIndex(t => t.id === args.id);
        if (index !== -1) {
          const targetTabId = args.tab_id || args.tabId;
          todos[index].tab_id = targetTabId;
          const minSort = todos.filter(t => t.tab_id === targetTabId).reduce((min, t) => Math.min(min, t.sort_order ?? 0), 0);
          todos[index].sort_order = minSort - 1;
          localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
          return todos[index];
        }
        throw new Error('Todo not found');
      }

      case 'delete_todo': {
        let todos = this.fallbackHandler('get_all_todos');
        todos = todos.filter(t => t.id !== args.id);
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
        return true;
      }

      case 'reorder_todos': {
        let todos = this.fallbackHandler('get_all_todos');
        const tabTodos = args.items; // array of updated order { id, sort_order }
        const map = new Map(tabTodos.map(item => [item.id, item.sort_order]));
        todos.forEach(t => {
          if (map.has(t.id)) {
            t.sort_order = map.get(t.id);
          }
        });
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
        return true;
      }

      case 'search_todos': {
        const todos = this.fallbackHandler('get_all_todos');
        const query = (args.query || '').toLowerCase().trim();
        if (!query) return [];
        return todos.filter(t => t.text.toLowerCase().includes(query));
      }

      case 'set_always_on_top': {
        localStorage.setItem('todolite_always_on_top', JSON.stringify(args.always_on_top));
        return args.always_on_top;
      }

      case 'minimize_window': {
        console.log('Window minimized (simulation in browser)');
        return true;
      }

      case 'hide_window': {
        console.log('Window hidden to tray (simulation in browser)');
        return true;
      }

      case 'exit_app': {
        console.log('App exited');
        window.close();
        return true;
      }

      case 'get_autostart': {
        return localStorage.getItem('todolite_autostart') === 'true';
      }

      case 'set_autostart': {
        const enabled = Boolean(args.enable);
        localStorage.setItem('todolite_autostart', JSON.stringify(enabled));
        return enabled;
      }

      case 'register_global_toggle_shortcut': {
        return Promise.resolve(null);
      }

      case 'get_all_note_tabs': {
        const raw = localStorage.getItem(STORAGE_KEY_NOTE_TABS);
        if (!raw) {
          localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(DEFAULT_NOTE_TABS));
          return [...DEFAULT_NOTE_TABS];
        }
        try {
          return JSON.parse(raw);
        } catch {
          return [...DEFAULT_NOTE_TABS];
        }
      }

      case 'create_note_tab': {
        const tabs = this.fallbackHandler('get_all_note_tabs');
        const newTab = {
          id: 'note-tab-' + Date.now(),
          name: args.name || 'Ghi chú mới',
          sort_order: tabs.length,
          created_at: new Date().toISOString()
        };
        tabs.push(newTab);
        localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(tabs));
        return newTab;
      }

      case 'update_note_tab': {
        const tabs = this.fallbackHandler('get_all_note_tabs');
        const index = tabs.findIndex(t => t.id === args.id);
        if (index !== -1) {
          tabs[index] = { ...tabs[index], ...args };
          localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(tabs));
          return tabs[index];
        }
        throw new Error('Note tab not found');
      }

      case 'delete_note_tab': {
        let tabs = this.fallbackHandler('get_all_note_tabs');
        tabs = tabs.filter(t => t.id !== args.id);
        localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(tabs));
        let notes = this.fallbackHandler('get_all_notes_internal');
        delete notes[args.id];
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
        return true;
      }

      case 'reorder_note_tabs': {
        let tabs = this.fallbackHandler('get_all_note_tabs');
        const map = new Map((args.items || []).map(item => [item.id, item.sort_order]));
        tabs.forEach(t => {
          if (map.has(t.id)) t.sort_order = map.get(t.id);
        });
        tabs.sort((a, b) => a.sort_order - b.sort_order);
        localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(tabs));
        return true;
      }

      case 'get_all_notes_internal': {
        const raw = localStorage.getItem(STORAGE_KEY_NOTES);
        if (!raw) {
          localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(DEFAULT_NOTES));
          return { ...DEFAULT_NOTES };
        }
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }

      case 'get_all_notes': {
        const notesObj = this.fallbackHandler('get_all_notes_internal');
        return Object.values(notesObj);
      }

      case 'get_note_by_tab': {
        const notes = this.fallbackHandler('get_all_notes_internal');
        const tabId = args.tab_id || args.tabId;
        return notes[tabId] || null;
      }

      case 'upsert_note': {
        const notes = this.fallbackHandler('get_all_notes_internal');
        const tabId = args.tab_id || args.tabId;
        const now = new Date().toISOString();
        const existing = notes[tabId];
        const note = {
          id: existing?.id || 'note-' + Date.now(),
          tab_id: tabId,
          content: args.content ?? '',
          updated_at: now
        };
        notes[tabId] = note;
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
        return note;
      }

      case 'get_default_export_directory':
        return 'Documents/TodoLite_Exports';
      case 'pick_export_directory':
        return null;
      case 'save_exported_file':
        return args ? `${args.directory}/${args.filename}` : 'saved';
      case 'open_export_directory':
        return null;

      case 'reset_database': {
        localStorage.removeItem(STORAGE_KEY_TABS);
        localStorage.removeItem(STORAGE_KEY_TODOS);
        localStorage.removeItem(STORAGE_KEY_NOTE_TABS);
        localStorage.removeItem(STORAGE_KEY_NOTES);
        return true;
      }

      case 'restore_backup': {
        const tabs = args.tabs || [];
        const todos = args.todos || [];
        const noteTabs = args.note_tabs || args.noteTabs || [];
        const notesList = args.notes || [];
        localStorage.setItem(STORAGE_KEY_TABS, JSON.stringify(tabs));
        localStorage.setItem(STORAGE_KEY_TODOS, JSON.stringify(todos));
        localStorage.setItem(STORAGE_KEY_NOTE_TABS, JSON.stringify(noteTabs));
        const notesObj = {};
        notesList.forEach(n => {
          if (n && n.tab_id) notesObj[n.tab_id] = n;
        });
        localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notesObj));
        return true;
      }

      default:
        console.warn(`Unknown command: ${command}`);
        return null;
    }
  }

  // Native Window API Wrappers
  static async setAlwaysOnTop(isPinned) {
    if (this.isTauri() && window.__TAURI__ && window.__TAURI__.window) {
      try {
        const appWindow = window.__TAURI__.window.getCurrentWindow();
        await appWindow.setAlwaysOnTop(isPinned);
      } catch (err) {
        console.error('Failed to set always on top via Tauri:', err);
      }
    }
    return this.invoke('set_always_on_top', { always_on_top: isPinned });
  }

  static async minimizeWindow() {
    if (this.isTauri() && window.__TAURI__ && window.__TAURI__.window) {
      try {
        const appWindow = window.__TAURI__.window.getCurrentWindow();
        await appWindow.minimize();
        return;
      } catch (err) {
        console.error('Failed to minimize window:', err);
      }
    }
    return this.invoke('minimize_window');
  }

  static async hideWindow() {
    if (this.isTauri() && window.__TAURI__ && window.__TAURI__.window) {
      try {
        const appWindow = window.__TAURI__.window.getCurrentWindow();
        await appWindow.hide();
        return;
      } catch (err) {
        console.error('Failed to hide window:', err);
      }
    }
    return this.invoke('hide_window');
  }

  static async exitApp() {
    if (this.isTauri()) {
      try {
        return await this.invoke('exit_app');
      } catch (err) {
        console.error('Failed to exit app via Tauri command:', err);
      }
    }
    window.close();
  }

  static async startDragging() {
    if (this.isTauri() && window.__TAURI__ && window.__TAURI__.window) {
      try {
        const appWindow = window.__TAURI__.window.getCurrentWindow();
        await appWindow.startDragging();
      } catch (err) {
        console.error('Failed to start dragging:', err);
      }
    }
  }

  // Export Directory API Wrappers
  static async getDefaultExportDirectory() {
    return this.invoke('get_default_export_directory');
  }

  static async pickExportDirectory(defaultPath = '') {
    return this.invoke('pick_export_directory', { default_path: defaultPath || null });
  }

  static async saveExportedFile(directory, filename, content) {
    return this.invoke('save_exported_file', { directory, filename, content });
  }

  static async openExportDirectory(directory) {
    return this.invoke('open_export_directory', { directory });
  }

  static async getAutoStart() {
    return this.invoke('get_autostart');
  }

  static async setAutoStart(enable) {
    return this.invoke('set_autostart', { enable: Boolean(enable) });
  }

  static async registerGlobalToggleShortcut(shortcut) {
    if (this.isTauri()) {
      return await this.invoke('register_global_toggle_shortcut', { shortcut });
    }
    return Promise.resolve(null);
  }
}
