import { data, state, genId, findWorkspace, findProject, findBoard, findColumn, findCard, findCardColumn, findDocument, findCanvas } from './data.js'
import { render } from './sidebar.js'
import { closeModal } from './modal.js'
import { pushCommand } from './history.js'

let _closeWorkspaceFn = null

export function setCloseWorkspaceFn(fn) {
  _closeWorkspaceFn = fn
}

export function createWorkspace() {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  let w = data.workspaces[0]
  const isNew = !w
  if (w) {
    const oldName = w.name
    w.name = name
    closeModal()
    state.selectedWorkspaceId = w.id
    state.selectedProjectId = null
    state.selectedBoardId = null
    render()
    pushCommand({
      undo() { w.name = oldName; render() },
      redo() { w.name = name; render() },
      description: 'Rename Workspace'
    })
  } else {
    w = { id: genId(), name, members: [], tags: [], projects: [] }
    data.workspaces.push(w)
    closeModal()
    state.selectedWorkspaceId = w.id
    state.selectedProjectId = null
    state.selectedBoardId = null
    render()
    pushCommand({
      undo() {
        const idx = data.workspaces.findIndex(x => x.id === w.id)
        if (idx !== -1) data.workspaces.splice(idx, 1)
        state.selectedWorkspaceId = data.workspaces.length > 0 ? data.workspaces[0].id : null
        state.selectedProjectId = null; state.selectedBoardId = null
      },
      redo() { data.workspaces.push(w); state.selectedWorkspaceId = w.id; state.selectedProjectId = null; state.selectedBoardId = null },
      description: 'Create Workspace'
    })
  }
  if (!state.selfMemberId) {
    setTimeout(() => window.openPreferences('members'), 100)
  }
}

export function deleteWorkspace(id) {
  if (!confirm('Delete this workspace and all its project references?')) return
  if (_closeWorkspaceFn) {
    _closeWorkspaceFn()
  } else {
    const idx = data.workspaces.findIndex(w => w.id === id)
    if (idx === -1) return
    const removed = data.workspaces[idx]
    data.workspaces.splice(idx, 1)
    const prevSelected = state.selectedWorkspaceId
    state.selectedWorkspaceId = null
    state.selectedProjectId = null
    state.selectedBoardId = null
    render()
    pushCommand({
      undo() { data.workspaces.splice(idx, 0, removed); if (prevSelected) state.selectedWorkspaceId = prevSelected },
      redo() {
        const ri = data.workspaces.findIndex(x => x.id === removed.id)
        if (ri !== -1) data.workspaces.splice(ri, 1)
        state.selectedWorkspaceId = data.workspaces.length > 0 ? data.workspaces[0].id : null
        state.selectedProjectId = null; state.selectedBoardId = null
      },
      description: 'Delete Workspace'
    })
  }
}

export function createProject(workspaceId) {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  const w = findWorkspace(workspaceId)
  if (!w) return
  const p = { id: genId(), name, boards: [] }
  w.projects.push(p)
  closeModal()
  state.selectedProjectId = p.id
  state.selectedBoardId = null
  render()
  pushCommand({
    undo() {
      const pi = w.projects.findIndex(x => x.id === p.id)
      if (pi !== -1) { w.projects.splice(pi, 1); state.selectedProjectId = w.projects.length > 0 ? w.projects[0].id : null; state.selectedBoardId = null }
    },
    redo() { w.projects.push(p); state.selectedProjectId = p.id; state.selectedBoardId = null },
    description: 'Create Project'
  })
}

export function deleteProject(id) {
  if (!confirm('Delete this project and everything inside?')) return
  for (const w of data.workspaces) {
    const idx = w.projects.findIndex(p => p.id === id)
    if (idx !== -1) {
      const removed = w.projects[idx]
      w.projects.splice(idx, 1)
      const prevId = state.selectedProjectId
      if (state.selectedProjectId === id) {
        state.selectedProjectId = w.projects.length > 0 ? w.projects[0].id : null
        state.selectedBoardId = null
      }
      render()
      pushCommand({
        undo() { w.projects.splice(idx, 0, removed); if (prevId === id) state.selectedProjectId = id; state.selectedBoardId = null },
        redo() {
          const ri = w.projects.findIndex(x => x.id === removed.id)
          if (ri !== -1) w.projects.splice(ri, 1)
          if (prevId === id) { state.selectedProjectId = w.projects.length > 0 ? w.projects[0].id : null; state.selectedBoardId = null }
        },
        description: 'Delete Project'
      })
      return
    }
  }
}

export function createBoard(projectId) {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  const p = findProject(projectId)
  if (!p) return
  const b = { id: genId(), name, columns: [] }
  p.boards.push(b)
  closeModal()
  state.selectedBoardId = b.id
  render()
  pushCommand({
    undo() {
      const bi = p.boards.findIndex(x => x.id === b.id)
      if (bi !== -1) { p.boards.splice(bi, 1); state.selectedBoardId = p.boards.length > 0 ? p.boards[0].id : null }
    },
    redo() { p.boards.push(b); state.selectedBoardId = b.id },
    description: 'Create Board'
  })
}

export function deleteBoard(id) {
  if (!confirm('Delete this board and all its columns and cards?')) return
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      const idx = p.boards.findIndex(b => b.id === id)
      if (idx !== -1) {
        const removed = p.boards[idx]
        p.boards.splice(idx, 1)
        if (state.selectedBoardId === id) {
          state.selectedBoardId = p.boards.length > 0 ? p.boards[0].id : null
        }
        render()
        pushCommand({
          undo() { p.boards.splice(idx, 0, removed); state.selectedBoardId = id },
          redo() {
            const ri = p.boards.findIndex(x => x.id === removed.id)
            if (ri !== -1) p.boards.splice(ri, 1)
            state.selectedBoardId = p.boards.length > 0 ? p.boards[0].id : null
          },
          description: 'Delete Board'
        })
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
  pushCommand({
    undo() {
      const ci = b.columns.findIndex(x => x.id === col.id)
      if (ci !== -1) b.columns.splice(ci, 1)
    },
    redo() { b.columns.push(col) },
    description: 'Add Column'
  })
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
          pushCommand({
            undo() {
              const ci = b.columns.findIndex(x => x.id === newCol.id)
              if (ci !== -1) b.columns.splice(ci, 1)
            },
            redo() {
              const ri = b.columns.findIndex(x => x.id === newCol.id)
              const insertIdx = idx + 1
              b.columns.splice(ri !== -1 ? ri : insertIdx, 0, newCol)
            },
            description: 'Paste Column'
          })
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
  pushCommand({
    undo() {
      const ci = b.columns.findIndex(x => x.id === newCol.id)
      if (ci !== -1) b.columns.splice(ci, 1)
    },
    redo() { b.columns.push(newCol) },
    description: 'Paste Column to Board'
  })
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
          pushCommand({
            undo() {
              const ci = b.columns.findIndex(x => x.id === newCol.id)
              if (ci !== -1) b.columns.splice(ci, 1)
            },
            redo() { b.columns.splice(idx + 1, 0, newCol) },
            description: 'Duplicate Column'
          })
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
          const movedCards = col.cards.slice()
          b.archivedCards.push(...col.cards)
          b.columns.splice(idx, 1)
          render()
          pushCommand({
            undo() {
              b.columns.splice(idx, 0, col)
              col.cards = movedCards
              if (b.archivedCards) {
                for (const mc of movedCards) {
                  const ai = b.archivedCards.indexOf(mc)
                  if (ai !== -1) b.archivedCards.splice(ai, 1)
                }
              }
            },
            redo() {
              if (!b.archivedCards) b.archivedCards = []
              b.archivedCards.push(...col.cards)
              const ci = b.columns.findIndex(x => x.id === col.id)
              if (ci !== -1) b.columns.splice(ci, 1)
            },
            description: 'Archive Column'
          })
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
        if (idx !== -1) {
          const removed = b.columns[idx]
          b.columns.splice(idx, 1)
          render()
          pushCommand({
            undo() { b.columns.splice(idx, 0, removed) },
            redo() {
              const ri = b.columns.findIndex(x => x.id === removed.id)
              if (ri !== -1) b.columns.splice(ri, 1)
            },
            description: 'Delete Column'
          })
          return
        }
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
  pushCommand({
    undo() {
      const ci = col.cards.findIndex(x => x.id === cardData.id)
      if (ci !== -1) col.cards.splice(ci, 1)
    },
    redo() { col.cards.push(cardData) },
    description: 'Create Card'
  })
}

export function saveCard(cardId) {
  const c = findCard(cardId)
  if (!c) return
  const oldSnapshot = JSON.parse(JSON.stringify(c))
  const newData = collectCardForm()
  if (!newData.title) return
  c.title = newData.title
  c.description = newData.description
  c.startDate = newData.startDate
  c.endDate = newData.endDate
  c.priority = newData.priority
  c.tags = newData.tags
  c.members = newData.members
  c.checklists = newData.checklists
  c.color = newData.color
  closeModal()
  render()
  pushCommand({
    undo() {
      const card = findCard(cardId)
      if (card) Object.assign(card, oldSnapshot)
    },
    redo() {
      const card = findCard(cardId)
      if (card) {
        card.title = newData.title; card.description = newData.description
        card.startDate = newData.startDate; card.endDate = newData.endDate
        card.priority = newData.priority; card.tags = newData.tags
        card.members = newData.members; card.checklists = newData.checklists
        card.color = newData.color
      }
    },
    description: 'Edit Card'
  })
}

function collectCardForm() {
  const title = (document.getElementById('cd-title')?.value || '').trim()
  const description = document.getElementById('cd-desc')?.value?.trim() || ''
  const startDate = document.getElementById('cd-start')?.value || null
  const endDate = document.getElementById('cd-end')?.value || null
  const priority = document.getElementById('cd-priority')?.value || '3'
  const color = document.getElementById('cd-color')?.value || null

  const tags = []
  document.querySelectorAll('#cd-tags .cd-chip[data-type="tag"]').forEach(el => {
    const text = el.dataset.value || (el.childNodes[0]?.nodeValue?.trim())
    if (text) tags.push(text)
  })

  const members = []
  document.querySelectorAll('#cd-members .cd-chip[data-type="member"]').forEach(el => {
    const text = el.dataset.value || (el.childNodes[0]?.nodeValue?.trim())
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

  return { title, description, startDate, endDate, priority, tags, members, checklists, color }
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
  pushCommand({
    undo() {
      const ci = srcCol.cards.findIndex(x => x.id === dup.id)
      if (ci !== -1) srcCol.cards.splice(ci, 1)
    },
    redo() { srcCol.cards.push(dup) },
    description: 'Duplicate Card'
  })
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
  pushCommand({
    undo() {
      const ci = col.cards.findIndex(x => x.id === pasteData.id)
      if (ci !== -1) col.cards.splice(ci, 1)
    },
    redo() { col.cards.push(pasteData) },
    description: 'Paste Card into Column'
  })
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
  pushCommand({
    undo() {
      const ci = srcCol.cards.findIndex(x => x.id === pasteData.id)
      if (ci !== -1) srcCol.cards.splice(ci, 1)
    },
    redo() { srcCol.cards.push(pasteData) },
    description: 'Paste Card'
  })
}

export function archiveCard(cardId) {
  const card = findCard(cardId)
  if (!card) return
  const srcCol = findCardColumn(card.id)
  if (!srcCol) return
  const idx = srcCol.cards.indexOf(card)
  if (idx === -1) return
  const archivedBoardId = state.selectedBoardId
  srcCol.cards.splice(idx, 1)
  const b = findBoard(state.selectedBoardId)
  if (b) {
    if (!b.archivedCards) b.archivedCards = []
    b.archivedCards.push(card)
  }
  render()
  pushCommand({
    undo() {
      srcCol.cards.splice(idx, 0, card)
      if (b && b.archivedCards) {
        const ai = b.archivedCards.indexOf(card)
        if (ai !== -1) b.archivedCards.splice(ai, 1)
      }
    },
    redo() {
      const ri = srcCol.cards.indexOf(card)
      if (ri !== -1) srcCol.cards.splice(ri, 1)
      if (b) {
        if (!b.archivedCards) b.archivedCards = []
        b.archivedCards.push(card)
      }
    },
    description: 'Archive Card'
  })
}

export function moveCardToBoardColumn(cardId, targetBoardId, targetColumnId) {
  const card = findCard(cardId)
  if (!card) return
  const srcCol = findCardColumn(cardId)
  if (!srcCol) return
  const srcBoard = findBoard(state.selectedBoardId)
  const srcBoardId = srcBoard ? srcBoard.id : null
  const idx = srcCol.cards.indexOf(card)
  if (idx === -1) return
  srcCol.cards.splice(idx, 1)

  const targetCol = findColumn(targetColumnId)
  if (!targetCol) return
  targetCol.cards.push(card)
  render()
  pushCommand({
    undo() {
      const ti = targetCol.cards.indexOf(card)
      if (ti !== -1) targetCol.cards.splice(ti, 1)
      srcCol.cards.splice(idx, 0, card)
    },
    redo() {
      const si = srcCol.cards.indexOf(card)
      if (si !== -1) srcCol.cards.splice(si, 1)
      targetCol.cards.push(card)
    },
    description: 'Move Card'
  })
}

export function deleteCard(cardId) {
  if (!confirm('Delete this card?')) return
  const col = findCardColumn(cardId)
  if (!col) return
  const idx = col.cards.findIndex(c => c.id === cardId)
  if (idx !== -1) {
    const removed = col.cards[idx]
    col.cards.splice(idx, 1)
    closeModal()
    render()
    pushCommand({
      undo() { col.cards.splice(idx, 0, removed) },
      redo() {
        const ri = col.cards.findIndex(x => x.id === removed.id)
        if (ri !== -1) col.cards.splice(ri, 1)
      },
      description: 'Delete Card'
    })
  }
}

export function toggleCardCompleted(cardId) {
  const c = findCard(cardId)
  if (!c) return
  const was = c.completed
  c.completed = !c.completed
  render()
  pushCommand({
    undo() { c.completed = was; render() },
    redo() { c.completed = !was; render() },
    description: 'Toggle Complete'
  })
}

export function addProjectDirect(workspaceId) {
  const w = findWorkspace(workspaceId)
  if (!w) return
  window.addProjectFolder()
}

export function addCardDirect(columnId) {
  const col = findColumn(columnId)
  if (!col) return
  const card = { id: genId(), title: 'New Card', description: '', completed: false, startDate: null, endDate: null, priority: '3', tags: [], members: [], checklists: [], color: null }
  col.cards.push(card)
  render()
  pushCommand({
    undo() {
      const ci = col.cards.findIndex(x => x.id === card.id)
      if (ci !== -1) col.cards.splice(ci, 1)
    },
    redo() { col.cards.push(card) },
    description: 'Add Card'
  })
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
    pushCommand({
      undo() { w.projects.splice(idx, 0, p); const ai = w.archivedProjects.indexOf(p); if (ai !== -1) w.archivedProjects.splice(ai, 1); if (state.selectedProjectId === null) { state.selectedProjectId = p.id; state.selectedBoardId = null } },
      redo() {
        const ri = w.projects.findIndex(x => x.id === p.id)
        if (ri !== -1) w.projects.splice(ri, 1)
        if (!w.archivedProjects) w.archivedProjects = []
        w.archivedProjects.push(p)
        if (state.selectedProjectId === p.id) { state.selectedProjectId = null; state.selectedBoardId = null }
      },
      description: 'Archive Project'
    })
    return
  }
}

export function setProjectColor(id, color) {
  for (const w of data.workspaces) {
    const p = w.projects.find(pj => pj.id === id)
    if (!p) continue
    const oldColor = p.color
    p.color = color || null
    render()
    pushCommand({
      undo() { p.color = oldColor; render() },
      redo() { p.color = color || null; render() },
      description: 'Set Project Color'
    })
    return
  }
}

export function setCardColor(cardId, color) {
  const c = findCard(cardId)
  if (!c) return
  const oldColor = c.color
  c.color = color || null
  render()
  pushCommand({
    undo() { c.color = oldColor; render() },
    redo() { c.color = color || null; render() },
    description: 'Set Card Color'
  })
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
  pushCommand({
    undo() {
      const di = p.documents.findIndex(x => x.id === doc.id)
      if (di !== -1) p.documents.splice(di, 1)
      state.selectedDocumentId = p.documents.length > 0 ? p.documents[0].id : null
    },
    redo() { p.documents.push(doc); state.selectedDocumentId = doc.id; state.selectedBoardId = null },
    description: 'Create Document'
  })
}

export function deleteDocument(id) {
  if (!confirm('Delete this document?')) return
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      if (!p.documents) continue
      const idx = p.documents.findIndex(d => d.id === id)
      if (idx !== -1) {
        const removed = p.documents[idx]
        p.documents.splice(idx, 1)
        if (state.selectedDocumentId === id) {
          state.selectedDocumentId = p.documents.length > 0 ? p.documents[0].id : null
        }
        render()
        pushCommand({
          undo() { p.documents.splice(idx, 0, removed); if (state.selectedDocumentId === null) state.selectedDocumentId = id },
          redo() {
            const ri = p.documents.findIndex(x => x.id === removed.id)
            if (ri !== -1) p.documents.splice(ri, 1)
            state.selectedDocumentId = p.documents.length > 0 ? p.documents[0].id : null
          },
          description: 'Delete Document'
        })
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
  if (!d) return
  const oldName = d.name
  d.name = name
  render()
  pushCommand({
    undo() { d.name = oldName; render() },
    redo() { d.name = name; render() },
    description: 'Rename Document'
  })
}

export function setDocumentPaperSize(id, paperSize) {
  const d = findDocument(id)
  if (d) { d.paperSize = paperSize }
}

export function createCanvas(projectId) {
  const name = document.getElementById('modalInput').value.trim()
  if (!name) return
  const p = findProject(projectId)
  if (!p) return
  if (!p.canvasBoards) p.canvasBoards = []
  const canvas = { id: genId(), name, data: getEmptyCanvasState() }
  p.canvasBoards.push(canvas)
  closeModal()
  state.selectedCanvasId = canvas.id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  render()
  pushCommand({
    undo() {
      const ci = p.canvasBoards.findIndex(x => x.id === canvas.id)
      if (ci !== -1) p.canvasBoards.splice(ci, 1)
      state.selectedCanvasId = p.canvasBoards.length > 0 ? p.canvasBoards[0].id : null
    },
    redo() { p.canvasBoards.push(canvas); state.selectedCanvasId = canvas.id; state.selectedBoardId = null; state.selectedDocumentId = null },
    description: 'Create Canvas'
  })
}

export function deleteCanvas(id) {
  if (!confirm('Delete this canvas board and all its content?')) return
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      if (!p.canvasBoards) continue
      const idx = p.canvasBoards.findIndex(c => c.id === id)
      if (idx !== -1) {
        const removed = p.canvasBoards[idx]
        p.canvasBoards.splice(idx, 1)
        if (state.selectedCanvasId === id) {
          state.selectedCanvasId = p.canvasBoards.length > 0 ? p.canvasBoards[0].id : null
        }
        render()
        pushCommand({
          undo() { p.canvasBoards.splice(idx, 0, removed); state.selectedCanvasId = id },
          redo() {
            const ri = p.canvasBoards.findIndex(x => x.id === removed.id)
            if (ri !== -1) p.canvasBoards.splice(ri, 1)
            state.selectedCanvasId = p.canvasBoards.length > 0 ? p.canvasBoards[0].id : null
          },
          description: 'Delete Canvas'
        })
        return
      }
    }
  }
}

export function renameCanvas(id, name) {
  const c = findCanvas(id)
  if (!c) return
  const oldName = c.name
  c.name = name
  render()
  pushCommand({
    undo() { c.name = oldName; render() },
    redo() { c.name = name; render() },
    description: 'Rename Canvas'
  })
}

export function saveCanvasContent(canvasId, canvasData) {
  const c = findCanvas(canvasId)
  if (c) { c.data = canvasData }
}
export function getCanvasData(canvasId) {
  const c = findCanvas(canvasId)
  return c ? c.data : null
}

function getEmptyCanvasState() {
  return {
    textBoxes: [], shapes: [], arrows: [], connectors: [], connections: [],
    viewport: { offsetX: 0, offsetY: 0, scale: 1 },
    nextTextBoxId: 1, nextShapeId: 1, nextArrowId: 1, nextConnectorId: 1, nextConnectionId: 1
  }
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
    if (copy.canvasBoards) copy.canvasBoards.forEach(c => { c.id = genId() })
    w.projects.splice(idx + 1, 0, copy)
    render()
    pushCommand({
      undo() {
        const ci = w.projects.findIndex(x => x.id === copy.id)
        if (ci !== -1) w.projects.splice(ci, 1)
      },
      redo() { w.projects.splice(idx + 1, 0, copy) },
      description: 'Copy Project'
    })
    return
  }
}
