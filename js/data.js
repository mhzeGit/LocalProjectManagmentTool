export const data = {
  workspaces: [
    {
      id: 'w1', name: 'Template Workspace',
      members: [
        { id: 'm1', name: 'Alice', avatar: '' },
        { id: 'm2', name: 'Bob', avatar: '' },
        { id: 'm3', name: 'Charlie', avatar: '' },
      ],
      projects: [
        {
          id: 'p1', name: 'Template Project',
          boards: [
            {
              id: 'b1', name: 'Task Board',
              columns: [
                { id: 'col1', name: 'To Do', cards: [] },
                { id: 'col2', name: 'Doing', cards: [] },
                { id: 'col3', name: 'Done', cards: [] },
              ]
            }
          ],
          documents: [
            { id: 'd1', name: 'Getting Started', content: '<h1>Welcome</h1><p>Start writing your document here. This supports <strong>bold</strong>, <em>italic</em>, and more!</p>' }
          ]
        }
      ]
    }
  ]
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
  selectedWorkspaceId: 'w1',
  selectedProjectId: 'p1',
  selectedBoardId: null,
  selectedDocumentId: 'd1',
  selectedView: 'kanban',
  selfMemberId: null,
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
export function findDocument(id) { for (const w of data.workspaces) { for (const p of w.projects) { const d = p.documents.find(doc => doc.id === id); if (d) return d } } return null }
