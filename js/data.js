export const data = {
  workspaces: [
    {
      id: 'w1', name: 'Template Workspace',
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
          ]
        }
      ]
    }
  ]
}

let uid = 100
export function genId() { return 'id' + (++uid) }

export const PREDEFINED_MEMBERS = ['Alice', 'Bob', 'Charlie']

export const state = {
  selectedWorkspaceId: 'w1',
  selectedProjectId: 'p1',
  selectedBoardId: 'b1',
  selectedView: 'kanban',
}

export function findWorkspace(id) { return data.workspaces.find(w => w.id === id) }
export function findProject(id) { for (const w of data.workspaces) { const p = w.projects.find(pj => pj.id === id); if (p) return p } return null }
export function findBoard(id) { for (const w of data.workspaces) { for (const p of w.projects) { const b = p.boards.find(bd => bd.id === id); if (b) return b } } return null }
export function findColumn(id) { for (const w of data.workspaces) { for (const p of w.projects) { for (const b of p.boards) { const c = b.columns.find(cl => cl.id === id); if (c) return c } } } return null }
export function findCard(id) { for (const w of data.workspaces) { for (const p of w.projects) { for (const b of p.boards) { for (const c of b.columns) { const cd = c.cards.find(crd => crd.id === id); if (cd) return cd } } } } return null }
export function findCardColumn(cardId) { for (const w of data.workspaces) { for (const p of w.projects) { for (const b of p.boards) { for (const c of b.columns) { if (c.cards.find(crd => crd.id === cardId)) return c } } } } return null }
