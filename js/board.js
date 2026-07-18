import { state, findBoard, findProject, findWorkspace, findDocument, getTagColor, PREDEFINED_COLORS } from './data.js'
import { escapeHtml, getProgressColor, countChecklistItems, countCompletedChecklistItems } from './utils.js'
import { renderFilterBar, filterBoardCards, getActiveFilterCount } from './filters.js'
import { showColumnContextMenu } from './columnMenu.js'
import { startRenameColumn, startRenameCard } from './inlineEdit.js'
import { renderTimeline } from './timeline.js'
import { renderCalendar } from './calendar.js'
import { wasRightDragged } from './dragscroll.js'
import { renderDocument, destroyEditor } from './document.js'
import { renderDashboard } from './dashboard.js'
import { updateMenuBar } from './menubar.js'
import { exportBoardCSV, importBoardCSV } from './io.js'

const PRIORITY_BAR_CONFIG = {
  none:   { filled: 3, color: '#f97316' },
  low:    { filled: 1, color: '#22c55e' },
  medium: { filled: 3, color: '#f97316' },
  high:   { filled: 5, color: '#ef4444' },
  urgent: { filled: 5, color: '#ef4444' },
  '1':    { filled: 1, color: '#22c55e' },
  '2':    { filled: 2, color: '#84cc16' },
  '3':    { filled: 3, color: '#f97316' },
  '4':    { filled: 4, color: '#f43f5e' },
  '5':    { filled: 5, color: '#ef4444' },
}

export function switchView(view) {
  state.selectedView = view
  state.selectedDocumentId = null
  renderBoard()
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view)
  })
  updateMenuBar()
}

export function renderBoard() {
  const area = document.getElementById('boardArea')
  const breadcrumb = document.getElementById('breadcrumb')
  const viewSwitcher = document.querySelector('.view-switcher')

  const b = state.selectedBoardId ? findBoard(state.selectedBoardId) : null
  const p = state.selectedProjectId ? findProject(state.selectedProjectId) : null
  const w = state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null
  const d = state.selectedDocumentId ? findDocument(state.selectedDocumentId) : null

  let bc = ''
  if (w) bc += `<span class="bc-link" onclick="selectWorkspace('${w.id}')">${w.name}</span>`
  if (p) bc += ` <span>›</span> <span class="bc-link" onclick="selectProject('${p.id}')">${p.name}</span>`
  if (b) bc += ` <span>›</span> <span class="bc-link" onclick="selectBoard('${b.id}')">${b.name}</span>`
  if (d) bc += ` <span>›</span> <span class="bc-link" onclick="selectDocument('${d.id}')">${d.name}</span>`
  if (state.selectedDashboard) bc += ` <span>›</span> <span>Dashboard</span>`
  breadcrumb.innerHTML = bc

  if (viewSwitcher) {
    viewSwitcher.style.display = b && !d && !state.selectedDashboard ? 'flex' : 'none'
  }
  document.querySelectorAll('.view-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.view === state.selectedView)
  })

  renderFilterBar()

  const ioEl = document.getElementById('boardIO')
  if (ioEl) {
    if (b && w && !state.selectedDashboard && !state.selectedDocumentId) {
      ioEl.classList.remove('hidden')
    } else {
      ioEl.classList.add('hidden')
    }
  }

  const topbarEl = document.querySelector('.topbar')

  if (!w) {
    if (topbarEl) topbarEl.style.display = 'none'
    destroyEditor()
    area.innerHTML =
      '<div class="onboarding">' +
      '<div class="onboarding-icon">' +
      '  <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#4f46e5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg>' +
      '</div>' +
      '<h1 class="onboarding-title">Welcome to Task Board</h1>' +
      '<p class="onboarding-desc">Organize your projects, manage tasks, and collaborate with your team. Get started by creating a new workspace or opening an existing one.</p>' +
      '<div class="onboarding-actions">' +
      '  <button class="btn-create onboarding-btn" onclick="onboardingCreateWorkspace()">+ Create New Workspace</button>' +
      '  <button class="btn-open onboarding-btn" onclick="onboardingOpenWorkspace()">Open Workspace</button>' +
      '</div>' +
      '</div>'
    return
  }

  if (topbarEl) topbarEl.style.display = ''

  if (w && !p) {
    destroyEditor()
    renderWorkspacePage(area, w)
    return
  }

  if (p && state.selectedDashboard) {
    destroyEditor()
    renderDashboard(area)
    return
  }

  if (p && d) {
    renderDocumentView(d.id)
    return
  }

  if (p && !b) {
    destroyEditor()
    renderProjectPage(area, p)
    return
  }

  if (state.selectedView === 'timeline') {
    destroyEditor()
    renderTimeline()
    return
  }
  if (state.selectedView === 'calendar') {
    destroyEditor()
    renderCalendar()
    return
  }

  const filterActive = getActiveFilterCount() > 0
  const filteredCardIds = filterActive ? filterBoardCards(b) : null

  let html = '<div class="board-columns">'
  for (const col of b.columns) {
    const totalCards = col.cards.length
    let visibleCards = totalCards
    if (filteredCardIds) {
      visibleCards = 0
      for (const c of col.cards) { if (filteredCardIds.has(c.id)) visibleCards++ }
    }
    const countStr = filteredCardIds ? visibleCards + '/' + totalCards : '' + totalCards

    html += '<div class="board-column" draggable="true" data-column-id="' + col.id + '">'
    html += '<div class="column-header" oncontextmenu="showColumnContextMenu(event,\'' + col.id + '\')">'
    html += '  <span ondblclick="startRenameColumn(event,\'' + col.id + '\')" id="colTitle-' + col.id + '">' + col.name + '</span>'
    html += '  <span class="col-count">' + countStr + '</span>'
    html += '  <div class="col-menu" id="colMenu-' + col.id + '">'
    html += '    <button class="col-menu-item" onclick="closeAllColumnMenus();copyColumn(\'' + col.id + '\')">Copy</button>'
    html += '    <button class="col-menu-item" onclick="closeAllColumnMenus();pasteColumn(\'' + col.id + '\')">Paste</button>'
    html += '    <button class="col-menu-item" onclick="closeAllColumnMenus();duplicateColumn(\'' + col.id + '\')">Duplicate</button>'
    html += '    <div class="col-menu-sep"></div>'
    html += '    <button class="col-menu-item danger" onclick="closeAllColumnMenus();archiveColumn(\'' + col.id + '\')">Archive</button>'
    html += '  </div>'
    html += '</div>'
    html += '<div class="column-cards" data-col-id="' + col.id + '">'
    for (const c of col.cards) {
      if (filteredCardIds && !filteredCardIds.has(c.id)) continue
      const completed = c.completed ? ' completed' : ''
      const checked = c.completed ? ' checked' : ''
      const cardColorStyle = c.color ? '--card-color:' + c.color + ';' : ''
      const barCfg = PRIORITY_BAR_CONFIG[c.priority] || PRIORITY_BAR_CONFIG.medium
      html += '<div class="card' + completed + '" draggable="true" data-card-id="' + c.id + '" style="' + cardColorStyle + '--card-priority-color:' + barCfg.color + ';">'
      html += '  <div class="card-check' + checked + '" onclick="event.stopPropagation();toggleCardCompleted(\'' + c.id + '\')"><div class="card-check-circle"><svg class="card-check-check" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>'
      html += '  <div class="card-body">'
      html += '    <div class="card-title" ondblclick="event.stopPropagation();startRenameCard(event,\'' + c.id + '\')" id="cardTitle-' + c.id + '">' + escapeHtml(c.title) + '</div>'
      if (c.description) html += '    <div class="card-desc">' + escapeHtml(c.description) + '</div>'
      if (c.tags && c.tags.length > 0) {
        html += '    <div class="card-tags">'
        for (const t of c.tags) {
          const color = getTagColor(t)
          html += '      <span class="card-tag" style="background:' + color + '">' + escapeHtml(t) + '</span>'
        }
        html += '    </div>'
      }
      if (c.checklists && c.checklists.length > 0) {
        const total = countChecklistItems(c.checklists)
        const done = countCompletedChecklistItems(c.checklists)
        const pct = total > 0 ? Math.round((done / total) * 100) : 0
        const allDone = total > 0 && done === total ? ' done' : ''
        html += '    <div class="card-cl-progress' + allDone + '"><div class="card-cl-progress-bar" style="width:' + pct + '%;background:' + getProgressColor(pct) + '"></div></div>'
      }
      html += '  </div>'
      html += '  <div class="card-priority">'
      for (let i = 0; i < 5; i++) {
        const filled = i < barCfg.filled ? ' filled' : ''
        html += '<div class="card-priority-bar' + filled + '" style="background:' + barCfg.color + ';color:' + barCfg.color + '"></div>'
      }
      html += '  </div>'
      html += '</div>'
    }
    html += '</div>'
    html += '<div class="column-footer">'
    html += '  <button class="btn-add-card" onclick="addCardDirect(\'' + col.id + '\')">+ Add a card</button>'
    html += '</div></div>'
  }
  html += '<div class="board-column add-column" onclick="addColumnDirect(\'' + b.id + '\')" oncontextmenu="showAddColContextMenu(event,\'' + b.id + '\')">'
  html += '  <span style="color:#888;font-size:13px;">+ Add Another Column</span>'
  html += '  <div class="col-menu" id="addColMenu-' + b.id + '">'
    html += '    <button class="col-menu-item" onclick="event.stopPropagation();closeAllColumnMenus();pasteColumnToBoard(\'' + b.id + '\')">Paste</button>'
  html += '  </div>'
  html += '</div>'
  html += '</div>'
  area.innerHTML = html

  if (!area._kanbanCtxDone) {
    area._kanbanCtxDone = true

    area.addEventListener('contextmenu', function(e) {
      if (state.selectedView !== 'kanban') return
      if (wasRightDragged()) return
      const card = e.target.closest('.card')
      if (card) {
        e.preventDefault()
        e.stopPropagation()
        document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
        const menu = document.createElement('div')
        menu.className = 'tl-ctx-menu'
        menu.style.left = e.clientX + 'px'
        menu.style.top = e.clientY + 'px'
        menu.dataset.cardId = card.dataset.cardId
        const colId = card.closest('[data-col-id]')?.dataset.colId || ''
        let colorSwatches = ''
        for (const pc of PREDEFINED_COLORS) {
          colorSwatches += '<button class="ps-color-swatch" data-color="' + pc.value + '" style="background:' + pc.value + '" onclick="event.stopPropagation();setCardColor(\'' + card.dataset.cardId + '\',\'' + pc.value + '\');this.closest(\'.tl-ctx-menu\').remove()"></button>'
        }
        colorSwatches += '<button class="ps-color-swatch ps-color-none" onclick="event.stopPropagation();setCardColor(\'' + card.dataset.cardId + '\',null);this.closest(\'.tl-ctx-menu\').remove()" title="None">✕</button>'
        let ctxHtml = '<button class="tl-ctx-item" data-action="copy">Copy</button>'
        ctxHtml += '<button class="tl-ctx-item" data-action="duplicate">Duplicate</button>'
        if (window.getCopiedCard && window.getCopiedCard()) {
          ctxHtml += '<button class="tl-ctx-item" data-action="paste">Paste</button>'
        }
        ctxHtml += '<div class="tl-ctx-divider"></div>'
        ctxHtml += '<div class="tl-ctx-item tl-ctx-sub-wrap">Set Color<div class="ps-color-submenu">' + colorSwatches + '</div></div>'
        ctxHtml += '<div class="tl-ctx-divider"></div>'
        ctxHtml += '<button class="tl-ctx-item tl-ctx-danger" data-action="archive">Archive</button>'
        menu.innerHTML = ctxHtml
        if (colId) menu.dataset.colId = colId
        menu.addEventListener('mouseleave', function() { menu.remove() })
        document.body.appendChild(menu)
        return
      }

      const addBtn = e.target.closest('.btn-add-card')
      if (addBtn && window.getCopiedCard && window.getCopiedCard()) {
        e.preventDefault()
        e.stopPropagation()
        document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
        const colEl = addBtn.closest('[data-column-id]')
        if (!colEl) return
        const menu = document.createElement('div')
        menu.className = 'tl-ctx-menu'
        menu.style.left = e.clientX + 'px'
        menu.style.top = e.clientY + 'px'
        menu.dataset.colId = colEl.dataset.columnId
        menu.innerHTML = '<button class="tl-ctx-item" data-action="paste">Paste</button>'
        menu.addEventListener('mouseleave', function() { menu.remove() })
        document.body.appendChild(menu)
      }
    })
  }

}

function renderWorkspacePage(area, w) {
  let html = '<div class="page-view" oncontextmenu="showWsCtxMenu(event,\'' + w.id + '\')">'
  html += '<div class="page-header"><h2>Projects</h2><button class="btn-create" onclick="addProjectDirect(\'' + w.id + '\')">+ New Project</button></div>'
  if (w.projects.length === 0) {
    html += '<div class="empty-state"><p>No projects yet</p></div>'
  } else {
    html += '<div class="page-grid">'
    for (const p of w.projects) {
      const count = p.boards.length
      const colorStyle = p.color ? 'border-top:5px solid ' + p.color + ';background:linear-gradient(180deg,' + p.color + '25, #1e1e2e 100%);' : ''
      html += '<div class="page-card" onclick="selectProject(\'' + p.id + '\')" oncontextmenu="event.stopPropagation();showProjectCtxMenu(event,\'' + p.id + '\')" style="' + colorStyle + '">'
      html += '<h3 id="projectTitle-' + p.id + '" ondblclick="startRenameProject(\'' + p.id + '\')">' + p.name + '</h3>'
      html += '<p class="count">' + count + ' board' + (count !== 1 ? 's' : '') + '</p>'
      html += '</div>'
    }
    html += '</div>'
  }
  html += '</div>'
  area.innerHTML = html
}

export function showWsCtxMenu(e, workspaceId) {
  e.preventDefault()
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
  menu.innerHTML = '<button class="tl-ctx-item" onclick="closeAllColumnMenus();addProjectDirect(\'' + workspaceId + '\')">+ Add Project</button>'
  menu.addEventListener('mouseleave', function() { menu.remove() })
  document.body.appendChild(menu)
}

const PROJECT_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#78716c','#a1a1aa']

export function showProjectCtxMenu(e, projectId) {
  e.preventDefault()
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'

  let colorSwatches = ''
  for (const c of PROJECT_COLORS) {
    colorSwatches += '<button class="ps-color-swatch" data-color="' + c + '" style="background:' + c + '" onclick="event.stopPropagation();setProjectColor(\'' + projectId + '\',\'' + c + '\');this.closest(\'.tl-ctx-menu\').remove()"></button>'
  }
  colorSwatches += '<button class="ps-color-swatch ps-color-none" onclick="event.stopPropagation();setProjectColor(\'' + projectId + '\',null);this.closest(\'.tl-ctx-menu\').remove()" title="None">✕</button>'

  menu.innerHTML =
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();startRenameProject(\'' + projectId + '\')">Rename</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<div class="tl-ctx-item tl-ctx-sub-wrap">Set Color<div class="ps-color-submenu">' + colorSwatches + '</div></div>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();copyProject(\'' + projectId + '\')">Duplicate</button>' +
    '<button class="tl-ctx-item tl-ctx-danger" onclick="closeAllColumnMenus();archiveProject(\'' + projectId + '\')">Archive</button>'
  menu.addEventListener('mouseleave', function() { menu.remove() })
  document.body.appendChild(menu)
}

function renderProjectPage(area) {
  area.innerHTML = '<div class="empty-state"><p>Select a board or document from the sidebar</p></div>'
}

export async function renderDocumentView(documentId) {
  const area = document.getElementById('boardArea')
  const doc = findDocument(documentId)
  if (!doc) return
  area.innerHTML = '<div class="doc-loading">Loading editor...</div>'
  await renderDocument(documentId)
}
