/**
 * TodoLite - Pocket Calculator Manager
 * High-precision Arithmetic, Keyboard Support & Cross-Workspace Actions
 */

import { store } from './state.js';
import { showToast } from './app.js';

export class CalculatorManager {
  constructor() {
    this.todoManager = null; // Injected from app.js
    this.noteManager = null; // Injected from app.js

    // Internal calculation state
    this.displayValue = '0';
    this.expression = '';
    this.previousOperand = null;
    this.currentOperator = null;
    this.waitingForNextOperand = false;
    this.history = [];

    // DOM Elements
    this.screenExpression = document.getElementById('calc-expression');
    this.screenResult = document.getElementById('calc-result');

    this.btnHistory = document.getElementById('btn-calc-history');
    this.btnCopy = document.getElementById('btn-calc-copy');
    this.btnToTodo = document.getElementById('btn-calc-to-todo');
    this.btnToNote = document.getElementById('btn-calc-to-note');

    this.historyDrawer = document.getElementById('calc-history-drawer');
    this.historyList = document.getElementById('calc-history-list');
    this.btnHistoryClear = document.getElementById('btn-history-clear');
    this.btnHistoryClose = document.getElementById('btn-history-close');

    this.init();
  }

  init() {
    this.loadHistory();
    this.initKeypadEvents();
    this.initActionEvents();
    this.initKeyboardEvents();
    this.updateDisplay();
  }

  loadHistory() {
    const stored = localStorage.getItem('todolite_calc_history');
    if (stored) {
      try {
        this.history = JSON.parse(stored) || [];
      } catch (e) {
        this.history = [];
      }
    }
    this.renderHistoryList();
  }

  saveHistory() {
    localStorage.setItem('todolite_calc_history', JSON.stringify(this.history.slice(0, 30)));
    this.renderHistoryList();
  }

  initKeypadEvents() {
    const keypad = document.getElementById('calc-keypad');
    if (!keypad) return;

    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.calc-key');
      if (!btn) return;

      const num = btn.dataset.num;
      const op = btn.dataset.op;
      const action = btn.dataset.action;

      if (num !== undefined) {
        this.inputDigit(num);
      } else if (op !== undefined) {
        this.handleOperator(op);
      } else if (action !== undefined) {
        this.handleAction(action);
      }
    });

    // Shortcuts: +8% VAT, +10% VAT, -10%, -20%
    document.querySelectorAll('[data-calc-shortcut]').forEach(btn => {
      btn.addEventListener('click', () => {
        const factor = parseFloat(btn.dataset.calcShortcut);
        this.applyMultiplier(factor, btn.textContent.trim());
      });
    });
  }

  initActionEvents() {
    // History Toggle
    if (this.btnHistory) {
      this.btnHistory.addEventListener('click', () => {
        this.toggleHistoryDrawer();
      });
    }

    if (this.btnHistoryClose) {
      this.btnHistoryClose.addEventListener('click', () => {
        this.closeHistoryDrawer();
      });
    }

    if (this.btnHistoryClear) {
      this.btnHistoryClear.addEventListener('click', () => {
        this.clearHistory();
      });
    }

    // Copy Result
    if (this.btnCopy) {
      this.btnCopy.addEventListener('click', () => this.copyResult());
    }

    // Add to Todo
    if (this.btnToTodo) {
      this.btnToTodo.addEventListener('click', () => this.exportToTodo());
    }

    // Insert into Note
    if (this.btnToNote) {
      this.btnToNote.addEventListener('click', () => this.exportToNote());
    }
  }

  initKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      // Only process when Calculator view is active and not inside an input
      if (store.getState().viewMode !== 'calculator') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      const key = e.key;

      if (key >= '0' && key <= '9') {
        e.preventDefault();
        this.inputDigit(key);
      } else if (key === '.' || key === ',') {
        e.preventDefault();
        this.inputDecimal();
      } else if (key === '+' || key === '-') {
        e.preventDefault();
        this.handleOperator(key);
      } else if (key === '*') {
        e.preventDefault();
        this.handleOperator('×');
      } else if (key === '/') {
        e.preventDefault();
        this.handleOperator('÷');
      } else if (key === '%') {
        e.preventDefault();
        this.handleAction('percent');
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        this.calculate();
      } else if (key === 'Backspace') {
        e.preventDefault();
        this.handleAction('backspace');
      } else if (key === 'Escape' || key.toLowerCase() === 'c') {
        e.preventDefault();
        this.handleAction('clear');
      }
    });
  }

  // ----------------- CALCULATION LOGIC -----------------
  inputDigit(digit) {
    if (this.waitingForNextOperand) {
      this.displayValue = String(digit);
      this.waitingForNextOperand = false;
    } else {
      if (this.displayValue === '0' || this.displayValue === 'Error') {
        this.displayValue = String(digit);
      } else {
        // Prevent exceeding 15 digits
        if (this.displayValue.replace(/[^0-9]/g, '').length < 15) {
          this.displayValue += String(digit);
        }
      }
    }
    this.updateDisplay();
  }

  inputDecimal() {
    if (this.waitingForNextOperand) {
      this.displayValue = '0.';
      this.waitingForNextOperand = false;
    } else if (!this.displayValue.includes('.')) {
      this.displayValue += '.';
    }
    this.updateDisplay();
  }

  handleOperator(nextOperator) {
    const inputValue = parseFloat(this.displayValue);

    if (this.currentOperator && this.waitingForNextOperand) {
      // User changed operator before typing second operand
      this.currentOperator = nextOperator;
      this.expression = `${this.formatNumber(this.previousOperand)} ${nextOperator}`;
      this.updateDisplay();
      return;
    }

    if (this.previousOperand === null && !isNaN(inputValue)) {
      this.previousOperand = inputValue;
    } else if (this.currentOperator) {
      const result = this.compute(this.previousOperand, inputValue, this.currentOperator);
      if (result === 'Error') {
        this.displayValue = 'Error';
        this.previousOperand = null;
        this.currentOperator = null;
        this.expression = '';
        this.waitingForNextOperand = true;
        this.updateDisplay();
        return;
      }
      this.displayValue = String(result);
      this.previousOperand = result;
    }

    this.waitingForNextOperand = true;
    this.currentOperator = nextOperator;
    this.expression = `${this.formatNumber(this.previousOperand)} ${nextOperator}`;
    this.updateDisplay();
  }

  calculate() {
    if (this.currentOperator === null || this.previousOperand === null) {
      return;
    }

    const current = parseFloat(this.displayValue);
    const fullExpr = `${this.formatNumber(this.previousOperand)} ${this.currentOperator} ${this.formatNumber(current)}`;
    const result = this.compute(this.previousOperand, current, this.currentOperator);

    if (result === 'Error') {
      this.displayValue = 'Error';
      this.expression = '';
      this.previousOperand = null;
      this.currentOperator = null;
      this.waitingForNextOperand = true;
      this.updateDisplay();
      return;
    }

    // Add to history
    this.addHistory(fullExpr, this.formatNumber(result));

    this.expression = `${fullExpr} =`;
    this.displayValue = String(result);
    this.previousOperand = null;
    this.currentOperator = null;
    this.waitingForNextOperand = true;
    this.updateDisplay();
  }

  compute(first, second, operator) {
    let result = 0;
    switch (operator) {
      case '+':
        result = first + second;
        break;
      case '-':
        result = first - second;
        break;
      case '×':
      case '*':
        result = first * second;
        break;
      case '÷':
      case '/':
        if (second === 0) return 'Error';
        result = first / second;
        break;
      default:
        return second;
    }
    // High-precision clean rounding
    return Math.round(result * 10000000000) / 10000000000;
  }

  handleAction(action) {
    switch (action) {
      case 'clear':
        this.displayValue = '0';
        this.expression = '';
        this.previousOperand = null;
        this.currentOperator = null;
        this.waitingForNextOperand = false;
        break;

      case 'backspace':
        if (this.waitingForNextOperand || this.displayValue === 'Error') {
          this.displayValue = '0';
          this.waitingForNextOperand = false;
        } else if (this.displayValue.length > 1) {
          this.displayValue = this.displayValue.slice(0, -1);
          if (this.displayValue === '-' || this.displayValue === '') {
            this.displayValue = '0';
          }
        } else {
          this.displayValue = '0';
        }
        break;

      case 'negate':
        if (this.displayValue !== '0' && this.displayValue !== 'Error') {
          this.displayValue = String(-parseFloat(this.displayValue));
        }
        break;

      case 'percent':
        const val = parseFloat(this.displayValue);
        if (!isNaN(val)) {
          const res = Math.round((val / 100) * 10000000000) / 10000000000;
          this.displayValue = String(res);
        }
        break;

      case 'decimal':
        this.inputDecimal();
        return;

      case 'equals':
        this.calculate();
        return;
    }
    this.updateDisplay();
  }

  applyMultiplier(factor, label) {
    const val = parseFloat(this.displayValue);
    if (isNaN(val)) return;

    const res = Math.round(val * factor * 10000000000) / 10000000000;
    const exprText = `${this.formatNumber(val)} × ${factor} (${label})`;
    this.addHistory(exprText, this.formatNumber(res));

    this.expression = `${exprText} =`;
    this.displayValue = String(res);
    this.waitingForNextOperand = true;
    this.updateDisplay();
  }

  // ----------------- DISPLAY FORMATTING -----------------
  formatNumber(num) {
    if (num === null || num === undefined) return '';
    if (num === 'Error') return 'Error';

    const str = String(num);
    const parts = str.split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
  }

  updateDisplay() {
    if (this.screenResult) {
      this.screenResult.textContent = this.formatNumber(this.displayValue);
    }
    if (this.screenExpression) {
      this.screenExpression.textContent = this.expression || '';
    }
  }

  // ----------------- HISTORY MANAGEMENT -----------------
  addHistory(expr, val) {
    this.history.unshift({
      expr,
      val,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    });
    this.saveHistory();
  }

  renderHistoryList() {
    if (!this.historyList) return;
    this.historyList.innerHTML = '';

    if (this.history.length === 0) {
      this.historyList.innerHTML = `
        <div class="calc-history-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Chưa có lịch sử tính toán nào
        </div>
      `;
      return;
    }

    this.history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'calc-history-item';
      el.innerHTML = `
        <div class="calc-hist-expr">${item.expr} =</div>
        <div class="calc-hist-val">${item.val}</div>
      `;
      el.title = 'Nhấp để sử dụng lại kết quả này';
      el.addEventListener('click', () => {
        // Remove commas and load back into calculator
        const cleanVal = item.val.replace(/,/g, '');
        this.displayValue = cleanVal;
        this.waitingForNextOperand = true;
        this.updateDisplay();
        this.closeHistoryDrawer();
        showToast(`Đã lấy số ${item.val}`, 'info');
      });
      this.historyList.appendChild(el);
    });
  }

  toggleHistoryDrawer() {
    if (this.historyDrawer) {
      this.historyDrawer.classList.toggle('open');
      if (this.btnHistory) {
        this.btnHistory.classList.toggle('active', this.historyDrawer.classList.contains('open'));
      }
    }
  }

  closeHistoryDrawer() {
    if (this.historyDrawer) {
      this.historyDrawer.classList.remove('open');
    }
    if (this.btnHistory) {
      this.btnHistory.classList.remove('active');
    }
  }

  clearHistory() {
    if (confirm('Bạn có muốn xóa toàn bộ lịch sử tính toán không?')) {
      this.history = [];
      this.saveHistory();
      showToast('Đã xóa lịch sử tính toán', 'info');
    }
  }

  // ----------------- CROSS-FEATURE ACTIONS -----------------
  async copyResult() {
    const formatted = this.formatNumber(this.displayValue);
    try {
      await navigator.clipboard.writeText(formatted);
      showToast(`Đã sao chép: ${formatted} 📋`, 'info');
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = formatted;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`Đã sao chép: ${formatted} 📋`, 'info');
    }
  }

  async exportToTodo() {
    const formatted = this.formatNumber(this.displayValue);
    const text = prompt('Tạo việc cần làm với số tiền / kết quả này:', `Chi phí: ${formatted}`);
    if (!text || !text.trim()) return;

    if (this.todoManager) {
      let activeTabId = store.getState().activeTabId;
      if (!activeTabId) {
        const tabs = store.getState().tabs;
        if (tabs && tabs.length > 0) {
          activeTabId = tabs[0].id;
          store.setState({ activeTabId });
        }
      }
      if (!activeTabId) {
        showToast('Vui lòng chọn 1 tab công việc trước!', 'error');
        return;
      }
      try {
        await this.todoManager.handleCreateTodoDirect(text.trim());
        showToast('Đã thêm vào danh sách việc cần làm! ☑', 'info');
      } catch (err) {
        console.error('Error creating todo from calc:', err);
      }
    }
  }

  exportToNote() {
    const formatted = this.formatNumber(this.displayValue);
    const expr = this.expression ? ` (${this.expression})` : '';
    const htmlToInsert = `<p>🧮 <strong>Tính toán:</strong> ${formatted}${expr}</p>`;

    const noteEditor = document.getElementById('note-editor');
    if (noteEditor) {
      noteEditor.focus();
      // Append to the bottom of note
      noteEditor.innerHTML += htmlToInsert;
      if (this.noteManager) {
        this.noteManager.handleEditorInput();
      }
      showToast('Đã chèn kết quả vào trang ghi chú! 📝', 'info');
    } else {
      showToast('Không tìm thấy khung ghi chú!', 'error');
    }
  }
}
