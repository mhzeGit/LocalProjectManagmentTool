import { data, state, findWorkspace, findProject } from './data.js'
import { openModal } from './modal.js'
import { renderBoard } from './board.js'
import { initDragDrop } from './dragdrop.js'

export function render() {
  const sidebar = document.getElementById('sidebarContent')
  let html = '<div class="section-title">Workspaces</div>'
  for (const w of data.workspaces) {
    const isOpen = state.selectedWorkspaceId === w.id
    html += `<div class="nav-item ${isOpen ? 'active' : ''}" onclick="selectWorkspace('${w.id}')">
      <span class="arrow ${isOpen ? 'open' : ''}">▶</span>
      <span>${w.name}</span>
      <button class="btn-del" onclick="event.stopPropagation();deleteWorkspace('${w.id}')">✕</button>
    </div>`
    if (isOpen) {
      html += '<div class="nav-children open">'
      for (const p of w.projects) {
        const isProjectOpen = state.selectedProjectId === p.id
        html += `<div class="nav-item ${isProjectOpen ? 'active' : ''}" style="padding-left:32px;font-size:13px;" onclick="selectProject('${p.id}')">
          <span class="arrow ${isProjectOpen ? 'open' : ''}">▶</span>
          <span>${p.name}</span>
          <button class="btn-del" onclick="event.stopPropagation();deleteProject('${p.id}')">✕</button>
        </div>`
        if (isProjectOpen) {
          html += '<div class="nav-children open">'
          for (const b of p.boards) {
            const isBoardActive = state.selectedBoardId === b.id
            html += `<div class="nav-child ${isBoardActive ? 'active' : ''}" onclick="selectBoard('${b.id}')">
              <span class="name">${b.name}</span>
              <button class="btn-del" onclick="event.stopPropagation();deleteBoard('${b.id}')">✕</button>
            </div>`
          }
          html += `<div class="nav-add" onclick="openModal('board','${p.id}')">+ Add board</div>`
          html += '</div>'
        }
      }
      html += `<div class="nav-add" onclick="openModal('project','${w.id}')">+ Add project</div>`
      html += '</div>'
    }
  }
  sidebar.innerHTML = html
  renderBoard()
  initDragDrop(render)
}

export function selectWorkspace(id) {
  if (state.selectedWorkspaceId === id) { state.selectedWorkspaceId = null; state.selectedProjectId = null; state.selectedBoardId = null }
  else {
    state.selectedWorkspaceId = id
    state.selectedProjectId = null
    state.selectedBoardId = null
  }
  render()
}

export function selectProject(id) {
  if (state.selectedProjectId === id) { state.selectedProjectId = null; state.selectedBoardId = null }
  else {
    state.selectedProjectId = id
    state.selectedBoardId = null
  }
  render()
}

export function selectBoard(id) {
  state.selectedBoardId = id
  render()
}
