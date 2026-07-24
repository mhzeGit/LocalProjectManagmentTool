import { data, state, findBoard, findProject, findWorkspace, findDocument, findCanvas, findCard, getTagColor, PREDEFINED_COLORS } from './data.js'
import { escapeHtml, getProgressColor, getInitials, countChecklistItems, countCompletedChecklistItems } from './utils.js'
import { render } from './sidebar.js'
import { getResolvedAvatar } from './persistence.js'
import { renderFilterBar, filterBoardCards, getActiveFilterCount } from './filters.js'
import { showColumnContextMenu } from './columnMenu.js'
import { startRenameColumn, startRenameCard } from './inlineEdit.js'
import { renderTimeline } from './timeline.js'
import { renderCalendar } from './calendar.js'
import { renderListView } from './listView.js'
import { wasRightDragged } from './dragscroll.js'
import { renderDocument, destroyEditor } from './document.js'
import { renderCanvasView, destroyCanvas, isCanvasActive } from './canvas.js'
import { renderDashboard } from './dashboard.js'
import { updateMenuBar } from './menubar.js'
import { exportBoardCSV, importBoardCSV } from './io.js'
import { cleanupGrid, setupGrid } from './navigation.js'

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

const PRIORITY_ORDER = { none: 0, low: 1, '1': 1, '2': 2, medium: 3, '3': 3, high: 4, '4': 4, urgent: 5, '5': 5 }
const _columnSortState = new Map()
const SORT_OPTIONS = [
  { key: null,     label: 'Default',                 asc: true },
  { key: 'title',      label: 'Name (A-Z)',             asc: true },
  { key: 'title',      label: 'Name (Z-A)',             asc: false },
  { key: 'priority',   label: 'Priority (High to Low)',  asc: false },
  { key: 'priority',   label: 'Priority (Low to High)',  asc: true },
  { key: 'startDate',  label: 'Start Date (Earliest)',   asc: true },
  { key: 'startDate',  label: 'Start Date (Latest)',     asc: false },
  { key: 'endDate',    label: 'End Date (Earliest)',     asc: true },
  { key: 'endDate',    label: 'End Date (Latest)',       asc: false },
  { key: 'completed',  label: 'Status (Incomplete)',     asc: true },
  { key: 'completed',  label: 'Status (Completed)',      asc: false },
  { key: 'members',    label: 'Members (A-Z)',           asc: true },
  { key: 'members',    label: 'Members (Z-A)',           asc: false },
]

function getSortedCards(col) {
  const s = _columnSortState.get(col.id)
  if (!s || !s.key) return col.cards
  const sorted = [...col.cards]
  const key = s.key
  const asc = s.asc
  sorted.sort((a, b) => {
    let cmp = 0
    if (key === 'title') {
      cmp = a.title.localeCompare(b.title)
    } else if (key === 'priority') {
      cmp = (PRIORITY_ORDER[a.priority] || 0) - (PRIORITY_ORDER[b.priority] || 0)
    } else if (key === 'startDate') {
      cmp = (a.startDate || '').localeCompare(b.startDate || '')
    } else if (key === 'endDate') {
      cmp = (a.endDate || '').localeCompare(b.endDate || '')
    } else if (key === 'completed') {
      cmp = (a.completed ? 1 : 0) - (b.completed ? 1 : 0)
    } else if (key === 'members') {
      const ma = (a.members && a.members.length > 0) ? a.members[0] : ''
      const mb = (b.members && b.members.length > 0) ? b.members[0] : ''
      cmp = ma.localeCompare(mb)
    }
    return asc ? cmp : -cmp
  })
  return sorted
}

function getColumnSortSubmenuHtml(colId) {
  const current = _columnSortState.get(colId)
  let html = ''
  for (const opt of SORT_OPTIONS) {
    const checked = current && current.key === opt.key && current.asc === opt.asc
    const checkStr = checked ? '✓ ' : '  '
    const cls = checked ? ' class="col-menu-sort-item col-menu-sort-item-active"' : ' class="col-menu-sort-item"'
    if (opt.key === null) {
      html += '<button' + cls + ' onclick="event.stopPropagation();clearColumnSort(\'' + colId + '\');closeAllColumnMenus()">' + checkStr + opt.label + '</button>'
    } else {
      html += '<button' + cls + ' onclick="event.stopPropagation();setColumnSort(\'' + colId + '\',\'' + opt.key + '\',' + opt.asc + ');closeAllColumnMenus()">' + checkStr + opt.label + '</button>'
    }
  }
  return html
}

export function setColumnSort(colId, key, asc) {
  _columnSortState.set(colId, { key, asc })
  renderBoard()
}

export function clearColumnSort(colId) {
  _columnSortState.delete(colId)
  renderBoard()
}

export function switchView(view) {
  state.selectedView = view
  state.selectedDocumentId = null
  if (window.__saveSelectedState) window.__saveSelectedState()
  renderBoard()
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view)
  })
  updateMenuBar()
}

export function renderBoard() {
  cleanupGrid()
  const area = document.getElementById('boardArea')
  if (!area._pageBoardCtxDone) {
    area._pageBoardCtxDone = true
    area.addEventListener('contextmenu', function(e) {
      var w = state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null
      var p = state.selectedProjectId ? findProject(state.selectedProjectId) : null
      if (e.target.closest('.page-card, .card, .board-column, .column-header, .btn-add-card')) return
      e.preventDefault()
      document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
      var menu = document.createElement('div')
      menu.className = 'tl-ctx-menu'
      menu.style.left = e.clientX + 'px'
      menu.style.top = e.clientY + 'px'
      if (!w) {
        menu.innerHTML = '<button class="tl-ctx-item" onclick="this.closest(\'.tl-ctx-menu\').remove();createWorkspaceInUser()">+ Create Workspace</button>'
      } else if (w && !p) {
        menu.innerHTML = '<button class="tl-ctx-item" onclick="this.closest(\'.tl-ctx-menu\').remove();addProjectDirect(\'' + w.id + '\')">+ Add Project</button>'
      } else {
        return
      }
      document.body.appendChild(menu)
    })
  }
  const breadcrumb = document.getElementById('breadcrumb')
  const viewSwitcher = document.querySelector('.view-switcher')

  const b = state.selectedBoardId ? findBoard(state.selectedBoardId) : null
  const p = state.selectedProjectId ? findProject(state.selectedProjectId) : null
  const w = state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null
  const d = state.selectedDocumentId ? findDocument(state.selectedDocumentId) : null

  let bc = ''
  const canvasBoard = state.selectedCanvasId ? findCanvas(state.selectedCanvasId) : null
  if (!w) {
    bc = '<span class="bc-current">Workspaces</span>'
  } else {
    if (data.workspaces.length > 1) {
      bc += `<span class="bc-dropdown-wrap"><span class="bc-link" onclick="selectWorkspaceHome()">Workspaces</span><div class="bc-dropdown">`
      for (const ws of data.workspaces) {
        const wsClass = state.selectedWorkspaceId === ws.id ? 'bc-dropdown-item bc-dropdown-item-current' : 'bc-dropdown-item'
        bc += `<div class="${wsClass}" onclick="selectWorkspace('${ws.id}')">${escapeHtml(ws.name)}</div>`
      }
      bc += `</div></span>`
    } else {
      bc += `<span class="bc-link" onclick="selectWorkspaceHome()">Workspaces</span>`
    }
    bc += ` <span>›</span> `
    const wsItemClass = `bc-link${!p && !b && !d && !canvasBoard && !state.selectedDashboard ? ' bc-current' : ''}`
    if (w.projects.length > 1) {
      bc += `<span class="bc-dropdown-wrap"><span class="${wsItemClass}" onclick="selectWorkspace('${w.id}')">${escapeHtml(w.name)}</span><div class="bc-dropdown">`
      for (const proj of w.projects) {
        const projClass = state.selectedProjectId === proj.id ? 'bc-dropdown-item bc-dropdown-item-current' : 'bc-dropdown-item'
        bc += `<div class="${projClass}" onclick="selectProject('${proj.id}')">${escapeHtml(proj.name)}</div>`
      }
      bc += `</div></span>`
    } else {
      bc += `<span class="${wsItemClass}" onclick="selectWorkspace('${w.id}')">${escapeHtml(w.name)}</span>`
    }
  }
  if (p) bc += ` <span>›</span> `
  if (p) {
    const pjItemClass = `bc-link${!b && !d && !canvasBoard && !state.selectedDashboard ? ' bc-current' : ''}`
    if (w && w.projects.length > 1) {
      bc += `<span class="bc-dropdown-wrap"><span class="${pjItemClass}" onclick="selectProject('${p.id}')">${escapeHtml(p.name)}</span><div class="bc-dropdown">`
      for (const proj of w.projects) {
        const projClass = state.selectedProjectId === proj.id ? 'bc-dropdown-item bc-dropdown-item-current' : 'bc-dropdown-item'
        bc += `<div class="${projClass}" onclick="selectProject('${proj.id}')">${escapeHtml(proj.name)}</div>`
      }
      bc += `</div></span>`
    } else {
      bc += `<span class="${pjItemClass}" onclick="selectProject('${p.id}')">${escapeHtml(p.name)}</span>`
    }
  }
  if (b) bc += ` <span>›</span> <span class="bc-link${!d && !canvasBoard && !state.selectedDashboard ? ' bc-current' : ''}" onclick="selectBoard('${b.id}')">${escapeHtml(b.name)}</span>`
  if (d) bc += ` <span>›</span> <span class="bc-link${!canvasBoard && !state.selectedDashboard ? ' bc-current' : ''}" onclick="selectDocument('${d.id}')">${escapeHtml(d.name)}</span>`
  if (canvasBoard) bc += ` <span>›</span> <span class="bc-link${!state.selectedDashboard ? ' bc-current' : ''}" onclick="selectCanvas('${canvasBoard.id}')">${escapeHtml(canvasBoard.name)}</span>`
  if (state.selectedDashboard) bc += ` <span>›</span> <span class="bc-current">Dashboard</span>`
  breadcrumb.innerHTML = bc

  const canvasActive = state.selectedCanvasId !== null
  if (viewSwitcher) {
    viewSwitcher.style.display = b && !d && !state.selectedDashboard && !canvasActive ? 'flex' : 'none'
  }
  if (!canvasActive && isCanvasActive()) destroyCanvas()
  document.querySelectorAll('.view-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.view === state.selectedView)
  })

  renderFilterBar()

  const ioEl = document.getElementById('boardIO')
  if (ioEl) {
    if (b && w && !state.selectedDashboard && !state.selectedDocumentId && !state.selectedCanvasId) {
      ioEl.classList.remove('hidden')
    } else {
      ioEl.classList.add('hidden')
    }
  }

  const topbarEl = document.querySelector('.topbar')
  const saveMode = window.__getSaveMode ? window.__getSaveMode() : 'memory'

  if (!w && saveMode !== 'user') {
    if (topbarEl) topbarEl.style.display = 'none'
    destroyEditor()
    var hasStored = window.__hasStoredUserFile ? window.__hasStoredUserFile() : false
    var reconnectHtml = ''
    if (hasStored) {
      reconnectHtml = '<div class="onboarding-reconnect"><p class="onboarding-desc">Previously saved user file found. Reconnect to restore your data.</p><button class="btn-reconnect onboarding-btn" onclick="window.__reconnectUserFile()">Reconnect to User File</button></div>'
    } else {
      reconnectHtml = '<p class="onboarding-desc">Set up a user directory to store workspaces and projects across your device.</p>'
    }
    area.innerHTML =
      '<div class="onboarding">' +
      '<div class="onboarding-icon">' +
      '  <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#4f46e5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg>' +
      '</div>' +
      '<h1 class="onboarding-title">Welcome to Task Board</h1>' +
      reconnectHtml +
      '<div class="onboarding-actions">' +
      '  <button class="btn-create onboarding-btn" onclick="setupUserDirectory()">+ Set Up User File</button>' +
      '  <button class="btn-open onboarding-btn" onclick="openUserFile()">Open Existing User File</button>' +
      '</div>' +
      '</div>'
    return
  }

  if (!w && data.workspaces.length === 0 && saveMode === 'user') {
    if (topbarEl) topbarEl.style.display = ''
    destroyEditor()
    area.innerHTML =
      '<div class="page-view">' +
      '<div class="page-header"><div class="page-header-actions">' +
      '<button class="btn-create" onclick="createWorkspaceInUser()">+ Create Workspace</button>' +
      '<button class="btn-secondary" onclick="addExistingWorkspace()">Locate Workspace</button>' +
      '</div></div>' +
      '<div class="empty-state"><p>No workspaces yet. Create a new workspace or locate an existing one.</p></div>' +
      '</div>'
    return
  }

  if (!w && data.workspaces.length > 0 && saveMode === 'user') {
    if (topbarEl) topbarEl.style.display = ''
    destroyEditor()
    renderWorkspacesPage(area)
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

  if (p && canvasBoard) {
    destroyEditor()
    renderCanvasView(canvasBoard.id)
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
  if (state.selectedView === 'list') {
    destroyEditor()
    renderListView()
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

    const colColorStyle = col.color ? '--column-color:' + col.color + ';' : ''
    html += '<div class="board-column" draggable="true" data-column-id="' + col.id + '" style="' + colColorStyle + '">'
    html += '<div class="column-header" oncontextmenu="showColumnContextMenu(event,\'' + col.id + '\')">'
    html += '  <span ondblclick="startRenameColumn(event,\'' + col.id + '\')" id="colTitle-' + col.id + '">' + col.name + '</span>'
    html += '  <span class="col-count">' + countStr + '</span>'
    const sortState = _columnSortState.get(col.id)
    if (sortState && sortState.key) {
      const arrow = sortState.asc ? '▲' : '▼'
      html += '  <span class="col-sort-indicator" title="Sorted">' + arrow + '</span>'
    }
    html += '  <div class="col-menu" id="colMenu-' + col.id + '">'
    html += '    <button class="col-menu-item" onclick="closeAllColumnMenus();copyColumn(\'' + col.id + '\')">Copy</button>'
    html += '    <button class="col-menu-item" onclick="closeAllColumnMenus();pasteColumn(\'' + col.id + '\')">Paste</button>'
    html += '    <button class="col-menu-item" onclick="closeAllColumnMenus();duplicateColumn(\'' + col.id + '\')">Duplicate</button>'
    html += '    <div class="col-menu-sep"></div>'
    html += '    <div class="col-menu-item col-menu-sub-wrap">Sort<div class="col-menu-sort-submenu">' + getColumnSortSubmenuHtml(col.id) + '</div></div>'
    html += '    <div class="col-menu-sep"></div>'
    let colSwatches = ''
    for (const pc of PREDEFINED_COLORS) {
      colSwatches += '<button class="ps-color-swatch" data-color="' + pc.value + '" style="background:' + pc.value + '" onclick="event.stopPropagation();setColumnColor(\'' + col.id + '\',\'' + pc.value + '\');closeAllColumnMenus()"></button>'
    }
    colSwatches += '<button class="ps-color-swatch ps-color-none" onclick="event.stopPropagation();setColumnColor(\'' + col.id + '\',null);closeAllColumnMenus()" title="None">✕</button>'
    html += '    <div class="col-menu-item col-menu-sub-wrap">Set Color<div class="ps-color-submenu">' + colSwatches + '</div></div>'
    html += '    <div class="col-menu-sep"></div>'
    html += '    <button class="col-menu-item danger" onclick="closeAllColumnMenus();archiveColumn(\'' + col.id + '\')">Archive</button>'
    html += '  </div>'
    html += '</div>'
    html += '<div class="column-cards" data-col-id="' + col.id + '">'
    const cardsToRender = getSortedCards(col)
    for (const c of cardsToRender) {
      if (filteredCardIds && !filteredCardIds.has(c.id)) continue
      const completed = c.completed ? ' completed' : ''
      const checked = c.completed ? ' checked' : ''
      const cardColorStyle = c.color ? '--card-color:' + c.color + ';' : ''
      const barCfg = PRIORITY_BAR_CONFIG[c.priority] || PRIORITY_BAR_CONFIG.medium
      html += '<div class="card' + completed + '" draggable="true" data-card-id="' + c.id + '" style="' + cardColorStyle + '--card-priority-color:' + barCfg.color + ';">'
      html += '  <div class="card-check' + checked + '" onclick="event.stopPropagation();toggleCardCompleted(\'' + c.id + '\')"><div class="card-check-circle"><svg class="card-check-check" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>'
      html += '  <div class="card-body">'
      html += '    <div class="card-title" onclick="event.stopPropagation()" ondblclick="event.stopPropagation();startRenameCard(event,\'' + c.id + '\')" id="cardTitle-' + c.id + '">' + escapeHtml(c.title) + '</div>'
      if (c.description) html += '    <div class="card-desc">' + c.description + '</div>'
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
      if (c.members && c.members.length > 0) {
        let memberHtml = ''
        for (const m of c.members) {
          const mo = w && w.members ? w.members.find(wm => wm.name === m) : null
          if (mo) {
            const avatarUrl = getResolvedAvatar(mo)
            if (avatarUrl) {
              memberHtml += '<img class="card-member-avatar" src="' + avatarUrl + '">'
            } else {
              memberHtml += '<span class="card-member-avatar card-member-avatar-initials">' + getInitials(m) + '</span>'
            }
          }
        }
        if (memberHtml) html += '    <div class="card-members">' + memberHtml + '</div>'
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
    if (state.showArchived && b.archivedCards && b.archivedCards.length > 0) {
      const colArchivedCards = b.archivedCards.filter(ac => ac._archivedFromColId === col.id)
      if (colArchivedCards.length > 0) {
        html += '<div class="archived-separator">Archived</div>'
      }
      for (const ac of colArchivedCards) {
        const cardColorStyle = ac.color ? '--card-color:' + ac.color + ';' : ''
        const barCfg = PRIORITY_BAR_CONFIG[ac.priority] || PRIORITY_BAR_CONFIG.medium
        html += '<div class="card archived" draggable="false" data-card-id="' + ac.id + '" data-archived="true" style="' + cardColorStyle + '--card-priority-color:' + barCfg.color + ';">'
        html += '  <div class="card-body">'
        html += '    <div class="card-title" id="cardTitle-' + ac.id + '">' + escapeHtml(ac.title) + '</div>'
        if (ac.description) html += '    <div class="card-desc">' + ac.description + '</div>'
        if (ac.tags && ac.tags.length > 0) {
          html += '    <div class="card-tags">'
          for (const t of ac.tags) {
            const tagColor = getTagColor(t)
            html += '      <span class="card-tag" style="background:' + tagColor + '">' + escapeHtml(t) + '</span>'
          }
          html += '    </div>'
        }
        if (ac.checklists && ac.checklists.length > 0) {
          const total = countChecklistItems(ac.checklists)
          const done = countCompletedChecklistItems(ac.checklists)
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          html += '    <div class="card-cl-progress"><div class="card-cl-progress-bar" style="width:' + pct + '%;background:' + getProgressColor(pct) + '"></div></div>'
        }
        if (ac.members && ac.members.length > 0) {
          let memberHtml = ''
          for (const m of ac.members) {
            const mo = w && w.members ? w.members.find(wm => wm.name === m) : null
            if (mo) {
              const avatarUrl = getResolvedAvatar(mo)
              if (avatarUrl) {
                memberHtml += '<img class="card-member-avatar" src="' + avatarUrl + '">'
              } else {
                memberHtml += '<span class="card-member-avatar card-member-avatar-initials">' + getInitials(m) + '</span>'
              }
            }
          }
          if (memberHtml) html += '    <div class="card-members">' + memberHtml + '</div>'
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
  if (state.showArchived && b.archivedCards && b.archivedCards.length > 0) {
    const unplacedArchived = b.archivedCards.filter(ac => !ac._archivedFromColId || !b.columns.some(col => col.id === ac._archivedFromColId))
    if (unplacedArchived.length > 0) {
      html += '<div class="archived-section"><div class="archived-section-title">Archived (no column)</div>'
      for (const ac of unplacedArchived) {
        const cardColorStyle = ac.color ? '--card-color:' + ac.color + ';' : ''
        const barCfg = PRIORITY_BAR_CONFIG[ac.priority] || PRIORITY_BAR_CONFIG.medium
        html += '<div class="card archived" draggable="false" data-card-id="' + ac.id + '" data-archived="true" style="' + cardColorStyle + '--card-priority-color:' + barCfg.color + ';display:inline-block;width:260px;margin-right:8px;vertical-align:top">'
        html += '  <div class="card-body"><div class="card-title">' + escapeHtml(ac.title) + '</div></div>'
        html += '  <div class="card-priority">'
        for (let i = 0; i < 5; i++) {
          const filled = i < barCfg.filled ? ' filled' : ''
          html += '<div class="card-priority-bar' + filled + '" style="background:' + barCfg.color + ';color:' + barCfg.color + '"></div>'
        }
        html += '  </div>'
        html += '</div>'
      }
      html += '</div>'
    }
  }
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
        const isArchived = card.dataset.archived === 'true'

        if (isArchived) {
          let ctxHtml = '<button class="tl-ctx-item" onclick="event.stopPropagation();restoreCard(\'' + card.dataset.cardId + '\');this.closest(\'.tl-ctx-menu\').remove()">Restore</button>'
          ctxHtml += '<div class="tl-ctx-divider"></div>'
          ctxHtml += '<button class="tl-ctx-item tl-ctx-danger" onclick="event.stopPropagation();deleteCardPermanently(\'' + card.dataset.cardId + '\');this.closest(\'.tl-ctx-menu\').remove()">Delete Permanently</button>'
          menu.innerHTML = ctxHtml
          document.body.appendChild(menu)
          return
        }

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

        const currentBoardId = state.selectedBoardId
        const project = currentBoardId ? findProject(state.selectedProjectId) : null
        if (project && project.boards.length > 1) {
          let moveHtml = ''
          for (const brd of project.boards) {
            if (brd.id === currentBoardId || brd.columns.length === 0) continue
            let colHtml = ''
            for (const col of brd.columns) {
              colHtml += '<button class="tl-ctx-item" onclick="event.stopPropagation();moveCardToBoardColumn(\'' + card.dataset.cardId + '\',\'' + brd.id + '\',\'' + col.id + '\');this.closest(\'.tl-ctx-menu\').remove()">' + escapeHtml(col.name) + '</button>'
            }
            moveHtml += '<div class="tl-ctx-item tl-ctx-sub-wrap move-board-item">' + escapeHtml(brd.name) + '<div class="move-col-submenu">' + colHtml + '</div></div>'
          }
          if (moveHtml) {
            ctxHtml += '<div class="tl-ctx-item tl-ctx-sub-wrap">Move<div class="move-board-submenu">' + moveHtml + '</div></div>'
            ctxHtml += '<div class="tl-ctx-divider"></div>'
          }
        }

        ctxHtml += '<button class="tl-ctx-item tl-ctx-danger" data-action="archive">Archive</button>'
        menu.innerHTML = ctxHtml
        if (colId) menu.dataset.colId = colId
        
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
        
        document.body.appendChild(menu)
      }
    })
  }

}

function renderWorkspacesPage(area) {
  let html = '<div class="page-view">'
  html += '<div class="page-header"><div class="page-header-actions">'
  html += '<button class="btn-create" onclick="createWorkspaceInUser()">+ Create Workspace</button>'
  html += '<button class="btn-secondary" onclick="addExistingWorkspace()">Locate Workspace</button>'
  html += '</div></div>'

  if (data.workspaces.length === 0) {
    html += '<div class="empty-state"><p>No workspaces yet.</p></div>'
  } else {
    html += '<div class="page-grid">'
    for (const ws of data.workspaces) {
      var isLoaded = !ws._loadError
      var wsName = ws.name || 'Workspace'
      if (isLoaded) {
        const colorStyle = ws.color ? 'border-top:5px solid ' + ws.color + ';background:linear-gradient(180deg,' + ws.color + '25, #1e1e2e 100%);' : ''
        html += '<div class="page-card" ondblclick="selectWorkspace(\'' + ws.id + '\')" data-id="' + ws.id + '" oncontextmenu="event.preventDefault();event.stopPropagation();showWsCtxMenu(event,\'' + ws.id + '\')" style="' + colorStyle + '">'
        html += '<h3 id="workspaceTitle-' + ws.id + '" ondblclick="event.stopPropagation();startRenameWorkspace(\'' + ws.id + '\')">' + wsName + '</h3>'
        html += '<p class="count">' + (ws.projects ? ws.projects.length : 0) + ' project' + ((ws.projects ? ws.projects.length : 0) !== 1 ? 's' : '') + '</p>'
        html += '</div>'
      } else {
        html += '<div class="page-card page-card-unloaded" style="border-top:5px solid #555;opacity:0.7" oncontextmenu="event.preventDefault();event.stopPropagation();showWsCtxMenu(event,\'' + ws.id + '\')">'
        html += '<h3>' + wsName + '</h3>'
        html += '<p class="count" style="color:var(--text-dim)">Workspace folder not located</p>'
        html += '<button class="btn-secondary btn-sm" onclick="event.stopPropagation();window.locateWorkspaceFile(\'' + ws.id + '\')">Locate File</button>'
        html += '</div>'
      }
    }
    html += '</div>'
  }
  html += '</div>'
  area.innerHTML = html
  const cards = area.querySelectorAll('.page-card:not(.page-card-unloaded)')
  if (cards.length > 0) setupGrid(Array.from(cards))
}

function renderWorkspacePage(area, w) {
  let html = '<div class="page-view">'
  html += '<div class="page-header"><div class="page-header-actions">'
  html += '<button class="btn-create" onclick="addProjectDirect(\'' + w.id + '\')">+ New Project</button>'
  html += '<button class="btn-secondary" onclick="window.locateExistingProjectInWorkspace(\'' + w.id + '\')" title="Load an existing project from its folder">Locate Project</button>'
  html += '</div></div>'
  if (w.projects.length === 0) {
    html += '<div class="empty-state"><p>No projects yet. Create a new project or locate an existing one.</p></div>'
  } else {
    html += '<div class="page-grid">'
    for (const p of w.projects) {
      const count = p.boards.length
      const isLoaded = !p._loadError
      const colorStyle = p.color ? 'border-top:5px solid ' + p.color + ';background:linear-gradient(180deg,' + p.color + '25, #1e1e2e 100%);' : ''
      if (isLoaded) {
        html += '<div class="page-card" ondblclick="selectProject(\'' + p.id + '\')" data-id="' + p.id + '" oncontextmenu="event.preventDefault();event.stopPropagation();showProjectCtxMenu(event,\'' + p.id + '\')" style="' + colorStyle + '">'
        html += '<h3 id="projectTitle-' + p.id + '" ondblclick="event.stopPropagation();startRenameProject(\'' + p.id + '\')">' + p.name + '</h3>'
        html += '<p class="count">' + count + ' board' + (count !== 1 ? 's' : '') + '</p>'
        html += '</div>'
      } else {
        html += '<div class="page-card page-card-unloaded" style="border-top:5px solid #555;opacity:0.7" oncontextmenu="event.preventDefault();event.stopPropagation();showProjectCtxMenu(event,\'' + p.id + '\')">'
        html += '<h3>' + p.name + '</h3>'
        html += '<p class="count" style="color:var(--text-dim)">Project folder not located</p>'
        html += '<button class="btn-secondary btn-sm" onclick="event.stopPropagation();window.locateProjectFolder(\'' + p.id + '\')">Locate Folder</button>'
        html += '</div>'
      }
    }
    html += '</div>'
  }
  html += '</div>'
  area.innerHTML = html
  const cards = area.querySelectorAll('.page-card:not(.page-card-unloaded)')
  if (cards.length > 0) setupGrid(Array.from(cards))
}

export function selectWorkspaceHome() {
  state.selectedWorkspaceId = null
  state.selectedProjectId = null
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  const f = state.filters
  f.search = ''; f.members = []; f.tags = []; f.priority = []
  f.startDateFrom = ''; f.startDateTo = ''; f.endDateFrom = ''; f.endDateTo = ''; f.completed = 'all'
  render()
}

const WORKSPACE_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#78716c','#a1a1aa']

export function showWsCtxMenu(e, workspaceId) {
  e.preventDefault()
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'

  let colorSwatches = ''
  for (const c of WORKSPACE_COLORS) {
    colorSwatches += '<button class="ps-color-swatch" data-color="' + c + '" style="background:' + c + '" onclick="event.stopPropagation();setWorkspaceColor(\'' + workspaceId + '\',\'' + c + '\');this.closest(\'.tl-ctx-menu\').remove()"></button>'
  }
  colorSwatches += '<button class="ps-color-swatch ps-color-none" onclick="event.stopPropagation();setWorkspaceColor(\'' + workspaceId + '\',null);this.closest(\'.tl-ctx-menu\').remove()" title="None">✕</button>'

  menu.innerHTML =
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();selectWorkspace(\'' + workspaceId + '\')">Open</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();addProjectDirect(\'' + workspaceId + '\')">+ Add Project</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();startRenameWorkspace(\'' + workspaceId + '\')">Rename</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<div class="tl-ctx-item tl-ctx-sub-wrap">Set Color<div class="ps-color-submenu">' + colorSwatches + '</div></div>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();window.__showWorkspaceInPicker(\'' + workspaceId + '\')">Show in file picker</button>' +
    (state.selectedWorkspaceId !== workspaceId ? '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item tl-ctx-danger" onclick="closeAllColumnMenus();deleteWorkspace(\'' + workspaceId + '\')">Delete Workspace</button>' : '')
  
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
    '<button class="tl-ctx-item tl-ctx-danger" onclick="closeAllColumnMenus();archiveProject(\'' + projectId + '\')">Archive</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();window.__showProjectInPicker(\'' + projectId + '\')">Show in file picker</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item tl-ctx-danger" onclick="closeAllColumnMenus();deleteProject(\'' + projectId + '\')">Delete Project</button>'
  
  document.body.appendChild(menu)
}

function renderProjectPage(area) {
  area.innerHTML = '<div class="empty-state"><p>Select a board or document from the sidebar</p></div>'
}

export async function renderDocumentView(documentId) {
  const doc = findDocument(documentId)
  if (!doc) return
  await renderDocument(documentId)
}
