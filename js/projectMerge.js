// Three-way merge of project trees. A 1:1 port of server/pmtool/merge.py.
// Every card, column, board, document and canvas merges on its own; ordered
// lists merge as lists and an item never ends up in two places. When both
// sides changed the same thing, `mine` wins.

const SKIP = ['boards', 'documents', 'canvasBoards']
const MISSING = Symbol('missing')

function clean(d) {
  const out = {}
  for (const k of Object.keys(d)) if (k[0] !== '_') out[k] = JSON.parse(JSON.stringify(d[k] === undefined ? null : d[k]))
  return out
}

function omit(d, keys) {
  const out = {}
  for (const k of Object.keys(d)) if (keys.indexOf(k) === -1) out[k] = d[k]
  return out
}

// order-insensitive deep equality for plain JSON values
function eq(a, b) {
  if (a === b) return true
  if (a === MISSING || b === MISSING) return false
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false
    return true
  }
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !eq(a[k], b[k])) return false
  return true
}
export { eq as deepEqual }

function flatten(project) {
  const ent = {}, lists = {}
  if (!project) return { ent, lists }
  const p = {}
  for (const k of Object.keys(project)) if (SKIP.indexOf(k) === -1 && k[0] !== '_') p[k] = JSON.parse(JSON.stringify(project[k] === undefined ? null : project[k]))
  ent.project = p
  lists['project.boards'] = (project.boards || []).map(b => b.id)
  lists['project.documents'] = (project.documents || []).map(d => d.id)
  lists['project.canvases'] = (project.canvasBoards || []).map(c => c.id)
  for (const d of project.documents || []) ent['doc:' + d.id] = clean(d)
  for (const c of project.canvasBoards || []) ent['canvas:' + c.id] = clean(c)
  for (const b of project.boards || []) {
    ent['board:' + b.id] = omit(clean(b), ['columns', 'archivedCards', 'archivedColumns'])
    lists['board.columns:' + b.id] = (b.columns || []).map(c => c.id)
    lists['board.archivedColumns:' + b.id] = (b.archivedColumns || []).map(c => c.id)
    lists['board.archivedCards:' + b.id] = (b.archivedCards || []).map(c => c.id)
    for (const card of b.archivedCards || []) ent['card:' + card.id] = clean(card)
    for (const col of (b.columns || []).concat(b.archivedColumns || [])) {
      ent['col:' + col.id] = omit(clean(col), ['cards'])
      lists['col.cards:' + col.id] = (col.cards || []).map(c => c.id)
      for (const card of col.cards || []) ent['card:' + card.id] = clean(card)
    }
  }
  return { ent, lists }
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && v !== MISSING

function mergeValue(b, s, m) {
  if (eq(m, b)) return s
  if (eq(s, b)) return m
  if (m === MISSING) return s
  if (isObj(s) && isObj(m) && (b === MISSING || isObj(b))) {
    // both changed the same card/column/...: merge field by field
    const base = isObj(b) ? b : {}
    const out = {}
    const keys = [...Object.keys(s), ...Object.keys(m).filter(k => !(k in s)), ...Object.keys(base).filter(k => !(k in s) && !(k in m))]
    for (const k of keys) {
      const v = mergeValue(k in base ? base[k] : MISSING, k in s ? s[k] : MISSING, k in m ? m[k] : MISSING)
      if (v !== MISSING) out[k] = v
    }
    return out
  }
  return m
}

function mergeList(b, s, m) {
  if (b === MISSING) b = []
  if (s === MISSING && m === MISSING) return MISSING
  if (s === MISSING) return eq(m, b) ? MISSING : m
  if (m === MISSING) return eq(s, b) ? MISSING : s
  if (eq(m, b)) return s.slice()
  if (eq(s, b)) return m.slice()
  const sSet = new Set(s), bSet = new Set(b)
  const removedByS = new Set(b.filter(x => !sSet.has(x)))
  const out = m.filter(x => !removedByS.has(x))
  const present = new Set(out)
  for (let i = 0; i < s.length; i++) {
    const x = s[i]
    if (present.has(x) || bSet.has(x)) continue
    let pos = 0
    for (let j = i - 1; j >= 0; j--) {
      if (present.has(s[j])) { pos = out.indexOf(s[j]) + 1; break }
    }
    out.splice(pos, 0, x)
    present.add(x)
  }
  return out
}

function get(map, k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : MISSING }

/** base may be null (no common ancestor known). */
export function mergeProjects(base, server, mine) {
  const S = flatten(server), M = flatten(mine)
  let B
  if (!base) {
    B = { ent: {}, lists: {} }
    for (const k in S.ent) if (k in M.ent) B.ent[k] = S.ent[k]
    for (const k in S.lists) if (k in M.lists) { const ms = new Set(M.lists[k]); B.lists[k] = S.lists[k].filter(x => ms.has(x)) }
  } else {
    B = flatten(base)
  }
  const ent = {}
  for (const k of new Set([...Object.keys(B.ent), ...Object.keys(S.ent), ...Object.keys(M.ent)])) {
    const v = mergeValue(get(B.ent, k), get(S.ent, k), get(M.ent, k))
    if (v !== MISSING) ent[k] = v
  }
  const lists = {}
  for (const k of new Set([...Object.keys(B.lists), ...Object.keys(S.lists), ...Object.keys(M.lists)])) {
    const v = mergeList(get(B.lists, k), get(S.lists, k), get(M.lists, k))
    if (v !== MISSING) lists[k] = v
  }
  const prefer = (id, keys) => {
    for (const side of [M.lists, S.lists]) for (const key of keys) if ((side[key] || []).indexOf(id) !== -1) return key
    return keys[0]
  }
  if (!ent.project) return JSON.parse(JSON.stringify(mine))
  const project = Object.assign({}, ent.project)
  const boardIds = (lists['project.boards'] || []).filter(x => ('board:' + x) in ent)
  const colOwners = {}, cardOwners = {}
  for (const bid of boardIds) {
    for (const key of ['board.columns:' + bid, 'board.archivedColumns:' + bid]) {
      for (const cid of lists[key] || []) if (('col:' + cid) in ent) (colOwners[cid] = colOwners[cid] || []).push(key)
    }
    for (const cid of lists['board.archivedCards:' + bid] || []) if (('card:' + cid) in ent) (cardOwners[cid] = cardOwners[cid] || []).push('board.archivedCards:' + bid)
  }
  for (const cid in colOwners) {
    for (const cardId of lists['col.cards:' + cid] || []) if (('card:' + cardId) in ent) (cardOwners[cardId] = cardOwners[cardId] || []).push('col.cards:' + cid)
  }
  const colHome = {}, cardHome = {}
  for (const id in colOwners) colHome[id] = colOwners[id].length === 1 ? colOwners[id][0] : prefer(id, colOwners[id])
  for (const id in cardOwners) cardHome[id] = cardOwners[id].length === 1 ? cardOwners[id][0] : prefer(id, cardOwners[id])
  const copy = v => JSON.parse(JSON.stringify(v))
  const cardsFor = key => (lists[key] || []).filter(x => cardHome[x] === key).map(x => copy(ent['card:' + x]))

  const boards = []
  for (const bid of boardIds) {
    const board = Object.assign({}, ent['board:' + bid])
    board.columns = []
    for (const cid of lists['board.columns:' + bid] || []) {
      if (colHome[cid] === 'board.columns:' + bid) {
        const col = Object.assign({}, ent['col:' + cid])
        col.cards = cardsFor('col.cards:' + cid)
        board.columns.push(col)
      }
    }
    const archivedCards = cardsFor('board.archivedCards:' + bid)
    if (archivedCards.length) board.archivedCards = archivedCards
    const archivedCols = []
    for (const cid of lists['board.archivedColumns:' + bid] || []) {
      if (colHome[cid] === 'board.archivedColumns:' + bid) {
        const col = Object.assign({}, ent['col:' + cid])
        col.cards = cardsFor('col.cards:' + cid)
        archivedCols.push(col)
      }
    }
    if (archivedCols.length) board.archivedColumns = archivedCols
    boards.push(board)
  }
  const homeless = Object.keys(ent).filter(k => k.startsWith('card:') && !(k.slice(5) in cardHome))
  if (homeless.length && boards.length && boards[0].columns.length) {
    for (const k of homeless) boards[0].columns[0].cards.push(copy(ent[k]))
  }
  project.boards = boards
  project.documents = (lists['project.documents'] || []).filter(x => ('doc:' + x) in ent).map(x => copy(ent['doc:' + x]))
  project.canvasBoards = (lists['project.canvases'] || []).filter(x => ('canvas:' + x) in ent).map(x => copy(ent['canvas:' + x]))
  return project
}
