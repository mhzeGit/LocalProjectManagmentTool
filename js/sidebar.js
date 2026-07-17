import { state, findProject } from './data.js'
import { openModal } from './modal.js'
import { renderBoard } from './board.js'
import { initDragDrop } from './dragdrop.js'

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
    return
  }

  const p = findProject(state.selectedProjectId)
  if (!p) {
    sidebar.innerHTML = ''
    renderBoard()
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
