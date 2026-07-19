import { state, findProject } from './data.js'
import { openModal } from './modal.js'
import { renderBoard, renderDocumentView } from './board.js'
import { initDragDrop, isCardDragActive } from './dragdrop.js'
import { renderMemberBar } from './members.js'
import { updateMenuBar } from './menubar.js'

export function render() {
  const sidebarEl = document.getElementById('sidebar')
  if (state.selectedProjectId && state.selectedWorkspaceId) {
    sidebarEl.classList.remove('hidden')
  } else {
    sidebarEl.classList.add('hidden')
  }

  const sidebar = document.getElementById('sidebarContent')

  if (!state.selectedProjectId) {
    sidebar.innerHTML = '<div class="sidebar-hint">Select a project to view boards</div>'
    renderBoard()
    renderMemberBar()
    updateMenuBar()
    return
  }

  const p = findProject(state.selectedProjectId)
  if (!p) {
    sidebar.innerHTML = ''
    renderBoard()
    renderMemberBar()
    updateMenuBar()
    return
  }

  let html = '<div class="sidebar-project-name">' + p.name + '</div>'
  const dashActive = state.selectedDashboard ? ' active' : ''
  html += `<div class="nav-child${dashActive}" onclick="selectDashboard()">
    <span class="name">Dashboard</span>
  </div>`
  html += '<div class="section-title" style="margin-top:12px"><span>Items</span><span class="btn-add-board" onclick="toggleAddBoardMenu(event,\'' + p.id + '\')">+</span></div>'

  const boardIcon = '<svg class="item-icon item-icon-board" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M3.2 4l.8.8L6 3.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 4h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><rect x="2.5" y="6.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M7 8h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><rect x="2.5" y="10.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M7 12h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>'
  const docIcon = '<svg class="item-icon item-icon-document" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="1.5" width="11" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10 1.5V4.5H13" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="9.5" x2="11" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
  const canvasIcon = '<svg class="item-icon item-icon-canvas" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="0.5" y="0.5" width="15" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="5.5" y1="0.5" x2="5.5" y2="15.5" stroke="currentColor" stroke-width="1"/><line x1="10.5" y1="0.5" x2="10.5" y2="15.5" stroke="currentColor" stroke-width="1"/><line x1="0.5" y1="5.5" x2="15.5" y2="5.5" stroke="currentColor" stroke-width="1"/><line x1="0.5" y1="10.5" x2="15.5" y2="10.5" stroke="currentColor" stroke-width="1"/></svg>'

  const allItems = []
  for (const b of p.boards) {
    allItems.push({ id: b.id, name: b.name, type: 'board', deleteFn: 'deleteBoard', icon: boardIcon })
  }
  for (const d of (p.documents || [])) {
    allItems.push({ id: d.id, name: d.name, type: 'document', deleteFn: 'deleteDocument', icon: docIcon })
  }
  for (const c of (p.canvasBoards || [])) {
    allItems.push({ id: c.id, name: c.name, type: 'canvas', deleteFn: 'deleteCanvas', icon: canvasIcon })
  }

  for (const item of allItems) {
    let active = false
    let selectFn = ''
    if (item.type === 'board') { active = state.selectedBoardId === item.id; selectFn = 'selectBoard' }
    else if (item.type === 'document') { active = state.selectedDocumentId === item.id; selectFn = 'selectDocument' }
    else if (item.type === 'canvas') { active = state.selectedCanvasId === item.id; selectFn = 'selectCanvas' }
    const activeClass = active ? ' active' : ''
    const boardAttr = item.type === 'board' ? ` data-board-id="${item.id}"` : ''
    html += `<div class="nav-child${activeClass}"${boardAttr} onclick="${selectFn}('${item.id}')">
      ${item.icon}
      <span class="name">${item.name}</span>
      <button class="btn-del" onclick="event.stopPropagation();${item.deleteFn}('${item.id}')">✕</button>
    </div>`
  }
  sidebar.innerHTML = html
  renderBoard()
  initDragDrop(render)
  initSidebarDrag()
  renderMemberBar()
  updateMenuBar()
  if (window.__autoSave) window.__autoSave()
}

function initSidebarDrag() {
  const sidebar = document.getElementById('sidebarContent')
  if (sidebar._sidebarDndInited) return
  sidebar._sidebarDndInited = true

  let hoverTimer = null
  let hoveredBoardId = null

  sidebar.addEventListener('dragenter', function(e) {
    if (!isCardDragActive()) return
    const item = e.target.closest('[data-board-id]')
    if (!item) return
    e.preventDefault()

    const boardId = item.dataset.boardId
    if (boardId === hoveredBoardId || boardId === state.selectedBoardId) return

    clearTimeout(hoverTimer)
    hoveredBoardId = boardId
    item.classList.add('drag-hover')

    hoverTimer = setTimeout(function() {
      selectBoard(boardId)
      hoveredBoardId = null
    }, 500)
  })

  sidebar.addEventListener('dragleave', function(e) {
    if (!isCardDragActive()) return
    const item = e.target.closest('[data-board-id]')
    if (!item) return
    if (e.relatedTarget && item.contains(e.relatedTarget)) return

    clearTimeout(hoverTimer)
    if (item.dataset.boardId === hoveredBoardId) {
      hoveredBoardId = null
    }
    item.classList.remove('drag-hover')
  })

  sidebar.addEventListener('dragover', function(e) {
    if (!isCardDragActive()) return
    if (e.target.closest('[data-board-id]')) {
      e.preventDefault()
    }
  })

  sidebar.addEventListener('drop', function(e) {
    if (!isCardDragActive()) return
    const item = e.target.closest('[data-board-id]')
    if (!item) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    clearTimeout(hoverTimer)
    hoveredBoardId = null
    item.classList.remove('drag-hover')
    const boardId = item.dataset.boardId
    if (state.selectedBoardId !== boardId) {
      selectBoard(boardId)
    }
  })
}

export function selectWorkspace(id) {
  state.selectedWorkspaceId = id
  state.selectedProjectId = null
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  render()
}

export function selectProject(id) {
  state.selectedProjectId = id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  render()
}

export function selectBoard(id) {
  if (state.selectedBoardId !== id) {
    const f = state.filters
    f.search = ''
    f.members = []
    f.tags = []
    f.priority = []
    f.startDateFrom = ''
    f.startDateTo = ''
    f.endDateFrom = ''
    f.endDateTo = ''
    f.completed = 'all'
  }
  state.selectedBoardId = id
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  render()
}

export function selectDocument(id) {
  state.selectedDocumentId = id
  state.selectedBoardId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  render()
}

export function selectCanvas(id) {
  state.selectedCanvasId = id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedDashboard = false
  render()
}

export function selectDashboard() {
  state.selectedDashboard = true
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  render()
}

export function toggleAddBoardMenu(e, projectId) {
  e.stopPropagation()
  const existing = document.querySelector('.add-board-menu')
  if (existing) { existing.remove(); return }

  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const btn = e.currentTarget
  const rect = btn.getBoundingClientRect()
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu add-board-menu'
  menu.style.left = (rect.left - 80) + 'px'
  menu.style.top = (rect.bottom + 2) + 'px'
  menu.innerHTML = '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'board\',\'' + projectId + '\')">Task Board</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'document\',\'' + projectId + '\')">Document</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'canvas\',\'' + projectId + '\')">Canvas Board</button>'
  menu.addEventListener('mouseleave', function() { menu.remove() })
  document.body.appendChild(menu)
}
