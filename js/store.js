import { data, state, genId, findWorkspace, findProject, findBoard, findColumn, findCard, findCardColumn } from './data.js'
import { render } from './sidebar.js'
import { closeModal } from './modal.js'

export function createWorkspace() {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  data.workspaces.push({ id: genId(), name, projects: [] })
  closeModal()
  state.selectedWorkspaceId = data.workspaces[data.workspaces.length - 1].id
  state.selectedProjectId = null
  state.selectedBoardId = null
  render()
}

export function deleteWorkspace(id) {
  if (!confirm('Delete this workspace and everything inside?')) return
  const idx = data.workspaces.findIndex(w => w.id === id)
  if (idx === -1) return
  data.workspaces.splice(idx, 1)
  if (state.selectedWorkspaceId === id) {
    state.selectedWorkspaceId = data.workspaces.length > 0 ? data.workspaces[0].id : null
    state.selectedProjectId = null
    state.selectedBoardId = null
  }
  render()
}

export function createProject(workspaceId) {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  const w = findWorkspace(workspaceId)
  if (!w) return
  w.projects.push({ id: genId(), name, boards: [] })
  closeModal()
  state.selectedProjectId = w.projects[w.projects.length - 1].id
  state.selectedBoardId = null
  render()
}

export function deleteProject(id) {
  if (!confirm('Delete this project and everything inside?')) return
  for (const w of data.workspaces) {
    const idx = w.projects.findIndex(p => p.id === id)
    if (idx !== -1) {
      w.projects.splice(idx, 1)
      if (state.selectedProjectId === id) {
        state.selectedProjectId = w.projects.length > 0 ? w.projects[0].id : null
        state.selectedBoardId = null
      }
      render()
      return
    }
  }
}

export function createBoard(projectId) {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  const p = findProject(projectId)
  if (!p) return
  p.boards.push({ id: genId(), name, columns: [] })
  closeModal()
  state.selectedBoardId = p.boards[p.boards.length - 1].id
  render()
}

export function deleteBoard(id) {
  if (!confirm('Delete this board and all its columns and cards?')) return
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      const idx = p.boards.findIndex(b => b.id === id)
      if (idx !== -1) {
        p.boards.splice(idx, 1)
        if (state.selectedBoardId === id) {
          state.selectedBoardId = p.boards.length > 0 ? p.boards[0].id : null
        }
        render()
        return
      }
    }
  }
}

export function addColumnDirect(boardId) {
  const b = findBoard(boardId)
  if (!b) return
  const col = { id: genId(), name: 'New Column', cards: [] }
  b.columns.push(col)
  render()
  requestAnimationFrame(() => {
    const span = document.getElementById('colTitle-' + col.id)
    if (span) span.dispatchEvent(new Event('dblclick'))
  })
}

export function deleteColumn(id) {
  if (!confirm('Delete this column and all its cards?')) return
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      for (const b of p.boards) {
        const idx = b.columns.findIndex(c => c.id === id)
        if (idx !== -1) { b.columns.splice(idx, 1); render(); return }
      }
    }
  }
}

export function createCard(columnId) {
  const title = document.getElementById('modalInput').value.trim()
  const desc = document.getElementById('modalTextarea').value.trim()
  if (!title) return
  const col = findColumn(columnId)
  if (!col) return
  col.cards.push({ id: genId(), title, description: desc, completed: false })
  closeModal()
  render()
}

export function saveCard(cardId) {
  const c = findCard(cardId)
  if (!c) return
  const title = document.getElementById('modalInput').value.trim()
  const desc = document.getElementById('modalTextarea').value.trim()
  if (!title) return
  c.title = title
  c.description = desc
  closeModal()
  render()
}

export function deleteCard(cardId) {
  if (!confirm('Delete this card?')) return
  const col = findCardColumn(cardId)
  if (!col) return
  const idx = col.cards.findIndex(c => c.id === cardId)
  if (idx !== -1) { col.cards.splice(idx, 1); closeModal(); render() }
}

export function toggleCardCompleted(cardId) {
  const c = findCard(cardId)
  if (!c) return
  c.completed = !c.completed
  render()
}

export function addCardDirect(columnId) {
  const col = findColumn(columnId)
  if (!col) return
  const card = { id: genId(), title: 'New Card', description: '', completed: false }
  col.cards.push(card)
  render()
  requestAnimationFrame(() => {
    const span = document.getElementById('cardTitle-' + card.id)
    if (span) span.dispatchEvent(new Event('dblclick'))
  })
}
