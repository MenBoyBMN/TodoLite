/**
 * TodoLite - Shared Roadmap Diagram Renderer (Flowchart & Timeline)
 * Zero-dependency hybrid SVG + HTML renderer with rAF-throttled dragging
 * and O(1) incremental DOM patching shared between Viewer and Studio.
 */

export const ROADMAP_COLORS = [
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#ec4899'  // Pink
];

export const ROADMAP_STATUS_META = {
  todo: { label: 'Chưa làm', icon: '○' },
  doing: { label: 'Đang làm', icon: '◐' },
  done: { label: 'Đã xong', icon: '●' }
};

const NODE_DEFAULT_W = 168;
const NODE_DEFAULT_H = 68;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createDefaultFlowchartData() {
  return {
    nodes: [
      {
        id: 'n-1',
        title: 'Bước 1: Khởi đầu',
        description: 'Xác định mục tiêu và các đầu việc chính.',
        x: 60,
        y: 120,
        color: '#f59e0b',
        status: 'done'
      },
      {
        id: 'n-2',
        title: 'Bước 2: Triển khai',
        description: 'Thực hiện từng phần theo kế hoạch.',
        x: 300,
        y: 120,
        color: '#3b82f6',
        status: 'doing'
      }
    ],
    edges: [
      {
        id: 'e-1',
        from: 'n-1',
        to: 'n-2',
        arrow: true,
        label: ''
      }
    ]
  };
}

export function createDefaultTimelineData() {
  const year = new Date().getFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate: `${year + 1}-01-01`,
    milestones: [
      {
        id: 'm-1',
        date: `${year}-02-01`,
        title: 'Khởi động',
        description: 'Chốt phạm vi và mục tiêu.',
        color: '#f59e0b',
        status: 'done'
      },
      {
        id: 'm-2',
        date: `${year}-06-15`,
        title: 'Cột mốc giữa kỳ',
        description: 'Đánh giá tiến độ và hiệu chỉnh.',
        color: '#3b82f6',
        status: 'doing'
      },
      {
        id: 'm-3',
        date: `${year}-11-01`,
        title: 'Hoàn thiện',
        description: 'Kiểm tra và bàn giao kết quả.',
        color: '#10b981',
        status: 'todo'
      }
    ]
  };
}

export function parseRoadmapData(kind, dataJson) {
  let parsed = null;
  if (typeof dataJson === 'string' && dataJson.trim()) {
    try {
      parsed = JSON.parse(dataJson);
    } catch {
      parsed = null;
    }
  } else if (dataJson && typeof dataJson === 'object') {
    parsed = dataJson;
  }

  if (kind === 'timeline') {
    const fallback = createDefaultTimelineData();
    const startDate = parsed && typeof parsed.startDate === 'string' && parseUtcDate(parsed.startDate) !== null
      ? parsed.startDate
      : fallback.startDate;
    const endDate = parsed && typeof parsed.endDate === 'string' && parseUtcDate(parsed.endDate) !== null
      ? parsed.endDate
      : fallback.endDate;
    const milestones = parsed && Array.isArray(parsed.milestones)
      ? parsed.milestones.map((m, i) => ({
          id: m.id || `m-${i + 1}`,
          date: typeof m.date === 'string' ? m.date : startDate,
          title: typeof m.title === 'string' ? m.title : 'Mốc mới',
          description: typeof m.description === 'string' ? m.description : '',
          color: typeof m.color === 'string' ? m.color : ROADMAP_COLORS[0],
          status: ROADMAP_STATUS_META[m.status] ? m.status : 'todo'
        }))
      : [];
    return { startDate, endDate, milestones };
  }

  const nodes = parsed && Array.isArray(parsed.nodes)
    ? parsed.nodes.map((n, i) => ({
        id: n.id || `n-${i + 1}`,
        title: typeof n.title === 'string' ? n.title : 'Khung mới',
        description: typeof n.description === 'string' ? n.description : '',
        x: Number.isFinite(Number(n.x)) ? Number(n.x) : 60 + i * 200,
        y: Number.isFinite(Number(n.y)) ? Number(n.y) : 100,
        color: typeof n.color === 'string' ? n.color : ROADMAP_COLORS[0],
        status: ROADMAP_STATUS_META[n.status] ? n.status : 'todo'
      }))
    : [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = parsed && Array.isArray(parsed.edges)
    ? parsed.edges
        .filter(e => e && nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to)
        .map((e, i) => ({
          id: e.id || `e-${i + 1}`,
          from: e.from,
          to: e.to,
          arrow: e.arrow !== false,
          label: typeof e.label === 'string' ? e.label : ''
        }))
    : [];
  return { nodes, edges };
}

export function computeRoadmapProgress(kind, data) {
  const items = kind === 'timeline' ? (data?.milestones || []) : (data?.nodes || []);
  const total = items.length;
  const done = items.filter(it => it.status === 'done').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

export function parseUtcDate(isoDate) {
  if (typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

export function formatDateVN(isoDate, includeYear = false) {
  const ms = parseUtcDate(isoDate);
  if (ms === null) return isoDate || '';
  const dt = new Date(ms);
  const day = dt.getUTCDate();
  const month = dt.getUTCMonth() + 1;
  const year = dt.getUTCFullYear();
  return includeYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

function getTodayUtcMs() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function intersectRectBorder(cx, cy, w, h, tx, ty, gap = 4) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy };
  }
  const halfW = w / 2 + gap;
  const halfH = h / 2 + gap;
  const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return {
    x: cx + dx * scale,
    y: cy + dy * scale
  };
}

export class RoadmapRenderer {
  constructor(containerEl, options = {}) {
    this.containerEl = containerEl;
    this.interactive = Boolean(options.interactive);

    this.onSelectNode = options.onSelectNode || null;
    this.onSelectEdge = options.onSelectEdge || null;
    this.onSelectMilestone = options.onSelectMilestone || null;
    this.onClearSelection = options.onClearSelection || null;
    this.onNodeMoved = options.onNodeMoved || null;
    this.onConnectNodes = options.onConnectNodes || null;
    this.onZoomChange = options.onZoomChange || null;

    this.kind = 'flowchart';
    this.data = { nodes: [], edges: [] };
    this.selectedType = null;
    this.selectedId = null;
    this.connectMode = false;
    this.connectFromId = null;

    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    // Indexed DOM caches for O(1) incremental updates
    this.nodesById = new Map();
    this.edgesById = new Map();
    this.nodeElements = new Map();
    this.nodeSizes = new Map();
    this.edgeElements = new Map();
    this.nodeEdges = new Map();
    this.milestoneElements = new Map();

    this.svgLayer = null;
    this.stageEl = null;
    this.viewportEl = null;
    this.timelineScrollEl = null;
    this.previewPathEl = null;

    this._dragState = null;
    this._rafId = null;
    this._pendingMoveEvent = null;
    this._onPointerMove = this._schedulePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    window.addEventListener('pointermove', this._onPointerMove, { passive: true });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
  }

  destroy() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._pendingMoveEvent = null;
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.containerEl.innerHTML = '';
    this._clearCaches();
  }

  _clearCaches() {
    this.nodesById.clear();
    this.edgesById.clear();
    this.nodeElements.clear();
    this.nodeSizes.clear();
    this.edgeElements.clear();
    this.nodeEdges.clear();
    this.milestoneElements.clear();
  }

  setSelection(type, id) {
    this.selectedType = type;
    this.selectedId = id;
    this._refreshSelectionStyles();
  }

  setConnectMode(enabled) {
    this.connectMode = Boolean(enabled);
    if (!this.connectMode) {
      this.connectFromId = null;
    }
    if (this.viewportEl) {
      this.viewportEl.classList.toggle('is-connect-mode', this.connectMode);
    }
    this._refreshSelectionStyles();
  }

  getZoom() {
    return this.zoom;
  }

  setZoom(nextZoom, anchorClientX = null, anchorClientY = null) {
    const clamped = Math.max(0.35, Math.min(2.2, Number(nextZoom) || 1));
    if (Math.abs(clamped - this.zoom) < 0.001) return;

    if (this.kind === 'flowchart' && this.viewportEl && anchorClientX !== null && anchorClientY !== null) {
      const rect = this.viewportEl.getBoundingClientRect();
      const localX = anchorClientX - rect.left;
      const localY = anchorClientY - rect.top;
      const worldX = (localX - this.panX) / this.zoom;
      const worldY = (localY - this.panY) / this.zoom;
      this.zoom = clamped;
      this.panX = localX - worldX * this.zoom;
      this.panY = localY - worldY * this.zoom;
      this._applyFlowchartTransform();
    } else if (this.kind === 'timeline') {
      this.zoom = clamped;
      this.render(this.kind, this.data, { preserveViewport: true });
    } else {
      this.zoom = clamped;
      this._applyFlowchartTransform();
    }

    if (this.onZoomChange) {
      this.onZoomChange(this.zoom);
    }
  }

  zoomIn() {
    if (this.viewportEl) {
      const rect = this.viewportEl.getBoundingClientRect();
      this.setZoom(this.zoom + 0.15, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      this.setZoom(this.zoom + 0.15);
    }
  }

  zoomOut() {
    if (this.viewportEl) {
      const rect = this.viewportEl.getBoundingClientRect();
      this.setZoom(this.zoom - 0.15, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      this.setZoom(this.zoom - 0.15);
    }
  }

  fitToView() {
    if (this.kind === 'timeline') {
      this.zoom = 1;
      if (this.timelineScrollEl) {
        this.timelineScrollEl.scrollLeft = 0;
      }
      this.render(this.kind, this.data, { preserveViewport: true });
      if (this.onZoomChange) this.onZoomChange(this.zoom);
      return;
    }

    if (!this.viewportEl) return;
    const nodes = this.data?.nodes || [];
    const rect = this.viewportEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (nodes.length === 0) {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this._applyFlowchartTransform();
      if (this.onZoomChange) this.onZoomChange(this.zoom);
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(n => {
      const sz = this._getNodeSize(n.id);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + sz.w);
      maxY = Math.max(maxY, n.y + sz.h);
    });

    const pad = 40;
    const contentW = Math.max(120, maxX - minX);
    const contentH = Math.max(80, maxY - minY);
    const scaleX = (rect.width - pad * 2) / contentW;
    const scaleY = (rect.height - pad * 2) / contentH;
    const nextZoom = Math.max(0.35, Math.min(1.25, Math.min(scaleX, scaleY)));

    this.zoom = nextZoom;
    this.panX = (rect.width - contentW * nextZoom) / 2 - minX * nextZoom;
    this.panY = (rect.height - contentH * nextZoom) / 2 - minY * nextZoom;
    this._applyFlowchartTransform();

    if (this.onZoomChange) {
      this.onZoomChange(this.zoom);
    }
  }

  render(kind, data, { preserveViewport = false } = {}) {
    this.kind = kind === 'timeline' ? 'timeline' : 'flowchart';
    this.data = data || (this.kind === 'timeline' ? createDefaultTimelineData() : createDefaultFlowchartData());

    if (!preserveViewport) {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
    }

    const prevScrollLeft = this.timelineScrollEl ? this.timelineScrollEl.scrollLeft : 0;
    this.containerEl.innerHTML = '';
    this._clearCaches();
    this.svgLayer = null;
    this.stageEl = null;
    this.viewportEl = null;
    this.timelineScrollEl = null;
    this.previewPathEl = null;

    if (this.kind === 'timeline') {
      this._renderTimeline(preserveViewport ? prevScrollLeft : 0);
    } else {
      this._renderFlowchart();
    }
  }

  /* ----------------------------------------------------------------------
   * TARGETED IN-PLACE DOM PATCHERS (ZERO FULL RE-RENDER ON KEYSTROKE)
   * ---------------------------------------------------------------------- */
  patchNode(node) {
    if (!node || this.kind !== 'flowchart') return;
    const el = this.nodeElements.get(node.id);
    if (!el) return;

    this.nodesById.set(node.id, node);
    el.style.setProperty('--rm-node-color', node.color || ROADMAP_COLORS[0]);

    const titleEl = el.querySelector('.rm-node-title');
    if (titleEl) titleEl.textContent = node.title || 'Khung mới';

    const statusKey = ROADMAP_STATUS_META[node.status] ? node.status : 'todo';
    const statusInfo = ROADMAP_STATUS_META[statusKey];
    const statusBadge = el.querySelector('.rm-status-pill');
    if (statusBadge) {
      statusBadge.className = `rm-status-pill status-${statusKey}`;
      statusBadge.textContent = `${statusInfo.icon} ${statusInfo.label}`;
    }

    const metaRow = el.querySelector('.rm-node-meta');
    if (metaRow) {
      let descIcon = metaRow.querySelector('.rm-has-desc-badge');
      const hasDesc = Boolean(node.description && node.description.trim());
      if (hasDesc && !descIcon) {
        descIcon = document.createElement('span');
        descIcon.className = 'rm-has-desc-badge';
        descIcon.title = 'Có mô tả chi tiết';
        descIcon.textContent = '📝';
        metaRow.appendChild(descIcon);
      } else if (!hasDesc && descIcon) {
        descIcon.remove();
      }
    }

    // Re-measure single node & update only its incident edges
    const w = el.offsetWidth || NODE_DEFAULT_W;
    const h = el.offsetHeight || NODE_DEFAULT_H;
    this.nodeSizes.set(node.id, { w, h });
    this._updateEdgesForNode(node.id);
  }

  patchEdge(edge) {
    if (!edge || this.kind !== 'flowchart') return;
    const refs = this.edgeElements.get(edge.id);
    if (!refs) return;

    this.edgesById.set(edge.id, edge);
    this._rebuildNodeEdgeAdjacency();
    this._updateEdgeVisual(edge, refs);
  }

  patchMilestone(milestone) {
    if (!milestone || this.kind !== 'timeline') return;
    const item = this.milestoneElements.get(milestone.id);
    if (!item) return;

    item.style.setProperty('--rm-node-color', milestone.color || ROADMAP_COLORS[0]);
    const dot = item.querySelector('.rm-milestone-dot');
    if (dot) dot.title = `${formatDateVN(milestone.date, true)} — ${milestone.title}`;

    const titleEl = item.querySelector('.rm-milestone-title');
    if (titleEl) titleEl.textContent = milestone.title || 'Mốc mới';

    const statusKey = ROADMAP_STATUS_META[milestone.status] ? milestone.status : 'todo';
    const statusDot = item.querySelector('.rm-milestone-status-dot');
    if (statusDot) {
      statusDot.className = `rm-milestone-status-dot status-${statusKey}`;
      statusDot.title = ROADMAP_STATUS_META[statusKey].label;
    }

    const dateRow = item.querySelector('.rm-milestone-date-row');
    if (dateRow) {
      let descBadge = dateRow.querySelector('.rm-has-desc-badge');
      const hasDesc = Boolean(milestone.description && milestone.description.trim());
      if (hasDesc && !descBadge) {
        descBadge = document.createElement('span');
        descBadge.className = 'rm-has-desc-badge';
        descBadge.textContent = '📝';
        descBadge.title = 'Có mô tả chi tiết';
        dateRow.appendChild(descBadge);
      } else if (!hasDesc && descBadge) {
        descBadge.remove();
      }
    }
  }

  /* ----------------------------------------------------------------------
   * FLOWCHART RENDERER (DẠNG 1)
   * ---------------------------------------------------------------------- */
  _renderFlowchart() {
    const viewport = document.createElement('div');
    viewport.className = `rm-canvas-viewport ${this.interactive ? 'is-interactive' : 'is-readonly'}`;
    if (this.connectMode) viewport.classList.add('is-connect-mode');
    this.viewportEl = viewport;

    const stage = document.createElement('div');
    stage.className = 'rm-stage';
    this.stageEl = stage;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'rm-edges-svg');
    svg.setAttribute('width', '1');
    svg.setAttribute('height', '1');
    this.svgLayer = svg;

    const nodesLayer = document.createElement('div');
    nodesLayer.className = 'rm-nodes-layer';

    stage.appendChild(svg);
    stage.appendChild(nodesLayer);
    viewport.appendChild(stage);
    this.containerEl.appendChild(viewport);

    const nodes = this.data.nodes || [];
    const frag = document.createDocumentFragment();
    nodes.forEach(node => {
      this.nodesById.set(node.id, node);
      const nodeEl = this._createFlowchartNodeElement(node);
      frag.appendChild(nodeEl);
      this.nodeElements.set(node.id, nodeEl);
    });
    nodesLayer.appendChild(frag);

    this._measureNodeSizes();
    this._renderFlowchartEdges();
    this._applyFlowchartTransform();
    this._refreshSelectionStyles();

    viewport.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.rm-node-card') || e.target.closest('.rm-edge-group')) {
        return;
      }
      this._dragState = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: this.panX,
        origPanY: this.panY,
        moved: false
      };
      viewport.classList.add('is-panning');
    });

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || !this.interactive) {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        this.setZoom(this.zoom * factor, e.clientX, e.clientY);
      } else {
        this.panX -= e.deltaX;
        this.panY -= e.deltaY;
        this._applyFlowchartTransform();
      }
    }, { passive: false });

    if (nodes.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'rm-canvas-empty-hint';
      hint.textContent = this.interactive
        ? 'Nhấn "+ Thêm khung" để bắt đầu vẽ sơ đồ lộ trình.'
        : 'Sơ đồ này chưa có khung nào.';
      viewport.appendChild(hint);
    }
  }

  _createFlowchartNodeElement(node) {
    const card = document.createElement('div');
    card.className = 'rm-node-card';
    card.dataset.nodeId = node.id;
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.style.setProperty('--rm-node-color', node.color || ROADMAP_COLORS[0]);

    const colorBar = document.createElement('div');
    colorBar.className = 'rm-node-accent';
    card.appendChild(colorBar);

    const body = document.createElement('div');
    body.className = 'rm-node-body';

    const titleEl = document.createElement('div');
    titleEl.className = 'rm-node-title';
    titleEl.textContent = node.title || 'Khung mới';
    body.appendChild(titleEl);

    const metaRow = document.createElement('div');
    metaRow.className = 'rm-node-meta';

    const statusKey = ROADMAP_STATUS_META[node.status] ? node.status : 'todo';
    const statusInfo = ROADMAP_STATUS_META[statusKey];
    const statusBadge = document.createElement('span');
    statusBadge.className = `rm-status-pill status-${statusKey}`;
    statusBadge.textContent = `${statusInfo.icon} ${statusInfo.label}`;
    metaRow.appendChild(statusBadge);

    if (node.description && node.description.trim()) {
      const descIcon = document.createElement('span');
      descIcon.className = 'rm-has-desc-badge';
      descIcon.title = 'Có mô tả chi tiết';
      descIcon.textContent = '📝';
      metaRow.appendChild(descIcon);
    }

    body.appendChild(metaRow);
    card.appendChild(body);

    if (this.interactive) {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'rm-node-connect-handle';
      handle.title = 'Kéo để nối sang khung khác';
      handle.textContent = '+';
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        this._startConnectDrag(node.id, e);
      });
      card.appendChild(handle);
    }

    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.rm-node-connect-handle')) return;
      e.stopPropagation();

      if (this.interactive && this.connectMode) {
        this._handleConnectClick(node.id);
        return;
      }

      const curNode = this.nodesById.get(node.id) || node;
      this._dragState = {
        mode: this.interactive ? 'node' : 'node-click-only',
        nodeId: node.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: curNode.x,
        origY: curNode.y,
        moved: false
      };
    });

    return card;
  }

  _handleConnectClick(nodeId) {
    if (!this.connectFromId) {
      this.connectFromId = nodeId;
      this._refreshSelectionStyles();
      return;
    }
    if (this.connectFromId === nodeId) {
      this.connectFromId = null;
      this._refreshSelectionStyles();
      return;
    }
    const fromId = this.connectFromId;
    this.connectFromId = null;
    this._refreshSelectionStyles();
    if (this.onConnectNodes) {
      this.onConnectNodes(fromId, nodeId);
    }
  }

  _startConnectDrag(fromId, e) {
    const pos = this._clientToWorld(e.clientX, e.clientY);
    const preview = document.createElementNS(SVG_NS, 'path');
    preview.setAttribute('class', 'rm-edge-preview');
    this.svgLayer.appendChild(preview);
    this.previewPathEl = preview;

    this._dragState = {
      mode: 'connect-drag',
      fromId,
      startX: e.clientX,
      startY: e.clientY
    };
    this._updateConnectPreview(fromId, pos.x, pos.y);
  }

  _updateConnectPreview(fromId, tx, ty) {
    if (!this.previewPathEl) return;
    const fromNode = this.nodesById.get(fromId);
    if (!fromNode) return;
    const sz = this._getNodeSize(fromId);
    const cx = fromNode.x + sz.w / 2;
    const cy = fromNode.y + sz.h / 2;
    const startPt = intersectRectBorder(cx, cy, sz.w, sz.h, tx, ty, 2);
    this.previewPathEl.setAttribute('d', `M ${startPt.x.toFixed(1)} ${startPt.y.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`);
  }

  _measureNodeSizes() {
    this.nodeElements.forEach((el, id) => {
      this.nodeSizes.set(id, {
        w: el.offsetWidth || NODE_DEFAULT_W,
        h: el.offsetHeight || NODE_DEFAULT_H
      });
    });
  }

  _getNodeSize(nodeId) {
    return this.nodeSizes.get(nodeId) || { w: NODE_DEFAULT_W, h: NODE_DEFAULT_H };
  }

  _rebuildNodeEdgeAdjacency() {
    this.nodeEdges.clear();
    (this.data.edges || []).forEach(edge => {
      if (!this.nodeEdges.has(edge.from)) this.nodeEdges.set(edge.from, new Set());
      if (!this.nodeEdges.has(edge.to)) this.nodeEdges.set(edge.to, new Set());
      this.nodeEdges.get(edge.from).add(edge.id);
      this.nodeEdges.get(edge.to).add(edge.id);
    });
  }

  _renderFlowchartEdges() {
    if (!this.svgLayer) return;
    this.svgLayer.innerHTML = '';
    this.edgeElements.clear();
    this.edgesById.clear();
    this.nodeEdges.clear();

    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.appendChild(this._createArrowMarker('rm-arrow-default', 'rm-marker-default'));
    defs.appendChild(this._createArrowMarker('rm-arrow-selected', 'rm-marker-selected'));
    this.svgLayer.appendChild(defs);

    const frag = document.createDocumentFragment();
    (this.data.edges || []).forEach(edge => {
      if (!this.nodesById.has(edge.from) || !this.nodesById.has(edge.to)) return;

      this.edgesById.set(edge.id, edge);
      if (!this.nodeEdges.has(edge.from)) this.nodeEdges.set(edge.from, new Set());
      if (!this.nodeEdges.has(edge.to)) this.nodeEdges.set(edge.to, new Set());
      this.nodeEdges.get(edge.from).add(edge.id);
      this.nodeEdges.get(edge.to).add(edge.id);

      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', 'rm-edge-group');
      group.dataset.edgeId = edge.id;

      const visiblePath = document.createElementNS(SVG_NS, 'path');
      visiblePath.setAttribute('class', 'rm-edge-path');
      group.appendChild(visiblePath);

      let hitPath = null;
      if (this.interactive) {
        hitPath = document.createElementNS(SVG_NS, 'path');
        hitPath.setAttribute('class', 'rm-edge-hit');
        hitPath.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const curEdge = this.edgesById.get(edge.id) || edge;
          this.setSelection('edge', curEdge.id);
          if (this.onSelectEdge) this.onSelectEdge(curEdge);
        });
        group.appendChild(hitPath);
      }

      const refs = { group, visiblePath, hitPath, labelBg: null, labelText: null };
      this.edgeElements.set(edge.id, refs);
      this._updateEdgeVisual(edge, refs);
      frag.appendChild(group);
    });

    this.svgLayer.appendChild(frag);
  }

  _updateEdgesForNode(nodeId) {
    const incident = this.nodeEdges.get(nodeId);
    if (!incident) return;
    incident.forEach(edgeId => {
      const edge = this.edgesById.get(edgeId);
      const refs = this.edgeElements.get(edgeId);
      if (edge && refs) {
        this._updateEdgeVisual(edge, refs);
      }
    });
  }

  _updateEdgeVisual(edge, refs) {
    const fromNode = this.nodesById.get(edge.from);
    const toNode = this.nodesById.get(edge.to);
    if (!fromNode || !toNode) return;

    const fromSz = this._getNodeSize(fromNode.id);
    const toSz = this._getNodeSize(toNode.id);
    const c1x = fromNode.x + fromSz.w / 2;
    const c1y = fromNode.y + fromSz.h / 2;
    const c2x = toNode.x + toSz.w / 2;
    const c2y = toNode.y + toSz.h / 2;

    const p1 = intersectRectBorder(c1x, c1y, fromSz.w, fromSz.h, c2x, c2y, 4);
    const p2 = intersectRectBorder(c2x, c2y, toSz.w, toSz.h, c1x, c1y, edge.arrow !== false ? 8 : 4);
    const d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;

    const isSel = this.selectedType === 'edge' && this.selectedId === edge.id;
    refs.group.classList.toggle('is-selected', isSel);
    refs.visiblePath.setAttribute('d', d);
    if (edge.arrow !== false) {
      refs.visiblePath.setAttribute('marker-end', `url(#${isSel ? 'rm-arrow-selected' : 'rm-arrow-default'})`);
    } else {
      refs.visiblePath.removeAttribute('marker-end');
    }
    if (refs.hitPath) {
      refs.hitPath.setAttribute('d', d);
    }

    const labelText = (edge.label || '').trim();
    if (labelText) {
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const displayLabel = labelText.length > 18 ? labelText.slice(0, 17) + '…' : labelText;
      const labelW = Math.max(36, Math.min(150, displayLabel.length * 7 + 16));

      if (!refs.labelBg) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('class', 'rm-edge-label-bg');
        rect.setAttribute('height', '22');
        rect.setAttribute('rx', '6');

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('class', 'rm-edge-label-text');
        text.setAttribute('text-anchor', 'middle');

        if (this.interactive) {
          const onClickLabel = (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const curEdge = this.edgesById.get(edge.id) || edge;
            this.setSelection('edge', curEdge.id);
            if (this.onSelectEdge) this.onSelectEdge(curEdge);
          };
          rect.addEventListener('pointerdown', onClickLabel);
          text.addEventListener('pointerdown', onClickLabel);
        }

        refs.group.appendChild(rect);
        refs.group.appendChild(text);
        refs.labelBg = rect;
        refs.labelText = text;
      }

      refs.labelBg.setAttribute('x', (midX - labelW / 2).toFixed(1));
      refs.labelBg.setAttribute('y', (midY - 11).toFixed(1));
      refs.labelBg.setAttribute('width', labelW.toFixed(1));
      refs.labelText.setAttribute('x', midX.toFixed(1));
      refs.labelText.setAttribute('y', (midY + 4).toFixed(1));
      refs.labelText.textContent = displayLabel;
    } else if (refs.labelBg) {
      refs.labelBg.remove();
      refs.labelText?.remove();
      refs.labelBg = null;
      refs.labelText = null;
    }
  }

  _createArrowMarker(id, cls) {
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('orient', 'auto-start-reverse');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M 0 1.2 L 9 5 L 0 8.8 z');
    path.setAttribute('class', cls);
    marker.appendChild(path);
    return marker;
  }

  _applyFlowchartTransform() {
    if (!this.stageEl) return;
    this.stageEl.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.zoom})`;
    if (this.viewportEl) {
      const gridStep = 24 * this.zoom;
      this.viewportEl.style.backgroundSize = `${gridStep}px ${gridStep}px`;
      this.viewportEl.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
    }
  }

  _clientToWorld(clientX, clientY) {
    if (!this.viewportEl) return { x: 0, y: 0 };
    const rect = this.viewportEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.zoom,
      y: (clientY - rect.top - this.panY) / this.zoom
    };
  }

  /* ----------------------------------------------------------------------
   * RAF-THROTTLED POINTER HANDLERS (60FPS CAP, ZERO WASTED FRAMES)
   * ---------------------------------------------------------------------- */
  _schedulePointerMove(e) {
    if (!this._dragState) return;
    this._pendingMoveEvent = e;
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      if (this._pendingMoveEvent && this._dragState) {
        const ev = this._pendingMoveEvent;
        this._pendingMoveEvent = null;
        this._processPointerMove(ev);
      }
    });
  }

  _processPointerMove(e) {
    const st = this._dragState;
    if (!st) return;

    if (st.mode === 'pan') {
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) st.moved = true;
      this.panX = st.origPanX + dx;
      this.panY = st.origPanY + dy;
      this._applyFlowchartTransform();
    } else if (st.mode === 'node') {
      const dx = (e.clientX - st.startX) / this.zoom;
      const dy = (e.clientY - st.startY) / this.zoom;
      if (Math.abs(e.clientX - st.startX) > 3 || Math.abs(e.clientY - st.startY) > 3) {
        st.moved = true;
      }
      if (!st.moved) return;

      const snappedX = Math.round((st.origX + dx) / 12) * 12;
      const snappedY = Math.round((st.origY + dy) / 12) * 12;
      const node = this.nodesById.get(st.nodeId);
      if (node && (node.x !== snappedX || node.y !== snappedY)) {
        node.x = snappedX;
        node.y = snappedY;
        const el = this.nodeElements.get(node.id);
        if (el) {
          el.style.left = `${snappedX}px`;
          el.style.top = `${snappedY}px`;
        }
        // Incremental O(degree) SVG update — zero DOM rebuild!
        this._updateEdgesForNode(node.id);
      }
    } else if (st.mode === 'node-click-only') {
      if (Math.abs(e.clientX - st.startX) > 4 || Math.abs(e.clientY - st.startY) > 4) {
        st.moved = true;
      }
    } else if (st.mode === 'connect-drag') {
      const pos = this._clientToWorld(e.clientX, e.clientY);
      this._updateConnectPreview(st.fromId, pos.x, pos.y);
      this.nodeElements.forEach((el, id) => {
        if (id === st.fromId) return;
        const r = el.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        el.classList.toggle('is-connect-target', over);
      });
    } else if (st.mode === 'timeline-pan' && this.timelineScrollEl) {
      const dx = e.clientX - st.startX;
      if (Math.abs(dx) > 3) st.moved = true;
      this.timelineScrollEl.scrollLeft = st.origScrollLeft - dx;
    }
  }

  _handlePointerUp(e) {
    if (!this._dragState) return;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._pendingMoveEvent) {
      this._processPointerMove(this._pendingMoveEvent);
      this._pendingMoveEvent = null;
    }

    const st = this._dragState;
    this._dragState = null;

    if (this.viewportEl) this.viewportEl.classList.remove('is-panning');
    if (this.timelineScrollEl) this.timelineScrollEl.classList.remove('is-panning');

    if (st.mode === 'pan') {
      if (!st.moved) {
        if (this.connectMode) {
          this.connectFromId = null;
          this._refreshSelectionStyles();
        }
        this.setSelection(null, null);
        if (this.onClearSelection) this.onClearSelection();
      }
    } else if (st.mode === 'node') {
      const node = this.nodesById.get(st.nodeId);
      if (st.moved && node) {
        if (this.onNodeMoved) this.onNodeMoved(node.id, node.x, node.y);
      } else if (node) {
        this.setSelection('node', node.id);
        if (this.onSelectNode) this.onSelectNode(node);
      }
    } else if (st.mode === 'node-click-only') {
      if (!st.moved) {
        const node = this.nodesById.get(st.nodeId);
        if (node) {
          this.setSelection('node', node.id);
          if (this.onSelectNode) this.onSelectNode(node);
        }
      }
    } else if (st.mode === 'connect-drag') {
      if (this.previewPathEl) {
        this.previewPathEl.remove();
        this.previewPathEl = null;
      }
      let targetId = null;
      this.nodeElements.forEach((el, id) => {
        el.classList.remove('is-connect-target');
        if (id === st.fromId) return;
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          targetId = id;
        }
      });
      if (targetId && this.onConnectNodes) {
        this.onConnectNodes(st.fromId, targetId);
      }
    } else if (st.mode === 'timeline-pan') {
      if (!st.moved) {
        this.setSelection(null, null);
        if (this.onClearSelection) this.onClearSelection();
      }
    }
  }

  /* ----------------------------------------------------------------------
   * TIMELINE RENDERER (DẠNG 2)
   * ---------------------------------------------------------------------- */
  _renderTimeline(restoreScrollLeft = 0) {
    const scrollWrap = document.createElement('div');
    scrollWrap.className = `rm-timeline-viewport ${this.interactive ? 'is-interactive' : 'is-readonly'}`;
    this.timelineScrollEl = scrollWrap;

    const containerW = this.containerEl.clientWidth || (this.interactive ? 640 : 420);
    const baseWidth = Math.max(containerW - 16, this.interactive ? 700 : 520);
    const trackWidth = Math.round(baseWidth * this.zoom);

    const track = document.createElement('div');
    track.className = 'rm-timeline-track';
    track.style.width = `${trackWidth}px`;

    const startMs = parseUtcDate(this.data.startDate) ?? Date.UTC(new Date().getFullYear(), 0, 1);
    const rawEndMs = parseUtcDate(this.data.endDate) ?? Date.UTC(new Date().getFullYear() + 1, 0, 1);
    const endMs = rawEndMs > startMs ? rawEndMs : startMs + 86400000;
    const spanMs = endMs - startMs;
    const padX = 56;
    const usableW = Math.max(120, trackWidth - padX * 2);

    const frag = document.createDocumentFragment();

    const axis = document.createElement('div');
    axis.className = 'rm-timeline-axis';
    axis.style.left = `${padX}px`;
    axis.style.width = `${usableW}px`;
    frag.appendChild(axis);

    frag.appendChild(this._createAxisEndpoint(padX, formatDateVN(this.data.startDate, true), 'start'));
    frag.appendChild(this._createAxisEndpoint(padX + usableW, formatDateVN(this.data.endDate, true), 'end'));

    this._renderTimelineSubTicks(frag, startMs, endMs, padX, usableW);

    const todayMs = getTodayUtcMs();
    if (todayMs >= startMs && todayMs <= endMs) {
      const todayX = padX + ((todayMs - startMs) / spanMs) * usableW;
      const todayLine = document.createElement('div');
      todayLine.className = 'rm-today-line';
      todayLine.style.left = `${todayX}px`;

      const todayBadge = document.createElement('span');
      todayBadge.className = 'rm-today-badge';
      todayBadge.textContent = 'Hôm nay';
      todayLine.appendChild(todayBadge);
      frag.appendChild(todayLine);
    }

    const milestones = [...(this.data.milestones || [])].sort((a, b) => {
      const ma = parseUtcDate(a.date) ?? startMs;
      const mb = parseUtcDate(b.date) ?? startMs;
      return ma - mb;
    });

    const lanes = {
      'top-0': -Infinity,
      'bottom-0': -Infinity,
      'top-1': -Infinity,
      'bottom-1': -Infinity,
      'top-2': -Infinity,
      'bottom-2': -Infinity
    };
    const evenOrder = ['top-0', 'bottom-0', 'top-1', 'bottom-1', 'top-2', 'bottom-2'];
    const oddOrder = ['bottom-0', 'top-0', 'bottom-1', 'top-1', 'bottom-2', 'top-2'];
    const minCardGap = 128;

    milestones.forEach((m, index) => {
      const mMs = parseUtcDate(m.date);
      const rawRatio = mMs !== null ? (mMs - startMs) / spanMs : 0.5;
      const outOfRange = rawRatio < 0 || rawRatio > 1;
      const clampedRatio = Math.max(0, Math.min(1, rawRatio));
      const x = padX + clampedRatio * usableW;

      const preferredOrder = index % 2 === 0 ? evenOrder : oddOrder;
      let chosenLane = preferredOrder[0];
      let found = false;
      for (const laneName of preferredOrder) {
        if (x - lanes[laneName] >= minCardGap) {
          chosenLane = laneName;
          found = true;
          break;
        }
      }
      if (!found) {
        chosenLane = preferredOrder.reduce((best, cur) => (lanes[cur] < lanes[best] ? cur : best), preferredOrder[0]);
      }
      lanes[chosenLane] = x;

      const [side, tierStr] = chosenLane.split('-');
      const itemEl = this._createMilestoneElement(m, x, side, Number(tierStr), outOfRange);
      this.milestoneElements.set(m.id, itemEl);
      frag.appendChild(itemEl);
    });

    track.appendChild(frag);
    scrollWrap.appendChild(track);
    this.containerEl.appendChild(scrollWrap);
    scrollWrap.scrollLeft = restoreScrollLeft;

    scrollWrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.rm-milestone-card') || e.target.closest('.rm-milestone-dot')) return;
      this._dragState = {
        mode: 'timeline-pan',
        startX: e.clientX,
        origScrollLeft: scrollWrap.scrollLeft,
        moved: false
      };
      scrollWrap.classList.add('is-panning');
    });

    scrollWrap.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        this.setZoom(this.zoom * factor);
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scrollWrap.scrollLeft += e.deltaY;
      }
    }, { passive: false });

    this._refreshSelectionStyles();
  }

  _createAxisEndpoint(x, labelText, posClass) {
    const cap = document.createElement('div');
    cap.className = `rm-timeline-endpoint is-${posClass}`;
    cap.style.left = `${x}px`;

    const tick = document.createElement('div');
    tick.className = 'rm-endpoint-tick';
    cap.appendChild(tick);

    const lbl = document.createElement('span');
    lbl.className = 'rm-endpoint-label';
    lbl.textContent = labelText;
    cap.appendChild(lbl);
    return cap;
  }

  _renderTimelineSubTicks(parent, startMs, endMs, padX, usableW) {
    const totalDays = (endMs - startMs) / 86400000;
    const stepMonths = totalDays > 540 ? 3 : (totalDays > 120 ? 1 : 0);
    if (stepMonths === 0) return;

    const startDt = new Date(startMs);
    let cursor = new Date(Date.UTC(startDt.getUTCFullYear(), startDt.getUTCMonth() + stepMonths, 1));
    const spanMs = endMs - startMs;

    while (cursor.getTime() < endMs - 86400000 * 12) {
      const ratio = (cursor.getTime() - startMs) / spanMs;
      if (ratio > 0.05 && ratio < 0.95) {
        const x = padX + ratio * usableW;
        const sub = document.createElement('div');
        sub.className = 'rm-timeline-subtick';
        sub.style.left = `${x}px`;

        const lbl = document.createElement('span');
        lbl.className = 'rm-subtick-label';
        lbl.textContent = `T${cursor.getUTCMonth() + 1}`;
        sub.appendChild(lbl);
        parent.appendChild(sub);
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + stepMonths, 1));
    }
  }

  _createMilestoneElement(milestone, x, side, tier, outOfRange) {
    const item = document.createElement('div');
    item.className = `rm-milestone-item side-${side} tier-${tier}`;
    item.dataset.milestoneId = milestone.id;
    item.style.left = `${x}px`;
    item.style.setProperty('--rm-node-color', milestone.color || ROADMAP_COLORS[0]);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'rm-milestone-dot';
    dot.title = `${formatDateVN(milestone.date, true)} — ${milestone.title}`;
    item.appendChild(dot);

    const stem = document.createElement('div');
    stem.className = 'rm-milestone-stem';
    item.appendChild(stem);

    const card = document.createElement('div');
    card.className = 'rm-milestone-card';

    const dateRow = document.createElement('div');
    dateRow.className = 'rm-milestone-date-row';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'rm-milestone-date';
    dateSpan.textContent = formatDateVN(milestone.date, false);
    dateRow.appendChild(dateSpan);

    const statusKey = ROADMAP_STATUS_META[milestone.status] ? milestone.status : 'todo';
    const statusDot = document.createElement('span');
    statusDot.className = `rm-milestone-status-dot status-${statusKey}`;
    statusDot.title = ROADMAP_STATUS_META[statusKey].label;
    dateRow.appendChild(statusDot);

    if (milestone.description && milestone.description.trim()) {
      const descBadge = document.createElement('span');
      descBadge.className = 'rm-has-desc-badge';
      descBadge.textContent = '📝';
      descBadge.title = 'Có mô tả chi tiết';
      dateRow.appendChild(descBadge);
    }

    card.appendChild(dateRow);

    const titleEl = document.createElement('div');
    titleEl.className = 'rm-milestone-title';
    titleEl.textContent = milestone.title || 'Mốc mới';
    card.appendChild(titleEl);

    if (outOfRange) {
      const warn = document.createElement('div');
      warn.className = 'rm-milestone-out-badge';
      warn.textContent = 'Ngoài khoảng';
      card.appendChild(warn);
    }

    item.appendChild(card);

    const handleSelect = (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.setSelection('milestone', milestone.id);
      if (this.onSelectMilestone) {
        this.onSelectMilestone(milestone);
      }
    };

    dot.addEventListener('pointerdown', (e) => e.stopPropagation());
    dot.addEventListener('click', handleSelect);
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    card.addEventListener('click', handleSelect);

    return item;
  }

  _refreshSelectionStyles() {
    this.nodeElements.forEach((el, id) => {
      el.classList.toggle('is-selected', this.selectedType === 'node' && this.selectedId === id);
      el.classList.toggle('is-connect-source', this.connectMode && this.connectFromId === id);
    });

    this.edgeElements.forEach((refs, edgeId) => {
      const isSel = this.selectedType === 'edge' && this.selectedId === edgeId;
      refs.group.classList.toggle('is-selected', isSel);
      if (refs.visiblePath.hasAttribute('marker-end')) {
        refs.visiblePath.setAttribute('marker-end', `url(#${isSel ? 'rm-arrow-selected' : 'rm-arrow-default'})`);
      }
    });

    this.milestoneElements.forEach((el, id) => {
      el.classList.toggle('is-selected', this.selectedType === 'milestone' && this.selectedId === id);
    });
  }
}
