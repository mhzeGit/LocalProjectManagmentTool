import { data, state, genId, findWorkspace, findProject, findBoard, findColumn, findCard, findCardColumn, findDocument } from './data.js'
import { render } from './sidebar.js'
import { closeModal } from './modal.js'

export function createWorkspace() {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  data.workspaces.push({ id: genId(), name, members: [], tags: [], projects: [] })
  closeModal()
  state.selectedWorkspaceId = data.workspaces[data.workspaces.length - 1].id
  state.selectedProjectId = null
  state.selectedBoardId = null
  render()
  if (!state.selfMemberId) {
    setTimeout(() => window.openPreferences('members'), 100)
  }
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

let _copiedColumn = null

export function copyColumn(id) {
  const col = findColumn(id)
  if (!col) return
  _copiedColumn = JSON.parse(JSON.stringify(col))
  delete _copiedColumn.id
}

export function pasteColumn(id) {
  if (!_copiedColumn) return
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      for (const b of p.boards) {
        const idx = b.columns.findIndex(c => c.id === id)
        if (idx !== -1) {
          const newCol = JSON.parse(JSON.stringify(_copiedColumn))
          newCol.id = genId()
          newCol.cards.forEach(c => { c.id = genId() })
          b.columns.splice(idx + 1, 0, newCol)
          render()
          return
        }
      }
    }
  }
}

export function pasteColumnToBoard(boardId) {
  if (!_copiedColumn) return
  const b = findBoard(boardId)
  if (!b) return
  const newCol = JSON.parse(JSON.stringify(_copiedColumn))
  newCol.id = genId()
  newCol.cards.forEach(c => { c.id = genId() })
  b.columns.push(newCol)
  render()
}

export function duplicateColumn(id) {
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      for (const b of p.boards) {
        const idx = b.columns.findIndex(c => c.id === id)
        if (idx !== -1) {
          const orig = b.columns[idx]
          const newCol = JSON.parse(JSON.stringify(orig))
          newCol.id = genId()
          newCol.name = orig.name + ' (copy)'
          newCol.cards.forEach(c => { c.id = genId() })
          b.columns.splice(idx + 1, 0, newCol)
          render()
          return
        }
      }
    }
  }
}

export function archiveColumn(id) {
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      for (const b of p.boards) {
        const idx = b.columns.findIndex(c => c.id === id)
        if (idx !== -1) {
          const col = b.columns[idx]
          if (!b.archivedCards) b.archivedCards = []
          b.archivedCards.push(...col.cards)
          b.columns.splice(idx, 1)
          render()
          return
        }
      }
    }
  }
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
  const col = findColumn(columnId)
  if (!col) return
  const cardData = collectCardForm()
  if (!cardData.title) return
  cardData.id = genId()
  cardData.completed = false
  col.cards.push(cardData)
  closeModal()
  render()
}

export function saveCard(cardId) {
  const c = findCard(cardId)
  if (!c) return
  const data = collectCardForm()
  if (!data.title) return
  c.title = data.title
  c.description = data.description
  c.startDate = data.startDate
  c.endDate = data.endDate
  c.priority = data.priority
  c.tags = data.tags
  c.members = data.members
  c.checklists = data.checklists
  closeModal()
  render()
}

function collectCardForm() {
  const title = (document.getElementById('cd-title')?.value || '').trim()
  const description = document.getElementById('cd-desc')?.value?.trim() || ''
  const startDate = document.getElementById('cd-start')?.value || null
  const endDate = document.getElementById('cd-end')?.value || null
  const priority = document.getElementById('cd-priority')?.value || '3'

  const tags = []
  document.querySelectorAll('#cd-tags .cd-chip[data-type="tag"]').forEach(el => {
    const text = el.dataset.value || (el.childNodes[0]?.nodeValue?.trim())
    if (text) tags.push(text)
  })

  const members = []
  document.querySelectorAll('#cd-members .cd-chip[data-type="member"]').forEach(el => {
    const text = el.childNodes[0]?.nodeValue?.trim()
    if (text) members.push(text)
  })

  const checklists = []
  function collectChildren(container) {
    const items = []
    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i]
      if (!child.matches('.cd-checklist-item')) continue
      const textEl = child.querySelector(':scope > .cd-cl-text')
      const cb = child.querySelector(':scope > .cd-cl-checkbox input[type="checkbox"]')
      const childrenEl = child.querySelector(':scope > .cd-cl-children')
      if (textEl && cb) {
        const text = textEl.textContent.trim()
        if (text) {
          const item = { text, completed: cb.checked }
          if (childrenEl && childrenEl.children.length > 0) {
            item.items = collectChildren(childrenEl)
          }
          items.push(item)
        }
      }
    }
    return items
  }
  const clContainer = document.getElementById('cd-checklist')
  if (clContainer) {
    checklists.push(...collectChildren(clContainer))
  }

  return { title, description, startDate, endDate, priority, tags, members, checklists }
}

let _copiedCard = null

export function copyCard(cardId) {
  const card = findCard(cardId)
  if (!card) return
  _copiedCard = JSON.parse(JSON.stringify(card))
}

export function getCopiedCard() {
  return _copiedCard
}

export function duplicateCard(cardId) {
  const card = findCard(cardId)
  if (!card) return
  const srcCol = findCardColumn(card.id)
  if (!srcCol) return
  const dup = JSON.parse(JSON.stringify(card))
  dup.id = genId()
  srcCol.cards.push(dup)
  render()
}

export function pasteIntoColumn(columnId) {
  if (!_copiedCard) return
  const col = findColumn(columnId)
  if (!col) return
  const pasteData = JSON.parse(JSON.stringify(_copiedCard))
  pasteData.id = genId()
  pasteData.startDate = null
  pasteData.endDate = null
  col.cards.push(pasteData)
  render()
}

export function pasteCard(cardId) {
  if (!_copiedCard) return
  const card = findCard(cardId)
  if (!card) return
  const srcCol = findCardColumn(card.id)
  if (!srcCol) return
  const pasteData = JSON.parse(JSON.stringify(_copiedCard))
  pasteData.id = genId()
  pasteData.startDate = null
  pasteData.endDate = null
  srcCol.cards.push(pasteData)
  render()
}

export function archiveCard(cardId) {
  const card = findCard(cardId)
  if (!card) return
  const srcCol = findCardColumn(card.id)
  if (!srcCol) return
  const idx = srcCol.cards.indexOf(card)
  if (idx === -1) return
  srcCol.cards.splice(idx, 1)
  const b = findBoard(state.selectedBoardId)
  if (b) {
    if (!b.archivedCards) b.archivedCards = []
    b.archivedCards.push(card)
  }
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

export function addProjectDirect(workspaceId) {
  const w = findWorkspace(workspaceId)
  if (!w) return
  const project = { id: genId(), name: 'New Project', boards: [] }
  w.projects.push(project)
  render()
  requestAnimationFrame(() => {
    const span = document.getElementById('projectTitle-' + project.id)
    if (span) span.dispatchEvent(new Event('dblclick'))
  })
}

export function addCardDirect(columnId) {
  const col = findColumn(columnId)
  if (!col) return
  const card = { id: genId(), title: 'New Card', description: '', completed: false, startDate: null, endDate: null, priority: '3', tags: [], members: [], checklists: [] }
  col.cards.push(card)
  render()
  requestAnimationFrame(() => {
    const span = document.getElementById('cardTitle-' + card.id)
    if (span) span.dispatchEvent(new Event('dblclick'))
  })
}

export function archiveProject(id) {
  for (const w of data.workspaces) {
    const idx = w.projects.findIndex(p => p.id === id)
    if (idx === -1) continue
    const p = w.projects[idx]
    if (!w.archivedProjects) w.archivedProjects = []
    w.archivedProjects.push(p)
    w.projects.splice(idx, 1)
    if (state.selectedProjectId === id) {
      state.selectedProjectId = null
      state.selectedBoardId = null
    }
    render()
    return
  }
}

export function setProjectColor(id, color) {
  for (const w of data.workspaces) {
    const p = w.projects.find(pj => pj.id === id)
    if (!p) continue
    p.color = color || null
    render()
    return
  }
}

export function createDocument(projectId) {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  const p = findProject(projectId)
  if (!p) return
  if (!p.documents) p.documents = []
  const doc = { id: genId(), name, content: '<h1>' + name + '</h1><p></p>' }
  p.documents.push(doc)
  closeModal()
  state.selectedDocumentId = doc.id
  state.selectedBoardId = null
  render()
}

export function deleteDocument(id) {
  if (!confirm('Delete this document?')) return
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      if (!p.documents) continue
      const idx = p.documents.findIndex(d => d.id === id)
      if (idx !== -1) {
        p.documents.splice(idx, 1)
        if (state.selectedDocumentId === id) {
          state.selectedDocumentId = p.documents.length > 0 ? p.documents[0].id : null
        }
        render()
        return
      }
    }
  }
}

export function saveDocumentContent(documentId, html) {
  const d = findDocument(documentId)
  if (d) d.content = html
}

export function renameDocument(id, name) {
  const d = findDocument(id)
  if (d) { d.name = name; render() }
}

export function copyProject(id) {
  for (const w of data.workspaces) {
    const idx = w.projects.findIndex(p => p.id === id)
    if (idx === -1) continue
    const orig = w.projects[idx]
    const copy = JSON.parse(JSON.stringify(orig))
    copy.id = genId()
    copy.name = orig.name + ' (copy)'
    copy.boards.forEach(b => { b.id = genId(); b.columns.forEach(c => { c.id = genId(); c.cards.forEach(cd => cd.id = genId()) }) })
    if (copy.documents) copy.documents.forEach(d => { d.id = genId() })
    w.projects.splice(idx + 1, 0, copy)
    render()
    return
  }
}
