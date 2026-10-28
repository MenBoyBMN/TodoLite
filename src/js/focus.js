/**
 * TodoLite - Focus Session (Pomodoro & Cycle Interval Timer)
 * Integrated with Web Audio API for Chimes & Ambient Soundscapes
 */

import { store } from './state.js';
import { showToast } from './app.js';
import { confirmDialog } from './dialog.js';

export class FocusSessionManager {
  constructor() {
    this.todoManager = null; // Injected from app.js

    // Settings
    this.totalTargetMinutes = 120;
    this.workIntervalMinutes = 25;
    this.breakIntervalMinutes = 5;
    this.autoNext = true;
    this.soundEnabled = true;
    this.ambientSound = 'none'; // 'none' | 'rain' | 'waves' | 'ticking'

    // Runtime state
    this.status = 'idle'; // 'idle' | 'work' | 'break' | 'paused' | 'completed'
    this.previousRunningStatus = 'work';
    this.totalElapsedSeconds = 0;
    this.currentIntervalSecondsLeft = 25 * 60;
    this.currentIntervalTotalSeconds = 25 * 60;
    this.currentSessionIndex = 1;
    this.linkedTodoId = null;

    // Timer refs
    this.timerInterval = null;
    this.lastTickTime = null;

    // Web Audio refs
    this.audioCtx = null;
    this.ambientNodes = null;

    // DOM Elements
    this.setupCard = document.getElementById('focus-setup-card');
    this.activeCard = document.getElementById('focus-active-card');
    this.completedCard = document.getElementById('focus-completed-card');

    this.todayBadge = document.getElementById('focus-today-badge');
    this.statusBadge = document.getElementById('focus-status-badge');
    this.statusBadgeText = document.getElementById('focus-status-badge-text');

    this.timeDigits = document.getElementById('focus-time-digits');
    this.timeSublabel = document.getElementById('focus-time-sublabel');
    this.circleProgress = document.getElementById('focus-circle-progress');

    this.totalProgressLabels = document.getElementById('focus-total-progress-labels');
    this.totalProgressBarFill = document.getElementById('focus-total-progress-bar-fill');

    this.linkedTaskBox = document.getElementById('focus-linked-task-box');
    this.linkedTaskText = document.getElementById('focus-linked-task-text');
    this.linkedTaskCheck = document.getElementById('focus-linked-task-check');

    this.btnStart = document.getElementById('btn-start-focus');
    this.btnPause = document.getElementById('btn-focus-pause');
    this.btnSkip = document.getElementById('btn-focus-skip');
    this.btnReset = document.getElementById('btn-focus-reset');
    this.btnRestart = document.getElementById('btn-focus-restart');
    this.btnStopAlarm = document.getElementById('btn-focus-stop-alarm');

    this.activeAlarmNodes = [];
    this.alarmMasterGain = null;
    this.alarmTimeout = null;

    this.taskSelect = document.getElementById('focus-task-select');
    this.autoNextToggle = document.getElementById('focus-auto-next-toggle');
    this.soundToggle = document.getElementById('focus-sound-toggle');

    this.init();
  }

  init() {
    this.loadStoredSettings();
    this.initAudioContext();
    this.initEventListeners();
    this.renderSetupChips();
    this.populateTaskDropdown();
    this.updateTodayStatsBadge();

    // Subscribe to store updates for todos
    store.subscribe('todos', () => {
      this.populateTaskDropdown();
      this.updateLinkedTaskVisual();
    });

    store.subscribe('viewMode', (mode) => {
      if (mode === 'focus') {
        this.populateTaskDropdown();
        this.updateTodayStatsBadge();
        if (this.status === 'work' || this.status === 'break' || this.status === 'paused') {
          this.updateActiveVisuals();
        }
      } else {
        this.stopAlarmSound();
      }
    });
  }

  loadStoredSettings() {
    const stored = localStorage.getItem('todolite_focus_settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.totalTargetMinutes = parsed.totalTargetMinutes || 120;
        this.workIntervalMinutes = parsed.workIntervalMinutes || 25;
        this.breakIntervalMinutes = parsed.breakIntervalMinutes || 5;
        this.autoNext = parsed.autoNext !== undefined ? parsed.autoNext : true;
        this.soundEnabled = parsed.soundEnabled !== undefined ? parsed.soundEnabled : true;
        this.ambientSound = parsed.ambientSound || 'none';
      } catch (e) {
        console.error('Error loading focus settings:', e);
      }
    }
    if (this.autoNextToggle) this.autoNextToggle.checked = this.autoNext;
    if (this.soundToggle) this.soundToggle.checked = this.soundEnabled;
  }

  saveSettings() {
    localStorage.setItem('todolite_focus_settings', JSON.stringify({
      totalTargetMinutes: this.totalTargetMinutes,
      workIntervalMinutes: this.workIntervalMinutes,
      breakIntervalMinutes: this.breakIntervalMinutes,
      autoNext: this.autoNext,
      soundEnabled: this.soundEnabled,
      ambientSound: this.ambientSound
    }));
  }

  initEventListeners() {
    // Start session
    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => this.startSession());
    }

    // Pause / Resume
    if (this.btnPause) {
      this.btnPause.addEventListener('click', () => this.togglePause());
    }

    // Skip current interval
    if (this.btnSkip) {
      this.btnSkip.addEventListener('click', () => this.skipInterval());
    }

    // Reset / Stop session
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => this.resetSession());
    }

    // Restart when completed
    if (this.btnRestart) {
      this.btnRestart.addEventListener('click', () => {
        this.stopAlarmSound();
        this.showSetupView();
      });
    }

    // Stop alarm sound button
    if (this.btnStopAlarm) {
      this.btnStopAlarm.addEventListener('click', () => {
        this.stopAlarmSound();
        showToast('Đã tắt âm báo hết giờ', 'info');
      });
    }

    // Toggles
    if (this.autoNextToggle) {
      this.autoNextToggle.addEventListener('change', (e) => {
        this.autoNext = e.target.checked;
        this.saveSettings();
      });
    }

    if (this.soundToggle) {
      this.soundToggle.addEventListener('change', (e) => {
        this.soundEnabled = e.target.checked;
        this.saveSettings();
        if (!this.soundEnabled) this.stopAmbientSound();
      });
    }

    // Task select
    if (this.taskSelect) {
      this.taskSelect.addEventListener('change', (e) => {
        this.linkedTodoId = e.target.value || null;
      });
    }

    // Linked task checkbox
    if (this.linkedTaskCheck) {
      this.linkedTaskCheck.addEventListener('change', async (e) => {
        if (this.linkedTodoId && this.todoManager) {
          await this.todoManager.handleToggleTodo(this.linkedTodoId);
          showToast('Đã đánh dấu hoàn thành công việc! 🎯', 'info');
        }
      });
    }

    // Setup Preset Chips Click Handlers
    this.setupChipsHandlers();

    // Ambient sound chips
    document.querySelectorAll('.focus-sound-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const sound = chip.dataset.sound;
        this.setAmbientSound(sound);
      });
    });
  }

  setupChipsHandlers() {
    // Total Target chips
    document.querySelectorAll('[data-target-mins]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-target-mins]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mins = parseInt(btn.dataset.targetMins, 10);
        this.totalTargetMinutes = mins;
        this.saveSettings();
      });
    });

    // Work Interval chips
    document.querySelectorAll('[data-work-mins]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-work-mins]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mins = parseInt(btn.dataset.workMins, 10);
        this.workIntervalMinutes = mins;
        this.saveSettings();
      });
    });

    // Break Interval chips
    document.querySelectorAll('[data-break-mins]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-break-mins]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mins = parseInt(btn.dataset.breakMins, 10);
        this.breakIntervalMinutes = mins;
        this.saveSettings();
      });
    });
  }

  renderSetupChips() {
    // Highlight active chips according to current settings
    document.querySelectorAll('[data-target-mins]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.targetMins, 10) === this.totalTargetMinutes);
    });
    document.querySelectorAll('[data-work-mins]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.workMins, 10) === this.workIntervalMinutes);
    });
    document.querySelectorAll('[data-break-mins]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.breakMins, 10) === this.breakIntervalMinutes);
    });

    // Highlight ambient sound chip
    document.querySelectorAll('.focus-sound-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.sound === this.ambientSound);
    });
  }

  populateTaskDropdown() {
    if (!this.taskSelect) return;
    const { todos, tabs, activeTabId } = store.getState();
    const currentSelected = this.taskSelect.value;

    this.taskSelect.innerHTML = '<option value="">-- Không gắn công việc (Tự do) --</option>';

    // Filter uncompleted tasks
    const uncompleted = todos.filter(t => !t.completed);
    if (uncompleted.length === 0) return;

    // Group by tabs
    tabs.forEach(tab => {
      const tabTodos = uncompleted.filter(t => t.tab_id === tab.id);
      if (tabTodos.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = tab.name;
        tabTodos.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.text;
          if (t.id === currentSelected || t.id === this.linkedTodoId) {
            opt.selected = true;
          }
          optgroup.appendChild(opt);
        });
        this.taskSelect.appendChild(optgroup);
      }
    });
  }

  updateLinkedTaskVisual() {
    if (!this.linkedTaskBox) return;
    if (!this.linkedTodoId) {
      this.linkedTaskBox.style.display = 'none';
      return;
    }

    const { todos } = store.getState();
    const task = todos.find(t => t.id === this.linkedTodoId);
    if (!task) {
      this.linkedTaskBox.style.display = 'none';
      return;
    }

    this.linkedTaskBox.style.display = 'flex';
    this.linkedTaskText.textContent = `🎯 Đang làm: ${task.text}`;
    this.linkedTaskCheck.checked = Boolean(task.completed);
  }

  // ----------------- SESSION LIFECYCLE -----------------
  startSession() {
    this.status = 'work';
    this.previousRunningStatus = 'work';
    this.totalElapsedSeconds = 0;
    this.currentSessionIndex = 1;

    this.currentIntervalTotalSeconds = this.workIntervalMinutes * 60;
    this.currentIntervalSecondsLeft = this.currentIntervalTotalSeconds;

    this.showActiveView();
    this.updateActiveVisuals();
    this.startTimer();
    this.playChime('start');

    if (this.ambientSound !== 'none') {
      this.startAmbientSound(this.ambientSound);
    }

    showToast(`Bắt đầu phiên tập trung: Hiệp 1 (${this.workIntervalMinutes} phút) 🔥`, 'info');
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.lastTickTime = Date.now();

    this.timerInterval = setInterval(() => {
      const now = Date.now();
      const delta = Math.round((now - this.lastTickTime) / 1000);
      if (delta <= 0) return;
      this.lastTickTime = now;

      this.currentIntervalSecondsLeft = Math.max(0, this.currentIntervalSecondsLeft - delta);

      if (this.status === 'work') {
        this.totalElapsedSeconds += delta;
      }

      this.updateActiveVisuals();

      if (this.currentIntervalSecondsLeft <= 0) {
        this.handleIntervalFinished();
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  togglePause() {
    if (this.status === 'paused') {
      // Resume
      this.status = this.previousRunningStatus;
      this.btnPause.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        Tạm dừng
      `;
      this.startTimer();
      if (this.ambientSound !== 'none') {
        this.startAmbientSound(this.ambientSound);
      }
      showToast('Đã tiếp tục phiên làm việc ▶', 'info');
    } else if (this.status === 'work' || this.status === 'break') {
      // Pause
      this.previousRunningStatus = this.status;
      this.status = 'paused';
      this.stopTimer();
      this.stopAmbientSound();
      this.btnPause.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Tiếp tục
      `;
      showToast('Đã tạm dừng ⏸', 'info');
    }
    this.updateActiveVisuals();
  }

  skipInterval() {
    const isWorkSession = this.status === 'work' || (this.status === 'paused' && this.previousRunningStatus === 'work');
    if (isWorkSession) {
      // User skips remaining work: credit remaining work time of this interval to totalElapsedSeconds
      this.totalElapsedSeconds += this.currentIntervalSecondsLeft;
      const totalTargetSeconds = this.totalTargetMinutes * 60;
      if (this.totalElapsedSeconds >= totalTargetSeconds) {
        this.finishSession();
        return;
      }
      this.transitionToBreak();
    } else {
      this.transitionToNextWork();
    }
  }

  handleIntervalFinished() {
    if (this.status === 'work') {
      // Check if total target time reached
      const totalTargetSeconds = this.totalTargetMinutes * 60;
      if (this.totalElapsedSeconds >= totalTargetSeconds) {
        this.finishSession();
        return;
      }
      this.transitionToBreak();
    } else if (this.status === 'break') {
      this.transitionToNextWork();
    }
  }

  transitionToBreak() {
    this.status = 'break';
    this.previousRunningStatus = 'break';
    this.currentIntervalTotalSeconds = this.breakIntervalMinutes * 60;
    this.currentIntervalSecondsLeft = this.currentIntervalTotalSeconds;

    this.playChime('break');
    showToast(`Hết giờ làm việc! Hãy nghỉ ngơi ${this.breakIntervalMinutes} phút ☕`, 'info');

    // Add today's minutes
    this.recordTodayMinutes(this.workIntervalMinutes);

    if (!this.autoNext) {
      this.status = 'paused';
      this.stopTimer();
      this.btnPause.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Bắt đầu nghỉ
      `;
    }

    this.updateActiveVisuals();
  }

  transitionToNextWork() {
    this.currentSessionIndex += 1;
    this.status = 'work';
    this.previousRunningStatus = 'work';
    this.currentIntervalTotalSeconds = this.workIntervalMinutes * 60;
    this.currentIntervalSecondsLeft = this.currentIntervalTotalSeconds;

    this.playChime('work');
    showToast(`Hết giờ nghỉ ngơi! Bắt đầu hiệp ${this.currentSessionIndex} (${this.workIntervalMinutes} phút) 🚀`, 'info');

    if (!this.autoNext) {
      this.status = 'paused';
      this.stopTimer();
      this.btnPause.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Bắt đầu hiệp
      `;
    }

    this.updateActiveVisuals();
  }

  finishSession() {
    this.status = 'completed';
    this.stopTimer();
    this.stopAmbientSound();
    this.playChime('completed');

    this.showCompletedView();
    showToast('Chúc mừng! Bạn đã hoàn thành trọn vẹn mục tiêu thời gian hôm nay 🎉', 'info');
  }

  async resetSession() {
    const confirmed = await confirmDialog({
      title: 'Kết thúc phiên tập trung?',
      message: 'Thời gian của phiên hiện tại sẽ được đặt lại.',
      confirmLabel: 'Kết thúc phiên'
    });
    if (confirmed) {
      this.stopTimer();
      this.stopAmbientSound();
      this.status = 'idle';
      this.totalElapsedSeconds = 0;
      this.showSetupView();
      showToast('Đã kết thúc phiên tập trung', 'info');
    }
  }

  // ----------------- UI VIEW TOGGLES -----------------
  showSetupView() {
    this.setupCard.style.display = 'flex';
    this.activeCard.style.display = 'none';
    this.completedCard.style.display = 'none';
    this.populateTaskDropdown();
    this.renderSetupChips();
    this.updateTodayStatsBadge();
  }

  showActiveView() {
    this.setupCard.style.display = 'none';
    this.activeCard.style.display = 'flex';
    this.completedCard.style.display = 'none';
    this.updateLinkedTaskVisual();
  }

  showCompletedView() {
    this.setupCard.style.display = 'none';
    this.activeCard.style.display = 'none';
    this.completedCard.style.display = 'flex';
    this.updateTodayStatsBadge();
  }

  updateActiveVisuals() {
    // 1. Time digits formatted MM:SS
    const mins = Math.floor(this.currentIntervalSecondsLeft / 60);
    const secs = this.currentIntervalSecondsLeft % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    this.timeDigits.textContent = formatted;

    // 2. SVG circle progress calculation
    // Circle radius = 85 => circumference = 2 * Math.PI * 85 ≈ 534
    const circumference = 534;
    const progressFraction = this.currentIntervalTotalSeconds > 0
      ? this.currentIntervalSecondsLeft / this.currentIntervalTotalSeconds
      : 0;
    const strokeOffset = circumference * (1 - progressFraction);
    this.circleProgress.style.strokeDashoffset = strokeOffset;

    // 3. Status Badge & Circle Color
    const isBreak = this.status === 'break';
    const isPaused = this.status === 'paused';

    if (isBreak) {
      this.statusBadge.className = 'focus-status-badge is-break';
      this.statusBadgeText.textContent = `Hiệp ${this.currentSessionIndex} • Đang nghỉ ngơi ☕`;
      this.timeSublabel.textContent = 'Thời gian giải lao';
      this.circleProgress.classList.add('is-break');
    } else {
      this.statusBadge.className = 'focus-status-badge is-work';
      this.statusBadgeText.textContent = `Hiệp ${this.currentSessionIndex} • ${isPaused ? 'Tạm dừng ⏸' : 'Đang tập trung 🔥'}`;
      this.timeSublabel.textContent = isPaused ? 'Tạm dừng' : 'Hiệp tập trung';
      this.circleProgress.classList.remove('is-break');
    }

    // 4. Overall Progress Bar
    const totalTargetSecs = Math.max(1, this.totalTargetMinutes * 60);
    const progressPercent = Math.min(100, (this.totalElapsedSeconds / totalTargetSecs) * 100);
    const totalPercent = Math.min(100, Math.round(progressPercent));

    const elapsedHours = Math.floor(this.totalElapsedSeconds / 3600);
    const elapsedMins = Math.floor((this.totalElapsedSeconds % 3600) / 60);
    const elapsedSecs = this.totalElapsedSeconds % 60;

    let elapsedText = '';
    if (elapsedHours > 0) {
      elapsedText = `${elapsedHours}h ${elapsedMins}p ${elapsedSecs}s`;
    } else if (elapsedMins > 0) {
      elapsedText = `${elapsedMins}p ${elapsedSecs > 0 ? (elapsedSecs < 10 ? '0' : '') + elapsedSecs + 's' : ''}`;
    } else {
      elapsedText = `${elapsedSecs}s`;
    }

    const targetHours = (this.totalTargetMinutes / 60).toFixed(1).replace('.0', '');
    const breakNote = isBreak ? ' <span style="font-size:10px; opacity:0.8;">(Đang nghỉ)</span>' : '';

    if (this.totalProgressLabels) {
      this.totalProgressLabels.innerHTML = `
        <span>Tiến độ tổng: ${elapsedText} / ${targetHours}h${breakNote}</span>
        <span>${totalPercent}%</span>
      `;
    }
    if (this.totalProgressBarFill) {
      this.totalProgressBarFill.style.width = `${progressPercent.toFixed(2)}%`;
    }
  }

  // ----------------- AUDIO SYNTHESIS (WEB AUDIO API) -----------------
  initAudioContext() {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      this.initAudioContext();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playChime(type = 'work') {
    if (!this.soundEnabled) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    // Stop any existing completion alarm sound
    this.stopAlarmSound();

    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    if (type === 'start') {
      // Soft single warm chime
      this.playWarmBell(523.25, now, 0.6, 0.22); // C5
    } else if (type === 'work') {
      // Hết thời gian nghỉ -> Bắt đầu hiệp làm việc: chuông ấm dần hướng lên, thời lượng ~2.7s (<= 3s)
      this.playWarmBell(261.63, now, 2.6, 0.16);         // C4
      this.playWarmBell(329.63, now + 0.35, 2.3, 0.18);  // E4
      this.playWarmBell(392.00, now + 0.70, 2.0, 0.22);  // G4
    } else if (type === 'break') {
      // Hết hiệp làm việc -> Bắt đầu nghỉ ngơi: chuông thư giãn hướng xuống, thời lượng ~2.7s (<= 3s)
      this.playWarmBell(392.00, now, 2.6, 0.16);         // G4
      this.playWarmBell(329.63, now + 0.35, 2.3, 0.18);  // E4
      this.playWarmBell(261.63, now + 0.70, 2.0, 0.22);  // C4
    } else if (type === 'completed') {
      // Âm thanh hoàn thành hết giờ: Khác hoàn toàn, giai điệu chúc mừng trang trọng + hợp âm vang sâu, thời lượng ~4.75s (<= 5s), có thể tắt được
      this.playCompletionAlarm();
    }
  }

  playWarmBell(freq, startTime, duration, maxGain = 0.2, dest = null) {
    const ctx = this.audioCtx;
    const destination = dest || ctx.destination;

    // Gentle low-pass filter to eliminate any harsh high frequencies
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1150, startTime);
    filter.Q.setValueAtTime(0.7, startTime);
    filter.connect(destination);

    // Fundamental oscillator (sine)
    const oscMain = ctx.createOscillator();
    const gainMain = ctx.createGain();
    oscMain.type = 'sine';
    oscMain.frequency.setValueAtTime(freq, startTime);

    // Harmonic overtone oscillator (triangle, subtle warmth)
    const oscHarmonic = ctx.createOscillator();
    const gainHarmonic = ctx.createGain();
    oscHarmonic.type = 'triangle';
    oscHarmonic.frequency.setValueAtTime(freq * 2, startTime);

    // Envelope for main tone: soft attack (0.04s) & smooth decay
    gainMain.gain.setValueAtTime(0.0001, startTime);
    gainMain.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.04);
    gainMain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    // Envelope for harmonic overtone
    gainHarmonic.gain.setValueAtTime(0.0001, startTime);
    gainHarmonic.gain.exponentialRampToValueAtTime(maxGain * 0.25, startTime + 0.03);
    gainHarmonic.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.7);

    oscMain.connect(gainMain);
    gainMain.connect(filter);

    oscHarmonic.connect(gainHarmonic);
    gainHarmonic.connect(filter);

    oscMain.start(startTime);
    oscMain.stop(startTime + duration + 0.05);

    oscHarmonic.start(startTime);
    oscHarmonic.stop(startTime + duration * 0.7 + 0.05);

    return [oscMain, oscHarmonic];
  }

  playCompletionAlarm() {
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Master gain for stopping alarm at any time
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1, now);
    masterGain.connect(ctx.destination);
    this.alarmMasterGain = masterGain;

    this.activeAlarmNodes = [];

    // Part 1: Ascending 5-note melodic celebration fanfare
    const notes = [
      { freq: 261.63, time: now, duration: 1.8, gain: 0.16 },         // C4
      { freq: 329.63, time: now + 0.22, duration: 1.8, gain: 0.17 },  // E4
      { freq: 392.00, time: now + 0.44, duration: 1.8, gain: 0.18 },  // G4
      { freq: 493.88, time: now + 0.66, duration: 1.8, gain: 0.19 },  // B4
      { freq: 523.25, time: now + 0.88, duration: 2.2, gain: 0.22 },  // C5
    ];

    notes.forEach(n => {
      const oscs = this.playWarmBell(n.freq, n.time, n.duration, n.gain, masterGain);
      this.activeAlarmNodes.push(...oscs);
    });

    // Part 2: Rich resonant grand celebration chord & gong starting at now + 1.25s, decaying to ~4.75s
    const chordTime = now + 1.25;
    const chordDuration = 3.5; // ends at now + 4.75s total

    const chordTones = [
      { freq: 130.81, gain: 0.25 }, // C3 (Deep base gong)
      { freq: 196.00, gain: 0.20 }, // G3 (Warm fifth)
      { freq: 261.63, gain: 0.18 }, // C4
      { freq: 329.63, gain: 0.17 }, // E4
      { freq: 392.00, gain: 0.18 }, // G4
    ];

    chordTones.forEach(ct => {
      const oscs = this.playWarmBell(ct.freq, chordTime, chordDuration, ct.gain, masterGain);
      this.activeAlarmNodes.push(...oscs);
    });

    // Show the Stop Alarm button so user can dismiss the sound
    if (this.btnStopAlarm) {
      this.btnStopAlarm.style.display = 'inline-flex';
    }

    // Auto hide the button when sound naturally ends after 4.85 seconds
    if (this.alarmTimeout) clearTimeout(this.alarmTimeout);
    this.alarmTimeout = setTimeout(() => {
      if (this.btnStopAlarm) {
        this.btnStopAlarm.style.display = 'none';
      }
      this.activeAlarmNodes = [];
      this.alarmMasterGain = null;
    }, 4900);
  }

  stopAlarmSound() {
    if (this.alarmTimeout) {
      clearTimeout(this.alarmTimeout);
      this.alarmTimeout = null;
    }

    if (this.btnStopAlarm) {
      this.btnStopAlarm.style.display = 'none';
    }

    if (this.alarmMasterGain && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.alarmMasterGain.gain.cancelScheduledValues(now);
        this.alarmMasterGain.gain.setValueAtTime(this.alarmMasterGain.gain.value, now);
        this.alarmMasterGain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
      } catch (_) {}
    }

    if (this.activeAlarmNodes && this.activeAlarmNodes.length > 0) {
      this.activeAlarmNodes.forEach(osc => {
        try {
          osc.stop();
        } catch (_) {}
      });
      this.activeAlarmNodes = [];
    }

    this.alarmMasterGain = null;
  }

  playTone(freq, startTime, duration, maxGain = 0.3) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  // ----------------- AMBIENT SOUND GENERATOR -----------------
  setAmbientSound(sound) {
    this.ambientSound = sound;
    this.saveSettings();
    this.renderSetupChips();

    if (this.status === 'work') {
      if (sound === 'none') {
        this.stopAmbientSound();
      } else {
        this.startAmbientSound(sound);
      }
    }
  }

  startAmbientSound(sound) {
    this.stopAmbientSound();
    if (!this.soundEnabled || sound === 'none') return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;

    try {
      if (sound === 'rain' || sound === 'waves') {
        // Synthesize white noise buffer
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        const gainNode = ctx.createGain();

        if (sound === 'rain') {
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(800, ctx.currentTime);
          gainNode.gain.setValueAtTime(0.04, ctx.currentTime);
        } else {
          // Ocean waves modulation
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(400, ctx.currentTime);
          gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
        }

        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);
        whiteNoise.start();

        this.ambientNodes = { source: whiteNoise, gain: gainNode };
      } else if (sound === 'ticking') {
        // Ticking metronome
        const tickInterval = setInterval(() => {
          if (this.status !== 'work') return;
          this.playTone(1200, ctx.currentTime, 0.03, 0.02);
        }, 1000);
        this.ambientNodes = { interval: tickInterval };
      }
    } catch (e) {
      console.warn('Ambient sound generation error:', e);
    }
  }

  stopAmbientSound() {
    if (this.ambientNodes) {
      if (this.ambientNodes.source) {
        try { this.ambientNodes.source.stop(); } catch (e) {}
      }
      if (this.ambientNodes.interval) {
        clearInterval(this.ambientNodes.interval);
      }
      this.ambientNodes = null;
    }
  }

  // ----------------- TODAY STATS PERSISTENCE -----------------
  getTodayKey() {
    const now = new Date();
    return `todolite_focus_minutes_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
  }

  recordTodayMinutes(mins) {
    const key = this.getTodayKey();
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    const updated = current + mins;
    localStorage.setItem(key, String(updated));
    this.updateTodayStatsBadge();
  }

  updateTodayStatsBadge() {
    if (!this.todayBadge) return;
    const key = this.getTodayKey();
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    const hours = Math.floor(current / 60);
    const mins = current % 60;
    const text = hours > 0 ? `${hours}h ${mins}m` : `${mins} phút`;
    this.todayBadge.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>
      Hôm nay: ${text}
    `;
  }
}
