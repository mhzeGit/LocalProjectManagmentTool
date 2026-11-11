// Server mode: used when the app is served by the local pm server
// (server/pm.py). Data is loaded from and autosaved to the server, and
// changes made by AI agents arrive live over Server-Sent Events.
import { data, state, setUid, findProject } from './data.js'
import { clearHistory } from './history.js'

const SAVE_DEBOUNCE_MS = 700
const CHECK_INTERVAL_MS = 1000

let _enabled = false
let _render = null
let _notify = null
let _clientId = 'tab-' + Math.random().toString(36).slice(2, 10)
let _revs = {}
let _metaRev = 0
let _synced = {}
let _syncedMeta = ''
let _busy = false
let _dirtySince = 0
let _pendingRemote = new Set()
let _pendingMeta = false
let _status = 'connecting'
let _events = null
let _projectDirs = {}
const _listeners = new Set()

export function isServerMode() { return _enabled }
export function getProjectDir(projectId) { return _projectDirs[projectId] || '' }
export function getSyncStatus() { return _status }
export function onSync(fn) { _listeners.add(fn); return () => _listeners.delete(fn) }
function emit(type, detail) { for (const fn of _listeners) { try { fn(type, detail) } catch (e) { console.error(e) } } }

export async function detectServer() {
  if (location.protocol !== 'http:') return false
  if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const r = await fetch('/api/hello', { cache: 'no-store', signal: ctrl.signal })
    clearTimeout(t)
    if (!r.ok) return false
    const j = await r.json()
    return j && j.app === 'pmtool'
  } catch { return false }
}

async function api(method, path, body, opts) {
  const init = { method, cache: 'no-store', headers: {} }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  if (opts && opts.keepalive) init.keepalive = true
  const r = await fetch(path, init)
  let j = null
  try { j = await r.json() } catch {}
  if (!r.ok) throw new Error((j && j.error) || ('HTTP ' + r.status))
  return j
}
export { api as serverApi }

/* ---------- serialisation ---------- */

function stripPrivate(v) {
  if (Array.isArray(v)) return v.map(stripPrivate)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) if (k[0] !== '_') out[k] = stripPrivate(v[k])
    return out
  }
  return v
}

function projectPayload(p) {
  return JSON.stringify(stripPrivate({
    id: p.id, name: p.name, color: p.color || null, path: p.path || '',
    boards: p.boards || [], documents: p.documents || [], canvasBoards: p.canvasBoards || [],
    folders: p.folders || [], sidebarOrder: p.sidebarOrder || [],
    ...(p.plan !== undefined ? { plan: p.plan } : {}),
  }))
}

function metaPayload() {
  return JSON.stringify({
    selfMemberId: state.selfMemberId || null,
    workspaces: data.workspaces.map(w => ({
      id: w.id, name: w.name, color: w.color || null, tags: w.tags || [],
      members: (w.members || []).map(m => ({ id: m.id, name: m.name, avatar: m.avatar || '' })),
      projects: (w.projects || []).map(p => ({ id: p.id, name: p.name, color: p.color || null, path: p.path || '' })),
    })),
  })
}

function maxNumericId() {
  let max = 100
  const visit = (id) => {
    if (typeof id !== 'string' || !/^id\d+$/.test(id)) return
    const n = parseInt(id.slice(2), 10)
    if (n > max) max = n
  }
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (o && typeof o === 'object') { if (o.id) visit(o.id); for (const k in o) if (typeof o[k] === 'object') walk(o[k]) }
  }
  walk(data.workspaces)
  return max
}

/* ---------- status ---------- */

function setStatus(s) {
  if (_status === s) return
  _status = s
  const el = document.getElementById('syncStatus')
  if (el) {
    el.className = 'sync-status sync-' + s
    const label = { live: 'Live', saving: 'Saving…', offline: 'Offline', connecting: 'Connecting…', error: 'Not saved' }[s] || s
    el.innerHTML = '<span class="sync-dot"></span><span class="sync-label">' + label + '</span>'
    el.title = s === 'live' ? 'Connected to the local server. Changes save automatically and agent changes appear live.'
      : s === 'offline' ? 'The local server is not reachable. Changes are kept in this tab and saved when it is back.'
      : s === 'error' ? 'The last save failed. Retrying…' : ''
  }
  emit('status', s)
}

/* ---------- init ---------- */

export async function initServerMode(hooks) {
  _render = hooks.render
  _notify = hooks.notify
  _enabled = true
  const st = await api('GET', '/api/state')
  loadState(st)
  hooks.restoreSelectedState()
  applyHashSelection()
  if (hooks.preloadAvatars) {
    for (const w of data.workspaces) await hooks.preloadAvatars(w.members || [])
  }
  _render()
  connectEvents()
  setInterval(checkDirty, CHECK_INTERVAL_MS)
  window.addEventListener('beforeunload', flushOnUnload)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') checkDirty(true) })
  window.addEventListener('hashchange', () => { if (applyHashSelection()) _render() })
  document.addEventListener('focusout', () => setTimeout(applyPendingRemote, 50), true)
  setInterval(applyPendingRemote, 1200)
  setStatus('live')
}

function loadState(st) {
  data.workspaces.splice(0, data.workspaces.length, ...st.workspaces)
  state.selfMemberId = st.selfMemberId || state.selfMemberId
  try { localStorage.setItem('kanboard_self_member', JSON.stringify(state.selfMemberId)) } catch {}
  _revs = Object.assign({}, st.projectRevs)
  _metaRev = st.metaRev
  _projectDirs = st.projectDirs || {}
  _synced = {}
  for (const w of data.workspaces) for (const p of w.projects) if (!p._loadError) _synced[p.id] = projectPayload(p)
  _syncedMeta = metaPayload()
  setUid(maxNumericId())
}

function applyHashSelection() {
  const m = /project=([^&]+)/.exec(location.hash || '')
  if (!m) return false
  const pid = decodeURIComponent(m[1])
  for (const w of data.workspaces) {
    if (w.projects.some(p => p.id === pid)) {
      state.selectedWorkspaceId = w.id
      state.selectedProjectId = pid
      state.selectedBoardId = null
      state.selectedDocumentId = null
      state.selectedCanvasId = null
      state.selectedDashboard = true
      history.replaceState(null, '', location.pathname)
      if (window.__saveSelectedState) window.__saveSelectedState()
      return true
    }
  }
  return false
}

/* ---------- saving ---------- */

function isDirty() {
  if (metaPayload() !== _syncedMeta) return true
  for (const w of data.workspaces) for (const p of w.projects) {
    if (!p._loadError && projectPayload(p) !== _synced[p.id]) return true
  }
  return false
}

async function checkDirty(force) {
  if (!_enabled || _busy) return
  if (window.__flushPendingEdits && force) window.__flushPendingEdits()
  const meta = metaPayload()
  const changed = []
  for (const w of data.workspaces) for (const p of w.projects) {
    if (p._loadError) continue
    const s = projectPayload(p)
    if (s !== _synced[p.id]) changed.push([p, s])
  }
  if (meta === _syncedMeta && changed.length === 0) { _dirtySince = 0; return }
  if (!_dirtySince) _dirtySince = Date.now()
  if (!force && Date.now() - _dirtySince < SAVE_DEBOUNCE_MS) return
  _busy = true
  setStatus('saving')
  try {
    if (meta !== _syncedMeta) {
      const r = await api('PUT', '/api/meta', Object.assign({ baseRev: _metaRev, clientId: _clientId }, JSON.parse(meta)))
      _metaRev = r.rev
      _syncedMeta = meta
      // new projects created by the server need their folders: refresh revs
      const st = await api('GET', '/api/state')
      _projectDirs = st.projectDirs || {}
      for (const w of st.workspaces) for (const p of w.projects) {
        const local = findProject(p.id)
        if (local && !(p.id in _synced) && !p._loadError) {
          _revs[p.id] = st.projectRevs[p.id]
          _synced[p.id] = projectPayload(p)
          delete local._loadError
        }
      }
    }
    for (const [p] of changed) {
      const s = projectPayload(p)
      if (s === _synced[p.id]) continue
      const r = await api('PUT', '/api/projects/' + encodeURIComponent(p.id),
        { baseRev: _revs[p.id], project: JSON.parse(s), clientId: _clientId })
      _revs[p.id] = r.rev
      _synced[p.id] = s
      if (r.project) {
        applyProject(p.id, r.project, true)
        _notify && _notify('Merged with changes made by an agent', 2500)
      }
    }
    _dirtySince = 0
    setStatus('live')
  } catch (e) {
    console.error('[sync] save failed', e)
    setStatus(navigator.onLine === false || /Failed to fetch|NetworkError/.test(String(e)) ? 'offline' : 'error')
  } finally {
    _busy = false
  }
}

export function flushNow() { return checkDirty(true) }

function flushOnUnload() {
  if (!isDirty()) return
  const meta = metaPayload()
  if (meta !== _syncedMeta) {
    api('PUT', '/api/meta', Object.assign({ baseRev: _metaRev, clientId: _clientId }, JSON.parse(meta)), { keepalive: true }).catch(() => {})
  }
  for (const w of data.workspaces) for (const p of w.projects) {
    if (p._loadError) continue
    const s = projectPayload(p)
    if (s !== _synced[p.id]) {
      api('PUT', '/api/projects/' + encodeURIComponent(p.id), { baseRev: _revs[p.id], project: JSON.parse(s), clientId: _clientId }, { keepalive: true }).catch(() => {})
    }
  }
}

/* ---------- remote changes ---------- */

function userIsEditing() {
  const a = document.activeElement
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return true
  if (document.getElementById('modal')?.classList.contains('open')) return true
  if (document.querySelector('.dragging, .card.dragging, .board-column.dragging')) return true
  if (window.__isCanvasActive && window.__isCanvasActive()) return true
  return false
}

function applyProject(pid, tree, skipRender) {
  const p = findProject(pid)
  if (!p) return
  const openFolders = {}
  for (const f of p.folders || []) if (f._open !== undefined) openFolders[f.id] = f._open
  const keepPath = p.path
  for (const k of Object.keys(p)) if (k[0] !== '_') delete p[k]
  Object.assign(p, tree)
  delete p._loadError
  if (!p.path) p.path = keepPath
  for (const f of p.folders || []) if (f.id in openFolders) f._open = openFolders[f.id]
  _synced[pid] = projectPayload(p)
  setUid(maxNumericId())
  clearHistory()
  if (state.selectedProjectId === pid) {
    if (state.selectedBoardId && !(p.boards || []).some(b => b.id === state.selectedBoardId)) state.selectedBoardId = null
    if (state.selectedDocumentId && !(p.documents || []).some(d => d.id === state.selectedDocumentId)) state.selectedDocumentId = null
    if (state.selectedCanvasId && !(p.canvasBoards || []).some(c => c.id === state.selectedCanvasId)) state.selectedCanvasId = null
    state.selectedCardIds = state.selectedCardIds.filter(id => JSON.stringify(p).indexOf('"' + id + '"') !== -1)
  }
  if (!skipRender) _render()
  emit('project', pid)
}

async function pullProject(pid) {
  const p = findProject(pid)
  if (!p) { _pendingMeta = true; return }
  if (projectPayload(p) !== _synced[pid]) {
    // local edits waiting: save first, the server merges both sides
    await checkDirty(true)
    return
  }
  const r = await api('GET', '/api/projects/' + encodeURIComponent(pid))
  if (r.rev <= (_revs[pid] || 0)) return
  _revs[pid] = r.rev
  applyProject(pid, r.project)
}

async function pullMeta() {
  if (metaPayload() !== _syncedMeta) { await checkDirty(true); return }
  const st = await api('GET', '/api/state')
  _projectDirs = st.projectDirs || {}
  _metaRev = st.metaRev
  const byId = {}
  for (const w of data.workspaces) for (const p of w.projects) byId[p.id] = p
  const next = st.workspaces.map(sw => {
    const lw = data.workspaces.find(w => w.id === sw.id) || {}
    const projects = sw.projects.map(sp => {
      const lp = byId[sp.id]
      if (!lp) { if (!sp._loadError) { _synced[sp.id] = projectPayload(sp); _revs[sp.id] = st.projectRevs[sp.id] } return sp }
      lp.name = sp.name; lp.color = sp.color
      if (lp._loadError && !sp._loadError) {
        applyProject(sp.id, sp, true)
        _revs[sp.id] = st.projectRevs[sp.id]
      }
      return lp
    })
    return Object.assign(lw, { id: sw.id, name: sw.name, color: sw.color, tags: sw.tags, members: sw.members, projects })
  })
  data.workspaces.splice(0, data.workspaces.length, ...next)
  _syncedMeta = metaPayload()
  _render()
}

async function applyPendingRemote() {
  if (!_enabled || _busy || userIsEditing()) return
  try {
    if (_pendingMeta) { _pendingMeta = false; await pullMeta() }
    for (const pid of Array.from(_pendingRemote)) {
      _pendingRemote.delete(pid)
      await pullProject(pid)
    }
  } catch (e) {
    console.error('[sync] pull failed', e)
  }
}

function connectEvents() {
  if (_events) _events.close()
  _events = new EventSource('/api/events')
  let firstOpen = true
  _events.addEventListener('hello', () => {
    setStatus('live')
    if (!firstOpen) {
      // reconnected (server restarted?): refresh everything that is not dirty
      _pendingMeta = true
      for (const w of data.workspaces) for (const p of w.projects) _pendingRemote.add(p.id)
      applyPendingRemote()
    }
    firstOpen = false
  })
  _events.addEventListener('project', (e) => {
    const ev = JSON.parse(e.data)
    if (ev.source === _clientId) return
    _pendingRemote.add(ev.projectId)
    applyPendingRemote()
  })
  _events.addEventListener('meta', (e) => {
    const ev = JSON.parse(e.data)
    if (ev.source === _clientId) return
    _pendingMeta = true
    applyPendingRemote()
  })
  _events.addEventListener('activity', (e) => {
    const ev = JSON.parse(e.data)
    emit('activity', ev)
    const entry = ev.entry || {}
    if (_notify && entry.lines && entry.lines.length) {
      const text = entry.by + ': ' + entry.lines[0] + (entry.lines.length > 1 ? ' (+' + (entry.lines.length - 1) + ')' : '')
      _notify(text, 3500)
    }
  })
  _events.addEventListener('sync', (e) => {
    const ev = JSON.parse(e.data)
    const st = ev.status || {}
    const el = document.getElementById('syncStatus')
    if (el && _status === 'live') {
      el.title = 'Connected to the local server; changes save automatically.\nGitHub sync ' + (st.ok ? 'OK' : 'FAILED') + ' at ' + (st.at || '').replace('T', ' ') + ': ' + (st.message || '')
    }
    if (st.ok === false && _notify) _notify('GitHub sync failed: ' + st.message, 5000)
  })
  _events.onerror = () => { setStatus('offline') }
}

/* ---------- server-mode replacements for file pickers ---------- */

function pathModal(title, label, placeholder, confirmText, extraHtml) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal')
    document.getElementById('modalTitle').textContent = title
    document.getElementById('modalBody').innerHTML =
      (extraHtml || '') +
      '<label>' + label + '</label><input id="pmPathInput" placeholder="' + placeholder + '" autofocus>' +
      '<div class="modal-actions"><button class="btn-cancel" id="pmPathCancel">Cancel</button>' +
      '<button class="btn-confirm" id="pmPathOk">' + confirmText + '</button></div>'
    overlay.classList.add('open')
    const input = document.getElementById('pmPathInput')
    setTimeout(() => input && input.focus(), 30)
    const done = (v) => { overlay.classList.remove('open'); resolve(v) }
    document.getElementById('pmPathCancel').onclick = () => done(null)
    document.getElementById('pmPathOk').onclick = () => {
      const fields = { value: input.value.trim() }
      const nameEl = document.getElementById('pmNameInput')
      if (nameEl) fields.name = nameEl.value.trim()
      done(fields)
    }
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('pmPathOk').click(); if (e.key === 'Escape') done(null) })
  })
}

async function afterServerChange(msg) {
  await pullMeta()
  _notify && _notify(msg)
}

export const serverActions = {
  async createWorkspace() {
    const r = await pathModal('New Workspace', 'Workspace name', 'e.g. Personal Workspace', 'Create')
    if (!r || !r.value) return
    await api('POST', '/api/workspaces', { name: r.value, clientId: _clientId })
    await afterServerChange('Workspace created')
  },
  async importWorkspace() {
    const r = await pathModal('Add Existing Workspace', 'Full path of the workspace .json file', 'C:/…/PersonalWorkspace.json', 'Add')
    if (!r || !r.value) return
    await api('POST', '/api/workspaces', { file: r.value, clientId: _clientId })
    await afterServerChange('Workspace added')
  },
  async addProject(workspaceId) {
    const r = await pathModal('New Project', 'Folder for the project files (optional)', 'Leave empty to store it in ~/.pmtool/projects', 'Create',
      '<label>Project name</label><input id="pmNameInput" placeholder="e.g. My Game">')
    if (!r || !(r.name || r.value)) return
    let dir = r.value
    if (!dir) dir = '~/.pmtool/projects/' + (r.name || 'project').replace(/[<>:"/\\|?*\s]+/g, '_').toLowerCase()
    const res = await api('POST', '/api/link', { dir, workspace: workspaceId, name: r.name || undefined, clientId: _clientId })
    await afterServerChange('Project ready: ' + res.name)
  },
  async locateExistingProject(workspaceId) {
    const r = await pathModal('Add Existing Project', 'Full path of the project folder (holds project.json)', 'C:/…/LocalProjectManagmentFiles', 'Add')
    if (!r || !r.value) return
    const res = await api('POST', '/api/link', { dir: r.value, workspace: workspaceId, clientId: _clientId })
    await afterServerChange('Project added: ' + res.name)
  },
  async locateProjectFolder(projectId) {
    const r = await pathModal('Locate Project Folder', 'Full path of the folder holding this project\'s project.json', 'C:/…/LocalProjectManagmentFiles', 'Link')
    if (!r || !r.value) return
    await api('POST', '/api/link', { dir: r.value, projectId, clientId: _clientId })
    await afterServerChange('Project folder linked')
  },
}
