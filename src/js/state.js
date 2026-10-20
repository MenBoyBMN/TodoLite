/**
 * TodoLite - State Management Store (Pub/Sub)
 */

class StateStore {
  constructor() {
    this.state = {
      activeTabId: null,
      tabs: [],
      todos: [], // All todos or cached todos
      isPinned: true, // Default always on top
      theme: 'light',
      style: 'glass', // 'glass' | 'minimal'
      viewMode: 'checklist', // 'checklist' | 'note' | 'focus' | 'calculator'
      activeNoteTabId: null,
      noteTabs: [], // Note mode tabs list
      notes: {}, // Cache of notes by tabId: { [tabId]: NoteItem }
      searchQuery: '',
      isSearchOpen: false,
      focusState: {
        status: 'idle', // 'idle' | 'running' | 'paused' | 'break' | 'completed'
        totalTargetMinutes: 120, // 2 hours default
        totalElapsedSeconds: 0,
        workIntervalMinutes: 25,
        breakIntervalMinutes: 5,
        currentIntervalSecondsLeft: 25 * 60,
        currentIntervalTotalSeconds: 25 * 60,
        currentSessionIndex: 1,
        totalEstimatedSessions: 4,
        linkedTodoId: null,
        autoNext: true,
        soundEnabled: true,
        ambientSound: 'none' // 'none' | 'rain' | 'waves' | 'ticking'
      },
      calcState: {
        displayValue: '0',
        expression: '',
        history: [],
        waitingForOperand: false,
        operator: null
      }
    };
    this.listeners = new Map();
  }

  getState() {
    return this.state;
  }

  setState(updates) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Notify listeners for changed keys
    Object.keys(updates).forEach(key => {
      if (this.listeners.has(key)) {
        this.listeners.get(key).forEach(callback => {
          try {
            callback(this.state[key], prevState[key], this.state);
          } catch (err) {
            console.error(`Error in state listener for "${key}":`, err);
          }
        });
      }
    });

    // Notify global listeners
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(callback => callback(this.state, prevState));
    }
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(callback);
      }
    };
  }
}

export const store = new StateStore();
