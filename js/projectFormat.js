// The on-disk format of one project: a folder with project.json and one JSON
// file per board, column, card, document and canvas. Used by File mode
// (persistence.js) and GitHub mode (githubSync.js).
// Kept 1:1 in sync with server/pmtool/store.py.

export const ENTITY_PREFIXES = ['column_', 'card_', 'board_', 'document_', 'canvas_']

const CARD_KNOWN = ['type', 'id', 'title', 'description', 'completed', 'startDate', 'endDate', 'priority', 'tags', 'members', 'checklists', 'color', 'archived', 'boardId', 'columnId']
const COLUMN_KNOWN = ['type', 'id', 'name', 'boardId', 'archived', 'cards', 'color']
const BOARD_KNOWN = ['type', 'id', 'name', 'projectId', 'columns', 'archivedCards', 'archivedColumns']

export function stringify(obj) {
  return JSON.stringify(obj, null, 2)
}

export function sanitizeFilename(name) {
  if (!name) return 'untitled'
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase().substring(0, 80) || 'untitled'
}

function uniqueFilenames(items, prefix, key) {
  const names = {}
  const used = {}
  for (const it of items) {
    const base = prefix + sanitizeFilename(it[key]) + '.json'
    if (!used[base]) { used[base] = 1; names[it.id] = base; continue }
    let n = 1
    while (true) {
      const alt = base.replace('.json', '_' + n + '.json')
      if (!used[alt]) { used[alt] = 1; names[it.id] = alt; break }
      n++
    }
  }
  return names
}

function copyExtras(target, source, known) {
  for (const k in source) {
    if (!Object.prototype.hasOwnProperty.call(source, k)) continue
    if (k.charAt(0) === '_' || known.indexOf(k) !== -1) continue
    target[k] = source[k]
  }
  return target
}

function cardFromFile(m) {
  return copyExtras({
    id: m.id, title: m.title,
    description: m.description || '',
    completed: m.completed || false,
    startDate: m.startDate || null,
    endDate: m.endDate || null,
    priority: m.priority || '3',
    tags: m.tags || [],
    members: m.members || [],
    checklists: m.checklists || [],
    color: m.color || null,
  }, m, CARD_KNOWN)
}

function columnFromFile(m) {
  return copyExtras({ id: m.id, name: m.name, cards: [], color: m.color || null }, m, COLUMN_KNOWN)
}

/** project tree -> { filename: object } */
export function projectFiles(project) {
  const out = {}
  const meta = {
    type: 'project', id: project.id, name: project.name,
    color: project.color || null,
    boards: (project.boards || []).map(b => b.id),
    documents: (project.documents || []).map(d => d.id),
    canvases: (project.canvasBoards || []).map(c => c.id),
    folders: (project.folders || []).map(f => ({ id: f.id, name: f.name, itemOrder: f.itemOrder || [] })),
    sidebarOrder: project.sidebarOrder || [],
  }
  if (project.plan !== undefined && project.plan !== null) meta.plan = project.plan
  out['project.json'] = meta

  const allCols = []
  const allCards = []
  for (const b of project.boards || []) {
    for (const c of b.columns || []) {
      allCols.push({ col: c, boardId: b.id })
      for (const cd of c.cards || []) allCards.push({ card: cd, where: { columnId: c.id } })
    }
    for (const ac of b.archivedCards || []) allCards.push({ card: ac, where: { archived: true, boardId: b.id } })
    for (const axc of b.archivedColumns || []) {
      allCols.push({ col: axc, boardId: b.id, archived: true })
      for (const cd of axc.cards || []) allCards.push({ card: cd, where: { archived: true, columnId: axc.id } })
    }
  }
  const colNames = uniqueFilenames(allCols.map(x => x.col), 'column_', 'name')
  const cardNames = uniqueFilenames(allCards.map(x => x.card), 'card_', 'title')
  const boardNames = uniqueFilenames(project.boards || [], 'board_', 'name')
  const docNames = uniqueFilenames(project.documents || [], 'document_', 'name')
  const canvasNames = uniqueFilenames(project.canvasBoards || [], 'canvas_', 'name')

  for (const b of project.boards || []) {
    out[boardNames[b.id]] = copyExtras({
      type: 'board', id: b.id, name: b.name, projectId: project.id,
      columns: (b.columns || []).map(c => c.id),
      archivedCards: (b.archivedCards || []).map(c => c.id),
      archivedColumns: (b.archivedColumns || []).map(c => c.id),
    }, b, BOARD_KNOWN)
  }
  for (const { col, boardId, archived } of allCols) {
    const co = { type: 'column', id: col.id, name: col.name, boardId }
    if (archived) co.archived = true
    co.cards = (col.cards || []).map(cd => cd.id)
    if (col.color) co.color = col.color
    out[colNames[col.id]] = copyExtras(co, col, COLUMN_KNOWN)
  }
  for (const { card, where } of allCards) {
    const co = {
      type: 'card', id: card.id, title: card.title,
      description: card.description || '', completed: card.completed || false,
      startDate: card.startDate || null, endDate: card.endDate || null,
      priority: card.priority || '3', tags: card.tags || [],
      members: card.members || [], checklists: card.checklists || [],
      color: card.color || null,
    }
    copyExtras(co, card, CARD_KNOWN)
    Object.assign(co, where)
    out[cardNames[card.id]] = co
  }
  for (const d of project.documents || []) {
    out[docNames[d.id]] = {
      type: 'document', id: d.id, name: d.name, content: d.content || '', projectId: project.id,
      paperSize: d.paperSize || null, paperZoom: d.paperZoom || null,
    }
  }
  for (const c of project.canvasBoards || []) {
    out[canvasNames[c.id]] = { type: 'canvas', id: c.id, name: c.name, data: c.data || null, projectId: project.id }
  }
  return out
}

/** { filename: object } -> project tree (null if there is no project.json) */
export function projectFromFiles(files) {
  const pMeta = files['project.json']
  if (!pMeta || pMeta.type !== 'project') return null
  const byType = { board: {}, column: {}, card: {}, document: {}, canvas: {} }
  for (const name in files) {
    for (const prefix of ENTITY_PREFIXES) {
      if (name.startsWith(prefix) && name.endsWith('.json')) {
        const obj = files[name]
        if (obj && obj.id) byType[prefix.slice(0, -1)][obj.id] = obj
        break
      }
    }
  }
  const project = {
    id: pMeta.id, name: pMeta.name, color: pMeta.color || null,
    boards: [], documents: [], canvasBoards: [],
    folders: (pMeta.folders || []).map(f => ({ id: f.id, name: f.name, itemOrder: (f.itemOrder || []).slice() })),
    sidebarOrder: (pMeta.sidebarOrder || []).slice(),
  }
  if (pMeta.plan !== undefined) project.plan = pMeta.plan
  const cards = byType.card
  for (const bid of pMeta.boards || []) {
    const bm = byType.board[bid]
    if (!bm || bm.archived) continue
    const board = copyExtras({ id: bm.id, name: bm.name, columns: [] }, bm, BOARD_KNOWN.concat(['archived']))
    for (const cid of bm.columns || []) {
      const cm = byType.column[cid]
      if (!cm || cm.archived) continue
      const col = columnFromFile(cm)
      col.cards = (cm.cards || []).filter(x => cards[x]).map(x => cardFromFile(cards[x]))
      board.columns.push(col)
    }
    if ((bm.archivedCards || []).length) board.archivedCards = bm.archivedCards.filter(x => cards[x]).map(x => cardFromFile(cards[x]))
    if ((bm.archivedColumns || []).length) {
      board.archivedColumns = []
      for (const cid of bm.archivedColumns) {
        const cm = byType.column[cid]
        if (!cm) continue
        const col = columnFromFile(cm)
        col.cards = (cm.cards || []).filter(x => cards[x]).map(x => cardFromFile(cards[x]))
        board.archivedColumns.push(col)
      }
    }
    project.boards.push(board)
  }
  for (const did of pMeta.documents || []) {
    const dm = byType.document[did]
    if (dm) project.documents.push({ id: dm.id, name: dm.name, content: dm.content || '', paperSize: dm.paperSize || null, paperZoom: dm.paperZoom || null })
  }
  for (const cid of pMeta.canvases || []) {
    const cm = byType.canvas[cid]
    if (cm) project.canvasBoards.push({ id: cm.id, name: cm.name, data: cm.data || null })
  }
  return project
}

export function isEntityFile(name) {
  return name.endsWith('.json') && ENTITY_PREFIXES.some(p => name.startsWith(p))
}
