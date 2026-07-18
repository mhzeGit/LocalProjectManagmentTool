import { state, findProject } from './data.js'
import { openModal } from './modal.js'
import { renderBoard, renderDocumentView } from './board.js'
import { initDragDrop } from './dragdrop.js'
import { renderMemberBar } from './members.js'

export function render() {
  const sidebarEl = document.getElementById('sidebar')
  if (state.selectedProjectId) {
    sidebarEl.classList.remove('hidden')
  } else {
    sidebarEl.classList.add('hidden')
  }

  const title = document.getElementById('sidebarTitle')
  if (state.selectedProjectId && state.selectedWorkspaceId) {
    const p = findProject(state.selectedProjectId)
    title.textContent = p ? p.name : 'Select a project'
    title.onclick = function() { selectWorkspace(state.selectedWorkspaceId) }
    title.classList.add('clickable')
  } else {
    title.textContent = 'Task Board'
    title.onclick = null
    title.classList.remove('clickable')
  }

  const sidebar = document.getElementById('sidebarContent')

  if (!state.selectedProjectId) {
    sidebar.innerHTML = '<div class="sidebar-hint">Select a project to view boards</div>'
    renderBoard()
    renderMemberBar()
    return
  }

  const p = findProject(state.selectedProjectId)
  if (!p) {
    sidebar.innerHTML = ''
    renderBoard()
    renderMemberBar()
    return
  }

  let html = '<div class="section-title"><span>Task Boards</span><span class="btn-add-board" onclick="toggleAddBoardMenu(event,\'' + p.id + '\')">+</span></div>'
  for (const b of p.boards) {
    const active = state.selectedBoardId === b.id ? ' active' : ''
    html += `<div class="nav-child${active}" onclick="selectBoard('${b.id}')">
      <span class="name">${b.name}</span>
      <button class="btn-del" onclick="event.stopPropagation();deleteBoard('${b.id}')">✕</button>
    </div>`
  }
  const docs = p.documents || []
  html += '<div class="section-title" style="margin-top:12px"><span>Documents</span><span class="btn-add-board" onclick="event.stopPropagation();openModal(\'document\',\'' + p.id + '\')">+</span></div>'
  for (const d of docs) {
    const active = state.selectedDocumentId === d.id ? ' active' : ''
    html += `<div class="nav-child${active}" onclick="selectDocument('${d.id}')">
      <span class="name">${d.name}</span>
      <button class="btn-del" onclick="event.stopPropagation();deleteDocument('${d.id}')">✕</button>
    </div>`
  }
  sidebar.innerHTML = html
  renderBoard()
  initDragDrop(render)
  renderMemberBar()
  if (window.__autoSave) window.__autoSave()
}

export function selectWorkspace(id) {
  state.selectedWorkspaceId = id
  state.selectedProjectId = null
  state.selectedBoardId = null
  state.selectedDocumentId = null
  render()
}

export function selectProject(id) {
  state.selectedProjectId = id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  render()
}

export function selectBoard(id) {
  state.selectedBoardId = id
  state.selectedDocumentId = null
  render()
}

export function selectDocument(id) {
  state.selectedDocumentId = id
  state.selectedBoardId = null
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
  menu.innerHTML = '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'board\',\'' + projectId + '\')">Task Board</button>'
  menu.addEventListener('mouseleave', function() { menu.remove() })
  document.body.appendChild(menu)
}
