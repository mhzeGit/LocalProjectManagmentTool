import { data, state, setUid } from './data.js'
import { render } from './sidebar.js'

const DB_NAME = 'kanboard-persistence'
const DB_VERSION = 1
const STORE_NAME = 'folder-handles'
const POLL_INTERVAL = 3000
const SAVE_DELAY = 500

let _folderHandle = null
let _lastSavedTimestamp = null
let _pollTimer = null
let _dirty = false
let _saveTimer = null
let _saveMode = 'memory'
let _initialized = false

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveHandleToDB(handle) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, 'folderHandle')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getHandleFromDB() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get('folderHandle')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function removeHandleFromDB() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete('folderHandle')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function showNotification(msg, duration) {
  duration = duration || 2000
  const el = document.getElementById('saveNotification')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._timeout)
  el._timeout = setTimeout(() => el.classList.remove('show'), duration)
}

function writeFile(handle, name, obj) {
  return handle.getFileHandle(name, { create: true }).then(function(fileHandle) {
    return fileHandle.createWritable().then(function(writable) {
      return writable.write(new TextEncoder().encode(JSON.stringify(obj, null, 2))).then(function() {
        return writable.close()
      })
    })
  })
}

function readFile(handle, name) {
  return handle.getFileHandle(name).then(function(fileHandle) {
    return fileHandle.getFile().then(function(file) {
      return file.text()
    })
  }).catch(function() { return null })
}

function readJSON(handle, name) {
  return readFile(handle, name).then(function(text) {
    if (!text) return null
    try { return JSON.parse(text) } catch { return null }
  })
}

function saveAllToFolder(handle) {
  var manifest = {
    version: 1,
    lastSaved: new Date().toISOString(),
    files: { workspaces: [], members: [], projects: [], boards: [], columns: [], cards: [], documents: [] }
  }

  var promises = []

  for (var wi = 0; wi < data.workspaces.length; wi++) {
    var ws = data.workspaces[wi]
    var wsFilename = 'workspace_' + ws.id + '.json'
    var wsData = {
      type: 'workspace', id: ws.id, name: ws.name,
      tags: (ws.tags || []),
      members: (ws.members || []).map(function(m) { return m.id }),
      projects: (ws.projects || []).map(function(p) { return p.id }),
      archivedProjects: (ws.archivedProjects || []).map(function(p) { return p.id })
    }
    promises.push(writeFile(handle, wsFilename, wsData))
    manifest.files.workspaces.push(wsFilename)

    for (var mi = 0; mi < (ws.members || []).length; mi++) {
      var m = ws.members[mi]
      var mFilename = 'member_' + m.id + '.json'
      promises.push(writeFile(handle, mFilename, { type: 'member', id: m.id, name: m.name, avatar: m.avatar || '' }))
      manifest.files.members.push(mFilename)
    }

    for (var pi = 0; pi < (ws.projects || []).length; pi++) {
      var p = ws.projects[pi]
      var pFilename = 'project_' + p.id + '.json'
      var pData = {
        type: 'project', id: p.id, name: p.name, workspaceId: ws.id,
        color: p.color || null,
        boards: (p.boards || []).map(function(b) { return b.id }),
        documents: (p.documents || []).map(function(d) { return d.id })
      }
      promises.push(writeFile(handle, pFilename, pData))
      manifest.files.projects.push(pFilename)

      for (var bi = 0; bi < (p.boards || []).length; bi++) {
        var b = p.boards[bi]
        var bFilename = 'board_' + b.id + '.json'
        var bData = {
          type: 'board', id: b.id, name: b.name, projectId: p.id,
          columns: (b.columns || []).map(function(c) { return c.id }),
          archivedCards: (b.archivedCards || []).map(function(c) { return c.id }),
          archivedColumns: (b.archivedColumns || []).map(function(c) { return c.id })
        }
        promises.push(writeFile(handle, bFilename, bData))
        manifest.files.boards.push(bFilename)

        for (var ci = 0; ci < (b.columns || []).length; ci++) {
          var c = b.columns[ci]
          var cFilename = 'column_' + c.id + '.json'
          var cData = {
            type: 'column', id: c.id, name: c.name, boardId: b.id,
            cards: (c.cards || []).map(function(cd) { return cd.id })
          }
          promises.push(writeFile(handle, cFilename, cData))
          manifest.files.columns.push(cFilename)

          for (var cdi = 0; cdi < (c.cards || []).length; cdi++) {
            var cd = c.cards[cdi]
            var cdFilename = 'card_' + cd.id + '.json'
            promises.push(writeFile(handle, cdFilename, {
              type: 'card', id: cd.id, title: cd.title,
              description: cd.description || '', completed: cd.completed || false,
              startDate: cd.startDate || null, endDate: cd.endDate || null,
              priority: cd.priority || '3', tags: cd.tags || [],
              members: cd.members || [], checklists: cd.checklists || [],
              color: cd.color || null, columnId: c.id
            }))
            manifest.files.cards.push(cdFilename)
          }
        }

        for (var aci = 0; aci < (b.archivedCards || []).length; aci++) {
          var ac = b.archivedCards[aci]
          var acFilename = 'card_' + ac.id + '.json'
          promises.push(writeFile(handle, acFilename, {
            type: 'card', id: ac.id, title: ac.title,
            description: ac.description || '', completed: ac.completed || false,
            startDate: ac.startDate || null, endDate: ac.endDate || null,
            priority: ac.priority || '3', tags: ac.tags || [],
            members: ac.members || [], checklists: ac.checklists || [],
            color: ac.color || null, archived: true, boardId: b.id
          }))
          manifest.files.cards.push(acFilename)
        }

        for (var axci = 0; axci < (b.archivedColumns || []).length; axci++) {
          var axc = b.archivedColumns[axci]
          var axcFilename = 'column_' + axc.id + '.json'
          promises.push(writeFile(handle, axcFilename, {
            type: 'column', id: axc.id, name: axc.name, boardId: b.id,
            archived: true, cards: (axc.cards || []).map(function(cd) { return cd.id })
          }))
          manifest.files.columns.push(axcFilename)

          for (var axcdi = 0; axcdi < (axc.cards || []).length; axcdi++) {
            var axcd = axc.cards[axcdi]
            var axcdFilename = 'card_' + axcd.id + '.json'
            promises.push(writeFile(handle, axcdFilename, {
              type: 'card', id: axcd.id, title: axcd.title,
              description: axcd.description || '', completed: axcd.completed || false,
              startDate: axcd.startDate || null, endDate: axcd.endDate || null,
              priority: axcd.priority || '3', tags: axcd.tags || [],
              members: axcd.members || [], checklists: axcd.checklists || [],
              color: axcd.color || null, archived: true, columnId: axc.id
            }))
            manifest.files.cards.push(axcdFilename)
          }
        }
      }

      for (var di = 0; di < (p.documents || []).length; di++) {
        var doc = p.documents[di]
        var dFilename = 'document_' + doc.id + '.json'
        promises.push(writeFile(handle, dFilename, {
          type: 'document', id: doc.id, name: doc.name,
          content: doc.content || '', projectId: p.id,
          paperSize: doc.paperSize || null,
          paperZoom: doc.paperZoom || null
        }))
        manifest.files.documents.push(dFilename)
      }
    }

    for (var api = 0; api < (ws.archivedProjects || []).length; api++) {
      var ap = ws.archivedProjects[api]
      var apFilename = 'project_' + ap.id + '.json'
      promises.push(writeFile(handle, apFilename, {
        type: 'project', id: ap.id, name: ap.name, workspaceId: ws.id,
        color: ap.color || null, archived: true,
        boards: (ap.boards || []).map(function(b) { return b.id }),
        documents: (ap.documents || []).map(function(d) { return d.id })
      }))
      manifest.files.projects.push(apFilename)
    }
  }

  promises.push(writeFile(handle, '_state.json', {
    selectedWorkspaceId: state.selectedWorkspaceId,
    selectedProjectId: state.selectedProjectId,
    selectedBoardId: state.selectedBoardId,
    selectedDocumentId: state.selectedDocumentId,
    selectedView: state.selectedView,
    selfMemberId: state.selfMemberId
  }))

  return Promise.all(promises).then(function() {
    return writeFile(handle, 'manifest.json', manifest)
  }).then(function() {
    _lastSavedTimestamp = manifest.lastSaved
  })
}

function loadAllFromFolder(handle) {
  return readJSON(handle, 'manifest.json').then(function(manifest) {
    if (!manifest) return null

    var loadPromises = []
    var allData = { workspaces: [], members: {}, projects: {}, boards: {}, columns: {}, cards: {}, documents: {} }

    function loadFiles(fileList, target) {
      for (var i = 0; i < fileList.length; i++) {
        loadPromises.push(readJSON(handle, fileList[i]).then(function(data) {
          if (data) target[data.id] = data
        }))
      }
    }

    loadFiles(manifest.files.workspaces || [], allData.workspaces)
    loadFiles(manifest.files.members || [], allData.members)
    loadFiles(manifest.files.projects || [], allData.projects)
    loadFiles(manifest.files.boards || [], allData.boards)
    loadFiles(manifest.files.columns || [], allData.columns)
    loadFiles(manifest.files.cards || [], allData.cards)
    loadFiles(manifest.files.documents || [], allData.documents)

    var statePromise = readJSON(handle, '_state.json')

    return Promise.all(loadPromises).then(function() {
      return statePromise.then(function(stateData) {
        return reconstructData(allData, stateData)
      })
    })
  })
}

function reconstructData(allData, stateData) {
  var newData = { workspaces: [] }
  var wsList = Object.values(allData.workspaces)

  for (var wi = 0; wi < wsList.length; wi++) {
    var wsMeta = wsList[wi]
    var newWs = { id: wsMeta.id, name: wsMeta.name, tags: wsMeta.tags || [] }
    newWs.members = (wsMeta.members || []).map(function(mId) {
      var m = allData.members[mId]
      return m ? { id: m.id, name: m.name, avatar: m.avatar || '' } : null
    }).filter(Boolean)

    newWs.projects = []
    for (var pi = 0; pi < (wsMeta.projects || []).length; pi++) {
      var pId = wsMeta.projects[pi]
      var pMeta = allData.projects[pId]
      if (!pMeta || pMeta.archived) continue

      var newP = { id: pMeta.id, name: pMeta.name, color: pMeta.color || null, boards: [], documents: [] }

      for (var bi = 0; bi < (pMeta.boards || []).length; bi++) {
        var bId = pMeta.boards[bi]
        var bMeta = allData.boards[bId]
        if (!bMeta || bMeta.archived) continue

        var newB = { id: bMeta.id, name: bMeta.name, columns: [] }

        for (var ci = 0; ci < (bMeta.columns || []).length; ci++) {
          var cId = bMeta.columns[ci]
          var cMeta = allData.columns[cId]
          if (!cMeta || cMeta.archived) continue

          var newC = { id: cMeta.id, name: cMeta.name, cards: [] }

          for (var cdi = 0; cdi < (cMeta.cards || []).length; cdi++) {
            var cdId = cMeta.cards[cdi]
            var cdMeta = allData.cards[cdId]
            if (!cdMeta) continue
            newC.cards.push({
              id: cdMeta.id, title: cdMeta.title,
              description: cdMeta.description || '',
              completed: cdMeta.completed || false,
              startDate: cdMeta.startDate || null,
              endDate: cdMeta.endDate || null,
              priority: cdMeta.priority || '3',
              tags: cdMeta.tags || [],
              members: cdMeta.members || [],
              checklists: cdMeta.checklists || [],
              color: cdMeta.color || null
            })
          }

          newB.columns.push(newC)
        }

        var archivedCards = bMeta.archivedCards || []
        if ((bMeta.archivedColumns || []).length > 0) {
          for (var aci = 0; aci < (bMeta.archivedColumns || []).length; aci++) {
            var acMeta = allData.columns[bMeta.archivedColumns[aci]]
            if (!acMeta) continue
            for (var acdi = 0; acdi < (acMeta.cards || []).length; acdi++) {
              var acdMeta = allData.cards[acMeta.cards[acdi]]
              if (acdMeta) archivedCards.push(acdMeta.id)
            }
          }
        }

        var uniqueArchived = []
        var seen = {}
        for (var aai = 0; aai < archivedCards.length; aai++) {
          if (!seen[archivedCards[aai]]) {
            seen[archivedCards[aai]] = true
            uniqueArchived.push(archivedCards[aai])
          }
        }

        if (uniqueArchived.length > 0) {
          newB.archivedCards = []
          for (var uai = 0; uai < uniqueArchived.length; uai++) {
            var cdMeta = allData.cards[uniqueArchived[uai]]
            if (!cdMeta) continue
            newB.archivedCards.push({
              id: cdMeta.id, title: cdMeta.title,
              description: cdMeta.description || '',
              completed: cdMeta.completed || false,
              startDate: cdMeta.startDate || null,
              endDate: cdMeta.endDate || null,
              priority: cdMeta.priority || '3',
              tags: cdMeta.tags || [],
              members: cdMeta.members || [],
              checklists: cdMeta.checklists || [],
              color: cdMeta.color || null
            })
          }
        }

        newP.boards.push(newB)
      }

      for (var di = 0; di < (pMeta.documents || []).length; di++) {
        var dId = pMeta.documents[di]
        var dMeta = allData.documents[dId]
        if (!dMeta) continue
        newP.documents.push({ id: dMeta.id, name: dMeta.name, content: dMeta.content || '', paperSize: dMeta.paperSize || null, paperZoom: dMeta.paperZoom || null })
      }

      newWs.projects.push(newP)
    }

    newWs.archivedProjects = []
    for (var api = 0; api < (wsMeta.archivedProjects || []).length; api++) {
      var apMeta = allData.projects[wsMeta.archivedProjects[api]]
      if (!apMeta || !apMeta.archived) continue
      newWs.archivedProjects.push({ id: apMeta.id, name: apMeta.name, color: apMeta.color || null, boards: [] })
    }
    if (newWs.archivedProjects.length === 0) delete newWs.archivedProjects

    newData.workspaces.push(newWs)
  }

  var allIds = [].concat(
    Object.keys(allData.cards),
    Object.keys(allData.members),
    Object.keys(allData.projects),
    Object.keys(allData.boards),
    Object.keys(allData.columns),
    Object.keys(allData.documents)
  )
  var maxNum = 100
  for (var idi = 0; idi < allIds.length; idi++) {
    var num = parseInt(allIds[idi].replace(/^\D+/, ''), 10)
    if (!isNaN(num) && num > maxNum) maxNum = num
  }

  return { data: newData, state: stateData, maxId: maxNum }
}

function applyLoadedData(result, message) {
  message = message || 'Data loaded from folder'
  data.workspaces.splice(0, data.workspaces.length)
  for (var i = 0; i < result.data.workspaces.length; i++) {
    data.workspaces.push(result.data.workspaces[i])
  }

  if (result.state) {
    if (result.state.selectedWorkspaceId !== undefined) state.selectedWorkspaceId = result.state.selectedWorkspaceId
    if (result.state.selectedProjectId !== undefined) state.selectedProjectId = result.state.selectedProjectId
    if (result.state.selectedBoardId !== undefined) state.selectedBoardId = result.state.selectedBoardId
    if (result.state.selectedDocumentId !== undefined) state.selectedDocumentId = result.state.selectedDocumentId
    if (result.state.selectedView !== undefined) state.selectedView = result.state.selectedView
    if (result.state.selfMemberId !== undefined) {
      state.selfMemberId = result.state.selfMemberId
      if (result.state.selfMemberId) {
        try { localStorage.setItem('kanboard_self_member', JSON.stringify(result.state.selfMemberId)) } catch {}
      }
    }
  }

  if (result.maxId) setUid(result.maxId)

  render()
  showNotification(message)
}

export function markDirty() {

  if (_saveMode !== 'file' || !_folderHandle) return
  _dirty = true
  if (_saveTimer) return
  _saveTimer = setTimeout(function() {
    _saveTimer = null
    if (_dirty) {
      _dirty = false
      saveAllToFolder(_folderHandle).then(function() {
        showNotification('Auto-saved')
      }).catch(function(err) {
        console.error('Auto-save error:', err)
      })
    }
  }, SAVE_DELAY)
}

export function saveNow() {
  if (_saveMode !== 'file' || !_folderHandle) return Promise.resolve()
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  _dirty = false
  return saveAllToFolder(_folderHandle).then(function() {
    showNotification('Saved!')
  }).catch(function(err) {
    console.error('Save error:', err)
    showNotification('Save failed: ' + err.message, 3000)
  })
}

function checkExternalChanges() {
  if (!_folderHandle) return

  _folderHandle.getFileHandle('manifest.json').then(function(fileHandle) {
    return fileHandle.getFile()
  }).then(function(file) {
    return file.text()
  }).then(function(text) {
    try {
      var manifest = JSON.parse(text)
      if (manifest.lastSaved && manifest.lastSaved !== _lastSavedTimestamp) {
        _lastSavedTimestamp = manifest.lastSaved
        return loadAllFromFolder(_folderHandle)
      }
    } catch {}
    return null
  }).then(function(result) {
    if (result) {
      return applyLoadedData(result, 'External changes detected - reloaded')
    }
  }).catch(function() {})
}

function startPolling() {
  stopPolling()
  _pollTimer = setInterval(checkExternalChanges, POLL_INTERVAL)
}

function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer)
    _pollTimer = null
  }
}

function updateSaveUI() {
  var openBtn = document.getElementById('openFolderBtn')

  if (_saveMode === 'file' && _folderHandle) {
    if (openBtn) openBtn.style.display = 'none'
  } else {
    if (openBtn) openBtn.style.display = ''
  }
}

export function openFolder() {
  if (!window.showDirectoryPicker) {
    showNotification('Your browser does not support the File System Access API. Use Chrome or Edge.', 4000)
    return Promise.resolve()
  }

  return window.showDirectoryPicker({ mode: 'readwrite' }).then(function(handle) {
    _folderHandle = handle
    return saveHandleToDB(handle)
  }).then(function() {
    return loadAllFromFolder(_folderHandle)
  }).then(function(result) {
    if (result) {
      _lastSavedTimestamp = result.maxId ? new Date().toISOString() : null
      return readJSON(_folderHandle, 'manifest.json').then(function(manifest) {
        if (manifest) _lastSavedTimestamp = manifest.lastSaved
        return applyLoadedData(result)
      }).then(function() {
        return preloadMemberAvatars((result.data.workspaces.reduce(function(acc, w) { return acc.concat(w.members || []) }, [])))
      })
    }
  }).then(function() {
    _saveMode = 'file'
    startPolling()
    updateSaveUI()
    showNotification('Folder opened - auto-save active')
  }).catch(function(e) {
    if (e.name !== 'AbortError' && e.name !== 'SecurityError') {
      console.error('Error opening folder:', e)
      showNotification('Error opening folder: ' + e.message, 3000)
    }
  })
}

export function closeFolder() {
  stopPolling()
  clearAllAvatarBlobUrls()
  _folderHandle = null
  _lastSavedTimestamp = null
  _dirty = false
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  _saveMode = 'memory'
  removeHandleFromDB().catch(function() {})
  updateSaveUI()
  showNotification('Folder closed - data is now in-memory only')
}



export function initPersistence() {
  if (_initialized) return Promise.resolve()
  _initialized = true

  return getHandleFromDB().then(function(handle) {
    if (!handle) return
    return handle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
      if (perm === 'granted') return handle
      return handle.requestPermission({ mode: 'readwrite' }).then(function(p) {
        return p === 'granted' ? handle : null
      })
    }).then(function(validHandle) {
      if (!validHandle) return removeHandleFromDB()
      _folderHandle = validHandle
      return readJSON(validHandle, 'manifest.json').then(function(manifest) {
        if (manifest) {
          _lastSavedTimestamp = manifest.lastSaved
          return loadAllFromFolder(validHandle)
        }
        return null
      }).then(function(result) {
        if (result) {
          _saveMode = 'file'
          return applyLoadedData(result).then(function() {
            return preloadMemberAvatars(result.data.workspaces.reduce(function(acc, w) { return acc.concat(w.members || []) }, []))
          }).then(function() {
            startPolling()
          })
        }
        return null
      })
    })
  }).then(function() {
    updateSaveUI()
  }).catch(function(err) {
    console.error('Persistence init error:', err)
    updateSaveUI()
  })
}

export function handleKeyDown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveNow()
  }
}

window.openFolder = openFolder
window.saveNow = saveNow

window.__autoSave = markDirty

/* --- Avatar file management --- */

const _avatarBlobCache = {}

export async function saveAvatarFile(memberId, file) {
  if (!_folderHandle) return null
  var ext = (file.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
  var filename = 'avatar_' + memberId + '.' + ext
  var fileHandle = await _folderHandle.getFileHandle(filename, { create: true })
  var writable = await fileHandle.createWritable()
  await writable.write(file)
  await writable.close()
  return filename
}

export async function deleteAvatarFile(filename) {
  if (!_folderHandle || !filename) return
  try { await _folderHandle.removeEntry(filename) } catch (e) { /* ignore */ }
}

export async function loadAvatarBlobUrl(memberId, filename) {
  if (!_folderHandle || !filename) return null
  try {
    var fileHandle = await _folderHandle.getFileHandle(filename)
    var file = await fileHandle.getFile()
    var url = URL.createObjectURL(file)
    _avatarBlobCache[memberId] = url
    return url
  } catch (e) { return null }
}

export function getResolvedAvatar(member) {
  if (!member || !member.avatar) return null
  if (member.avatar.indexOf('://') !== -1 || member.avatar.indexOf('data:') === 0) {
    return member.avatar
  }
  return _avatarBlobCache[member.id] || null
}

function clearAllAvatarBlobUrls() {
  var ids = Object.keys(_avatarBlobCache)
  for (var i = 0; i < ids.length; i++) {
    URL.revokeObjectURL(_avatarBlobCache[ids[i]])
    delete _avatarBlobCache[ids[i]]
  }
}

export function clearAvatarFromCache(memberId) {
  if (_avatarBlobCache[memberId]) {
    URL.revokeObjectURL(_avatarBlobCache[memberId])
    delete _avatarBlobCache[memberId]
  }
}

export async function preloadMemberAvatars(members) {
  if (!_folderHandle) return
  var promises = []
  for (var i = 0; i < members.length; i++) {
    var m = members[i]
    if (m.avatar && m.avatar.indexOf('://') === -1 && m.avatar.indexOf('data:') !== 0) {
      promises.push(loadAvatarBlobUrl(m.id, m.avatar).catch(function() {}))
    }
  }
  await Promise.all(promises)
}

export function getSaveMode() {
  return _saveMode
}
