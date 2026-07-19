import { data, state, genId, setUid } from './data.js'
import { render } from './sidebar.js'

const DB_NAME = 'kanboard-workspace-v2'
const DB_VERSION = 1
const STORE_NAME = 'handles'
const SAVE_DELAY = 500

let _workspaceHandle = null
let _projectDirHandles = {}
let _saveMode = 'memory'
let _lastSavedTimestamp = null
let _dirty = false
let _saveTimer = null
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

async function saveHandleToDB(key, handle) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(handle, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getHandleFromDB(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function removeHandleFromDB(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getAllKeys() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAllKeys()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(tx.error)
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

function writeToFileHandle(fileHandle, obj) {
  return fileHandle.createWritable().then(function(writable) {
    return writable.write(new TextEncoder().encode(JSON.stringify(obj, null, 2))).then(function() {
      return writable.close()
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

function verifyHandlePermission(handle) {
  return handle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
    if (perm === 'granted') return true
    return handle.requestPermission({ mode: 'readwrite' }).then(function(p) {
      return p === 'granted'
    })
  })
}

/* ======== WORKSPACE FILE ======== */

function getWorkspaceFileData() {
  var w = data.workspaces[0]
  if (!w) return null
  return {
    version: 1,
    workspace: {
      id: w.id,
      name: w.name,
      tags: w.tags || [],
      members: (w.members || []).map(function(m) { return { id: m.id, name: m.name, avatar: m.avatar || '' } })
    },
    projects: (w.projects || []).map(function(p) {
      return { id: p.id, name: p.name, color: p.color || null, path: p.path || '' }
    }),
    state: {
      selectedWorkspaceId: state.selectedWorkspaceId,
      selectedProjectId: state.selectedProjectId,
      selectedBoardId: state.selectedBoardId,
      selectedDocumentId: state.selectedDocumentId,
      selectedCanvasId: state.selectedCanvasId,
      selectedView: state.selectedView,
      selfMemberId: state.selfMemberId
    }
  }
}

function saveWorkspaceFile() {
  if (!_workspaceHandle) return Promise.resolve()
  var wsData = getWorkspaceFileData()
  if (!wsData) return Promise.resolve()
  return writeToFileHandle(_workspaceHandle, wsData).then(function() {
    _lastSavedTimestamp = Date.now()
  })
}

/* ======== PROJECT FOLDER ======== */

function saveProjectToDir(project, dirHandle) {
  var promises = []

  promises.push(writeFile(dirHandle, 'project.json', {
    type: 'project', id: project.id, name: project.name,
    color: project.color || null,
    boards: (project.boards || []).map(function(b) { return b.id }),
    documents: (project.documents || []).map(function(d) { return d.id }),
    canvases: (project.canvasBoards || []).map(function(c) { return c.id })
  }))

  for (var bi = 0; bi < (project.boards || []).length; bi++) {
    var b = project.boards[bi]
    promises.push(writeFile(dirHandle, 'board_' + b.id + '.json', {
      type: 'board', id: b.id, name: b.name, projectId: project.id,
      columns: (b.columns || []).map(function(c) { return c.id }),
      archivedCards: (b.archivedCards || []).map(function(c) { return c.id }),
      archivedColumns: (b.archivedColumns || []).map(function(c) { return c.id })
    }))

    for (var ci = 0; ci < (b.columns || []).length; ci++) {
      var c = b.columns[ci]
      promises.push(writeFile(dirHandle, 'column_' + c.id + '.json', {
        type: 'column', id: c.id, name: c.name, boardId: b.id,
        cards: (c.cards || []).map(function(cd) { return cd.id })
      }))

      for (var cdi = 0; cdi < (c.cards || []).length; cdi++) {
        var cd = c.cards[cdi]
        promises.push(writeFile(dirHandle, 'card_' + cd.id + '.json', {
          type: 'card', id: cd.id, title: cd.title,
          description: cd.description || '', completed: cd.completed || false,
          startDate: cd.startDate || null, endDate: cd.endDate || null,
          priority: cd.priority || '3', tags: cd.tags || [],
          members: cd.members || [], checklists: cd.checklists || [],
          color: cd.color || null, columnId: c.id
        }))
      }
    }

    for (var aci = 0; aci < (b.archivedCards || []).length; aci++) {
      var ac = b.archivedCards[aci]
      promises.push(writeFile(dirHandle, 'card_' + ac.id + '.json', {
        type: 'card', id: ac.id, title: ac.title,
        description: ac.description || '', completed: ac.completed || false,
        startDate: ac.startDate || null, endDate: ac.endDate || null,
        priority: ac.priority || '3', tags: ac.tags || [],
        members: ac.members || [], checklists: ac.checklists || [],
        color: ac.color || null, archived: true, boardId: b.id
      }))
    }

    for (var axci = 0; axci < (b.archivedColumns || []).length; axci++) {
      var axc = b.archivedColumns[axci]
      promises.push(writeFile(dirHandle, 'column_' + axc.id + '.json', {
        type: 'column', id: axc.id, name: axc.name, boardId: b.id,
        archived: true, cards: (axc.cards || []).map(function(cd) { return cd.id })
      }))
      for (var axcdi = 0; axcdi < (axc.cards || []).length; axcdi++) {
        var axcd = axc.cards[axcdi]
        promises.push(writeFile(dirHandle, 'card_' + axcd.id + '.json', {
          type: 'card', id: axcd.id, title: axcd.title,
          description: axcd.description || '', completed: axcd.completed || false,
          startDate: axcd.startDate || null, endDate: axcd.endDate || null,
          priority: axcd.priority || '3', tags: axcd.tags || [],
          members: axcd.members || [], checklists: axcd.checklists || [],
          color: axcd.color || null, archived: true, columnId: axc.id
        }))
      }
    }
  }

  for (var di = 0; di < (project.documents || []).length; di++) {
    var doc = project.documents[di]
    promises.push(writeFile(dirHandle, 'document_' + doc.id + '.json', {
      type: 'document', id: doc.id, name: doc.name,
      content: doc.content || '', projectId: project.id,
      paperSize: doc.paperSize || null, paperZoom: doc.paperZoom || null
    }))
  }

  for (var cai = 0; cai < (project.canvasBoards || []).length; cai++) {
    var ca = project.canvasBoards[cai]
    promises.push(writeFile(dirHandle, 'canvas_' + ca.id + '.json', {
      type: 'canvas', id: ca.id, name: ca.name,
      data: ca.data || null, projectId: project.id
    }))
  }

  return Promise.all(promises)
}

function loadProjectFromDir(dirHandle) {
  var allData = { boards: {}, columns: {}, cards: {}, documents: {}, canvases: {} }
  var loadPromises = []

  function queueLoad(filename, targetMap) {
    loadPromises.push(readJSON(dirHandle, filename).then(function(data) {
      if (data) targetMap[data.id] = data
    }))
  }

  return readJSON(dirHandle, 'project.json').then(function(pMeta) {
    if (!pMeta || pMeta.type !== 'project') return null

    for (var bi = 0; bi < (pMeta.boards || []).length; bi++) {
      queueLoad('board_' + pMeta.boards[bi] + '.json', allData.boards)
    }
    for (var di = 0; di < (pMeta.documents || []).length; di++) {
      queueLoad('document_' + pMeta.documents[di] + '.json', allData.documents)
    }
    for (var cai = 0; cai < (pMeta.canvases || []).length; cai++) {
      queueLoad('canvas_' + pMeta.canvases[cai] + '.json', allData.canvases)
    }

    return Promise.all(loadPromises).then(function() {
      var columnLoadPromises = []
      var boardIds = Object.keys(allData.boards)
      for (var bj = 0; bj < boardIds.length; bj++) {
        var bMeta = allData.boards[boardIds[bj]]
        for (var cj = 0; cj < (bMeta.columns || []).length; cj++) {
          var colId = bMeta.columns[cj]
          columnLoadPromises.push(readJSON(dirHandle, 'column_' + colId + '.json').then(function(data) {
            if (data) allData.columns[data.id] = data
          }))
        }
        for (var acj = 0; acj < (bMeta.archivedColumns || []).length; acj++) {
          columnLoadPromises.push(readJSON(dirHandle, 'column_' + bMeta.archivedColumns[acj] + '.json').then(function(data) {
            if (data) allData.columns[data.id] = data
          }))
        }
      }

      return Promise.all(columnLoadPromises).then(function() {
        var cardLoadPromises = []
        var colIds = Object.keys(allData.columns)
        for (var ck = 0; ck < colIds.length; ck++) {
          var cMeta = allData.columns[colIds[ck]]
          for (var cdk = 0; cdk < (cMeta.cards || []).length; cdk++) {
            cardLoadPromises.push(readJSON(dirHandle, 'card_' + cMeta.cards[cdk] + '.json').then(function(data) {
              if (data) allData.cards[data.id] = data
            }))
          }
        }

        return Promise.all(cardLoadPromises).then(function() {
          return reconstructProject(pMeta, allData)
        })
      })
    })
  })
}

function reconstructProject(pMeta, allData) {
  var project = {
    id: pMeta.id, name: pMeta.name, color: pMeta.color || null,
    boards: [], documents: [], canvasBoards: []
  }

  for (var bi = 0; bi < (pMeta.boards || []).length; bi++) {
    var bMeta = allData.boards[pMeta.boards[bi]]
    if (!bMeta || bMeta.archived) continue
    var newB = { id: bMeta.id, name: bMeta.name, columns: [] }

    for (var ci = 0; ci < (bMeta.columns || []).length; ci++) {
      var cMeta = allData.columns[bMeta.columns[ci]]
      if (!cMeta || cMeta.archived) continue
      var newC = { id: cMeta.id, name: cMeta.name, cards: [] }

      for (var cdi = 0; cdi < (cMeta.cards || []).length; cdi++) {
        var cdMeta = allData.cards[cMeta.cards[cdi]]
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

    var archivedCards = (bMeta.archivedCards || []).slice()
    for (var aci = 0; aci < (bMeta.archivedColumns || []).length; aci++) {
      var acMeta = allData.columns[bMeta.archivedColumns[aci]]
      if (!acMeta) continue
      for (var acdi = 0; acdi < (acMeta.cards || []).length; acdi++) {
        archivedCards.push(acMeta.cards[acdi])
      }
    }
    var seen = {}
    var uniqueArchived = []
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
    project.boards.push(newB)
  }

  for (var di = 0; di < (pMeta.documents || []).length; di++) {
    var dMeta = allData.documents[pMeta.documents[di]]
    if (!dMeta) continue
    project.documents.push({
      id: dMeta.id, name: dMeta.name, content: dMeta.content || '',
      paperSize: dMeta.paperSize || null, paperZoom: dMeta.paperZoom || null
    })
  }

  for (var cai = 0; cai < (pMeta.canvases || []).length; cai++) {
    var caMeta = allData.canvases[pMeta.canvases[cai]]
    if (!caMeta) continue
    project.canvasBoards.push({
      id: caMeta.id, name: caMeta.name, data: caMeta.data || null
    })
  }

  return project
}

/* ======== LOAD WORKSPACE FROM FILE ======== */

function loadWorkspaceFromHandle(fileHandle) {
  var _lastModified = Date.now()
  return fileHandle.getFile().then(function(file) {
    _lastModified = file.lastModified || Date.now()
    return file.text()
  }).then(function(text) {
    var wsData = JSON.parse(text)
    if (!wsData || !wsData.workspace) return null

    var w = wsData.workspace
    var ws = {
      id: w.id,
      name: w.name,
      tags: w.tags || [],
      members: (w.members || []).map(function(m) {
        return { id: m.id, name: m.name, avatar: m.avatar || '' }
      }),
      projects: []
    }

    var loadPromises = []
    var projectList = wsData.projects || []

    for (var pi = 0; pi < projectList.length; pi++) {
      (function(pRef) {
        var p = {
          id: pRef.id,
          name: pRef.name,
          color: pRef.color || null,
          path: pRef.path || '',
          boards: [],
          documents: [],
          canvasBoards: [],
          _loadError: false
        }

        var dirHandle = _projectDirHandles[pRef.id]
        if (dirHandle) {
          loadPromises.push(
            loadProjectFromDir(dirHandle).then(function(loaded) {
              if (loaded) {
                p.boards = loaded.boards || []
                p.documents = loaded.documents || []
                p.canvasBoards = loaded.canvasBoards || []
              }
            }).catch(function() {
              p._loadError = true
            })
          )
        } else {
          p._loadError = true
        }

        ws.projects.push(p)
      })(projectList[pi])
    }

    return Promise.all(loadPromises).then(function() {
      data.workspaces.splice(0, data.workspaces.length)
      data.workspaces.push(ws)

      if (wsData.state) {
        var s = wsData.state
        if (s.selectedWorkspaceId !== undefined) state.selectedWorkspaceId = s.selectedWorkspaceId
        if (s.selfMemberId !== undefined) {
          state.selfMemberId = s.selfMemberId
          if (s.selfMemberId) {
            try { localStorage.setItem('kanboard_self_member', JSON.stringify(s.selfMemberId)) } catch {}
          }
        }
        if (s.selectedView !== undefined) state.selectedView = s.selectedView
      }
      state.selectedProjectId = null
      state.selectedBoardId = null
      state.selectedDocumentId = null
      state.selectedCanvasId = null
      state.selectedDashboard = false

      var allIds = []
      for (var pi2 = 0; pi2 < ws.projects.length; pi2++) {
        var pp = ws.projects[pi2]
        allIds.push(pp.id)
        for (var bi = 0; bi < (pp.boards || []).length; bi++) {
          allIds.push(pp.boards[bi].id)
          for (var ci = 0; ci < (pp.boards[bi].columns || []).length; ci++) {
            allIds.push(pp.boards[bi].columns[ci].id)
            for (var cdi = 0; cdi < (pp.boards[bi].columns[ci].cards || []).length; cdi++) {
              allIds.push(pp.boards[bi].columns[ci].cards[cdi].id)
            }
          }
        }
        for (var di = 0; di < (pp.documents || []).length; di++) allIds.push(pp.documents[di].id)
        for (var cai = 0; cai < (pp.canvasBoards || []).length; cai++) allIds.push(pp.canvasBoards[cai].id)
      }
      var maxNum = 100
      for (var idi = 0; idi < allIds.length; idi++) {
        var num = parseInt(allIds[idi].replace(/^\D+/, ''), 10)
        if (!isNaN(num) && num > maxNum) maxNum = num
      }
      setUid(maxNum)

      _workspaceHandle = fileHandle
      _lastSavedTimestamp = _lastModified

      return preloadMemberAvatars(ws.members).then(function() {
        return ws
      })
    })
  })
}

/* ======== SAVE ALL ======== */

function saveAll() {
  if (_saveMode !== 'workspace' || !_workspaceHandle) return Promise.resolve()

  var promises = []
  var w = data.workspaces[0]

  if (w) {
    for (var pi = 0; pi < (w.projects || []).length; pi++) {
      var p = w.projects[pi]
      var dirHandle = _projectDirHandles[p.id]
      if (dirHandle) {
        promises.push(saveProjectToDir(p, dirHandle))
      }
    }
  }

  promises.push(saveWorkspaceFile())

  return Promise.all(promises).then(function() {
    showNotification('Auto-saved')
  })
}

/* ======== PUBLIC API ======== */

export function createWorkspaceFile() {
  if (!window.showSaveFilePicker) {
    showNotification('Your browser does not support the File System Access API. Use Chrome or Edge.', 4000)
    return Promise.resolve()
  }

  return window.showSaveFilePicker({
    suggestedName: 'workspace.json',
    types: [{ description: 'Workspace File', accept: { 'application/json': ['.json'] } }]
  }).then(function(fileHandle) {
    _workspaceHandle = fileHandle
    data.workspaces.splice(0, data.workspaces.length)
    data.workspaces.push({
      id: genId(),
      name: 'New Workspace',
      tags: [],
      members: [],
      projects: []
    })
    state.selectedWorkspaceId = data.workspaces[0].id
    return saveWorkspaceFile().then(function() {
      return saveHandleToDB('workspace', fileHandle)
    })
  }).then(function() {
    _saveMode = 'workspace'
    updateSaveUI()
    render()
    showNotification('Workspace created')
  }).catch(function(e) {
    if (e.name !== 'AbortError' && e.name !== 'SecurityError') {
      console.error('Error creating workspace:', e)
      showNotification('Error: ' + e.message, 3000)
    }
  })
}

export function openWorkspaceFile() {
  if (!window.showOpenFilePicker) {
    showNotification('Your browser does not support the File System Access API. Use Chrome or Edge.', 4000)
    return Promise.resolve()
  }

  return window.showOpenFilePicker({
    types: [{ description: 'Workspace File', accept: { 'application/json': ['.json'] } }],
    multiple: false
  }).then(function(handles) {
    _workspaceHandle = handles[0]
    _projectDirHandles = {}
    return loadWorkspaceFromHandle(_workspaceHandle)
  }).then(function(result) {
    if (result) {
      return saveHandleToDB('workspace', _workspaceHandle).then(function() {
        _saveMode = 'workspace'
        updateSaveUI()
        render()
        showNotification('Workspace opened')
      })
    }
  }).catch(function(e) {
    if (e.name !== 'AbortError' && e.name !== 'SecurityError') {
      console.error('Error opening workspace:', e)
      showNotification('Error opening workspace: ' + e.message, 3000)
    }
  })
}

export function addProjectFolder() {
  if (!window.showDirectoryPicker) {
    showNotification('Your browser does not support the File System Access API.', 4000)
    return Promise.resolve()
  }

  return window.showDirectoryPicker({ mode: 'readwrite' }).then(function(dirHandle) {
    var w = data.workspaces[0]
    if (!w) return

    var project = {
      id: genId(),
      name: dirHandle.name || 'New Project',
      color: null,
      boards: [],
      documents: [],
      canvasBoards: [],
      path: dirHandle.name || ''
    }

    w.projects.push(project)
    _projectDirHandles[project.id] = dirHandle

    return saveProjectToDir(project, dirHandle).then(function() {
      return saveHandleToDB('project_' + project.id, dirHandle)
    }).then(function() {
      return saveWorkspaceFile()
    }).then(function() {
      state.selectedProjectId = project.id
      render()
      showNotification('Project added: ' + project.name)
    })
  }).catch(function(e) {
    if (e.name !== 'AbortError' && e.name !== 'SecurityError') {
      console.error('Error adding project:', e)
      showNotification('Error: ' + e.message, 3000)
    }
  })
}

export function locateExistingProject() {
  if (!window.showDirectoryPicker) {
    showNotification('Your browser does not support the File System Access API.', 4000)
    return Promise.resolve()
  }

  return window.showDirectoryPicker({ mode: 'readwrite' }).then(function(dirHandle) {
    return readJSON(dirHandle, 'project.json').then(function(pMeta) {
      if (!pMeta || pMeta.type !== 'project') {
        showNotification('No project data found in this folder', 3000)
        return null
      }
      return loadProjectFromDir(dirHandle).then(function(loaded) {
        if (!loaded) {
          showNotification('Failed to load project', 3000)
          return null
        }
        var w = data.workspaces[0]
        if (!w) return null
        loaded.path = dirHandle.name || ''
        loaded._loadError = false
        w.projects.push(loaded)
        _projectDirHandles[loaded.id] = dirHandle
        return saveHandleToDB('project_' + loaded.id, dirHandle).then(function() {
          return saveWorkspaceFile()
        }).then(function() {
          state.selectedProjectId = loaded.id
          render()
          showNotification('Project loaded: ' + loaded.name)
        })
      })
    })
  }).catch(function(e) {
    if (e.name !== 'AbortError' && e.name !== 'SecurityError') {
      console.error('Error locating project:', e)
      showNotification('Error: ' + e.message, 3000)
    }
  })
}

export function locateProjectFolder(projectId) {
  if (!window.showDirectoryPicker) {
    showNotification('Your browser does not support the File System Access API.', 4000)
    return Promise.resolve()
  }

  var w = data.workspaces[0]
  if (!w) return Promise.resolve()
  var p = w.projects.find(function(pj) { return pj.id === projectId })
  if (!p) return Promise.resolve()

  return window.showDirectoryPicker({ mode: 'readwrite' }).then(function(dirHandle) {
    _projectDirHandles[projectId] = dirHandle
    return loadProjectFromDir(dirHandle).then(function(loaded) {
      if (loaded) {
        p.boards = loaded.boards || []
        p.documents = loaded.documents || []
        p.canvasBoards = loaded.canvasBoards || []
        p._loadError = false
        p.name = loaded.name
        p.color = loaded.color || null
        p.path = dirHandle.name || ''
      }
    }).then(function() {
      return saveHandleToDB('project_' + projectId, dirHandle)
    }).then(function() {
      return saveWorkspaceFile()
    }).then(function() {
      render()
      showNotification('Project located and loaded')
    })
  }).catch(function(e) {
    if (e.name !== 'AbortError' && e.name !== 'SecurityError') {
      console.error('Error locating project:', e)
      showNotification('Error: ' + e.message, 3000)
    }
  })
}

export function markDirty() {
  if (_saveMode !== 'workspace' || !_workspaceHandle) return
  _dirty = true
  if (_saveTimer) return
  _saveTimer = setTimeout(function() {
    _saveTimer = null
    if (_dirty) {
      _dirty = false
      saveAll().catch(function(err) {
        console.error('Auto-save error:', err)
      })
    }
  }, SAVE_DELAY)
}

export function saveNow() {
  if (_saveMode !== 'workspace' || !_workspaceHandle) return Promise.resolve()
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  _dirty = false
  return saveAll().then(function() {
    showNotification('Saved!')
  }).catch(function(err) {
    console.error('Save error:', err)
    showNotification('Save failed: ' + err.message, 3000)
  })
}

function updateSaveUI() {
  var openBtn = document.getElementById('openFolderBtn')
  if (openBtn) {
    if (_saveMode === 'workspace' && _workspaceHandle) {
      openBtn.textContent = 'Workspace: Open'
      openBtn.title = 'Open a different workspace file'
    } else {
      openBtn.textContent = 'Open Workspace'
      openBtn.title = 'Open a workspace file'
    }
  }
}

export function closeWorkspace() {
  _workspaceHandle = null
  _projectDirHandles = {}
  _lastSavedTimestamp = null
  _dirty = false
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  _saveMode = 'memory'
  removeHandleFromDB('workspace').catch(function() {})

  getAllKeys().then(function(keys) {
    for (var i = 0; i < (keys || []).length; i++) {
      if (keys[i] !== 'workspace' && typeof keys[i] === 'string' && keys[i].startsWith('project_')) {
        removeHandleFromDB(keys[i]).catch(function() {})
      }
    }
  }).catch(function() {})

  data.workspaces.splice(0, data.workspaces.length)
  state.selectedWorkspaceId = null
  state.selectedProjectId = null
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null

  updateSaveUI()
  render()
  showNotification('Workspace closed')
}

export function initPersistence() {
  if (_initialized) return Promise.resolve()
  _initialized = true

  return getHandleFromDB('workspace').then(function(handle) {
    if (!handle) return
    return verifyHandlePermission(handle).then(function(valid) {
      if (!valid) {
        return removeHandleFromDB('workspace')
      }
      _workspaceHandle = handle
      return getAllKeys().then(function(keys) {
        var projectPromises = []
        for (var i = 0; i < (keys || []).length; i++) {
          var k = keys[i]
          if (typeof k === 'string' && k.startsWith('project_')) {
            projectPromises.push(
              getHandleFromDB(k).then(function(dirHandle) {
                if (dirHandle) {
                  return verifyHandlePermission(dirHandle).then(function(ok) {
                    if (ok) {
                      _projectDirHandles[k.replace('project_', '')] = dirHandle
                    } else {
                      removeHandleFromDB(k).catch(function() {})
                    }
                  })
                }
              })
            )
          }
        }
        return Promise.all(projectPromises)
      }).then(function() {
        return loadWorkspaceFromHandle(_workspaceHandle)
      }).then(function(result) {
        if (result) {
          _saveMode = 'workspace'
          render()
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

export function getSaveMode() {
  return _saveMode
}

export function hasProjectHandle(projectId) {
  return !!_projectDirHandles[projectId]
}

window.closeWorkspace = closeWorkspace
window.__autoSave = markDirty

/* ======== AVATAR SUPPORT ======== */

const _avatarBlobCache = {}

export async function saveAvatarFile(memberId, file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader()
    reader.onload = function() {
      resolve(reader.result)
    }
    reader.onerror = function() {
      reject(reader.error)
    }
    reader.readAsDataURL(file)
  })
}

export async function deleteAvatarFile(filename) {
}

export async function loadAvatarBlobUrl(memberId, dataUrl) {
  if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null
  try {
    var blob = await fetch(dataUrl).then(function(r) { return r.blob() })
    var url = URL.createObjectURL(blob)
    _avatarBlobCache[memberId] = url
    return url
  } catch { return null }
}

export function getResolvedAvatar(member) {
  if (!member || !member.avatar) return null
  if (_avatarBlobCache[member.id]) return _avatarBlobCache[member.id]
  if (member.avatar.indexOf('data:') === 0) return member.avatar
  return null
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
  var promises = []
  for (var i = 0; i < (members || []).length; i++) {
    var m = members[i]
    if (m.avatar && m.avatar.indexOf('data:') === 0) {
      promises.push(loadAvatarBlobUrl(m.id, m.avatar).catch(function() {}))
    }
  }
  await Promise.all(promises)
}
