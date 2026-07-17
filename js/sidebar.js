import { data, state, findWorkspace, findProject } from './data.js'
import { openModal } from './modal.js'
import { renderBoard } from './board.js'
import { initDragDrop } from './dragdrop.js'

function updateDropdowns() {
  const wsSelect = document.getElementById('workspaceSelect')
  const projSelect = document.getElementById('projectSelect')
  if (!wsSelect || !projSelect) return

  let wsHtml = '<option value="">Select Workspace...</option>'
  for (const w of data.workspaces) {
    const sel = w.id === state.selectedWorkspaceId ? ' selected' : ''
    wsHtml += `<option value="${w.id}"${sel}>${w.name}</option>`
  }
  wsSelect.innerHTML = wsHtml

  const w = state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null
  let projHtml = '<option value="">Select Project...</option>'
  if (w) {
    for (const p of w.projects) {
      const sel = p.id === state.selectedProjectId ? ' selected' : ''
      projHtml += `<option value="${p.id}"${sel}>${p.name}</option>`
    }
  }
  projSelect.innerHTML = projHtml
}

export function render() {
  updateDropdowns()

  const sidebar = document.getElementById('sidebarContent')

  if (!state.selectedProjectId) {
    sidebar.innerHTML = '<div class="sidebar-hint">Select a project to view boards</div>'
    renderBoard()
    return
  }

  const p = findProject(state.selectedProjectId)
  if (!p) {
    sidebar.innerHTML = ''
    renderBoard()
    return
  }

  let html = '<div class="section-title">Task Boards</div>'
  for (const b of p.boards) {
    const active = state.selectedBoardId === b.id ? ' active' : ''
    html += `<div class="nav-child${active}" onclick="selectBoard('${b.id}')">
      <span class="name">${b.name}</span>
      <button class="btn-del" onclick="event.stopPropagation();deleteBoard('${b.id}')">✕</button>
    </div>`
  }
  html += `<div class="nav-add" onclick="openModal('board','${p.id}')">+ Add board</div>`
  sidebar.innerHTML = html
  renderBoard()
  initDragDrop(render)
}

export function selectWorkspace(id) {
  state.selectedWorkspaceId = id
  state.selectedProjectId = null
  state.selectedBoardId = null
  render()
}

export function selectProject(id) {
  state.selectedProjectId = id
  state.selectedBoardId = null
  render()
}

export function selectBoard(id) {
  state.selectedBoardId = id
  render()
}

export function onWorkspaceChange(value) {
  if (!value) {
    state.selectedWorkspaceId = null
    state.selectedProjectId = null
    state.selectedBoardId = null
  } else {
    state.selectedWorkspaceId = value
    state.selectedProjectId = null
    state.selectedBoardId = null
  }
  render()
}

export function onProjectChange(value) {
  if (!value) {
    state.selectedProjectId = null
    state.selectedBoardId = null
  } else {
    state.selectedProjectId = value
    state.selectedBoardId = null
  }
  render()
}
