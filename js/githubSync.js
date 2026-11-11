// GitHub mode: the app reads and writes a private GitHub repository (the
// "data repo" kept in sync by the pm server on your PC). Used on a phone or
// any machine without the local server. The token stays in this browser.
//
// Data repo layout: pmsync.json (workspaces + project list) and
// projects/<projectId>/ with the usual project files.
import { data, state, setUid, findProject } from './data.js'
import { clearHistory } from './history.js'
import { projectFiles, projectFromFiles, stringify, isEntityFile } from './projectFormat.js'
import { mergeProjects, deepEqual } from './projectMerge.js'

const CONFIG_KEY = 'pm_github'
const BLOB_CACHE_KEY = 'pm_github_blobs'
const SAVE_DEBOUNCE_MS = 1500
const POLL_MS = 20000

let _enabled = false
let _cfg = null
let _render = null
let _notify = null
let _status = ''
let _headSha = null        // commit our local state is based on
let _headTree = null
let _fileIndex = {}        // path -> blob sha at _headSha
let _base = {}             // projectId -> project tree at _headSha
let _baseMeta = null
let _synced = {}           // projectId -> payload string at last sync
let _syncedMeta = ''
let _busy = false
let _dirtySince = 0
let _blobs = {}
let _lastPoll = 0

export function isGithubMode() { return _enabled }
export function getGithubConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') } catch { return null }
}
function saveConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)) }
export function disconnectGithub() {
  try { localStorage.removeItem(CONFIG_KEY); localStorage.removeItem(BLOB_CACHE_KEY) } catch {}
  location.reload()
}

/* ---------- GitHub API ---------- */

async function gh(method, path, body, accept) {
  const cfg = _cfg
  const headers = {
    'Authorization': 'Bearer ' + cfg.token,
    'Accept': accept || 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const init = { method, headers, cache: 'no-store' }
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body) }
  const base = (cfg.api || 'https://api.github.com').replace(/\/$/, '')
  const r = await fetch(base + path, init)
  if (accept && accept.indexOf('raw') !== -1 && r.ok) return r.text()
  let j = null
  try { j = await r.json() } catch {}
  if (!r.ok) {
    const err = new Error((j && j.message) || ('GitHub ' + r.status))
    err.status = r.status
    throw err
  }
  return j
}

const repoPath = () => '/repos/' + _cfg.repo

async function getHead() {
  const r = await gh('GET', repoPath() + '/git/ref/heads/' + encodeURIComponent(_cfg.branch || 'main'))
  return r.object.sha
}

function loadBlobCache() {
  try { _blobs = JSON.parse(localStorage.getItem(BLOB_CACHE_KEY) || '{}') } catch { _blobs = {} }
}
function storeBlobCache(index) {
  const keep = {}
  for (const p in index) if (_blobs[index[p]] !== undefined) keep[index[p]] = _blobs[index[p]]
  _blobs = keep
  try { localStorage.setItem(BLOB_CACHE_KEY, JSON.stringify(keep)) } catch {}
}

async function fetchBlobs(shas) {
  const todo = shas.filter(s => _blobs[s] === undefined)
  let i = 0
  async function worker() {
    while (i < todo.length) {
      const sha = todo[i++]
      _blobs[sha] = await gh('GET', repoPath() + '/git/blobs/' + sha, undefined, 'application/vnd.github.raw+json')
    }
  }
  await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()])
}

/** Reads the whole data repo at a commit. */
async function readSnapshot(commitSha) {
  const commit = await gh('GET', repoPath() + '/git/commits/' + commitSha)
  const tree = await gh('GET', repoPath() + '/git/trees/' + commit.tree.sha + '?recursive=1')
  const index = {}
  for (const it of tree.tree) if (it.type === 'blob') index[it.path] = it.sha
  const wanted = Object.keys(index).filter(p => p === 'pmsync.json' || (p.startsWith('projects/') && p.endsWith('.json')))
  await fetchBlobs(wanted.map(p => index[p]))
  const meta = index['pmsync.json'] ? JSON.parse(_blobs[index['pmsync.json']]) : { workspaces: [] }
  const files = {}
  for (const p of wanted) {
    const m = /^projects\/([^/]+)\/([^/]+)$/.exec(p)
    if (!m) continue
    try { (files[m[1]] = files[m[1]] || {})[m[2]] = JSON.parse(_blobs[index[p]]) } catch {}
  }
  const projects = {}
  for (const pid in files) {
    const pr = projectFromFiles(files[pid])
    if (pr) projects[pid] = pr
  }
  storeBlobCache(index)
  return { commit: commitSha, tree: commit.tree.sha, index, meta, projects }
}

/* ---------- local state ---------- */

function stripPrivate(v) {
  if (Array.isArray(v)) return v.map(stripPrivate)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) if (k[0] !== '_' && v[k] !== undefined) out[k] = stripPrivate(v[k])
    return out
  }
  return v
}

function projectTree(p) {
  const t = {
    id: p.id, name: p.name, color: p.color || null,
    boards: p.boards || [], documents: p.documents || [], canvasBoards: p.canvasBoards || [],
    folders: p.folders || [], sidebarOrder: p.sidebarOrder || [],
  }
  if (p.plan !== undefined && p.plan !== null) t.plan = p.plan
  return stripPrivate(t)
}
const payload = p => JSON.stringify(projectTree(p))

function metaOf() {
  return {
    version: 1,
    selfMemberId: state.selfMemberId || null,
    workspaces: data.workspaces.map(w => ({
      id: w.id, name: w.name, color: w.color || null, tags: w.tags || [],
      members: (w.members || []).map(m => ({ id: m.id, name: m.name, avatar: m.avatar || '' })),
      projects: (w.projects || []).map(p => ({ id: p.id, name: p.name, color: p.color || null })),
    })),
  }
}

function buildWorkspaces(snap) {
  return (snap.meta.workspaces || []).map(w => ({
    id: w.id, name: w.name, color: w.color || null, tags: w.tags || [], members: w.members || [],
    projects: (w.projects || []).map(ref => {
      const pr = snap.projects[ref.id]
      if (!pr) return { id: ref.id, name: ref.name, color: ref.color || null, path: '', boards: [], documents: [], canvasBoards: [], _loadError: true }
      return Object.assign({}, JSON.parse(JSON.stringify(pr)), { name: ref.name || pr.name, color: ref.color || pr.color || null, path: '' })
    }),
  }))
}

function adopt(snap) {
  _headSha = snap.commit
  _headTree = snap.tree
  _fileIndex = snap.index
  _base = JSON.parse(JSON.stringify(snap.projects))
  _baseMeta = JSON.parse(JSON.stringify(snap.meta))
}

function markSynced() {
  _synced = {}
  for (const w of data.workspaces) for (const p of w.projects) if (!p._loadError) _synced[p.id] = payload(p)
  _syncedMeta = JSON.stringify(metaOf())
}

function maxNumericId() {
  let max = 100
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return }
    if (o && typeof o === 'object') {
      if (typeof o.id === 'string' && /^id\d+$/.test(o.id)) max = Math.max(max, parseInt(o.id.slice(2), 10))
      for (const k in o) if (typeof o[k] === 'object') walk(o[k])
    }
  }
  walk(data.workspaces)
  return max
}

function replaceProject(p, tree) {
  const openFolders = {}
  for (const f of p.folders || []) if (f._open !== undefined) openFolders[f.id] = f._open
  for (const k of Object.keys(p)) if (k[0] !== '_') delete p[k]
  Object.assign(p, JSON.parse(JSON.stringify(tree)), { path: '' })
  delete p._loadError
  for (const f of p.folders || []) if (f.id in openFolders) f._open = openFolders[f.id]
}

function fixSelection() {
  const p = state.selectedProjectId ? findProject(state.selectedProjectId) : null
  if (!p) return
  if (state.selectedBoardId && !(p.boards || []).some(b => b.id === state.selectedBoardId)) state.selectedBoardId = null
  if (state.selectedDocumentId && !(p.documents || []).some(d => d.id === state.selectedDocumentId)) state.selectedDocumentId = null
}

/* ---------- status ---------- */

function setStatus(s, detail) {
  _status = s
  const el = document.getElementById('syncStatus')
  if (!el) return
  const labels = { live: 'Synced', saving: 'Saving…', pulling: 'Updating…', offline: 'Offline', error: 'Not saved', connecting: 'Connecting…' }
  const cls = s === 'pulling' ? 'saving' : s
  el.className = 'sync-status sync-' + cls
  el.innerHTML = '<span class="sync-dot"></span><span class="sync-label">' + (labels[s] || s) + '</span>'
  el.title = detail || (s === 'live' ? 'Synced with GitHub (' + _cfg.repo + '). Your PC picks changes up within a minute while its pm server runs.' : '')
  el.onclick = () => { if (_status !== 'saving') syncNow(true) }
}

/* ---------- init ---------- */

export async function initGithubMode(hooks) {
  _cfg = getGithubConfig()
  if (!_cfg || !_cfg.repo || !_cfg.token) return false
  _render = hooks.render
  _notify = hooks.notify
  _enabled = true
  document.body.classList.add('pm-github')
  setStatus('connecting')
  loadBlobCache()
  let snap
  try {
    snap = await readSnapshot(await getHead())
  } catch (e) {
    _enabled = false
    showConnectModal(_cfg, 'Could not load ' + _cfg.repo + ': ' + e.message)
    return false
  }
  adopt(snap)
  data.workspaces.splice(0, data.workspaces.length, ...buildWorkspaces(snap))
  if (snap.meta.selfMemberId) state.selfMemberId = snap.meta.selfMemberId
  setUid(maxNumericId())
  markSynced()
  hooks.restoreSelectedState()
  if (!state.selectedWorkspaceId && data.workspaces.length === 1) state.selectedWorkspaceId = data.workspaces[0].id
  _render()
  setStatus('live')
  setInterval(tick, 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow(false)
    else flushNow()
  })
  window.addEventListener('pagehide', () => { flushNow() })
  return true
}

function isDirty() {
  if (JSON.stringify(metaOf()) !== _syncedMeta) return true
  for (const w of data.workspaces) for (const p of w.projects) if (!p._loadError && payload(p) !== _synced[p.id]) return true
  return false
}

function userIsEditing() {
  const a = document.activeElement
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return true
  if (document.getElementById('modal')?.classList.contains('open')) return true
  return false
}

function tick() {
  if (!_enabled || _busy) return
  if (isDirty()) {
    if (!_dirtySince) _dirtySince = Date.now()
    if (Date.now() - _dirtySince >= SAVE_DEBOUNCE_MS) syncNow(false)
    return
  }
  _dirtySince = 0
  if (document.visibilityState === 'visible' && Date.now() - _lastPoll > POLL_MS && !userIsEditing()) syncNow(false)
}

export function flushNow() { return syncNow(false) }

/** Pulls remote changes and pushes local ones (merging when both changed). */
export async function syncNow(showResult) {
  if (!_enabled || _busy) return
  _busy = true
  _lastPoll = Date.now()
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await getHead()
      const dirty = isDirty()
      if (head !== _headSha) {
        setStatus('pulling')
        const snap = await readSnapshot(head)
        mergeRemote(snap)
        adopt(snap)
      }
      if (!isDirty()) {
        if (!dirty) markSynced()
        setStatus('live')
        if (showResult && _notify) _notify('Up to date')
        return
      }
      setStatus('saving')
      const ok = await pushLocal()
      if (ok) {
        _dirtySince = 0
        setStatus('live')
        if (showResult && _notify) _notify('Saved to GitHub')
        return
      }
    }
    setStatus('error', 'Could not save after several tries; will retry.')
  } catch (e) {
    console.error('[github] sync failed', e)
    if (e.status === 401 || e.status === 403 || e.status === 404) {
      setStatus('error', 'GitHub refused the token (' + e.message + '). Use File > GitHub Sync to fix it.')
    } else {
      setStatus(navigator.onLine === false || e instanceof TypeError ? 'offline' : 'error', String(e.message || e))
    }
  } finally {
    _busy = false
  }
}

/** Three-way merge of the remote snapshot into local data (local edits win). */
function mergeRemote(snap) {
  const remoteWs = buildWorkspaces(snap)
  let touched = false
  for (const rw of remoteWs) {
    let lw = data.workspaces.find(w => w.id === rw.id)
    if (!lw) { data.workspaces.push(rw); touched = true; continue }
    const bw = ((_baseMeta && _baseMeta.workspaces) || []).find(w => w.id === rw.id) || {}
    for (const k of ['name', 'color', 'tags', 'members']) {
      const localChanged = !deepEqual(lw[k], bw[k])
      if (!localChanged && !deepEqual(lw[k], rw[k])) { lw[k] = rw[k]; touched = true }
    }
    for (const rp of rw.projects) {
      const lp = lw.projects.find(p => p.id === rp.id)
      if (!lp) { lw.projects.push(rp); touched = true; continue }
      if (rp._loadError) continue
      if (lp._loadError) { replaceProject(lp, rp); touched = true; continue }
      const base = _base[rp.id] || null
      const mine = projectTree(lp)
      const merged = mergeProjects(base, projectTree(rp), mine)
      if (!deepEqual(merged, mine)) { replaceProject(lp, merged); touched = true }
    }
  }
  if (touched) {
    setUid(maxNumericId())
    clearHistory()
    fixSelection()
    if (!userIsEditing()) _render()
  }
}

async function pushLocal() {
  const entries = []
  const desired = {}
  for (const w of data.workspaces) for (const p of w.projects) {
    if (p._loadError) continue
    if (payload(p) === _synced[p.id] && _base[p.id]) continue
    const files = projectFiles(projectTree(p))
    const dir = 'projects/' + p.id + '/'
    for (const name in files) desired[dir + name] = stringify(files[name])
    for (const path in _fileIndex) {
      if (!path.startsWith(dir)) continue
      const name = path.slice(dir.length)
      if ((isEntityFile(name) || name === 'project.json') && !(path in desired)) entries.push({ path, mode: '100644', type: 'blob', sha: null })
    }
  }
  const meta = metaOf()
  // keep project refs the phone does not know about (other workspaces' projects)
  desired['pmsync.json'] = stringify(meta)
  for (const path in desired) {
    const current = _fileIndex[path] ? _blobs[_fileIndex[path]] : undefined
    if (current !== desired[path]) entries.push({ path, mode: '100644', type: 'blob', content: desired[path] })
  }
  if (!entries.length) { markSynced(); _base = {}; for (const w of data.workspaces) for (const p of w.projects) if (!p._loadError) _base[p.id] = projectTree(p); return true }
  const tree = await gh('POST', repoPath() + '/git/trees', { base_tree: _headTree, tree: entries })
  const commit = await gh('POST', repoPath() + '/git/commits', {
    message: 'Edit from ' + (/iPhone|iPad|Android/.test(navigator.userAgent) ? 'phone' : 'browser') + ' ' + new Date().toISOString().slice(0, 16),
    tree: tree.sha, parents: [_headSha],
  })
  try {
    await gh('PATCH', repoPath() + '/git/refs/heads/' + encodeURIComponent(_cfg.branch || 'main'), { sha: commit.sha, force: false })
  } catch (e) {
    if (e.status === 422 || e.status === 409) return false   // someone pushed first: pull, merge, retry
    throw e
  }
  // our commit is the new base
  _headSha = commit.sha
  _headTree = tree.sha
  for (const e of entries) {
    if (e.sha === null) delete _fileIndex[e.path]
  }
  for (const path in desired) {
    // remember content by a synthetic key so the next diff sees it as current
    const key = 'local:' + path
    _blobs[key] = desired[path]
    _fileIndex[path] = key
  }
  _base = {}
  for (const w of data.workspaces) for (const p of w.projects) if (!p._loadError) _base[p.id] = projectTree(p)
  _baseMeta = meta
  markSynced()
  return true
}

/* ---------- connect UI ---------- */

export function showConnectModal(existing, error) {
  const cfg = existing || getGithubConfig() || {}
  const overlay = document.getElementById('modal')
  document.getElementById('modalTitle').textContent = 'GitHub Sync'
  document.getElementById('modalBody').innerHTML =
    '<p class="gh-help">Read and edit your projects from any device. Your PC\'s <code>pm</code> server keeps them in a private GitHub repository; this browser talks to that repository directly. Your token stays on this device.</p>' +
    (error ? '<div class="gh-error">' + error.replace(/</g, '&lt;') + '</div>' : '') +
    '<label>Repository</label><input id="ghRepo" placeholder="owner/repo-name" autocapitalize="off" autocorrect="off" spellcheck="false" value="' + (cfg.repo || '').replace(/"/g, '&quot;') + '">' +
    '<label>Access token</label><input id="ghToken" type="password" placeholder="github_pat_…" autocapitalize="off" autocorrect="off" spellcheck="false" value="' + (cfg.token || '').replace(/"/g, '&quot;') + '">' +
    '<p class="gh-help">Use a fine-grained token limited to this one repository with <b>Contents: Read and write</b>.</p>' +
    '<div class="modal-actions">' +
    (getGithubConfig() ? '<button class="btn-cancel" id="ghDisconnect">Disconnect</button>' : '') +
    '<button class="btn-cancel" id="ghCancel">Cancel</button><button class="btn-confirm" id="ghConnect">Connect</button></div>'
  overlay.classList.add('open')
  document.getElementById('ghCancel').onclick = () => overlay.classList.remove('open')
  const dc = document.getElementById('ghDisconnect')
  if (dc) dc.onclick = () => disconnectGithub()
  document.getElementById('ghConnect').onclick = async () => {
    const repo = document.getElementById('ghRepo').value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
    const token = document.getElementById('ghToken').value.trim()
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return
    const next = { repo, token, branch: cfg.branch || 'main', api: cfg.api }
    _cfg = next
    const btn = document.getElementById('ghConnect')
    btn.textContent = 'Checking…'
    btn.disabled = true
    try {
      const info = await gh('GET', '/repos/' + repo)
      if (info.permissions && info.permissions.push === false) throw new Error('This token cannot write to ' + repo + '.')
      await getHead()
      saveConfig(next)
      location.reload()
    } catch (e) {
      showConnectModal(next, e.status === 409 ? 'The repository is empty. Run "pm sync setup ' + repo + '" on your PC first.' : 'Could not connect: ' + e.message)
    }
  }
}
