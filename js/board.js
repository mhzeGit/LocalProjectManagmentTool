import { state, findBoard, findProject, findWorkspace } from './data.js'
import { escapeHtml, getProgressColor } from './utils.js'
import { showColumnContextMenu } from './columnMenu.js'
import { startRenameColumn, startRenameCard } from './inlineEdit.js'
import { renderTimeline } from './timeline.js'
import { wasRightDragged } from './dragscroll.js'

export function switchView(view) {
  state.selectedView = view
  renderBoard()
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view)
  })
}

export function renderBoard() {
  const area = document.getElementById('boardArea')
  const breadcrumb = document.getElementById('breadcrumb')

  const b = state.selectedBoardId ? findBoard(state.selectedBoardId) : null
  const p = state.selectedProjectId ? findProject(state.selectedProjectId) : null
  const w = state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null

  let bc = ''
  if (w) bc += w.name
  if (p) bc += ' <span>›</span> ' + p.name
  if (b) bc += ' <span>›</span> ' + b.name
  breadcrumb.innerHTML = bc || 'Select a board'

  if (!b) {
    area.innerHTML = '<div class="empty-state"><p>' + (w ? 'Select a board from the sidebar' : 'Select or create a workspace to get started') + '</p></div>'
    return
  }

  if (state.selectedView === 'timeline') {
    renderTimeline()
    return
  }
  if (state.selectedView === 'calendar') {
    area.innerHTML = '<div class="empty-state"><p>Calendar view — coming soon</p></div>'
    return
  }

  let html = '<div class="board-columns">'
  for (const col of b.columns) {
    html += '<div class="board-column" draggable="true" data-column-id="' + col.id + '">'
    html += '<div class="column-header" oncontextmenu="showColumnContextMenu(event,\'' + col.id + '\')">'
    html += '  <span ondblclick="startRenameColumn(event,\'' + col.id + '\')" id="colTitle-' + col.id + '">' + col.name + '</span>'
    html += '  <span class="col-count">' + col.cards.length + '</span>'
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
      const completed = c.completed ? ' completed' : ''
      const checked = c.completed ? ' checked' : ''
      html += '<div class="card' + completed + '" draggable="true" data-card-id="' + c.id + '">'
      html += '  <div class="card-check' + checked + '" onclick="event.stopPropagation();toggleCardCompleted(\'' + c.id + '\')"><div class="card-check-circle"><svg class="card-check-check" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>'
      html += '  <div class="card-body">'
      html += '    <div class="card-title" ondblclick="event.stopPropagation();startRenameCard(event,\'' + c.id + '\')" id="cardTitle-' + c.id + '">' + escapeHtml(c.title) + '</div>'
      if (c.description) html += '    <div class="card-desc">' + escapeHtml(c.description) + '</div>'
      if (c.checklists && c.checklists.length > 0) {
        const completedCount = c.checklists.filter(function(item) { return item.completed }).length
        const pct = Math.round((completedCount / c.checklists.length) * 100)
        const done = completedCount === c.checklists.length ? ' done' : ''
        html += '    <div class="card-cl-progress' + done + '"><div class="card-cl-progress-bar" style="width:' + pct + '%;background:' + getProgressColor(pct) + '"></div></div>'
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
        let ctxHtml = '<button class="tl-ctx-item" data-action="copy">Copy</button>'
        ctxHtml += '<button class="tl-ctx-item" data-action="duplicate">Duplicate</button>'
        if (window.getCopiedCard && window.getCopiedCard()) {
          ctxHtml += '<button class="tl-ctx-item" data-action="paste">Paste</button>'
        }
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
