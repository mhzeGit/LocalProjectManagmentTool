import { findCanvas } from './data.js'
import { saveCanvasContent } from './store.js'

let _currentCanvasId = null
let _canvasData = null
let _animationId = null
let _history = null
let _renderedCanvasId = null

function createHistoryManager() {
  let undoStack = [], redoStack = []
  const MAX_SIZE = 100
  let isUndoRedoing = false
  return {
    push(cmd) {
      if (isUndoRedoing) return
      undoStack.push(cmd)
      if (undoStack.length > MAX_SIZE) undoStack.shift()
      redoStack = []
      markDirty()
    },
    undo() {
      if (undoStack.length === 0) return
      isUndoRedoing = true
      const cmd = undoStack.pop()
      cmd.undo()
      redoStack.push(cmd)
      isUndoRedoing = false
      markDirty()
    },
    redo() {
      if (redoStack.length === 0) return
      isUndoRedoing = true
      const cmd = redoStack.pop()
      cmd.redo()
      undoStack.push(cmd)
      isUndoRedoing = false
      markDirty()
    },
    clear() { undoStack = []; redoStack = [] }
  }
}

const fieldEls = {}
let _ui = null

function markDirty() {
  if (window.__autoSave) window.__autoSave()
}

function getThemeBg() {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg-body').trim() || '#111118'
}

function getThemeGridLine() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#2a2a40'
  return hexToRgb(c)
}

function hexToRgb(hex) {
  hex = hex.replace('#', '')
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  return hex.match(/\w\w/g).map(x => parseInt(x, 16))
}

function getAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5'
}

function getTextPrimary() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#e0e0e8'
}

function getTextDim() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim() || '#666'
}

function getPanelBg() {
  return getComputedStyle(document.documentElement).getPropertyValue('--bg-panel-alt').trim() || '#1e1e2e'
}

const GRID_CONFIG = {
  spacing: 20,
  gridLevels: [
    { spacing: 10, weight: 0.4 },
    { spacing: 40, weight: 0.6 },
    { spacing: 200, weight: 1.0 },
    { spacing: 1000, weight: 1.2 },
  ]
}

const TOOLS = {
  CURSOR: 'cursor',
  TEXT: 'text',
  SHAPES: 'shapes',
  ARROW: 'arrow',
  CONNECTION_LINE: 'connection',
  IMAGE_CONTAINER: 'imageContainer',
}

export function isCanvasActive() {
  return _renderedCanvasId !== null
}

export function renderCanvasView(canvasId) {
  if (_renderedCanvasId === canvasId) return
  if (_renderedCanvasId) destroyCanvas()
  const area = document.getElementById('boardArea')
  _currentCanvasId = canvasId
  const c = findCanvas(canvasId)
  if (!c) return

  if (!c.data) c.data = getEmptyCanvasData()
  if (!c.data.textBoxes) c.data.textBoxes = []
  if (!c.data.shapes) c.data.shapes = []
  if (!c.data.arrows) c.data.arrows = []
  if (!c.data.connectors) c.data.connectors = []
  if (!c.data.connections) c.data.connections = []
  if (!c.data.viewport) c.data.viewport = { offsetX: 0, offsetY: 0, scale: 1 }
  _canvasData = c.data
  _history = createHistoryManager()

  area.innerHTML = ''
  area.style.padding = '0'
  area.style.overflow = 'hidden'
  area.style.position = 'relative'
  area.style.background = getThemeBg()

  const container = document.createElement('div')
  container.id = 'canvasContainer-' + canvasId
  container.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;position:relative;'

  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 16px;background:var(--bg-topbar);border-bottom:1px solid var(--border-light);flex-shrink:0;min-height:40px;'
  header.innerHTML = '<h2 class="document-title" id="canvasTitle-' + canvasId + '" ondblclick="startRenameCanvas(\'' + canvasId + '\')" style="font-size:16px;font-weight:600;color:var(--text-primary);margin:0;cursor:pointer;flex-shrink:0;">' + c.name + '</h2>'
  header.innerHTML += '<div class="canvas-toolbar" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;"></div>'
  header.innerHTML += '<div style="flex:1;"></div>'

  const toolbarActions = [
    { id: 'canvasToolCursor', title: 'Select (V)', icon: '⇱', tool: TOOLS.CURSOR },
    { id: 'canvasToolText', title: 'Text Box (T)', icon: 'T', tool: TOOLS.TEXT },
    { id: 'canvasToolShape', title: 'Shapes', icon: '□', tool: TOOLS.SHAPES, hasSubmenu: true },
    { id: 'canvasToolArrow', title: 'Arrow (A)', icon: '→', tool: TOOLS.ARROW },
    { id: 'canvasToolConnector', title: 'Connector (C)', icon: '—', tool: TOOLS.CONNECTION_LINE },
    { id: 'canvasToolImage', title: 'Image Container', icon: '🖼', tool: TOOLS.IMAGE_CONTAINER },
  ]
  const toolbarEl = header.querySelector('.canvas-toolbar')
  const toolBtnMap = {}
  for (const a of toolbarActions) {
    const btn = document.createElement('button')
    btn.id = a.id
    btn.title = a.title
    btn.textContent = a.icon
    btn.dataset.tool = a.tool
    btn.style.cssText = 'padding:4px 10px;font-size:13px;font-weight:500;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-surface-hover);color:var(--text-secondary);cursor:pointer;transition:all .1s;'
    btn.onmouseover = () => { if (!btn.classList.contains('active')) btn.style.background = 'var(--accent-subtle)' }
    btn.onmouseout = () => { if (!btn.classList.contains('active')) btn.style.background = 'var(--bg-surface-hover)' }
    btn.onclick = () => setActiveTool(a.tool)
    toolbarEl.appendChild(btn)
    toolBtnMap[a.tool] = btn

    if (a.hasSubmenu) {
      const submenu = document.createElement('div')
      submenu.id = 'canvasShapeSubmenu'
      submenu.style.cssText = 'display:none;position:absolute;top:100%;left:0;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:6px;padding:4px;box-shadow:0 4px 16px var(--shadow-md);z-index:10;white-space:nowrap;'
      const shapes = [
        { type: 'rectangle', label: 'Rectangle', icon: '▬' },
        { type: 'circle', label: 'Circle', icon: '●' },
        { type: 'triangle', label: 'Triangle', icon: '▲' },
        { type: 'diamond', label: 'Diamond', icon: '◆' },
      ]
      for (const s of shapes) {
        const sb = document.createElement('button')
        sb.textContent = s.icon + ' ' + s.label
        sb.style.cssText = 'display:block;width:100%;padding:6px 12px;font-size:12px;color:var(--text-secondary);border-radius:4px;border:none;background:transparent;cursor:pointer;text-align:left;'
        sb.onmouseover = () => sb.style.background = 'var(--bg-surface-hover)'
        sb.onmouseout = () => sb.style.background = 'transparent'
        sb.onclick = (e) => { e.stopPropagation(); setShapeSubType(s.type); setActiveTool(TOOLS.SHAPES); submenu.style.display = 'none' }
        submenu.appendChild(sb)
      }
      btn.style.position = 'relative'
      btn.appendChild(submenu)
      btn.onclick = (e) => {
        e.stopPropagation()
        setActiveTool(TOOLS.SHAPES)
        const allSubmenus = container.querySelectorAll('.canvas-shape-submenu')
        allSubmenus.forEach(m => m.style.display = 'none')
        submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block'
      }
      submenu.className = 'canvas-shape-submenu'
    }
  }

  header.innerHTML += '<div class="canvas-actions" style="display:flex;align-items:center;gap:4px;flex-shrink:0;">'
  header.innerHTML += '<button id="canvasUndoBtn" title="Undo (Ctrl+Z)" style="padding:4px 8px;font-size:12px;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-surface-hover);color:var(--text-secondary);cursor:pointer;">↩</button>'
  header.innerHTML += '<button id="canvasRedoBtn" title="Redo (Ctrl+Shift+Z)" style="padding:4px 8px;font-size:12px;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-surface-hover);color:var(--text-secondary);cursor:pointer;">↪</button>'
  header.innerHTML += '<button id="canvasDeleteBtn" title="Delete selected (Del)" style="padding:4px 8px;font-size:12px;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-surface-hover);color:var(--danger);cursor:pointer;">🗑</button>'
  header.innerHTML += '<button id="canvasFitBtn" title="Fit to screen (F)" style="padding:4px 8px;font-size:12px;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-surface-hover);color:var(--text-secondary);cursor:pointer;">⊞</button>'
  header.innerHTML += '</div>'

  container.appendChild(header)

  const canvasArea = document.createElement('div')
  canvasArea.id = 'canvasArea-' + canvasId
  canvasArea.style.cssText = 'flex:1;position:relative;overflow:hidden;cursor:default;'

  const mainCanvas = document.createElement('canvas')
  mainCanvas.id = 'canvasMain-' + canvasId
  mainCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;'
  canvasArea.appendChild(mainCanvas)

  const arrowCanvas = document.createElement('canvas')
  arrowCanvas.id = 'canvasArrow-' + canvasId
  arrowCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;'
  canvasArea.appendChild(arrowCanvas)

  const entityLayer = document.createElement('div')
  entityLayer.id = 'canvasEntityLayer-' + canvasId
  entityLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;'
  canvasArea.appendChild(entityLayer)

  container.appendChild(canvasArea)

  const sidePanel = document.createElement('div')
  sidePanel.id = 'canvasSidePanel-' + canvasId
  sidePanel.style.cssText = 'position:absolute;top:40px;right:0;width:260px;height:calc(100% - 40px);background:var(--bg-panel-alt);border-left:1px solid var(--border);overflow-y:auto;display:none;z-index:5;padding:12px;font-size:13px;color:var(--text-primary);'
  sidePanel.innerHTML = '<div class="canvas-panel-empty" style="color:var(--text-dim);text-align:center;padding:40px 0;">No selection</div>'
  container.appendChild(sidePanel)

  area.appendChild(container)

  _ui = {
    container, canvasArea, mainCanvas, arrowCanvas, entityLayer, sidePanel,
    toolBtnMap, toolbarEl,
    offsetX: _canvasData.viewport?.offsetX || 0,
    offsetY: _canvasData.viewport?.offsetY || 0,
    scale: _canvasData.viewport?.scale || 1,
    targetOffsetX: _canvasData.viewport?.offsetX || 0,
    targetOffsetY: _canvasData.viewport?.offsetY || 0,
    targetScale: _canvasData.viewport?.scale || 1,
    activeTool: TOOLS.CURSOR,
    shapeSubType: 'rectangle',
    isPanning: false,
    lastPanX: 0, lastPanY: 0,
    isDragging: false,
    dragStartX: 0, dragStartY: 0,
    isResizing: false,
    resizeHandle: '',
    resizeEntityType: null,
    resizeEntityIdx: -1,
    resizeStartBounds: null,
    resizeStartWorldX: 0, resizeStartWorldY: 0,
    selectedTextBoxes: new Set(),
    selectedShapes: new Set(),
    selectedArrows: new Set(),
    selectedConnectors: new Set(),
    selectedConnection: null,
    connectingFrom: null,
    connectingMouseWorld: { x: 0, y: 0 },
    arrowDragTarget: null,
    isDraggingArrowEnd: false,
    dragArrowEndSnapshot: null,
    drawingStartX: 0, drawingStartY: 0,
    isSelectingBox: false,
    boxStartX: 0, boxStartY: 0, boxEndX: 0, boxEndY: 0,
    lastWorldMouse: { x: 0, y: 0 },
    nextTextBoxId: _canvasData.nextTextBoxId || 1,
    nextShapeId: _canvasData.nextShapeId || 1,
    nextArrowId: _canvasData.nextArrowId || 1,
    nextConnectorId: _canvasData.nextConnectorId || 1,
    nextConnectionId: _canvasData.nextConnectionId || 1,
    clipboard: [],
  }

  wireEvents()
  resizeCanvases()
  updateToolUI()

  document.getElementById('canvasUndoBtn')?.addEventListener('click', () => performUndo())
  document.getElementById('canvasRedoBtn')?.addEventListener('click', () => performRedo())
  document.getElementById('canvasDeleteBtn')?.addEventListener('click', () => deleteSelected())
  document.getElementById('canvasFitBtn')?.addEventListener('click', () => focusOnAll())

  _renderedCanvasId = canvasId
  animate()
}

function getEmptyCanvasData() {
  return {
    textBoxes: [], shapes: [], arrows: [], connectors: [], connections: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    nextTextBoxId: 1, nextShapeId: 1, nextArrowId: 1, nextConnectorId: 1, nextConnectionId: 1
  }
}

function saveData() {
  if (!_currentCanvasId || !_canvasData) return
  _canvasData.viewport = { offsetX: _ui.targetOffsetX, offsetY: _ui.targetOffsetY, scale: _ui.targetScale }
  _canvasData.nextTextBoxId = _ui.nextTextBoxId
  _canvasData.nextShapeId = _ui.nextShapeId
  _canvasData.nextArrowId = _ui.nextArrowId
  _canvasData.nextConnectorId = _ui.nextConnectorId
  _canvasData.nextConnectionId = _ui.nextConnectionId
  markDirty()
}

function resizeCanvases() {
  if (!_ui || !_ui.canvasArea) return
  const dpr = window.devicePixelRatio || 1
  const rect = _ui.canvasArea.getBoundingClientRect()
  const w = rect.width
  const h = rect.height

  _ui.mainCanvas.style.width = w + 'px'
  _ui.mainCanvas.style.height = h + 'px'
  _ui.mainCanvas.width = w * dpr
  _ui.mainCanvas.height = h * dpr

  _ui.arrowCanvas.style.width = w + 'px'
  _ui.arrowCanvas.style.height = h + 'px'
  _ui.arrowCanvas.width = w * dpr
  _ui.arrowCanvas.height = h * dpr
}

function screenToWorld(sx, sy) {
  return { x: (sx - _ui.offsetX) / _ui.scale, y: (sy - _ui.offsetY) / _ui.scale }
}

function worldToScreen(wx, wy) {
  return { x: wx * _ui.scale + _ui.offsetX, y: wy * _ui.scale + _ui.offsetY }
}

function drawGrid(ctx, w, h) {
  const { offsetX, offsetY, scale } = _ui
  const bgColor = getThemeBg()
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, w, h)

  const gridRgb = getThemeGridLine()
  const levels = GRID_CONFIG.gridLevels

  for (const level of levels) {
    const pxSpacing = level.spacing * scale
    const alpha = Math.min(1, Math.max(0, (pxSpacing - 4) / 16)) * level.weight * 0.5
    if (alpha <= 0) continue

    ctx.strokeStyle = `rgba(${gridRgb[0]},${gridRgb[1]},${gridRgb[2]},${alpha})`
    ctx.lineWidth = 1
    ctx.beginPath()

    const startX = offsetX % (level.spacing * scale)
    const startY = offsetY % (level.spacing * scale)

    for (let x = startX; x < w; x += level.spacing * scale) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let y = startY; y < h; y += level.spacing * scale) {
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
  }
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawShapePath(ctx, shape) {
  const { x, y, w, h } = shape
  switch (shape.shapeType) {
    case 'circle':
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      break
    case 'triangle':
      ctx.moveTo(x + w / 2, y)
      ctx.lineTo(x + w, y + h)
      ctx.lineTo(x, y + h)
      ctx.closePath()
      break
    case 'diamond':
      ctx.moveTo(x + w / 2, y)
      ctx.lineTo(x + w, y + h / 2)
      ctx.lineTo(x + w / 2, y + h)
      ctx.lineTo(x, y + h / 2)
      ctx.closePath()
      break
    default:
      drawRoundedRect(ctx, x, y, w, h, shape.cornerRadius || 4)
  }
}

function drawEntities() {
  const canvas = _ui.mainCanvas
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  drawGrid(ctx, canvas.width / dpr, canvas.height / dpr)

  ctx.translate(_ui.offsetX, _ui.offsetY)
  ctx.scale(_ui.scale, _ui.scale)

  for (const shape of _canvasData.shapes) {
    ctx.save()
    const borderColor = shape.borderColor || getAccentColor()
    const fillColor = shape.color || getPanelBg()
    ctx.fillStyle = fillColor
    ctx.strokeStyle = borderColor
    ctx.lineWidth = (shape.borderWidth || 2) / _ui.scale

    drawShapePath(ctx, shape)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  for (const tb of _canvasData.textBoxes) {
    ctx.save()
    const alpha = _ui.selectedTextBoxes.has(_canvasData.textBoxes.indexOf(tb)) ? 0.15 : 0.08
    ctx.fillStyle = tb.color || '#1a1a1a'
    ctx.strokeStyle = tb.borderColor || '#444'
    ctx.lineWidth = 2 / _ui.scale
    drawRoundedRect(ctx, tb.x, tb.y, tb.w, tb.h, 6)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    if (tb.title) {
      ctx.save()
      ctx.fillStyle = tb.titleColor || '#e7e7e7'
      ctx.font = `bold ${Math.max(10, (tb.fontSize || 14) + 2)}px sans-serif`
      ctx.textBaseline = 'top'
      const mx = 8
      ctx.fillText(tb.title, tb.x + mx, tb.y + 6)
      ctx.restore()
    }
    if (tb.text) {
      ctx.save()
      ctx.fillStyle = tb.textColor || '#ddd'
      ctx.font = `${tb.fontSize || 14}px sans-serif`
      ctx.textBaseline = 'top'
      const mx = 8
      const titleOffset = tb.title ? 26 : 8
      const maxW = Math.max(10, tb.w - 16)
      const lineH = (tb.fontSize || 14) + 2
      const words = tb.text.split(/\s+/)
      let line = '', ly = tb.y + titleOffset, maxLines = Math.max(1, Math.floor((tb.h - titleOffset - 4) / lineH))
      let lines = []
      for (const w of words) {
        const test = line ? line + ' ' + w : w
        if (ctx.measureText(test).width > maxW && line) {
          lines.push(line)
          line = w
          if (lines.length >= maxLines) break
        } else {
          line = test
        }
      }
      if (line && lines.length < maxLines) lines.push(line)
      for (const l of lines) {
        ctx.fillText(l, tb.x + mx, ly)
        ly += lineH
      }
      ctx.restore()
    }
  }

  if (_ui.isSelectingBox) {
    ctx.save()
    ctx.strokeStyle = getAccentColor()
    ctx.lineWidth = 1 / _ui.scale
    ctx.setLineDash([4 / _ui.scale, 4 / _ui.scale])
    const x = Math.min(_ui.boxStartX, _ui.boxEndX)
    const y = Math.min(_ui.boxStartY, _ui.boxEndY)
    const w = Math.abs(_ui.boxEndX - _ui.boxStartX)
    const h = Math.abs(_ui.boxEndY - _ui.boxStartY)
    ctx.strokeRect(x, y, w, h)
    ctx.restore()
  }

  ctx.restore()
}

function drawConnectionsAndArrows() {
  const canvas = _ui.arrowCanvas
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(_ui.offsetX, _ui.offsetY)
  ctx.scale(_ui.scale, _ui.scale)

  for (const arrow of _canvasData.arrows) {
    let x1 = arrow.x1, y1 = arrow.y1, x2 = arrow.x2, y2 = arrow.y2
    if (arrow.connectedFrom !== null && _canvasData.textBoxes[arrow.connectedFrom]) {
      const t = _canvasData.textBoxes[arrow.connectedFrom]
      const p = getRectEdgePoint(t.x, t.y, t.w, t.h, x2, y2)
      x1 = p.x; y1 = p.y
    }
    if (arrow.connectedTo !== null && _canvasData.textBoxes[arrow.connectedTo]) {
      const t = _canvasData.textBoxes[arrow.connectedTo]
      const p = getRectEdgePoint(t.x, t.y, t.w, t.h, x1, y1)
      x2 = p.x; y2 = p.y
    }

    ctx.save()
    ctx.strokeStyle = arrow.color || '#6bb5ff'
    ctx.lineWidth = (arrow.lineWidth || 2) / _ui.scale
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    const angle = Math.atan2(y2 - y1, x2 - x1)
    const headLen = (arrow.headSize || 14) / _ui.scale
    const headAngle = Math.PI / 6
    ctx.beginPath()
    ctx.moveTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(angle - headAngle), y2 - headLen * Math.sin(angle - headAngle))
    ctx.lineTo(x2 - headLen * Math.cos(angle + headAngle), y2 - headLen * Math.sin(angle + headAngle))
    ctx.closePath()
    ctx.fillStyle = arrow.color || '#6bb5ff'
    ctx.fill()

    ctx.restore()
  }

  for (const conn of _canvasData.connectors) {
    let x1 = conn.x1, y1 = conn.y1, x2 = conn.x2, y2 = conn.y2
    if (conn.connectedFrom !== null) {
      const arr = conn.connectedFromType === 'shape' ? _canvasData.shapes : _canvasData.textBoxes
      if (arr[conn.connectedFrom]) {
        const p = getRectEdgePoint(arr[conn.connectedFrom].x, arr[conn.connectedFrom].y, arr[conn.connectedFrom].w, arr[conn.connectedFrom].h, x2, y2)
        x1 = p.x; y1 = p.y
      }
    }
    if (conn.connectedTo !== null) {
      const arr = conn.connectedToType === 'shape' ? _canvasData.shapes : _canvasData.textBoxes
      if (arr[conn.connectedTo]) {
        const p = getRectEdgePoint(arr[conn.connectedTo].x, arr[conn.connectedTo].y, arr[conn.connectedTo].w, arr[conn.connectedTo].h, x1, y1)
        x2 = p.x; y2 = p.y
      }
    }

    ctx.save()
    ctx.strokeStyle = conn.color || '#6bb5ff'
    ctx.lineWidth = 2 / _ui.scale
    ctx.setLineDash([6 / _ui.scale, 4 / _ui.scale])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x1, y1, 4 / _ui.scale, 0, Math.PI * 2)
    ctx.fillStyle = conn.color || '#6bb5ff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x2, y2, 4 / _ui.scale, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  for (const conn of _canvasData.connections) {
    const fromTb = _canvasData.textBoxes[conn.from]
    const toTb = _canvasData.textBoxes[conn.to]
    if (!fromTb || !toTb) continue

    const start = getRectEdgePoint(fromTb.x, fromTb.y, fromTb.w, fromTb.h, toTb.x + toTb.w / 2, toTb.y + toTb.h / 2)
    const end = getRectEdgePoint(toTb.x, toTb.y, toTb.w, toTb.h, fromTb.x + fromTb.w / 2, fromTb.y + fromTb.h / 2)
    const cpx = (start.x + end.x) / 2
    const cpy = (start.y + end.y) / 2 - 40 / _ui.scale

    ctx.save()
    ctx.strokeStyle = conn.color || '#6bb5ff'
    ctx.lineWidth = 2 / _ui.scale
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.quadraticCurveTo(cpx, cpy, end.x, end.y)
    ctx.stroke()
    ctx.restore()
  }

  if (_ui.connectingFrom !== null) {
    ctx.save()
    ctx.strokeStyle = getAccentColor()
    ctx.lineWidth = 2 / _ui.scale
    ctx.setLineDash([6 / _ui.scale, 4 / _ui.scale])
    const fromTb = _canvasData.textBoxes[_ui.connectingFrom]
    if (fromTb) {
      const start = getRectEdgePoint(fromTb.x, fromTb.y, fromTb.w, fromTb.h, _ui.connectingMouseWorld.x, _ui.connectingMouseWorld.y)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(_ui.connectingMouseWorld.x, _ui.connectingMouseWorld.y)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.restore()
}

function getRectEdgePoint(x, y, w, h, tx, ty) {
  const cx = x + w / 2, cy = y + h / 2
  const dx = tx - cx, dy = ty - cy
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return { x: cx, y: cy }
  const hw = w / 2, hh = h / 2
  if (dx !== 0) {
    const t = dx > 0 ? hw / dx : -hw / dx
    const yAtEdge = cy + dy * t
    if (yAtEdge >= y && yAtEdge <= y + h) return { x: cx + (dx > 0 ? hw : -hw), y: yAtEdge }
  }
  const t = dy > 0 ? hh / dy : -hh / dy
  return { x: cx + dx * t, y: cy + (dy > 0 ? hh : -hh) }
}

function animate() {
  if (!_ui) return
  _ui.offsetX += (_ui.targetOffsetX - _ui.offsetX) * 0.3
  _ui.offsetY += (_ui.targetOffsetY - _ui.offsetY) * 0.3
  _ui.scale += (_ui.targetScale - _ui.scale) * 0.3

  resizeCanvases()
  drawEntities()
  drawConnectionsAndArrows()
  _animationId = requestAnimationFrame(animate)
}

function setActiveTool(tool) {
  _ui.activeTool = tool
  _ui.canvasArea.style.cursor = tool === TOOLS.CURSOR ? 'default' : tool === TOOLS.TEXT ? 'text' : 'crosshair'
  updateToolUI()
}

function setShapeSubType(type) {
  _ui.shapeSubType = type
}

function updateToolUI() {
  if (!_ui) return
  for (const [tool, btn] of Object.entries(_ui.toolBtnMap)) {
    const isActive = tool === _ui.activeTool
    btn.style.background = isActive ? 'var(--accent)' : 'var(--bg-surface-hover)'
    btn.style.color = isActive ? 'var(--text-white)' : 'var(--text-secondary)'
    btn.style.borderColor = isActive ? 'var(--accent)' : 'var(--border-strong)'
  }
}

function getEdgeAt(wx, wy, entities, margin) {
  margin = margin || 8
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i]
    if (e.locked) continue
    const onLeft = Math.abs(wx - e.x) <= margin
    const onRight = Math.abs(wx - (e.x + e.w)) <= margin
    const onTop = Math.abs(wy - e.y) <= margin
    const onBottom = Math.abs(wy - (e.y + e.h)) <= margin
    const inX = wx >= e.x - margin && wx <= e.x + e.w + margin
    const inY = wy >= e.y - margin && wy <= e.y + e.h + margin
    if (!inX || !inY) continue
    if (onLeft && onTop) return { idx: i, handle: 'tl', cursor: 'nw-resize' }
    if (onRight && onTop) return { idx: i, handle: 'tr', cursor: 'ne-resize' }
    if (onLeft && onBottom) return { idx: i, handle: 'bl', cursor: 'sw-resize' }
    if (onRight && onBottom) return { idx: i, handle: 'br', cursor: 'se-resize' }
    if (onLeft) return { idx: i, handle: 'left', cursor: 'ew-resize' }
    if (onRight) return { idx: i, handle: 'right', cursor: 'ew-resize' }
    if (onTop) return { idx: i, handle: 'top', cursor: 'ns-resize' }
    if (onBottom) return { idx: i, handle: 'bottom', cursor: 'ns-resize' }
  }
  return null
}

function getHitEntity(wx, wy) {
  for (let i = _canvasData.arrows.length - 1; i >= 0; i--) {
    const a = _canvasData.arrows[i]
    const d = pointToLineDist(wx, wy, a.x1, a.y1, a.x2, a.y2)
    if (d < 10) return { type: 'arrow', idx: i }
  }
  for (let i = _canvasData.connectors.length - 1; i >= 0; i--) {
    const c = _canvasData.connectors[i]
    const d = pointToLineDist(wx, wy, c.x1, c.y1, c.x2, c.y2)
    if (d < 8) return { type: 'connector', idx: i }
  }
  for (let i = _canvasData.textBoxes.length - 1; i >= 0; i--) {
    const tb = _canvasData.textBoxes[i]
    if (!tb.locked && wx >= tb.x && wx <= tb.x + tb.w && wy >= tb.y && wy <= tb.y + tb.h)
      return { type: 'textBox', idx: i }
  }
  for (let i = _canvasData.shapes.length - 1; i >= 0; i--) {
    const s = _canvasData.shapes[i]
    if (!s.locked && wx >= s.x && wx <= s.x + s.w && wy >= s.y && wy <= s.y + s.h)
      return { type: 'shape', idx: i }
  }
  return null
}

function pointToLineDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

let _listeners = []

function wireEvents() {
  const area = _ui.canvasArea

  function addL(el, type, fn, opts) {
    el.addEventListener(type, fn, opts)
    _listeners.push({ el, type, fn, opts })
  }

  addL(area, 'pointerdown', onPointerDown)
  addL(area, 'pointermove', onPointerMove)
  addL(area, 'pointerup', onPointerUp)
  addL(area, 'pointerleave', onPointerUp)
  addL(area, 'wheel', onWheel, { passive: false })
  addL(area, 'dblclick', onDoubleClick)
  addL(area, 'contextmenu', e => e.preventDefault())

  addL(document, 'keydown', onKeyDown)
  addL(window, 'resize', resizeCanvases)
}

function onPointerDown(e) {
  const rect = _ui.canvasArea.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const wx = (sx - _ui.offsetX) / _ui.scale
  const wy = (sy - _ui.offsetY) / _ui.scale
  _ui.lastWorldMouse = { x: wx, y: wy }
  _ui.dragStartX = sx
  _ui.dragStartY = sy

  if (e.button === 2 || (e.button === 0 && e.altKey)) {
    _ui.isPanning = true
    _ui.lastPanX = sx
    _ui.lastPanY = sy
    _ui.canvasArea.style.cursor = 'grabbing'
    return
  }

  if (_ui.activeTool === TOOLS.CURSOR || _ui.activeTool === TOOLS.TEXT) {
    const edgeTb = getEdgeAt(wx, wy, _canvasData.textBoxes)
    const edgeSh = edgeTb ? null : getEdgeAt(wx, wy, _canvasData.shapes)
    const edge = edgeTb || edgeSh
    if (edge) {
      _ui.isResizing = true
      _ui.resizeHandle = edge.handle
      _ui.resizeStartWorldX = wx
      _ui.resizeStartWorldY = wy
      _ui.resizeEntityType = edgeTb ? 'textBox' : 'shape'
      _ui.resizeEntityIdx = edge.idx
      const entity = edgeTb ? _canvasData.textBoxes[edge.idx] : _canvasData.shapes[edge.idx]
      if (!entity) { _ui.isResizing = false; return }
      _ui.resizeStartBounds = { x: entity.x, y: entity.y, w: entity.w, h: entity.h }
      _ui.canvasArea.style.cursor = edge.cursor
      return
    }

    const hit = getHitEntity(wx, wy)
    if (hit) {
      if (hit.type === 'arrow') {
        const a = _canvasData.arrows[hit.idx]
        const endDist = Math.min(Math.hypot(wx - a.x1, wy - a.y1), Math.hypot(wx - a.x2, wy - a.y2))
        if (endDist < 12) {
          _ui.arrowDragTarget = hit.idx
          _ui.isDraggingArrowEnd = true
          _ui.dragArrowEndSnapshot = { ...a }
          return
        }
      }
      if (!e.shiftKey) clearSelection()
      if (hit.type === 'textBox') {
        _ui.selectedTextBoxes.add(hit.idx)
        _ui.isDragging = true
      } else if (hit.type === 'shape') {
        _ui.selectedShapes.add(hit.idx)
        _ui.isDragging = true
      } else if (hit.type === 'arrow') {
        _ui.selectedArrows.add(hit.idx)
      } else if (hit.type === 'connector') {
        _ui.selectedConnectors.add(hit.idx)
      }
      updateSidePanel()
      return
    }

    if (_ui.activeTool === TOOLS.TEXT) {
      addTextBox(wx, wy)
      return
    }

    if (e.button === 0) {
      _ui.isSelectingBox = true
      _ui.boxStartX = wx
      _ui.boxStartY = wy
      _ui.boxEndX = wx
      _ui.boxEndY = wy
      clearSelection()
    }
    return
  }

  if (_ui.activeTool === TOOLS.SHAPES) {
    _ui.drawingStartX = wx
    _ui.drawingStartY = wy
    return
  }

  if (_ui.activeTool === TOOLS.ARROW) {
    const hit = getHitEntity(wx, wy)
    if (hit && hit.type === 'textBox') {
      _ui.connectingFrom = hit.idx
      _ui.connectingMouseWorld = { x: wx, y: wy }
    } else {
      addArrow(wx, wy)
    }
    return
  }

  if (_ui.activeTool === TOOLS.CONNECTION_LINE) {
    const hit = getHitEntity(wx, wy)
    if (hit && hit.type === 'textBox') {
      _ui.connectingFrom = hit.idx
      _ui.connectingMouseWorld = { x: wx, y: wy }
    } else {
      addConnector(wx, wy)
    }
    return
  }

  if (_ui.activeTool === TOOLS.IMAGE_CONTAINER) {
    _ui.drawingStartX = wx
    _ui.drawingStartY = wy
    return
  }
}

function onPointerMove(e) {
  const rect = _ui.canvasArea.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const wx = (sx - _ui.offsetX) / _ui.scale
  const wy = (sy - _ui.offsetY) / _ui.scale
  _ui.lastWorldMouse = { x: wx, y: wy }

  if (_ui.isPanning) {
    const dx = sx - _ui.lastPanX
    const dy = sy - _ui.lastPanY
    _ui.targetOffsetX += dx
    _ui.targetOffsetY += dy
    _ui.lastPanX = sx
    _ui.lastPanY = sy
    return
  }

  if (_ui.isResizing) {
    const dx = (sx - _ui.dragStartX) / _ui.scale
    const dy = (sy - _ui.dragStartY) / _ui.scale
    const b = _ui.resizeStartBounds
    if (!b) return
    const h = _ui.resizeHandle
    let nx = b.x, ny = b.y, nw = b.w, nh = b.h
    if (h.includes('l')) { nx = b.x + dx; nw = b.w - dx }
    if (h.includes('r')) nw = b.w + dx
    if (h.includes('t')) { ny = b.y + dy; nh = b.h - dy }
    if (h.includes('b')) nh = b.h + dy
    if (nw < 20) { if (h.includes('l')) nx = b.x + b.w - 20; nw = 20 }
    if (nh < 20) { if (h.includes('t')) ny = b.y + b.h - 20; nh = 20 }

    const entity = _ui.resizeEntityType === 'textBox' ? _canvasData.textBoxes[_ui.resizeEntityIdx] : _canvasData.shapes[_ui.resizeEntityIdx]
    if (entity) {
      entity.x = nx; entity.y = ny; entity.w = nw; entity.h = nh
    }
    return
  }

  if (_ui.isDragging) {
    const dx = (sx - _ui.dragStartX) / _ui.scale
    const dy = (sy - _ui.dragStartY) / _ui.scale
    for (const idx of _ui.selectedTextBoxes) {
      const tb = _canvasData.textBoxes[idx]
      const start = getDragStart(idx, 'textBox')
      if (start) { tb.x = start.x + dx; tb.y = start.y + dy }
    }
    for (const idx of _ui.selectedShapes) {
      const s = _canvasData.shapes[idx]
      const start = getDragStart(idx, 'shape')
      if (start) { s.x = start.x + dx; s.y = start.y + dy }
    }
    return
  }

  if (_ui.isDraggingArrowEnd && _ui.arrowDragTarget !== null) {
    const a = _canvasData.arrows[_ui.arrowDragTarget]
    if (a) {
      const snap = _ui.dragArrowEndSnapshot
      const fromDist = Math.hypot(wx - snap.x1, wy - snap.y1)
      const toDist = Math.hypot(wx - snap.x2, wy - snap.y2)
      if (fromDist < toDist) { a.x1 = wx; a.y1 = wy } else { a.x2 = wx; a.y2 = wy }
    }
    return
  }

  if (_ui.connectingFrom !== null && (_ui.activeTool === TOOLS.ARROW || _ui.activeTool === TOOLS.CONNECTION_LINE)) {
    _ui.connectingMouseWorld = { x: wx, y: wy }
    return
  }

  if (_ui.activeTool === TOOLS.SHAPES || _ui.activeTool === TOOLS.IMAGE_CONTAINER) {
    if (e.buttons === 1) {
      const dx = (sx - _ui.dragStartX) / _ui.scale
      const dy = (sy - _ui.dragStartY) / _ui.scale
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { } 
    }
    return
  }

  if (_ui.isSelectingBox) {
    _ui.boxEndX = wx
    _ui.boxEndY = wy
    return
  }

  if (_ui.activeTool === TOOLS.CURSOR) {
    const edge = getEdgeAt(wx, wy, _canvasData.textBoxes)
      || getEdgeAt(wx, wy, _canvasData.shapes)
    _ui.canvasArea.style.cursor = edge ? edge.cursor : 'default'
  }
}

function onPointerUp(e) {
  const rect = _ui.canvasArea.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top
  const wx = (sx - _ui.offsetX) / _ui.scale
  const wy = (sy - _ui.offsetY) / _ui.scale

  if (_ui.isPanning) {
    _ui.isPanning = false
    _ui.canvasArea.style.cursor = _ui.activeTool === TOOLS.CURSOR ? 'default' : 'crosshair'
    saveData()
    return
  }

  if (_ui.isResizing) {
    _ui.isResizing = false
    const entity = _ui.resizeEntityType === 'textBox' ? _canvasData.textBoxes[_ui.resizeEntityIdx] : _canvasData.shapes[_ui.resizeEntityIdx]
    if (entity && _ui.resizeStartBounds) {
      const fromBounds = _ui.resizeStartBounds
      const toBounds = { x: entity.x, y: entity.y, w: entity.w, h: entity.h }
      _history.push({
        undo() {
          const e = _ui.resizeEntityType === 'textBox' ? _canvasData.textBoxes[_ui.resizeEntityIdx] : _canvasData.shapes[_ui.resizeEntityIdx]
          if (e) { e.x = fromBounds.x; e.y = fromBounds.y; e.w = fromBounds.w; e.h = fromBounds.h }
        },
        redo() {
          const e = _ui.resizeEntityType === 'textBox' ? _canvasData.textBoxes[_ui.resizeEntityIdx] : _canvasData.shapes[_ui.resizeEntityIdx]
          if (e) { e.x = toBounds.x; e.y = toBounds.y; e.w = toBounds.w; e.h = toBounds.h }
        },
        description: 'Resize'
      })
    }
    _ui.resizeStartBounds = null
    _ui.resizeEntityType = null
    _ui.resizeEntityIdx = -1
    saveData()
    return
  }

  if (_ui.isDragging) {
    _ui.isDragging = false
    const moves = []
    for (const idx of _ui.selectedTextBoxes) {
      const start = getDragStart(idx, 'textBox')
      const tb = _canvasData.textBoxes[idx]
      if (start && (start.x !== tb.x || start.y !== tb.y))
        moves.push({ id: tb.id, fromX: start.x, fromY: start.y, toX: tb.x, toY: tb.y, type: 'textBox' })
    }
    for (const idx of _ui.selectedShapes) {
      const start = getDragStart(idx, 'shape')
      const s = _canvasData.shapes[idx]
      if (start && (start.x !== s.x || start.y !== s.y))
        moves.push({ id: s.id, fromX: start.x, fromY: start.y, toX: s.x, toY: s.y, type: 'shape' })
    }
    if (moves.length > 0) _history.push(createMoveCmd(moves))
    _dragStarts = {}
    saveData()
    return
  }

  if (_ui.isDraggingArrowEnd) {
    _ui.isDraggingArrowEnd = false
    const a = _canvasData.arrows[_ui.arrowDragTarget]
    if (a && _ui.dragArrowEndSnapshot) {
      _history.push({
        undo() {
          const arrow = _canvasData.arrows[_ui.arrowDragTarget]
          if (arrow) Object.assign(arrow, _ui.dragArrowEndSnapshot)
        },
        redo() {
          const arrow = _canvasData.arrows[_ui.arrowDragTarget]
          if (arrow) Object.assign(arrow, a)
        },
        description: 'Move Arrow Point'
      })
    }
    _ui.arrowDragTarget = null
    _ui.dragArrowEndSnapshot = null
    saveData()
    return
  }

  if (_ui.connectingFrom !== null) {
    const hit = getHitEntity(wx, wy)
    if (hit && hit.type === 'textBox' && hit.idx !== _ui.connectingFrom) {
      if (_ui.activeTool === TOOLS.ARROW) {
        addArrowBetween(_ui.connectingFrom, hit.idx)
      } else if (_ui.activeTool === TOOLS.CONNECTION_LINE) {
        _history.push(createAddConnectionCmd(_ui.connectingFrom, hit.idx))
      }
    }
    _ui.connectingFrom = null
    saveData()
    return
  }

  if (_ui.isSelectingBox) {
    _ui.isSelectingBox = false
    const x = Math.min(_ui.boxStartX, _ui.boxEndX)
    const y = Math.min(_ui.boxStartY, _ui.boxEndY)
    const w = Math.abs(_ui.boxEndX - _ui.boxStartX)
    const h = Math.abs(_ui.boxEndY - _ui.boxStartY)
    if (w > 2 || h > 2) {
      for (let i = 0; i < _canvasData.textBoxes.length; i++) {
        const tb = _canvasData.textBoxes[i]
        if (tb.x + tb.w >= x && tb.x <= x + w && tb.y + tb.h >= y && tb.y <= y + h)
          _ui.selectedTextBoxes.add(i)
      }
      for (let i = 0; i < _canvasData.shapes.length; i++) {
        const s = _canvasData.shapes[i]
        if (s.x + s.w >= x && s.x <= x + w && s.y + s.h >= y && s.y <= y + h)
          _ui.selectedShapes.add(i)
      }
      updateSidePanel()
    }
    return
  }

  if (_ui.activeTool === TOOLS.SHAPES || _ui.activeTool === TOOLS.IMAGE_CONTAINER) {
    const dx = Math.abs(sx - _ui.dragStartX)
    const dy = Math.abs(sy - _ui.dragStartY)
    if (dx > 3 || dy > 3) {
      const w = Math.abs(sx - _ui.dragStartX) / _ui.scale
      const h = Math.abs(sy - _ui.dragStartY) / _ui.scale
      const x = Math.min(_ui.drawingStartX, wx)
      const y = Math.min(_ui.drawingStartY, wy)
      if (_ui.activeTool === TOOLS.SHAPES) addShapeAtCenter(x + w / 2, y + h / 2, _ui.shapeSubType, w, h)
      else addImageContainer(x, y, w, h)
    } else {
      if (_ui.activeTool === TOOLS.SHAPES) addShapeAtCenter(wx, wy, _ui.shapeSubType)
      else addImageContainer(wx, wy)
    }
    saveData()
    return
  }
}

const _dragStarts = {}

function getDragStart(idx, type) {
  const key = type + '_' + idx
  if (!_dragStarts[key]) {
    const entity = type === 'textBox' ? _canvasData.textBoxes[idx] : _canvasData.shapes[idx]
    if (entity) _dragStarts[key] = { x: entity.x, y: entity.y }
  }
  return _dragStarts[key]
}

function onWheel(e) {
  e.preventDefault()
  const rect = _ui.canvasArea.getBoundingClientRect()
  const sx = e.clientX - rect.left
  const sy = e.clientY - rect.top

  const factor = e.deltaY > 0 ? 0.92 : 1.08
  const newScale = Math.max(0.05, Math.min(5, _ui.targetScale * factor))
  const worldX = (sx - _ui.offsetX) / _ui.scale
  const worldY = (sy - _ui.offsetY) / _ui.scale
  _ui.targetOffsetX = sx - worldX * newScale
  _ui.targetOffsetY = sy - worldY * newScale
  _ui.targetScale = newScale
}

function onDoubleClick(e) {
  const rect = _ui.canvasArea.getBoundingClientRect()
  const wx = (e.clientX - rect.left - _ui.offsetX) / _ui.scale
  const wy = (e.clientY - rect.top - _ui.offsetY) / _ui.scale

  if (_ui.activeTool === TOOLS.TEXT) {
    addTextBox(wx, wy)
    return
  }

  const hit = getHitEntity(wx, wy)
  if (hit && hit.type === 'textBox') {
    const tb = _canvasData.textBoxes[hit.idx]
    const text = prompt('Edit text content:', tb.text || '')
    if (text !== null) {
      const oldText = tb.text
      tb.text = text
      _history.push({
        undo() { tb.text = oldText },
        redo() { tb.text = text },
        description: 'Edit Text'
      })
      saveData()
    }
  }
}

function onKeyDown(e) {
  if (!_ui) return
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); performUndo(); return }
    if (e.key === 'z' && e.shiftKey) { e.preventDefault(); performRedo(); return }
    if (e.key === 'c') { e.preventDefault(); copySelection(); return }
    if (e.key === 'v') { e.preventDefault(); pasteAt(); return }
    if (e.key === 'd') { e.preventDefault(); duplicateSelection(); return }
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
    e.preventDefault()
    deleteSelected()
    return
  }
  if (e.key === 'Escape') { clearSelection(); _ui.connectingFrom = null; return }
  if (e.key === 'f' || e.key === 'F') { focusOnAll(); return }
  if (e.key === 'v' || e.key === 'V') { setActiveTool(TOOLS.CURSOR); return }
  if (e.key === 't' || e.key === 'T') { setActiveTool(TOOLS.TEXT); return }
  if (e.key === 'a' || e.key === 'A') { setActiveTool(TOOLS.ARROW); return }
  if (e.key === 'c' || e.key === 'C') { if (!e.ctrlKey && !e.metaKey) { setActiveTool(TOOLS.CONNECTION_LINE); return } }

  if (e.key.startsWith('Arrow')) {
    e.preventDefault()
    const dx = e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0
    const dy = e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0
    const moved = []
    for (const idx of _ui.selectedTextBoxes) {
      const tb = _canvasData.textBoxes[idx]
      if (tb) { moved.push({ id: tb.id, fromX: tb.x, fromY: tb.y, toX: tb.x + dx, toY: tb.y + dy, type: 'textBox' }); tb.x += dx; tb.y += dy }
    }
    for (const idx of _ui.selectedShapes) {
      const s = _canvasData.shapes[idx]
      if (s) { moved.push({ id: s.id, fromX: s.x, fromY: s.y, toX: s.x + dx, toY: s.y + dy, type: 'shape' }); s.x += dx; s.y += dy }
    }
    if (moved.length > 0) _history.push(createMoveCmd(moved))
    saveData()
  }
}

function addTextBox(wx, wy, w, h) {
  w = w || 200; h = h || 120
  const tb = {
    id: _ui.nextTextBoxId++,
    x: wx, y: wy, w, h,
    text: '',
    title: '',
    color: '#1a1a1a',
    borderColor: '#444',
    textColor: '#ddd',
    titleColor: '#e7e7e7',
    fontSize: 14,
    locked: false,
  }
  const idx = _canvasData.textBoxes.length
  _canvasData.textBoxes.push(tb)
  clearSelection()
  _ui.selectedTextBoxes.add(idx)
  _history.push({
    undo() { _canvasData.textBoxes.splice(idx, 1); clearSelection() },
    redo() { _canvasData.textBoxes.splice(idx, 0, tb); clearSelection(); _ui.selectedTextBoxes.add(idx) },
    description: 'Add Text Box'
  })
  updateSidePanel()
  saveData()
}

function addShapeAtCenter(wx, wy, shapeType, optW, optH) {
  const w = optW || 120; const h = optH || 80
  const shape = {
    id: _ui.nextShapeId++,
    shapeType: shapeType || 'rectangle',
    x: optW ? wx - w / 2 : wx - w / 2,
    y: optH ? wy - h / 2 : wy - h / 2,
    w, h,
    color: '#2b2b2b',
    borderColor: getAccentColor(),
    borderWidth: 2,
    cornerRadius: (shapeType || 'rectangle') === 'rectangle' ? 4 : 0,
    image: null,
    locked: false,
  }
  const idx = _canvasData.shapes.length
  _canvasData.shapes.push(shape)
  clearSelection()
  _ui.selectedShapes.add(idx)
  _history.push({
    undo() { _canvasData.shapes.splice(idx, 1); clearSelection() },
    redo() { _canvasData.shapes.splice(idx, 0, shape); clearSelection(); _ui.selectedShapes.add(idx) },
    description: 'Add Shape'
  })
  updateSidePanel()
  saveData()
}

function addImageContainer(wx, wy, optW, optH) {
  addShapeAtCenter(wx, wy, 'rectangle', optW || 280, optH || 220)
  const shape = _canvasData.shapes[_canvasData.shapes.length - 1]
  if (shape) {
    shape.color = '#1e1e1e'
    shape.borderColor = '#3a3a3a'
    shape.borderWidth = 1
    shape.cornerRadius = 8
  }
}

function addArrow(wx, wy) {
  const offset = 60 / _ui.scale
  const a = {
    id: _ui.nextArrowId++,
    x1: wx - offset, y1: wy, x2: wx + offset, y2: wy,
    connectedFrom: null, connectedTo: null,
    connectedFromType: null, connectedToType: null,
    color: '#6bb5ff', lineWidth: 2, headSize: 14, locked: false,
  }
  const idx = _canvasData.arrows.length
  _canvasData.arrows.push(a)
  clearSelection()
  _ui.selectedArrows.add(idx)
  _history.push({
    undo() { _canvasData.arrows.splice(idx, 1); clearSelection() },
    redo() { _canvasData.arrows.splice(idx, 0, a); clearSelection(); _ui.selectedArrows.add(idx) },
    description: 'Add Arrow'
  })
  saveData()
}

function addArrowBetween(fromIdx, toIdx) {
  const fromTb = _canvasData.textBoxes[fromIdx]
  const toTb = _canvasData.textBoxes[toIdx]
  if (!fromTb || !toTb) return
  const start = getRectEdgePoint(fromTb.x, fromTb.y, fromTb.w, fromTb.h, toTb.x + toTb.w / 2, toTb.y + toTb.h / 2)
  const end = getRectEdgePoint(toTb.x, toTb.y, toTb.w, toTb.h, fromTb.x + fromTb.w / 2, fromTb.y + fromTb.h / 2)
  const a = {
    id: _ui.nextArrowId++,
    x1: start.x, y1: start.y, x2: end.x, y2: end.y,
    connectedFrom: fromIdx, connectedTo: toIdx,
    connectedFromType: 'textBox', connectedToType: 'textBox',
    color: '#6bb5ff', lineWidth: 2, headSize: 14, locked: false,
  }
  const idx = _canvasData.arrows.length
  _canvasData.arrows.push(a)
  _history.push({
    undo() { _canvasData.arrows.splice(idx, 1) },
    redo() { _canvasData.arrows.splice(idx, 0, a) },
    description: 'Add Arrow'
  })
  saveData()
}

function addConnector(wx, wy) {
  const offset = 60 / _ui.scale
  const c = {
    id: _ui.nextConnectorId++,
    x1: wx - offset, y1: wy, x2: wx + offset, y2: wy,
    connectedFrom: null, connectedTo: null,
    connectedFromType: null, connectedToType: null,
    color: '#6bb5ff', locked: false,
  }
  const idx = _canvasData.connectors.length
  _canvasData.connectors.push(c)
  clearSelection()
  _ui.selectedConnectors.add(idx)
  _history.push({
    undo() { _canvasData.connectors.splice(idx, 1); clearSelection() },
    redo() { _canvasData.connectors.splice(idx, 0, c); clearSelection(); _ui.selectedConnectors.add(idx) },
    description: 'Add Connector'
  })
  saveData()
}

function clearSelection() {
  _ui.selectedTextBoxes.clear()
  _ui.selectedShapes.clear()
  _ui.selectedArrows.clear()
  _ui.selectedConnectors.clear()
  _ui.selectedConnection = null
  updateSidePanel()
}

function copySelection() {
  _ui.clipboard = []
  for (const idx of _ui.selectedTextBoxes) {
    const tb = _canvasData.textBoxes[idx]
    _ui.clipboard.push({ _type: 'textBox', x: tb.x, y: tb.y, w: tb.w, h: tb.h, text: tb.text, title: tb.title, color: tb.color, borderColor: tb.borderColor, textColor: tb.textColor, titleColor: tb.titleColor, fontSize: tb.fontSize })
  }
  for (const idx of _ui.selectedShapes) {
    const s = _canvasData.shapes[idx]
    _ui.clipboard.push({ _type: 'shape', x: s.x, y: s.y, w: s.w, h: s.h, shapeType: s.shapeType, color: s.color, borderColor: s.borderColor, borderWidth: s.borderWidth, cornerRadius: s.cornerRadius })
  }
}

function pasteAt() {
  if (_ui.clipboard.length === 0) return
  const offset = 20
  const entries = []
  for (const item of _ui.clipboard) {
    if (item._type === 'textBox') {
      const tb = { id: _ui.nextTextBoxId++, x: item.x + offset, y: item.y + offset, w: item.w, h: item.h, text: item.text, title: item.title, color: item.color, borderColor: item.borderColor, textColor: item.textColor, titleColor: item.titleColor, fontSize: item.fontSize, locked: false }
      entries.push({ entity: tb, type: 'textBox', idx: _canvasData.textBoxes.length })
      _canvasData.textBoxes.push(tb)
      _ui.selectedTextBoxes.add(entries[entries.length - 1].idx)
    } else if (item._type === 'shape') {
      const s = { id: _ui.nextShapeId++, x: item.x + offset, y: item.y + offset, w: item.w, h: item.h, shapeType: item.shapeType, color: item.color, borderColor: item.borderColor, borderWidth: item.borderWidth, cornerRadius: item.cornerRadius, image: null, locked: false }
      entries.push({ entity: s, type: 'shape', idx: _canvasData.shapes.length })
      _canvasData.shapes.push(s)
      _ui.selectedShapes.add(entries[entries.length - 1].idx)
    }
  }
  if (entries.length > 0) {
    clearSelection()
    for (const e of entries) {
      if (e.type === 'textBox') _ui.selectedTextBoxes.add(e.idx)
      else _ui.selectedShapes.add(e.idx)
    }
    _history.push({
      undo() {
        const ids = new Set(entries.map(e => e.entity.id))
        for (let i = _canvasData.textBoxes.length - 1; i >= 0; i--) { if (ids.has(_canvasData.textBoxes[i].id)) _canvasData.textBoxes.splice(i, 1) }
        for (let i = _canvasData.shapes.length - 1; i >= 0; i--) { if (ids.has(_canvasData.shapes[i].id)) _canvasData.shapes.splice(i, 1) }
        clearSelection()
      },
      redo() {
        for (const e of entries) {
          if (e.type === 'textBox') _canvasData.textBoxes.splice(e.idx, 0, e.entity)
          else _canvasData.shapes.splice(e.idx, 0, e.entity)
        }
        clearSelection()
        for (const e of entries) {
          if (e.type === 'textBox') _ui.selectedTextBoxes.add(e.idx)
          else _ui.selectedShapes.add(e.idx)
        }
      },
      description: 'Paste'
    })
    updateSidePanel()
    saveData()
  }
}

function duplicateSelection() {
  copySelection()
  pasteAt()
}

function deleteSelected() {
  const deletedTextBoxes = [], deletedShapes = [], deletedArrows = [], deletedConnectors = []
  for (const idx of _ui.selectedTextBoxes) deletedTextBoxes.push({ entity: _canvasData.textBoxes[idx], index: idx })
  for (const idx of _ui.selectedShapes) deletedShapes.push({ entity: _canvasData.shapes[idx], index: idx })
  for (const idx of _ui.selectedArrows) deletedArrows.push({ entity: { ..._canvasData.arrows[idx] }, index: idx })
  for (const idx of _ui.selectedConnectors) deletedConnectors.push({ entity: { ..._canvasData.connectors[idx] }, index: idx })

  for (let i = deletedTextBoxes.length - 1; i >= 0; i--) _canvasData.textBoxes.splice(deletedTextBoxes[i].index, 1)
  for (let i = deletedShapes.length - 1; i >= 0; i--) _canvasData.shapes.splice(deletedShapes[i].index, 1)
  for (let i = deletedArrows.length - 1; i >= 0; i--) _canvasData.arrows.splice(deletedArrows[i].index, 1)
  for (let i = deletedConnectors.length - 1; i >= 0; i--) _canvasData.connectors.splice(deletedConnectors[i].index, 1)

  if (deletedTextBoxes.length + deletedShapes.length + deletedArrows.length + deletedConnectors.length > 0) {
    _history.push({
      undo() {
        for (const d of deletedTextBoxes) _canvasData.textBoxes.splice(d.index, 0, d.entity)
        for (const d of deletedShapes) _canvasData.shapes.splice(d.index, 0, d.entity)
        for (const d of deletedArrows) _canvasData.arrows.splice(d.index, 0, d.entity)
        for (const d of deletedConnectors) _canvasData.connectors.splice(d.index, 0, d.entity)
      },
      redo() {
        const ids = new Set()
        for (const d of [...deletedTextBoxes, ...deletedShapes]) ids.add(d.entity.id)
        for (let i = _canvasData.textBoxes.length - 1; i >= 0; i--) { if (ids.has(_canvasData.textBoxes[i].id)) _canvasData.textBoxes.splice(i, 1) }
        for (let i = _canvasData.shapes.length - 1; i >= 0; i--) { if (ids.has(_canvasData.shapes[i].id)) _canvasData.shapes.splice(i, 1) }
        for (const d of deletedArrows) {
          const ai = _canvasData.arrows.findIndex(a => a.id === d.entity.id)
          if (ai !== -1) _canvasData.arrows.splice(ai, 1)
        }
        for (const d of deletedConnectors) {
          const ci = _canvasData.connectors.findIndex(c => c.id === d.entity.id)
          if (ci !== -1) _canvasData.connectors.splice(ci, 1)
        }
      },
      description: 'Delete'
    })
  }

  clearSelection()
  saveData()
}

function createMoveCmd(moves) {
  return {
    undo() {
      for (const m of moves) {
        const e = m.type === 'textBox' ? _canvasData.textBoxes.find(t => t.id === m.id) : _canvasData.shapes.find(s => s.id === m.id)
        if (e) { e.x = m.fromX; e.y = m.fromY }
      }
    },
    redo() {
      for (const m of moves) {
        const e = m.type === 'textBox' ? _canvasData.textBoxes.find(t => t.id === m.id) : _canvasData.shapes.find(s => s.id === m.id)
        if (e) { e.x = m.toX; e.y = m.toY }
      }
    },
    description: moves.length === 1 ? 'Move' : `Move ${moves.length} items`
  }
}

function createAddConnectionCmd(fromIdx, toIdx) {
  let maxId = 0
  for (const c of _canvasData.connections) if (c.id > maxId) maxId = c.id
  const conn = { id: maxId + 1, from: fromIdx, to: toIdx, color: '#6bb5ff', text: '', locked: false }
  _canvasData.connections.push(conn)
  return {
    undo() {
      const idx = _canvasData.connections.findIndex(c => c.id === conn.id)
      if (idx !== -1) _canvasData.connections.splice(idx, 1)
    },
    redo() { _canvasData.connections.push(conn) },
    description: 'Add Connection'
  }
}

function performUndo() {
  if (_history) _history.undo()
}

function performRedo() {
  if (_history) _history.redo()
}

function focusOnAll() {
  if (!_ui) return
  const allEntities = [..._canvasData.textBoxes, ..._canvasData.shapes]
  if (allEntities.length === 0) {
    _ui.targetOffsetX = 0; _ui.targetOffsetY = 0; _ui.targetScale = 1
    return
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const e of allEntities) {
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y)
    maxX = Math.max(maxX, e.x + e.w); maxY = Math.max(maxY, e.y + e.h)
  }
  const pad = 40
  const bw = maxX - minX + pad * 2
  const bh = maxY - minY + pad * 2
  const cw = _ui.canvasArea.clientWidth
  const ch = _ui.canvasArea.clientHeight
  const scale = Math.min(cw / bw, ch / bh, 2)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  _ui.targetOffsetX = cw / 2 - cx * scale
  _ui.targetOffsetY = ch / 2 - cy * scale
  _ui.targetScale = scale
}

function updateSidePanel() {
  const panel = _ui.sidePanel
  if (!panel) return

  const count = _ui.selectedTextBoxes.size + _ui.selectedShapes.size + _ui.selectedArrows.size + _ui.selectedConnectors.size
  if (count === 0) {
    panel.style.display = 'none'
    return
  }
  panel.style.display = 'block'

  let html = '<div style="padding:8px 0;font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;">Selection</div>'

  if (_ui.selectedTextBoxes.size === 1) {
    const tb = _canvasData.textBoxes[Array.from(_ui.selectedTextBoxes)[0]]
    if (tb) {
      html += buildPropertyEditor(tb, 'textBox')
    }
  } else if (_ui.selectedShapes.size === 1) {
    const s = _canvasData.shapes[Array.from(_ui.selectedShapes)[0]]
    if (s) {
      html += buildShapePropertyEditor(s)
    }
  }

  html += '<div style="margin-top:12px;font-size:12px;color:var(--text-dim);">'
  if (_ui.selectedTextBoxes.size > 0) html += `<div>📄 ${_ui.selectedTextBoxes.size} text box(es)</div>`
  if (_ui.selectedShapes.size > 0) html += `<div>◇ ${_ui.selectedShapes.size} shape(s)</div>`
  if (_ui.selectedArrows.size > 0) html += `<div>→ ${_ui.selectedArrows.size} arrow(s)</div>`
  if (_ui.selectedConnectors.size > 0) html += `<div>— ${_ui.selectedConnectors.size} connector(s)</div>`
  html += '</div>'

  panel.innerHTML = html

  panel.querySelectorAll('[data-prop]').forEach(el => {
    const prop = el.dataset.prop
    const id = el.dataset.id
    const type = el.dataset.type
    el.addEventListener('change', () => {
      const entity = type === 'textBox' ? _canvasData.textBoxes.find(t => t.id == id) : _canvasData.shapes.find(s => s.id == id)
      if (!entity) return
      const oldVal = entity[prop]
      entity[prop] = el.type === 'checkbox' ? el.checked : el.value
      if (prop === 'color' || prop === 'borderColor' || prop === 'textColor') {
        entity[prop] = el.value
      }
      _history.push({
        undo() { entity[prop] = oldVal },
        redo() { entity[prop] = el.type === 'checkbox' ? el.checked : el.value },
        description: `Change ${prop}`
      })
      saveData()
    })
  })
}

function buildPropertyEditor(tb, type) {
  const colorVal = tb.color || '#1a1a1a'
  const borderVal = tb.borderColor || '#444'
  const textColorVal = tb.textColor || '#ddd'
  return `
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">Background</label>
      <input type="color" data-prop="color" data-id="${tb.id}" data-type="${type}" value="${colorVal}" style="width:100%;height:28px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);cursor:pointer;padding:2px;">
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">Border</label>
      <input type="color" data-prop="borderColor" data-id="${tb.id}" data-type="${type}" value="${borderVal}" style="width:100%;height:28px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);cursor:pointer;padding:2px;">
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">Text Color</label>
      <input type="color" data-prop="textColor" data-id="${tb.id}" data-type="${type}" value="${textColorVal}" style="width:100%;height:28px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);cursor:pointer;padding:2px;">
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">Title</label>
      <input data-prop="title" data-id="${tb.id}" data-type="${type}" value="${escAttr(tb.title || '')}" style="width:100%;padding:4px 6px;font-size:12px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text-primary);">
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">X: ${Math.round(tb.x)} Y: ${Math.round(tb.y)}  W: ${Math.round(tb.w)} H: ${Math.round(tb.h)}</label>
    </div>
  `
}

function buildShapePropertyEditor(s) {
  const colorVal = s.color || '#2b2b2b'
  const borderVal = s.borderColor || getAccentColor()
  return `
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">Shape Type: ${s.shapeType}</label>
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">Fill</label>
      <input type="color" data-prop="color" data-id="${s.id}" data-type="shape" value="${colorVal}" style="width:100%;height:28px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);cursor:pointer;padding:2px;">
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">Border</label>
      <input type="color" data-prop="borderColor" data-id="${s.id}" data-type="shape" value="${borderVal}" style="width:100%;height:28px;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);cursor:pointer;padding:2px;">
    </div>
    <div style="margin-bottom:8px;">
      <label style="display:block;font-size:11px;color:var(--text-dim);margin-bottom:2px;">X: ${Math.round(s.x)} Y: ${Math.round(s.y)}  W: ${Math.round(s.w)} H: ${Math.round(s.h)}</label>
    </div>
  `
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function destroyCanvas() {
  if (_animationId) {
    cancelAnimationFrame(_animationId)
    _animationId = null
  }
  for (const l of _listeners) {
    l.el.removeEventListener(l.type, l.fn, l.opts)
  }
  _listeners = []
  const area = document.getElementById('boardArea')
  if (area) {
    area.style.padding = ''
    area.style.overflow = ''
    area.style.background = ''
    area.style.position = ''
  }
  _currentCanvasId = null
  _canvasData = null
  _ui = null
  _history = null
  _renderedCanvasId = null
}
