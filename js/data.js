export const data = {
  workspaces: []
}

let uid = 100
export function genId() { return 'id' + (++uid) }
export function setUid(min) { if (min > uid) uid = min }

export const PREDEFINED_MEMBERS = []

export const PREDEFINED_COLORS = [
  { id: 'pc1', name: 'Indigo', value: '#4f46e5' },
  { id: 'pc2', name: 'Green', value: '#22c55e' },
  { id: 'pc3', name: 'Red', value: '#ef4444' },
  { id: 'pc4', name: 'Yellow', value: '#eab308' },
  { id: 'pc5', name: 'Cyan', value: '#06b6d4' },
  { id: 'pc6', name: 'Pink', value: '#ec4899' },
  { id: 'pc7', name: 'Orange', value: '#f97316' },
  { id: 'pc8', name: 'Purple', value: '#a855f7' },
]

export const state = {
  selectedWorkspaceId: null,
  selectedProjectId: null,
  selectedBoardId: null,
  selectedDocumentId: null,
  selectedCanvasId: null,
  selectedDashboard: false,
  renamingFolderId: null,
  renamingSidebarItemId: null,
  renamingSidebarItemType: null,
  selectedView: 'kanban',
  selfMemberId: null,
  selectedSidebarItems: [],
  filters: {
    search: '',
    members: [],
    tags: [],
    priority: [],
    startDateFrom: '',
    startDateTo: '',
    endDateFrom: '',
    endDateTo: '',
    completed: 'all',
  },
  showArchived: false,
}

export function getCurrentWorkspace() {
  return state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null
}

export function findWorkspace(id) { return data.workspaces.find(w => w.id === id) }
export function findProject(id) { for (const w of data.workspaces) { const p = w.projects.find(pj => pj.id === id); if (p) return p } return null }
export function findBoard(id) { for (const w of data.workspaces) { for (const p of w.projects) { const b = p.boards.find(bd => bd.id === id); if (b) return b } } return null }
export function findColumn(id) { for (const w of data.workspaces) { for (const p of w.projects) { for (const b of p.boards) { const c = b.columns.find(cl => cl.id === id); if (c) return c } } } return null }
export function findCard(id) { for (const w of data.workspaces) { for (const p of w.projects) { for (const b of p.boards) { for (const c of b.columns) { const cd = c.cards.find(crd => crd.id === id); if (cd) return cd } } } } return null }
export function findCardColumn(cardId) { for (const w of data.workspaces) { for (const p of w.projects) { for (const b of p.boards) { for (const c of b.columns) { if (c.cards.find(crd => crd.id === cardId)) return c } } } } return null }
export function findArchivedCard(id) { for (const w of data.workspaces) { for (const p of w.projects) { for (const b of p.boards) { if (b.archivedCards) { const c = b.archivedCards.find(crd => crd.id === id); if (c) return c } } } } return null }
export function findDocument(id) { for (const w of data.workspaces) { for (const p of w.projects) { const d = p.documents.find(doc => doc.id === id); if (d) return d } } return null }
export function findCanvas(id) { for (const w of data.workspaces) { for (const p of w.projects) { const c = p.canvasBoards.find(cb => cb.id === id); if (c) return c } } return null }

export function getWorkspaceTags() {
  const w = getCurrentWorkspace()
  return w ? (w.tags || []) : []
}

export function getTagColor(tagName) {
  const tags = getWorkspaceTags()
  const tag = tags.find(t => t.name === tagName)
  return tag ? tag.color : '#6b7280'
}
