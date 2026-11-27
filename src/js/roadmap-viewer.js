/**
 * TodoLite - Read-Only Roadmap Viewer Manager (Part 1 - Main Window)
 */

import { store } from './state.js';
import { Bridge } from './bridge.js';
import { showToast } from './app.js';
import {
  RoadmapRenderer,
  ROADMAP_STATUS_META,
  parseRoadmapData,
  computeRoadmapProgress,
  formatDateVN
} from './roadmap-renderer.js';

export class RoadmapViewerManager {
  constructor(options = {}) {
    this.themeManager = options.themeManager || null;
    this.roadmaps = [];
    this.activeRoadmapId = null;
    this.lastNonRoadmapMode = 'checklist';
    this.selectedSheetItemId = null;
    this._needsRender = true;
    this._loadedOnce = false;

    this.btnTitlebarRoadmap = document.getElementById('btn-open-roadmap');
    this.listView = document.getElementById('roadmap-list-view');
    this.detailView = document.getElementById('roadmap-detail-view');
    this.listContainer = document.getElementById('roadmap-list-container');
    this.emptyState = document.getElementById('roadmap-empty-state');
    this.visibleCountEl = document.getElementById('roadmap-visible-count');

    this.btnOpenStudio = document.getElementById('btn-roadmap-open-studio');
    this.btnEmptyStudio = document.getElementById('btn-roadmap-empty-studio');
    this.btnBack = document.getElementById('btn-roadmap-back');
    this.btnEditCurrent = document.getElementById('btn-roadmap-edit-current');

    this.detailTitleEl = document.getElementById('roadmap-detail-title');
    this.detailBadgeEl = document.getElementById('roadmap-detail-badge');
    this.canvasMountEl = document.getElementById('roadmap-viewer-canvas');

    this.btnZoomOut = document.getElementById('btn-rm-zoom-out');
    this.btnZoomIn = document.getElementById('btn-rm-zoom-in');
    this.btnFit = document.getElementById('btn-rm-fit');
    this.zoomLabelEl = document.getElementById('rm-zoom-label');

    this.sheetEl = document.getElementById('roadmap-detail-sheet');
    this.sheetColorDot = document.getElementById('rm-sheet-color-dot');
    this.sheetTitleEl = document.getElementById('rm-sheet-title');
    this.sheetStatusEl = document.getElementById('rm-sheet-status');
    this.sheetDateEl = document.getElementById('rm-sheet-date');
    this.sheetDescEl = document.getElementById('rm-sheet-desc');
    this.btnSheetClose = document.getElementById('btn-rm-sheet-close');

    this.renderer = null;

    this.bindEvents();
    this.setupRealtimeSync();
  }

  ensureRenderer() {
    if (!this.renderer && this.canvasMountEl) {
      this.renderer = new RoadmapRenderer(this.canvasMountEl, {
        interactive: false,
        onSelectNode: (node) => this.showItemSheet(node, 'node'),
        onSelectMilestone: (milestone) => this.showItemSheet(milestone, 'milestone'),
        onClearSelection: () => this.hideItemSheet(),
        onZoomChange: (z) => this.updateZoomLabel(z)
      });
    }
    return this.renderer;
  }

  bindEvents() {
    if (this.btnTitlebarRoadmap) {
      this.btnTitlebarRoadmap.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentMode = store.getState().viewMode;
        if (currentMode === 'roadmap') {
          const target = this.lastNonRoadmapMode && this.lastNonRoadmapMode !== 'roadmap'
            ? this.lastNonRoadmapMode
            : 'checklist';
          this.themeManager?.applyMode(target);
        } else {
          this.lastNonRoadmapMode = currentMode || 'checklist';
          this.themeManager?.applyMode('roadmap');
          this.showListView();
          this.loadRoadmaps();
        }
      });
    }

    // Track last non-roadmap mode whenever mode changes externally
    store.subscribe('viewMode', (mode) => {
      if (mode && mode !== 'roadmap') {
        this.lastNonRoadmapMode = mode;
      }
      if (mode === 'roadmap') {
        if (!this._loadedOnce) {
          this.loadRoadmaps();
        } else if (this._needsRender) {
          this._needsRender = false;
          this.renderList();
        }
        if (this.activeRoadmapId && this.detailView?.style.display !== 'none') {
          requestAnimationFrame(() => this.renderer?.fitToView());
        }
      }
    });

    if (this.btnOpenStudio) {
      this.btnOpenStudio.addEventListener('click', () => this.openStudio(null));
    }
    if (this.btnEmptyStudio) {
      this.btnEmptyStudio.addEventListener('click', () => this.openStudio(null));
    }
    if (this.btnEditCurrent) {
      this.btnEditCurrent.addEventListener('click', () => this.openStudio(this.activeRoadmapId));
    }
    if (this.btnBack) {
      this.btnBack.addEventListener('click', () => this.showListView());
    }

    if (this.btnZoomOut) {
      this.btnZoomOut.addEventListener('click', () => this.renderer?.zoomOut());
    }
    if (this.btnZoomIn) {
      this.btnZoomIn.addEventListener('click', () => this.renderer?.zoomIn());
    }
    if (this.btnFit) {
      this.btnFit.addEventListener('click', () => this.renderer?.fitToView());
    }
    if (this.btnSheetClose) {
      this.btnSheetClose.addEventListener('click', () => {
        this.hideItemSheet();
        this.renderer?.setSelection(null, null);
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.sheetEl?.classList.contains('open')) {
        this.hideItemSheet();
        this.renderer?.setSelection(null, null);
      }
    });
  }

  setupRealtimeSync() {
    if (typeof window !== 'undefined') {
      const listenEvent = window.__TAURI__?.event?.listen || window.__TAURI_INTERNALS__?.listen;
      if (typeof listenEvent === 'function') {
        listenEvent('roadmaps_changed', () => {
          this.loadRoadmaps();
        });
      }

      // Browser preview fallback sync across tabs
      window.addEventListener('storage', (e) => {
        if (e.key === 'todolite_roadmaps_data') {
          this.loadRoadmaps();
        }
      });
    }
  }

  async openStudio(roadmapId = null) {
    try {
      await Bridge.invoke('open_roadmap_studio', { roadmap_id: roadmapId });
    } catch (err) {
      console.error('Failed to open roadmap studio:', err);
      showToast('Không thể mở Trình sửa Lộ Trình: ' + err.message, 'error');
    }
  }

  async loadRoadmaps() {
    try {
      const list = await Bridge.invoke('get_all_roadmaps');
      this.roadmaps = Array.isArray(list) ? list : [];
      this._loadedOnce = true;
      store.setState({ roadmaps: this.roadmaps });

      if (store.getState().viewMode !== 'roadmap') {
        this._needsRender = true;
        return;
      }

      this._needsRender = false;
      this.renderList();

      if (this.activeRoadmapId && this.detailView?.style.display !== 'none') {
        const active = this.roadmaps.find(r => r.id === this.activeRoadmapId && r.is_visible === 1);
        if (active) {
          this.renderActiveDetail(active, true);
        } else {
          this.showListView();
          showToast('Lộ trình đang xem đã bị ẩn hoặc xóa.', 'info');
        }
      }
    } catch (err) {
      console.error('Failed to load roadmaps:', err);
    }
  }

  renderList() {
    if (!this.listContainer) return;
    const visibleRoadmaps = this.roadmaps.filter(r => r.is_visible === 1);

    if (this.visibleCountEl) {
      this.visibleCountEl.textContent = String(visibleRoadmaps.length);
    }

    this.listContainer.innerHTML = '';
    if (visibleRoadmaps.length === 0) {
      this.listContainer.style.display = 'none';
      if (this.emptyState) this.emptyState.style.display = 'flex';
      return;
    }

    this.listContainer.style.display = 'flex';
    if (this.emptyState) this.emptyState.style.display = 'none';

    visibleRoadmaps.forEach(rm => {
      const parsed = parseRoadmapData(rm.kind, rm.data_json);
      const progress = computeRoadmapProgress(rm.kind, parsed);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'rm-list-card';

      const topRow = document.createElement('div');
      topRow.className = 'rm-list-card-top';

      const titleEl = document.createElement('span');
      titleEl.className = 'rm-list-card-title';
      titleEl.textContent = rm.title || 'Lộ trình';
      topRow.appendChild(titleEl);

      const chip = document.createElement('span');
      chip.className = `rm-kind-chip ${rm.kind === 'timeline' ? 'kind-timeline' : 'kind-flowchart'}`;
      chip.textContent = rm.kind === 'timeline' ? 'Timeline' : 'Sơ đồ khối';
      topRow.appendChild(chip);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'rm-list-card-bottom';

      const barWrap = document.createElement('div');
      barWrap.className = 'rm-progress-bar-wrap';
      const barFill = document.createElement('div');
      barFill.className = 'rm-progress-bar-fill';
      barFill.style.width = `${progress.percent}%`;
      barWrap.appendChild(barFill);
      bottomRow.appendChild(barWrap);

      const progText = document.createElement('span');
      progText.className = 'rm-progress-text';
      progText.textContent = `${progress.done}/${progress.total} xong`;
      bottomRow.appendChild(progText);

      card.appendChild(topRow);
      card.appendChild(bottomRow);
      card.addEventListener('click', () => this.openRoadmapDetail(rm.id));
      this.listContainer.appendChild(card);
    });
  }

  showListView() {
    this.activeRoadmapId = null;
    this.hideItemSheet();
    if (this.detailView) this.detailView.style.display = 'none';
    if (this.listView) this.listView.style.display = 'flex';
  }

  openRoadmapDetail(id) {
    const rm = this.roadmaps.find(r => r.id === id && r.is_visible === 1);
    if (!rm) return;
    this.activeRoadmapId = rm.id;
    this.hideItemSheet();

    if (this.listView) this.listView.style.display = 'none';
    if (this.detailView) this.detailView.style.display = 'flex';

    this.renderActiveDetail(rm, false);
    requestAnimationFrame(() => {
      this.renderer?.fitToView();
      this.updateZoomLabel(this.renderer?.getZoom() || 1);
    });
  }

  renderActiveDetail(rm, preserveViewport = false) {
    if (this.detailTitleEl) this.detailTitleEl.textContent = rm.title || 'Lộ trình';
    if (this.detailBadgeEl) {
      this.detailBadgeEl.textContent = rm.kind === 'timeline' ? 'Timeline' : 'Sơ đồ khối';
    }
    const parsed = parseRoadmapData(rm.kind, rm.data_json);
    const renderer = this.ensureRenderer();
    renderer?.render(rm.kind, parsed, { preserveViewport });
    this.updateZoomLabel(renderer?.getZoom() || 1);

    // Refresh open detail sheet if the selected item was updated
    if (this.selectedSheetItemId && this.sheetEl?.classList.contains('open')) {
      const list = rm.kind === 'timeline' ? parsed.milestones : parsed.nodes;
      const updatedItem = (list || []).find(it => it.id === this.selectedSheetItemId);
      if (updatedItem) {
        this.showItemSheet(updatedItem, rm.kind === 'timeline' ? 'milestone' : 'node');
      } else {
        this.hideItemSheet();
      }
    }
  }

  updateZoomLabel(zoom) {
    if (this.zoomLabelEl) {
      this.zoomLabelEl.textContent = `${Math.round((zoom || 1) * 100)}%`;
    }
  }

  showItemSheet(item, type) {
    if (!this.sheetEl || !item) return;
    this.selectedSheetItemId = item.id;

    if (this.sheetColorDot) {
      this.sheetColorDot.style.background = item.color || '#f59e0b';
    }
    if (this.sheetTitleEl) {
      this.sheetTitleEl.textContent = item.title || 'Chưa đặt tên';
    }

    const statusKey = ROADMAP_STATUS_META[item.status] ? item.status : 'todo';
    const statusInfo = ROADMAP_STATUS_META[statusKey];
    if (this.sheetStatusEl) {
      this.sheetStatusEl.className = `rm-status-pill status-${statusKey}`;
      this.sheetStatusEl.textContent = `${statusInfo.icon} ${statusInfo.label}`;
    }

    if (this.sheetDateEl) {
      if (type === 'milestone' && item.date) {
        this.sheetDateEl.textContent = `📅 ${formatDateVN(item.date, true)}`;
        this.sheetDateEl.style.display = 'inline-block';
      } else {
        this.sheetDateEl.style.display = 'none';
      }
    }

    if (this.sheetDescEl) {
      const desc = (item.description || '').trim();
      this.sheetDescEl.textContent = desc || 'Chưa có mô tả chi tiết cho mục này.';
    }

    this.sheetEl.classList.add('open');
    this.sheetEl.setAttribute('aria-hidden', 'false');
  }

  hideItemSheet() {
    this.selectedSheetItemId = null;
    if (this.sheetEl) {
      this.sheetEl.classList.remove('open');
      this.sheetEl.setAttribute('aria-hidden', 'true');
    }
  }
}
