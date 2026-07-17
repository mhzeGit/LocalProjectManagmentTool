import { state, findBoard, findProject, findWorkspace } from './data.js'
import { escapeHtml } from './utils.js'
import { toggleColumnMenu } from './columnMenu.js'
import { startRenameColumn, startRenameCard } from './inlineEdit.js'

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

  let html = '<div class="board-columns">'
  for (const col of b.columns) {
    html += '<div class="board-column" draggable="true" data-column-id="' + col.id + '">'
    html += '<div class="column-header">'
    html += '  <span ondblclick="startRenameColumn(event,\'' + col.id + '\')" id="colTitle-' + col.id + '">' + col.name + '</span>'
    html += '  <div style="position:relative;">'
    html += '    <button class="col-menu-btn" onclick="event.stopPropagation();toggleColumnMenu(\'' + col.id + '\')">⋮</button>'
    html += '    <div class="col-menu" id="colMenu-' + col.id + '">'
    html += '      <button class="col-menu-item danger" onclick="event.stopPropagation();deleteColumn(\'' + col.id + '\')">Delete</button>'
    html += '    </div>'
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
      html += '  </div>'
      html += '</div>'
    }
    html += '</div>'
    html += '<div class="column-footer">'
    html += '  <button class="btn-add-card" onclick="addCardDirect(\'' + col.id + '\')">+ Add a card</button>'
    html += '</div></div>'
  }
  html += '<div class="board-column add-column" onclick="addColumnDirect(\'' + b.id + '\')">'
  html += '  <span style="color:#888;font-size:13px;">+ Add Another Column</span>'
  html += '</div>'
  html += '</div>'
  area.innerHTML = html
}
