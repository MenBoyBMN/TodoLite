/**
 * TodoLite - Roadmap Studio Window Controller (Part 2 - Large Editor & Manager)
 */

import { Bridge } from './bridge.js';
import {
  RoadmapRenderer,
  ROADMAP_COLORS,
  createDefaultFlowchartData,
  createDefaultTimelineData,
  parseRoadmapData,
  computeRoadmapProgress,
  parseUtcDate
} from './roadmap-renderer.js';

class RoadmapStudioApp {
  constructor() {
    this.roadmaps = [];
    this.activeRoadmapId = null;
    this.currentData = null;
    this.selectedType = null; // 'node' | 'edge' | 'milestone' | null
    this.selectedId = null;
    this.connectMode = false;

    this._saveTimer = null;
    this._pendingSaveId = null;
    this._toastTimer = null;
    this._confirmResolve = null;

    // DOM refs - Sidebar
    this.btnTheme = document.getElementById('btn-studio-theme');
    this.btnNew = document.getElementById('btn-studio-new');
    this.btnEmptyNew = document.getElementById('btn-studio-empty-new');
    this.listEl = document.getElementById('studio-roadmap-list');
    this.sidebarCountEl = document.getElementById('studio-sidebar-count');

    // DOM refs - Toolbar & Canvas
    this.toolbarEl = document.getElementById('studio-toolbar');
    this.titleInput = document.getElementById('studio-roadmap-title-input');
    this.kindBadge = document.getElementById('studio-kind-badge');
    this.saveStatusEl = document.getElementById('studio-save-status');
    this.flowchartTools = document.getElementById('studio-flowchart-tools');
    this.timelineTools = document.getElementById('studio-timeline-tools');
    this.btnAddNode = document.getElementById('btn-add-node');
    this.btnToggleConnect = document.getElementById('btn-toggle-connect');
    this.connectBanner = document.getElementById('studio-connect-banner');
    this.tlStartInput = document.getElementById('studio-tl-start');
    this.tlEndInput = document.getElementById('studio-tl-end');
    this.btnAddMilestone = document.getElementById('btn-add-milestone');
    this.btnZoomOut = document.getElementById('btn-studio-zoom-out');
    this.btnZoomIn = document.getElementById('btn-studio-zoom-in');
    this.btnFit = document.getElementById('btn-studio-fit');
    this.zoomLabelEl = document.getElementById('studio-zoom-label');
    this.canvasMountEl = document.getElementById('studio-canvas');
    this.emptyOverlay = document.getElementById('studio-empty-overlay');

    // DOM refs - Inspector
    this.panelOverview = document.getElementById('insp-overview');
    this.panelNode = document.getElementById('insp-node');
    this.panelEdge = document.getElementById('insp-edge');
    this.panelMilestone = document.getElementById('insp-milestone');

    this.ovKindEl = document.getElementById('insp-ov-kind');
    this.ovVisibleCheck = document.getElementById('insp-ov-visible');
    this.ovProgressBar = document.getElementById('insp-ov-progress-bar');
    this.ovProgressText = document.getElementById('insp-ov-progress-text');

    this.nodeTitleInput = document.getElementById('insp-node-title');
    this.nodeDescInput = document.getElementById('insp-node-desc');
    this.nodeStatusGroup = document.getElementById('insp-node-status-group');
    this.nodeColorsEl = document.getElementById('insp-node-colors');
    this.btnDeleteNode = document.getElementById('btn-delete-node');

    this.edgeStyleGroup = document.getElementById('insp-edge-style-group');
    this.edgeLabelInput = document.getElementById('insp-edge-label');
    this.btnReverseEdge = document.getElementById('btn-reverse-edge');
    this.btnDeleteEdge = document.getElementById('btn-delete-edge');

    this.msDateInput = document.getElementById('insp-ms-date');
    this.msTitleInput = document.getElementById('insp-ms-title');
    this.msDescInput = document.getElementById('insp-ms-desc');
    this.msStatusGroup = document.getElementById('insp-ms-status-group');
    this.msColorsEl = document.getElementById('insp-ms-colors');
    this.btnDeleteMs = document.getElementById('btn-delete-milestone');

    // Modals
    this.createModal = document.getElementById('studio-create-modal');
    this.createTitleInput = document.getElementById('create-rm-title');
    this.createVisibleCheck = document.getElementById('create-rm-visible');
    this.confirmModal = document.getElementById('studio-confirm-modal');
    this.confirmMsgEl = document.getElementById('confirm-modal-message');

    this.renderer = new RoadmapRenderer(this.canvasMountEl, {
      interactive: true,
      onSelectNode: (node) => this.selectItem('node', node.id),
      onSelectEdge: (edge) => this.selectItem('edge', edge.id),
      onSelectMilestone: (ms) => this.selectItem('milestone', ms.id),
      onClearSelection: () => this.clearSelection(),
      onNodeMoved: (nodeId, x, y) => this.handleNodeMoved(nodeId, x, y),
      onConnectNodes: (fromId, toId) => this.handleConnectNodes(fromId, toId),
      onZoomChange: (z) => this.updateZoomLabel(z)
    });

    this.init();
  }

  async init() {
    this.syncThemeFromStorage();
    this.buildColorSwatches();
    this.bindEvents();
    this.setupRealtimeListeners();

    const params = new URLSearchParams(window.location.search);
    const requestedId = window.__INITIAL_ROADMAP_ID__ || params.get('id');

    await this.loadRoadmaps(requestedId);
  }

  syncThemeFromStorage() {
    const theme = localStorage.getItem('todolite_theme') || 'light';
    const style = localStorage.getItem('todolite_style') || 'glass';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-style', style);
  }

  buildColorSwatches() {
    const buildGrid = (container, onPick) => {
      if (!container) return;
      container.innerHTML = '';
      ROADMAP_COLORS.forEach(hex => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'insp-color-swatch';
        btn.dataset.color = hex;
        btn.style.background = hex;
        btn.title = hex;
        btn.addEventListener('click', () => onPick(hex));
        container.appendChild(btn);
      });
    };

    buildGrid(this.nodeColorsEl, (hex) => this.updateSelectedNode({ color: hex }));
    buildGrid(this.msColorsEl, (hex) => this.updateSelectedMilestone({ color: hex }));
  }

  bindEvents() {
    if (this.btnTheme) {
      this.btnTheme.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
      });
    }

    if (this.btnNew) this.btnNew.addEventListener('click', () => this.openCreateModal());
    if (this.btnEmptyNew) this.btnEmptyNew.addEventListener('click', () => this.openCreateModal());

    // Create Modal
    document.getElementById('btn-create-close')?.addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-create-cancel')?.addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-create-submit')?.addEventListener('click', () => this.submitCreateModal());
    this.createModal?.querySelectorAll('.create-kind-card').forEach(card => {
      card.addEventListener('click', () => {
        this.createModal.querySelectorAll('.create-kind-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });
    this.createTitleInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitCreateModal();
    });

    // Confirm Modal
    document.getElementById('btn-confirm-close')?.addEventListener('click', () => this.resolveConfirm(false));
    document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => this.resolveConfirm(false));
    document.getElementById('btn-confirm-ok')?.addEventListener('click', () => this.resolveConfirm(true));

    // Title & Overview Visibility
    this.titleInput?.addEventListener('change', async () => {
      const rm = this.getActiveRoadmap();
      if (!rm) return;
      const nextTitle = this.titleInput.value.trim() || rm.title;
      this.titleInput.value = nextTitle;
      await this.updateRoadmapMeta(rm.id, nextTitle, rm.is_visible);
    });

    this.ovVisibleCheck?.addEventListener('change', async () => {
      const rm = this.getActiveRoadmap();
      if (!rm) return;
      await this.updateRoadmapMeta(rm.id, rm.title, this.ovVisibleCheck.checked ? 1 : 0);
    });

    // Flowchart Toolbar
    this.btnAddNode?.addEventListener('click', () => this.addFlowchartNode());
    this.btnToggleConnect?.addEventListener('click', () => this.toggleConnectMode());

    // Timeline Toolbar
    this.tlStartInput?.addEventListener('change', () => this.handleTimelineRangeChange());
    this.tlEndInput?.addEventListener('change', () => this.handleTimelineRangeChange());
    this.btnAddMilestone?.addEventListener('click', () => this.addTimelineMilestone());

    // Zoom Controls
    this.btnZoomOut?.addEventListener('click', () => this.renderer.zoomOut());
    this.btnZoomIn?.addEventListener('click', () => this.renderer.zoomIn());
    this.btnFit?.addEventListener('click', () => this.renderer.fitToView());

    // Inspector Clear Buttons
    document.getElementById('btn-insp-clear-node')?.addEventListener('click', () => this.clearSelection());
    document.getElementById('btn-insp-clear-edge')?.addEventListener('click', () => this.clearSelection());
    document.getElementById('btn-insp-clear-ms')?.addEventListener('click', () => this.clearSelection());

    // Node Inspector Inputs
    this.nodeTitleInput?.addEventListener('input', () => {
      this.updateSelectedNode({ title: this.nodeTitleInput.value });
    });
    this.nodeDescInput?.addEventListener('input', () => {
      this.updateSelectedNode({ description: this.nodeDescInput.value });
    });
    this.nodeStatusGroup?.querySelectorAll('.insp-status-btn').forEach(btn => {
      btn.addEventListener('click', () => this.updateSelectedNode({ status: btn.dataset.status }));
    });
    this.btnDeleteNode?.addEventListener('click', () => this.deleteSelectedItem());

    // Edge Inspector Inputs
    this.edgeStyleGroup?.querySelectorAll('.insp-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.updateSelectedEdge({ arrow: btn.dataset.arrow === 'true' });
      });
    });
    this.edgeLabelInput?.addEventListener('input', () => {
      this.updateSelectedEdge({ label: this.edgeLabelInput.value });
    });
    this.btnReverseEdge?.addEventListener('click', () => {
      const edge = this.getSelectedEdge();
      if (!edge) return;
      const dup = (this.currentData.edges || []).some(
        e => e.id !== edge.id && e.from === edge.to && e.to === edge.from
      );
      if (dup) {
        this.showToast('Đã tồn tại đường nối theo chiều ngược lại.', 'error');
        return;
      }
      this.updateSelectedEdge({ from: edge.to, to: edge.from });
    });
    this.btnDeleteEdge?.addEventListener('click', () => this.deleteSelectedItem());

    // Milestone Inspector Inputs
    this.msDateInput?.addEventListener('change', () => {
      if (!this.msDateInput.value) return;
      this.updateSelectedMilestone({ date: this.msDateInput.value });
    });
    this.msTitleInput?.addEventListener('input', () => {
      this.updateSelectedMilestone({ title: this.msTitleInput.value });
    });
    this.msDescInput?.addEventListener('input', () => {
      this.updateSelectedMilestone({ description: this.msDescInput.value });
    });
    this.msStatusGroup?.querySelectorAll('.insp-status-btn').forEach(btn => {
      btn.addEventListener('click', () => this.updateSelectedMilestone({ status: btn.dataset.status }));
    });
    this.btnDeleteMs?.addEventListener('click', () => this.deleteSelectedItem());

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.createModal?.classList.contains('open')) {
          this.closeCreateModal();
          return;
        }
        if (this.confirmModal?.classList.contains('open')) {
          this.resolveConfirm(false);
          return;
        }
        if (this.connectMode) {
          this.setConnectMode(false);
          return;
        }
        this.clearSelection();
        return;
      }

      const activeTag = document.activeElement?.tagName;
      const isEditingText = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
      if (!isEditingText && (e.key === 'Delete' || e.key === 'Backspace') && this.selectedId) {
        e.preventDefault();
        this.deleteSelectedItem();
      }
    });

    // Flush pending autosave on close
    window.addEventListener('beforeunload', () => {
      this.flushPendingSave();
    });
  }

  setupRealtimeListeners() {
    if (typeof window !== 'undefined') {
      const listenEvent = window.__TAURI__?.event?.listen || window.__TAURI_INTERNALS__?.listen;
      if (typeof listenEvent === 'function') {
        listenEvent('app_theme_synced', (event) => {
          const payload = event.payload || {};
          if (payload.theme) document.documentElement.setAttribute('data-theme', payload.theme);
          if (payload.style) document.documentElement.setAttribute('data-style', payload.style);
        });
        listenEvent('roadmap_studio_select', (event) => {
          const targetId = event.payload;
          if (targetId) this.selectRoadmap(targetId);
        });
      }

      window.addEventListener('storage', (e) => {
        if (e.key === 'todolite_theme' || e.key === 'todolite_style') {
          this.syncThemeFromStorage();
        }
      });
    }
  }

  async loadRoadmaps(preferredId = null) {
    try {
      const list = await Bridge.invoke('get_all_roadmaps');
      this.roadmaps = Array.isArray(list) ? list : [];
      this.renderSidebar();

      if (this.roadmaps.length === 0) {
        this.activeRoadmapId = null;
        this.currentData = null;
        this.showEmptyState(true);
        return;
      }

      this.showEmptyState(false);
      const targetId =
        (preferredId && this.roadmaps.some(r => r.id === preferredId) && preferredId) ||
        (this.activeRoadmapId && this.roadmaps.some(r => r.id === this.activeRoadmapId) && this.activeRoadmapId) ||
        this.roadmaps[0].id;

      await this.selectRoadmap(targetId, { skipFlush: true });
    } catch (err) {
      console.error('Failed to load roadmaps in Studio:', err);
      this.showToast('Không thể tải danh sách lộ trình.', 'error');
    }
  }

  getActiveRoadmap() {
    return this.roadmaps.find(r => r.id === this.activeRoadmapId) || null;
  }

  showEmptyState(isEmpty) {
    if (this.emptyOverlay) this.emptyOverlay.style.display = isEmpty ? 'flex' : 'none';
    if (this.toolbarEl) this.toolbarEl.style.visibility = isEmpty ? 'hidden' : 'visible';
    if (isEmpty) {
      this.canvasMountEl.innerHTML = '';
      this.clearSelection();
      this.updateOverviewPanel();
    }
  }

  renderSidebar() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    const visibleCount = this.roadmaps.filter(r => r.is_visible === 1).length;
    if (this.sidebarCountEl) {
      this.sidebarCountEl.textContent = `Hiển thị trên TodoLite: ${visibleCount} / ${this.roadmaps.length}`;
    }

    this.roadmaps.forEach((rm, index) => {
      const row = document.createElement('div');
      row.className = `studio-rm-item ${rm.id === this.activeRoadmapId ? 'active' : ''}`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('.studio-switch')) return;
        this.selectRoadmap(rm.id);
      });

      const top = document.createElement('div');
      top.className = 'studio-rm-item-top';

      const icon = document.createElement('span');
      icon.className = 'studio-rm-kind-icon';
      icon.textContent = rm.kind === 'timeline' ? '📅' : '🕸️';
      icon.title = rm.kind === 'timeline' ? 'Dạng 2: Timeline' : 'Dạng 1: Sơ đồ khối';
      top.appendChild(icon);

      const title = document.createElement('span');
      title.className = 'studio-rm-item-title';
      title.textContent = rm.title || 'Lộ trình';
      top.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'studio-rm-item-actions';

      const visLabel = document.createElement('label');
      visLabel.className = 'studio-rm-vis-label';
      visLabel.title = 'Bật/tắt hiển thị lộ trình này lên cửa sổ TodoLite';

      const sw = document.createElement('span');
      sw.className = 'studio-switch small';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = rm.is_visible === 1;
      chk.addEventListener('change', async (e) => {
        e.stopPropagation();
        await this.updateRoadmapMeta(rm.id, rm.title, chk.checked ? 1 : 0);
      });
      const slider = document.createElement('span');
      slider.className = 'studio-slider';
      sw.appendChild(chk);
      sw.appendChild(slider);

      const visText = document.createElement('span');
      visText.textContent = rm.is_visible === 1 ? 'Đang hiện' : 'Đang ẩn';

      visLabel.appendChild(sw);
      visLabel.appendChild(visText);

      const miniBtns = document.createElement('div');
      miniBtns.className = 'studio-mini-btns';

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'studio-mini-btn';
      btnUp.textContent = '↑';
      btnUp.title = 'Di chuyển lên';
      btnUp.disabled = index === 0;
      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveRoadmap(index, -1);
      });

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'studio-mini-btn';
      btnDown.textContent = '↓';
      btnDown.title = 'Di chuyển xuống';
      btnDown.disabled = index === this.roadmaps.length - 1;
      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        this.moveRoadmap(index, 1);
      });

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'studio-mini-btn danger';
      btnDel.textContent = '🗑';
      btnDel.title = 'Xóa lộ trình';
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteRoadmap(rm);
      });

      miniBtns.appendChild(btnUp);
      miniBtns.appendChild(btnDown);
      miniBtns.appendChild(btnDel);

      actions.appendChild(visLabel);
      actions.appendChild(miniBtns);

      row.appendChild(top);
      row.appendChild(actions);
      this.listEl.appendChild(row);
    });
  }

  async selectRoadmap(id, { skipFlush = false } = {}) {
    if (!skipFlush) {
      await this.flushPendingSave();
    }
    const rm = this.roadmaps.find(r => r.id === id);
    if (!rm) return;

    this.activeRoadmapId = rm.id;
    this.currentData = parseRoadmapData(rm.kind, rm.data_json);
    this.setConnectMode(false);
    this.clearSelection();
    this.showEmptyState(false);

    if (this.titleInput) this.titleInput.value = rm.title || '';
    if (this.kindBadge) {
      this.kindBadge.textContent = rm.kind === 'timeline' ? 'Dạng 2: Timeline' : 'Dạng 1: Sơ đồ khối';
      this.kindBadge.className = `studio-kind-badge ${rm.kind === 'timeline' ? 'timeline' : ''}`;
    }

    const isTimeline = rm.kind === 'timeline';
    if (this.flowchartTools) this.flowchartTools.style.display = isTimeline ? 'none' : 'flex';
    if (this.timelineTools) this.timelineTools.style.display = isTimeline ? 'flex' : 'none';

    if (isTimeline) {
      if (this.tlStartInput) this.tlStartInput.value = this.currentData.startDate;
      if (this.tlEndInput) this.tlEndInput.value = this.currentData.endDate;
    }

    this.renderSidebar();
    this.updateOverviewPanel();
    this.renderer.render(rm.kind, this.currentData, { preserveViewport: false });
    requestAnimationFrame(() => {
      this.renderer.fitToView();
      this.updateZoomLabel(this.renderer.getZoom());
    });
  }

  updateZoomLabel(zoom) {
    if (this.zoomLabelEl) {
      this.zoomLabelEl.textContent = `${Math.round((zoom || 1) * 100)}%`;
    }
  }

  /* ----------------------------------------------------------------------
   * CREATE / DELETE / REORDER / META
   * ---------------------------------------------------------------------- */
  openCreateModal() {
    if (!this.createModal) return;
    if (this.createTitleInput) this.createTitleInput.value = '';
    if (this.createVisibleCheck) this.createVisibleCheck.checked = true;
    this.createModal.classList.add('open');
    this.createModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => this.createTitleInput?.focus(), 60);
  }

  closeCreateModal() {
    if (!this.createModal) return;
    this.createModal.classList.remove('open');
    this.createModal.setAttribute('aria-hidden', 'true');
  }

  async submitCreateModal() {
    const title = (this.createTitleInput?.value || '').trim() || 'Lộ trình mới';
    const checkedRadio = this.createModal?.querySelector('input[name="create-rm-kind"]:checked');
    const kind = checkedRadio?.value === 'timeline' ? 'timeline' : 'flowchart';
    const isVisible = this.createVisibleCheck?.checked ? 1 : 0;
    const starterData = kind === 'timeline' ? createDefaultTimelineData() : createDefaultFlowchartData();

    try {
      await this.flushPendingSave();
      const created = await Bridge.invoke('create_roadmap', {
        title,
        kind,
        is_visible: isVisible,
        data_json: JSON.stringify(starterData)
      });
      this.closeCreateModal();
      await this.loadRoadmaps(created?.id);
      this.showToast(`Đã tạo lộ trình "${title}"`);
    } catch (err) {
      console.error('Failed to create roadmap:', err);
      this.showToast('Không thể tạo lộ trình: ' + err.message, 'error');
    }
  }

  async updateRoadmapMeta(id, title, isVisible) {
    try {
      const updated = await Bridge.invoke('update_roadmap_meta', {
        id,
        title,
        is_visible: isVisible
      });
      const idx = this.roadmaps.findIndex(r => r.id === id);
      if (idx !== -1 && updated) {
        this.roadmaps[idx] = updated;
      }
      this.renderSidebar();
      if (id === this.activeRoadmapId) {
        this.updateOverviewPanel();
      }
    } catch (err) {
      console.error('Failed to update roadmap meta:', err);
      this.showToast('Lỗi cập nhật thông tin lộ trình.', 'error');
    }
  }

  async moveRoadmap(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= this.roadmaps.length) return;
    const copy = [...this.roadmaps];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    const items = copy.map((rm, idx) => ({ id: rm.id, sort_order: idx }));
    copy.forEach((rm, idx) => { rm.sort_order = idx; });
    this.roadmaps = copy;
    this.renderSidebar();

    try {
      await Bridge.invoke('reorder_roadmaps', { items });
    } catch (err) {
      console.error('Failed to reorder roadmaps:', err);
      this.showToast('Không thể sắp xếp thứ tự.', 'error');
    }
  }

  async deleteRoadmap(rm) {
    const ok = await this.confirmAction(`Bạn có chắc muốn xóa vĩnh viễn lộ trình "${rm.title}"?`);
    if (!ok) return;

    if (this._pendingSaveId === rm.id && this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      this._pendingSaveId = null;
    }

    try {
      await Bridge.invoke('delete_roadmap', { id: rm.id });
      this.showToast(`Đã xóa "${rm.title}"`);
      await this.loadRoadmaps();
    } catch (err) {
      console.error('Failed to delete roadmap:', err);
      this.showToast('Lỗi khi xóa lộ trình.', 'error');
    }
  }

  /* ----------------------------------------------------------------------
   * DIAGRAM EDITING & AUTO-SAVE
   * ---------------------------------------------------------------------- */
  scheduleAutoSave() {
    const rm = this.getActiveRoadmap();
    if (!rm || !this.currentData) return;
    const targetId = rm.id;
    const dataJson = JSON.stringify(this.currentData);
    rm.data_json = dataJson;

    this._pendingSaveId = targetId;
    if (this.saveStatusEl) {
      this.saveStatusEl.textContent = 'Đang lưu...';
      this.saveStatusEl.classList.add('saving');
    }

    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.persistRoadmapData(targetId, dataJson);
    }, 350);
  }

  async flushPendingSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._pendingSaveId) {
      const rm = this.roadmaps.find(r => r.id === this._pendingSaveId);
      const idToSave = this._pendingSaveId;
      this._pendingSaveId = null;
      if (rm) {
        await this.persistRoadmapData(idToSave, rm.data_json);
      }
    }
  }

  async persistRoadmapData(id, dataJson) {
    this._pendingSaveId = null;
    try {
      const updated = await Bridge.invoke('update_roadmap_data', {
        id,
        data_json: dataJson
      });
      const idx = this.roadmaps.findIndex(r => r.id === id);
      if (idx !== -1 && updated) {
        this.roadmaps[idx] = updated;
      }
      if (this.saveStatusEl) {
        this.saveStatusEl.textContent = 'Đã lưu ✓';
        this.saveStatusEl.classList.remove('saving');
      }
    } catch (err) {
      console.error('Auto-save failed:', err);
      if (this.saveStatusEl) {
        this.saveStatusEl.textContent = 'Lỗi lưu!';
      }
    }
  }

  /* ----------------------------------------------------------------------
   * FLOWCHART ACTIONS (DẠNG 1)
   * ---------------------------------------------------------------------- */
  addFlowchartNode() {
    const rm = this.getActiveRoadmap();
    if (!rm || rm.kind !== 'flowchart' || !this.currentData) return;

    const nodes = this.currentData.nodes || [];
    const last = nodes[nodes.length - 1];
    const x = last ? Math.round((last.x + 216) / 12) * 12 : 84;
    const y = last ? last.y : 120;

    const newNode = {
      id: 'n-' + Date.now(),
      title: `Khung ${nodes.length + 1}`,
      description: '',
      x,
      y,
      color: ROADMAP_COLORS[nodes.length % ROADMAP_COLORS.length],
      status: 'todo'
    };

    this.currentData.nodes.push(newNode);
    this.renderer.render('flowchart', this.currentData, { preserveViewport: true });
    this.selectItem('node', newNode.id);
    this.updateOverviewPanel();
    this.scheduleAutoSave();
  }

  toggleConnectMode() {
    this.setConnectMode(!this.connectMode);
  }

  setConnectMode(enabled) {
    this.connectMode = Boolean(enabled);
    this.renderer.setConnectMode(this.connectMode);
    if (this.btnToggleConnect) {
      this.btnToggleConnect.classList.toggle('active', this.connectMode);
    }
    if (this.connectBanner) {
      this.connectBanner.style.display = this.connectMode ? 'block' : 'none';
    }
  }

  handleNodeMoved(nodeId, x, y) {
    const node = (this.currentData?.nodes || []).find(n => n.id === nodeId);
    if (!node) return;
    node.x = x;
    node.y = y;
    this.scheduleAutoSave();
  }

  handleConnectNodes(fromId, toId) {
    if (!this.currentData || fromId === toId) return;
    const edges = this.currentData.edges || [];
    const exists = edges.some(e => e.from === fromId && e.to === toId);
    if (exists) {
      this.showToast('Hai khung này đã có đường nối theo hướng đó rồi.', 'error');
      return;
    }

    const newEdge = {
      id: 'e-' + Date.now(),
      from: fromId,
      to: toId,
      arrow: true,
      label: ''
    };
    edges.push(newEdge);
    this.currentData.edges = edges;
    this.setConnectMode(false);
    this.renderer.render('flowchart', this.currentData, { preserveViewport: true });
    this.selectItem('edge', newEdge.id);
    this.scheduleAutoSave();
  }

  /* ----------------------------------------------------------------------
   * TIMELINE ACTIONS (DẠNG 2)
   * ---------------------------------------------------------------------- */
  handleTimelineRangeChange() {
    const rm = this.getActiveRoadmap();
    if (!rm || rm.kind !== 'timeline' || !this.currentData) return;

    const nextStart = this.tlStartInput?.value;
    const nextEnd = this.tlEndInput?.value;
    const startMs = parseUtcDate(nextStart);
    const endMs = parseUtcDate(nextEnd);

    if (startMs === null || endMs === null || endMs <= startMs) {
      this.showToast('Ngày kết thúc phải lớn hơn ngày bắt đầu.', 'error');
      if (this.tlStartInput) this.tlStartInput.value = this.currentData.startDate;
      if (this.tlEndInput) this.tlEndInput.value = this.currentData.endDate;
      return;
    }

    this.currentData.startDate = nextStart;
    this.currentData.endDate = nextEnd;
    this.renderer.render('timeline', this.currentData, { preserveViewport: true });
    this.scheduleAutoSave();
  }

  addTimelineMilestone() {
    const rm = this.getActiveRoadmap();
    if (!rm || rm.kind !== 'timeline' || !this.currentData) return;

    const startMs = parseUtcDate(this.currentData.startDate) ?? Date.now();
    const endMs = parseUtcDate(this.currentData.endDate) ?? (startMs + 86400000 * 30);
    const midMs = Math.round((startMs + endMs) / 2);
    const dt = new Date(midMs);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');

    const milestones = this.currentData.milestones || [];
    const newMs = {
      id: 'm-' + Date.now(),
      date: `${yyyy}-${mm}-${dd}`,
      title: `Mốc ${milestones.length + 1}`,
      description: '',
      color: ROADMAP_COLORS[milestones.length % ROADMAP_COLORS.length],
      status: 'todo'
    };

    milestones.push(newMs);
    this.currentData.milestones = milestones;
    this.renderer.render('timeline', this.currentData, { preserveViewport: true });
    this.selectItem('milestone', newMs.id);
    this.updateOverviewPanel();
    this.scheduleAutoSave();
  }

  /* ----------------------------------------------------------------------
   * SELECTION & INSPECTOR
   * ---------------------------------------------------------------------- */
  selectItem(type, id) {
    this.selectedType = type;
    this.selectedId = id;
    this.renderer.setSelection(type, id);

    this.panelOverview.style.display = 'none';
    this.panelNode.style.display = 'none';
    this.panelEdge.style.display = 'none';
    this.panelMilestone.style.display = 'none';

    if (type === 'node') {
      const node = (this.currentData?.nodes || []).find(n => n.id === id);
      if (!node) return this.clearSelection();
      this.panelNode.style.display = 'flex';
      this.nodeTitleInput.value = node.title || '';
      this.nodeDescInput.value = node.description || '';
      this.syncStatusButtons(this.nodeStatusGroup, node.status || 'todo');
      this.syncColorSwatches(this.nodeColorsEl, node.color || ROADMAP_COLORS[0]);
    } else if (type === 'edge') {
      const edge = this.getSelectedEdge();
      if (!edge) return this.clearSelection();
      this.panelEdge.style.display = 'flex';
      this.edgeLabelInput.value = edge.label || '';
      this.edgeStyleGroup?.querySelectorAll('.insp-status-btn').forEach(btn => {
        const isArrow = btn.dataset.arrow === 'true';
        btn.classList.toggle('active', (edge.arrow !== false) === isArrow);
      });
    } else if (type === 'milestone') {
      const ms = (this.currentData?.milestones || []).find(m => m.id === id);
      if (!ms) return this.clearSelection();
      this.panelMilestone.style.display = 'flex';
      this.msDateInput.value = ms.date || '';
      this.msTitleInput.value = ms.title || '';
      this.msDescInput.value = ms.description || '';
      this.syncStatusButtons(this.msStatusGroup, ms.status || 'todo');
      this.syncColorSwatches(this.msColorsEl, ms.color || ROADMAP_COLORS[0]);
    } else {
      this.clearSelection();
    }
  }

  clearSelection() {
    this.selectedType = null;
    this.selectedId = null;
    this.renderer.setSelection(null, null);

    this.panelNode.style.display = 'none';
    this.panelEdge.style.display = 'none';
    this.panelMilestone.style.display = 'none';
    this.panelOverview.style.display = 'flex';
    this.updateOverviewPanel();
  }

  updateOverviewPanel() {
    const rm = this.getActiveRoadmap();
    if (!rm || !this.currentData) {
      if (this.ovKindEl) this.ovKindEl.textContent = '—';
      if (this.ovVisibleCheck) this.ovVisibleCheck.checked = false;
      if (this.ovProgressBar) this.ovProgressBar.style.width = '0%';
      if (this.ovProgressText) this.ovProgressText.textContent = '0/0';
      return;
    }

    if (this.ovKindEl) {
      this.ovKindEl.textContent = rm.kind === 'timeline'
        ? 'Dạng 2: Thanh Timeline ngang'
        : 'Dạng 1: Sơ đồ khối (Flowchart)';
    }
    if (this.ovVisibleCheck) {
      this.ovVisibleCheck.checked = rm.is_visible === 1;
    }
    const prog = computeRoadmapProgress(rm.kind, this.currentData);
    if (this.ovProgressBar) this.ovProgressBar.style.width = `${prog.percent}%`;
    if (this.ovProgressText) this.ovProgressText.textContent = `${prog.done}/${prog.total} xong`;
  }

  syncStatusButtons(groupEl, status) {
    groupEl?.querySelectorAll('.insp-status-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.status === status);
    });
  }

  syncColorSwatches(gridEl, activeColor) {
    gridEl?.querySelectorAll('.insp-color-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.dataset.color?.toLowerCase() === (activeColor || '').toLowerCase());
    });
  }

  updateSelectedNode(patch) {
    if (this.selectedType !== 'node' || !this.selectedId || !this.currentData) return;
    const node = (this.currentData.nodes || []).find(n => n.id === this.selectedId);
    if (!node) return;
    Object.assign(node, patch);

    if (patch.status !== undefined) {
      this.syncStatusButtons(this.nodeStatusGroup, node.status);
      this.updateOverviewPanel();
    }
    if (patch.color !== undefined) this.syncColorSwatches(this.nodeColorsEl, node.color);

    this.renderer.patchNode(node);
    this.scheduleAutoSave();
  }

  getSelectedEdge() {
    if (this.selectedType !== 'edge' || !this.selectedId || !this.currentData) return null;
    return (this.currentData.edges || []).find(e => e.id === this.selectedId) || null;
  }

  updateSelectedEdge(patch) {
    const edge = this.getSelectedEdge();
    if (!edge) return;
    Object.assign(edge, patch);

    if (patch.arrow !== undefined) {
      this.edgeStyleGroup?.querySelectorAll('.insp-status-btn').forEach(btn => {
        const isArrow = btn.dataset.arrow === 'true';
        btn.classList.toggle('active', (edge.arrow !== false) === isArrow);
      });
    }

    this.renderer.patchEdge(edge);
    this.scheduleAutoSave();
  }

  updateSelectedMilestone(patch) {
    if (this.selectedType !== 'milestone' || !this.selectedId || !this.currentData) return;
    const ms = (this.currentData.milestones || []).find(m => m.id === this.selectedId);
    if (!ms) return;
    Object.assign(ms, patch);

    if (patch.status !== undefined) {
      this.syncStatusButtons(this.msStatusGroup, ms.status);
      this.updateOverviewPanel();
    }
    if (patch.color !== undefined) this.syncColorSwatches(this.msColorsEl, ms.color);

    if (patch.date !== undefined) {
      // Date affects horizontal position & anti-overlap lanes
      this.renderer.render('timeline', this.currentData, { preserveViewport: true });
      this.renderer.setSelection('milestone', ms.id);
    } else {
      this.renderer.patchMilestone(ms);
    }
    this.scheduleAutoSave();
  }

  deleteSelectedItem() {
    if (!this.selectedType || !this.selectedId || !this.currentData) return;
    const rm = this.getActiveRoadmap();
    if (!rm) return;

    if (this.selectedType === 'node') {
      const id = this.selectedId;
      this.currentData.nodes = (this.currentData.nodes || []).filter(n => n.id !== id);
      this.currentData.edges = (this.currentData.edges || []).filter(e => e.from !== id && e.to !== id);
    } else if (this.selectedType === 'edge') {
      const id = this.selectedId;
      this.currentData.edges = (this.currentData.edges || []).filter(e => e.id !== id);
    } else if (this.selectedType === 'milestone') {
      const id = this.selectedId;
      this.currentData.milestones = (this.currentData.milestones || []).filter(m => m.id !== id);
    }

    this.clearSelection();
    this.renderer.render(rm.kind, this.currentData, { preserveViewport: true });
    this.updateOverviewPanel();
    this.scheduleAutoSave();
  }

  /* ----------------------------------------------------------------------
   * CONFIRMATION & TOAST
   * ---------------------------------------------------------------------- */
  confirmAction(message) {
    if (!this.confirmModal || !this.confirmMsgEl) return Promise.resolve(false);
    this.confirmMsgEl.textContent = message;
    this.confirmModal.classList.add('open');
    this.confirmModal.setAttribute('aria-hidden', 'false');
    return new Promise(resolve => {
      this._confirmResolve = resolve;
    });
  }

  resolveConfirm(answer) {
    if (this.confirmModal) {
      this.confirmModal.classList.remove('open');
      this.confirmModal.setAttribute('aria-hidden', 'true');
    }
    if (this._confirmResolve) {
      const fn = this._confirmResolve;
      this._confirmResolve = null;
      fn(Boolean(answer));
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('studio-toast');
    const text = document.getElementById('studio-toast-text');
    if (!toast || !text) return;
    text.textContent = message;
    toast.className = `studio-toast show ${type}`;
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
}

function startRoadmapStudio() {
  if (!window.roadmapStudio) {
    window.roadmapStudio = new RoadmapStudioApp();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startRoadmapStudio);
} else {
  startRoadmapStudio();
}
