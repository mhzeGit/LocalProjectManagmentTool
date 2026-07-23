import { state, findProject } from './data.js'
import { renderBoard } from './board.js'
import { initDragDrop, isCardDragActive } from './dragdrop.js'
import { renderMemberBar } from './members.js'
import { updateMenuBar } from './menubar.js'
import { pushCommand } from './history.js'

let _sidebarDragData = null
let _lastClickedKey = null
let _sidebarNavIndex = -1
let _sidebarNavItems = []

function getItemByType(p, type, id) {
  if (type === 'board') return p.boards.find(b => b.id === id)
  if (type === 'document') return (p.documents || []).find(d => d.id === id)
  if (type === 'canvas') return (p.canvasBoards || []).find(c => c.id === id)
  return null
}

function getFolderById(p, id) {
  return (p.folders || []).find(f => f.id === id)
}

function ensureSidebarOrder(p) {
  if (!p.sidebarOrder) {
    p.sidebarOrder = []
    for (const b of p.boards) p.sidebarOrder.push('board:' + b.id)
    for (const d of (p.documents || [])) p.sidebarOrder.push('document:' + d.id)
    for (const c of (p.canvasBoards || [])) p.sidebarOrder.push('canvas:' + c.id)
  }
  if (!p.folders) p.folders = []
  for (const f of p.folders) {
    if (!f.itemOrder) f.itemOrder = []
  }
}

function getItemKeyFromEl(el) {
  if (el.classList.contains('nav-child')) {
    return el.dataset.sidebarType + ':' + el.dataset.sidebarId
  }
  if (el.classList.contains('sidebar-folder')) {
    return 'folder:' + el.dataset.folderId
  }
  return null
}

function flipRender(fn) {
  const sidebar = document.getElementById('sidebarContent')
  const oldItems = []
  const itemEls = sidebar.querySelectorAll(':scope > .nav-child[draggable], :scope > .sidebar-folder[draggable], .sidebar-folder-items > .nav-child[draggable]')
  itemEls.forEach(function(el) {
    oldItems.push({
      key: getItemKeyFromEl(el),
      rect: el.getBoundingClientRect()
    })
  })

  fn()

  requestAnimationFrame(function() {
    const newEls = sidebar.querySelectorAll(':scope > .nav-child[draggable], :scope > .sidebar-folder[draggable], .sidebar-folder-items > .nav-child[draggable]')
    newEls.forEach(function(el) {
      const key = getItemKeyFromEl(el)
      const old = key && oldItems.find(function(o) { return o.key === key })
      if (old) {
        const newRect = el.getBoundingClientRect()
        const dx = old.rect.left - newRect.left
        const dy = old.rect.top - newRect.top
        if (dx !== 0 || dy !== 0) {
          el.style.transition = 'none'
          el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)'
        }
      }
    })

    requestAnimationFrame(function() {
      newEls.forEach(function(el) {
        if (el.style.transform) {
          el.style.transition = 'transform 0.22s cubic-bezier(0.25, 0.8, 0.25, 1)'
          el.style.transform = 'translate(0, 0)'
        }
      })
      setTimeout(function() {
        newEls.forEach(function(el) {
          el.style.transition = ''
          el.style.transform = ''
        })
      }, 250)
    })
  })
}

const _boardIcon = '<svg class="item-icon item-icon-board" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M3.2 4l.8.8L6 3.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 4h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><rect x="2.5" y="6.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M7 8h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><rect x="2.5" y="10.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M7 12h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>'
const _docIcon = '<svg class="item-icon item-icon-document" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="1.5" width="11" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10 1.5V4.5H13" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="9.5" x2="11" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
const _canvasIcon = '<svg class="item-icon item-icon-canvas" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="0.5" y="0.5" width="15" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="5.5" y1="0.5" x2="5.5" y2="15.5" stroke="currentColor" stroke-width="1"/><line x1="10.5" y1="0.5" x2="10.5" y2="15.5" stroke="currentColor" stroke-width="1"/><line x1="0.5" y1="5.5" x2="15.5" y2="5.5" stroke="currentColor" stroke-width="1"/><line x1="0.5" y1="10.5" x2="15.5" y2="10.5" stroke="currentColor" stroke-width="1"/></svg>'
const _folderIcon = '<svg class="item-icon item-icon-folder" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5V13C1.5 13.5523 1.94772 14 2.5 14H13.5C14.0523 14 14.5 13.5523 14.5 13V5.5C14.5 4.94772 14.0523 4.5 13.5 4.5H8L6.5 3H2.5C1.94772 3 1.5 3.44772 1.5 4V4.5Z" fill="currentColor"/></svg>'
const _icons = { board: _boardIcon, document: _docIcon, canvas: _canvasIcon }

export function render() {
  const sidebarEl = document.getElementById('sidebar')
  if (state.selectedProjectId && state.selectedWorkspaceId) {
    sidebarEl.classList.remove('hidden')
  } else {
    sidebarEl.classList.add('hidden')
  }

  const sidebar = document.getElementById('sidebarContent')

  if (!state.selectedProjectId) {
    sidebar.innerHTML = '<div class="sidebar-hint">Select a project to view boards</div>'
    renderBoard()
    renderMemberBar()
    updateMenuBar()
    if (window.__autoSave) window.__autoSave()
    return
  }

  const p = findProject(state.selectedProjectId)
  if (!p) {
    sidebar.innerHTML = ''
    renderBoard()
    renderMemberBar()
    updateMenuBar()
    if (window.__autoSave) window.__autoSave()
    return
  }

  ensureSidebarOrder(p)

  let html = '<div class="sidebar-project-name" id="projectTitle-' + p.id + '">' + p.name + '</div>'
  const dashActive = state.selectedDashboard ? ' active' : ''
  html += `<div class="nav-child${dashActive}" onclick="selectDashboard()">
    <span class="name">Dashboard</span>
  </div>`
  html += '<div class="section-title" style="margin-top:12px"><span>Items</span><span class="btn-add-board" onclick="toggleAddBoardMenu(event,\'' + p.id + '\')">+</span></div>'

  for (const entry of p.sidebarOrder) {
    const colonIdx = entry.indexOf(':')
    const entryType = entry.substring(0, colonIdx)
    const entryId = entry.substring(colonIdx + 1)

    if (entryType === 'folder') {
      const folder = getFolderById(p, entryId)
      if (!folder) continue
      const isOpen = folder._open !== false
      const folderKey = 'folder:' + folder.id
      const folderSelected = state.selectedSidebarItems.indexOf(folderKey) !== -1
      html += '<div class="sidebar-folder' + (folderSelected ? ' multi-selected' : '') + '" data-folder-id="' + folder.id + '" data-sidebar-key="' + folderKey + '" draggable="true">'
      html += '<div class="sidebar-folder-header' + (folderSelected ? ' multi-selected' : '') + '" data-sidebar-key="' + folderKey + '" tabindex="0" onclick="handleFolderClick(event,\'' + folder.id + '\')" oncontextmenu="event.stopPropagation();showFolderContextMenu(event,\'' + folder.id + '\')">'
      html += '<span class="arrow' + (isOpen ? ' open' : '') + '">' + String.fromCharCode(9654) + '</span>'
      html += _folderIcon
      if (state.renamingFolderId === folder.id) {
        html += '<input type="text" class="sidebar-folder-rename-input" value="' + folder.name.replace(/"/g, '&quot;').replace(/&/g, '&amp;') + '" data-folder-id="' + folder.id + '" />'
      } else {
        html += '<span class="name" ondblclick="event.stopPropagation();renameFolder(\'' + folder.id + '\')">' + folder.name + '</span>'
      }
      html += '<button class="btn-del" onclick="event.stopPropagation();deleteFolder(\'' + folder.id + '\')">' + String.fromCharCode(10005) + '</button>'
      html += '</div>'
      html += '<div class="sidebar-folder-items' + (isOpen ? ' open' : '') + '">'
      for (const fi of folder.itemOrder) {
        const fcolonIdx = fi.indexOf(':')
        const fiType = fi.substring(0, fcolonIdx)
        const fiId = fi.substring(fcolonIdx + 1)
        const item = getItemByType(p, fiType, fiId)
        if (!item) continue
        html += renderNavChild(p, fiType, item, _icons, folder.id)
      }
      html += '</div></div>'
    } else {
      const item = getItemByType(p, entryType, entryId)
      if (!item) continue
      html += renderNavChild(p, entryType, item, _icons, null)
    }
  }

  if (state.selectedSidebarItems.length > 0) {
    html += '<div class="sidebar-multi-toolbar">'
    html += '<span class="multi-count">' + state.selectedSidebarItems.length + ' selected</span>'
    html += '<button class="multi-btn" onclick="moveSelectedUp()" title="Move Up">&#9650;</button>'
    html += '<button class="multi-btn" onclick="moveSelectedDown()" title="Move Down">&#9660;</button>'
    const hasFolders = (p.folders || []).length > 0
    if (hasFolders) {
      html += '<button class="multi-btn" onclick="showMoveToFolderMenu(event)" title="Move to Folder">&#128193;</button>'
    }
    html += '<button class="multi-btn multi-btn-clear" onclick="clearMultiSelection()" title="Clear Selection">&#10005;</button>'
    html += '</div>'
  }

  sidebar.innerHTML = html
  renderBoard()
  initDragDrop(render)
  initSidebarDrag()
  initSidebarReorder()
  initSidebarContextMenu()
  initSidebarKeyboardNav()
  resetSidebarNavFocus()
  if (state.selectedSidebarItems.length > 0) {
    var lastKey = state.selectedSidebarItems[state.selectedSidebarItems.length - 1]
    var focusEl = sidebar.querySelector('.sidebar-folder-header[data-sidebar-key="' + lastKey + '"]') || sidebar.querySelector('[data-sidebar-key="' + lastKey + '"]')
    if (focusEl) focusEl.focus({ preventScroll: true })
  }
  renderMemberBar()
  updateMenuBar()
  if (window.__autoSave) window.__autoSave()

  if (state.renamingFolderId) {
    const input = sidebar.querySelector('.sidebar-folder-rename-input')
    if (input) {
      input.focus()
      input.select()
      input.addEventListener('blur', function() { finishFolderRename(input) })
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          input.blur()
        } else if (e.key === 'Escape') {
          state.renamingFolderId = null
          render()
        }
      })
    }
  }

  if (state.renamingSidebarItemId && state.renamingSidebarItemType) {
    const input = sidebar.querySelector('.sidebar-item-rename-input')
    if (input) {
      input.focus()
      input.select()
      input.addEventListener('blur', function() { finishSidebarItemRename(input) })
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          input.blur()
        } else if (e.key === 'Escape') {
          state.renamingSidebarItemId = null
          state.renamingSidebarItemType = null
          render()
        }
      })
    }
  }
}

function finishFolderRename(input) {
  const id = input.dataset.folderId
  const p = findProject(state.selectedProjectId)
  if (!p) return
  const folder = (p.folders || []).find(f => f.id === id)
  if (!folder) return
  const oldName = folder.name
  const newName = input.value.trim() || 'New Folder'
  state.renamingFolderId = null
  if (newName === oldName) {
    render()
    return
  }
  folder.name = newName
  render()
  pushCommand({
    undo() { folder.name = oldName; render() },
    redo() { folder.name = newName; render() },
    description: 'Rename Folder'
  })
}

function renderNavChild(p, type, item, icons, folderId) {
  let active = false
  if (type === 'board') { active = state.selectedBoardId === item.id }
  else if (type === 'document') { active = state.selectedDocumentId === item.id }
  else if (type === 'canvas') { active = state.selectedCanvasId === item.id }
  const key = type + ':' + item.id
  const multiSelected = state.selectedSidebarItems.indexOf(key) !== -1
  const activeClass = active ? ' active' : ''
  const multiClass = multiSelected ? ' multi-selected' : ''
  const boardAttr = type === 'board' ? ' data-board-id="' + item.id + '"' : ''
  const folderAttr = folderId ? ' data-folder-id="' + folderId + '"' : ''
  const isRenaming = state.renamingSidebarItemId === item.id && state.renamingSidebarItemType === type
  const nameHtml = isRenaming
    ? '<input type="text" class="sidebar-item-rename-input" value="' + item.name.replace(/"/g, '&quot;').replace(/&/g, '&amp;') + '" data-sidebar-item-id="' + item.id + '" data-sidebar-item-type="' + type + '" onclick="event.stopPropagation()" />'
    : '<span class="name" ondblclick="event.stopPropagation();startRenameSidebarItem(\'' + item.id + '\',\'' + type + '\')">' + item.name + '</span>'
  return '<div class="nav-child' + activeClass + multiClass + '" draggable="true" tabindex="0"' + boardAttr + folderAttr + ' data-sidebar-type="' + type + '" data-sidebar-id="' + item.id + '" data-sidebar-key="' + key + '" onclick="handleSidebarItemClick(event,\'' + type + '\',\'' + item.id + '\')" oncontextmenu="event.stopPropagation();showNavChildContextMenu(event,\'' + type + '\',\'' + item.id + '\')">' +
    icons[type] +
    nameHtml +
    '<button class="btn-del" onclick="event.stopPropagation();window.' + (type === 'board' ? 'deleteBoard' : type === 'document' ? 'deleteDocument' : 'deleteCanvas') + '(\'' + item.id + '\')">' + String.fromCharCode(10005) + '</button>' +
    '</div>'
}

function initSidebarDrag() {
  const sidebar = document.getElementById('sidebarContent')
  if (sidebar._sidebarDndInited) return
  sidebar._sidebarDndInited = true

  let hoverTimer = null
  let hoveredBoardId = null

  sidebar.addEventListener('dragenter', function(e) {
    if (!isCardDragActive()) return
    if (_sidebarDragData) return
    const item = e.target.closest('[data-board-id]')
    if (!item) return
    e.preventDefault()

    const boardId = item.dataset.boardId
    if (boardId === hoveredBoardId || boardId === state.selectedBoardId) return

    clearTimeout(hoverTimer)
    hoveredBoardId = boardId
    item.classList.add('drag-hover')

    hoverTimer = setTimeout(function() {
      selectBoard(boardId)
      hoveredBoardId = null
    }, 500)
  })

  sidebar.addEventListener('dragleave', function(e) {
    if (!isCardDragActive()) return
    if (_sidebarDragData) return
    const item = e.target.closest('[data-board-id]')
    if (!item) return
    if (e.relatedTarget && item.contains(e.relatedTarget)) return

    clearTimeout(hoverTimer)
    if (item.dataset.boardId === hoveredBoardId) {
      hoveredBoardId = null
    }
    item.classList.remove('drag-hover')
  })

  sidebar.addEventListener('dragover', function(e) {
    if (!isCardDragActive()) return
    if (_sidebarDragData) return
    if (e.target.closest('[data-board-id]')) {
      e.preventDefault()
    }
  })

  sidebar.addEventListener('drop', function(e) {
    if (!isCardDragActive()) return
    if (_sidebarDragData) return
    const item = e.target.closest('[data-board-id]')
    if (!item) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    clearTimeout(hoverTimer)
    hoveredBoardId = null
    item.classList.remove('drag-hover')
    const boardId = item.dataset.boardId
    if (state.selectedBoardId !== boardId) {
      selectBoard(boardId)
    }
  })
}

function initSidebarReorder() {
  const sidebar = document.getElementById('sidebarContent')
  if (sidebar._sidebarReorderInited) return
  sidebar._sidebarReorderInited = true

  let dragSource = null
  let dragSourceType = null
  let dragSourceKey = null
  let dragSourceFolder = null
  let _lastPosKey = null
  let _flipCleanupTimer = null
  let _dragGhost = null
  let _ghostOffsetY = 0
  let _dragBatchKeys = null

  function isBatchDrag() { return _dragBatchKeys && _dragBatchKeys.length > 0 }

  function addClassToBatchElements(className) {
    sidebar.querySelectorAll('.nav-child[draggable]').forEach(function(el) {
      const key = el.dataset.sidebarType + ':' + el.dataset.sidebarId
      if (_dragBatchKeys.indexOf(key) !== -1) {
        el.classList.add(className)
      }
    })
  }

  function removeClassFromBatchElements(className) {
    sidebar.querySelectorAll('.nav-child[draggable]').forEach(function(el) {
      el.classList.remove(className)
    })
  }

  function isDragTarget(el) {
    if (!dragSource) return false
    return el === dragSource || (isBatchDrag() && el.matches('.nav-child[draggable]') && _dragBatchKeys.indexOf(el.dataset.sidebarType + ':' + el.dataset.sidebarId) !== -1)
  }

  function flipSiblings(container, movedEls, oldRects) {
    if (_flipCleanupTimer) { clearTimeout(_flipCleanupTimer); _flipCleanupTimer = null }
    for (let i = 0; i < oldRects.length; i++) {
      const el = oldRects[i].el
      const oldRect = oldRects[i].rect
      const newRect = el.getBoundingClientRect()
      const dx = oldRect.left - newRect.left
      const dy = oldRect.top - newRect.top
      if (dx > 0.5 || dx < -0.5 || dy > 0.5 || dy < -0.5) {
        el.style.transition = 'none'
        el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)'
      }
    }

    requestAnimationFrame(function() {
      const all = container.querySelectorAll(':scope > .nav-child[draggable], :scope > .sidebar-folder[draggable]')
      for (let i = 0; i < all.length; i++) {
        if (movedEls.indexOf(all[i]) === -1 && all[i].style.transform && all[i].style.transform !== 'none') {
          all[i].style.transition = 'transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)'
          all[i].style.transform = 'translate(0, 0)'
        }
      }
      _flipCleanupTimer = setTimeout(function() {
        for (let i = 0; i < all.length; i++) {
          all[i].style.transition = ''
          all[i].style.transform = ''
        }
        _flipCleanupTimer = null
      }, 250)
    })
  }

  function getDragKeys() {
    return isBatchDrag() ? _dragBatchKeys : (dragSourceKey ? [dragSourceKey] : [])
  }

  sidebar.addEventListener('dragstart', function(e) {
    const navChild = e.target.closest('.nav-child[draggable]')
    if (navChild) {
      dragSource = navChild
      dragSourceType = 'item'
      dragSourceKey = navChild.dataset.sidebarType + ':' + navChild.dataset.sidebarId
      dragSourceFolder = navChild.dataset.folderId || null

      _dragBatchKeys = null
      if (state.selectedSidebarItems.length > 0 && state.selectedSidebarItems.indexOf(dragSourceKey) !== -1) {
        _dragBatchKeys = state.selectedSidebarItems.slice()
      }

      const p = findProject(state.selectedProjectId)
      if (!p) { e.preventDefault(); return }
      ensureSidebarOrder(p)

      _sidebarDragData = { key: dragSourceKey, folder: dragSourceFolder, batchKeys: _dragBatchKeys }

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-sidebar-item', dragSourceKey)
      var _transparentImg = new Image()
      _transparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      e.dataTransfer.setDragImage(_transparentImg, 0, 0)

      if (isBatchDrag()) {
        var batchCount = _dragBatchKeys.length
        _dragGhost = document.createElement('div')
        _dragGhost.textContent = batchCount + ' items'
        _dragGhost.style.cssText = 'position:fixed;left:' + sidebar.getBoundingClientRect().left + 'px;width:' + sidebar.getBoundingClientRect().width + 'px;opacity:0.75;background:var(--accent);color:#fff;border-radius:6px;pointer-events:none;z-index:99999;box-shadow:0 4px 16px var(--shadow-md);display:flex;align-items:center;justify-content:center;padding:10px 0;font-size:13px;font-weight:600;'
        _ghostOffsetY = 0
        _dragGhost.style.top = (e.clientY - 20) + 'px'
        document.body.appendChild(_dragGhost)
        addClassToBatchElements('sidebar-drag-preview')
      } else {
        _dragGhost = navChild.cloneNode(true)
        _dragGhost.style.cssText = 'position:fixed;left:' + sidebar.getBoundingClientRect().left + 'px;width:' + sidebar.getBoundingClientRect().width + 'px;opacity:0.65;background:var(--bg-elevated);border:1px solid var(--accent);border-radius:6px;pointer-events:none;z-index:99999;box-shadow:0 4px 16px var(--shadow-md);'
        _ghostOffsetY = e.clientY - navChild.getBoundingClientRect().top
        _dragGhost.style.top = (e.clientY - _ghostOffsetY) + 'px'
        document.body.appendChild(_dragGhost)
        navChild.classList.add('sidebar-drag-preview')
      }
      return
    }

    const folderEl = e.target.closest('.sidebar-folder[draggable]')
    if (folderEl && !e.target.closest('.btn-del') && !e.target.closest('.sidebar-folder-header .arrow')) {
      const folderId = folderEl.dataset.folderId
      dragSource = folderEl
      dragSourceType = 'folder'
      dragSourceKey = 'folder:' + folderId
      _dragBatchKeys = null

      _sidebarDragData = { key: dragSourceKey, folder: null }

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-sidebar-folder', folderId)
      var _transparentImg = new Image()
      _transparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      e.dataTransfer.setDragImage(_transparentImg, 0, 0)

      _dragGhost = folderEl.cloneNode(true)
      _dragGhost.style.cssText = 'position:fixed;left:' + sidebar.getBoundingClientRect().left + 'px;width:' + sidebar.getBoundingClientRect().width + 'px;opacity:0.65;background:var(--bg-elevated);border:1px solid var(--accent);border-radius:6px;pointer-events:none;z-index:99999;box-shadow:0 4px 16px var(--shadow-md);'
      _ghostOffsetY = e.clientY - folderEl.getBoundingClientRect().top
      _dragGhost.style.top = (e.clientY - _ghostOffsetY) + 'px'
      document.body.appendChild(_dragGhost)
      folderEl.classList.add('sidebar-drag-preview')
      return
    }

    e.preventDefault()
  })

  document.addEventListener('dragover', function(e) {
    if (_dragGhost) {
      _dragGhost.style.top = (e.clientY - _ghostOffsetY) + 'px'
    }
  })

  document.addEventListener('dragend', function() {
    if (_flipCleanupTimer) { clearTimeout(_flipCleanupTimer); _flipCleanupTimer = null }
    clearDragIndicators()
    if (_dragGhost) { _dragGhost.remove(); _dragGhost = null }
    if (isBatchDrag()) {
      removeClassFromBatchElements('sidebar-drag-preview')
    } else if (dragSource) {
      dragSource.classList.remove('sidebar-drag-preview')
    }
    _sidebarDragData = null
    dragSource = null
    dragSourceType = null
    dragSourceKey = null
    dragSourceFolder = null
    _lastPosKey = null
    _dragBatchKeys = null
  })

  function getDropPosition(containerEl, clientY) {
    const items = []
    for (let i = 0; i < containerEl.children.length; i++) {
      const child = containerEl.children[i]
      if (!isDragTarget(child) && child.matches('.nav-child[draggable], .sidebar-folder[draggable]')) {
        items.push(child)
      }
    }
    let before = null
    let after = null
    for (const item of items) {
      const rect = item.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (clientY < mid) {
        before = item
        after = null
        break
      }
      after = item
    }
    return { beforeKey: null, beforeEl: before, afterEl: after }
  }

  function getDropPositionInFolder(folderEl, clientY) {
    const items = []
    for (const item of folderEl.querySelectorAll('.nav-child[draggable]')) {
      if (!isDragTarget(item)) items.push(item)
    }
    let before = null
    let after = null
    for (const item of items) {
      const rect = item.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (clientY < mid) {
        before = item
        after = null
        break
      }
      after = item
    }
    return { beforeEl: before, afterEl: after }
  }

  function clearDragIndicators() {
    sidebar.querySelectorAll('.drag-indicator-top, .drag-indicator-bottom, .drag-over-folder').forEach(function(el) {
      el.classList.remove('drag-indicator-top', 'drag-indicator-bottom', 'drag-over-folder')
    })
  }

  function moveDragSource(container, beforeEl) {
    if (!dragSource) return false
    if (isBatchDrag()) {
      return moveBatchItems(container, beforeEl)
    }
    if (dragSource.parentNode === container && dragSource.nextElementSibling === beforeEl) return false
    if (_flipCleanupTimer) { clearTimeout(_flipCleanupTimer); _flipCleanupTimer = null }
    const siblings = []
    for (let i = 0; i < container.children.length; i++) {
      const c = container.children[i]
      if (c !== dragSource && c.matches('.nav-child[draggable], .sidebar-folder[draggable]')) {
        siblings.push({ el: c, rect: c.getBoundingClientRect() })
      }
    }
    container.insertBefore(dragSource, beforeEl)
    const moved = []
    for (let i = 0; i < siblings.length; i++) {
      const el = siblings[i].el
      const oldRect = siblings[i].rect
      const newRect = el.getBoundingClientRect()
      const dx = oldRect.left - newRect.left
      const dy = oldRect.top - newRect.top
      if (dx > 0.5 || dx < -0.5 || dy > 0.5 || dy < -0.5) {
        el.style.transition = 'none'
        el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)'
        moved.push(el)
      }
    }
    if (moved.length) {
      void container.offsetHeight
      for (let i = 0; i < moved.length; i++) {
        moved[i].style.transition = 'transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)'
        moved[i].style.transform = 'translate(0, 0)'
      }
      _flipCleanupTimer = setTimeout(function() {
        for (let i = 0; i < moved.length; i++) {
          moved[i].style.transition = ''
          moved[i].style.transform = ''
        }
        _flipCleanupTimer = null
      }, 250)
    }
    return true
  }

  function moveBatchItems(container, beforeEl) {
    if (!_dragBatchKeys || _dragBatchKeys.length === 0) return false

    const batchEls = []
    for (let i = 0; i < container.children.length; i++) {
      const c = container.children[i]
      if (c.matches('.nav-child[draggable]')) {
        const key = c.dataset.sidebarType + ':' + c.dataset.sidebarId
        if (_dragBatchKeys.indexOf(key) !== -1) {
          batchEls.push(c)
        }
      }
    }
    if (batchEls.length === 0) return false

    const firstBatch = batchEls[0]
    if (batchEls.length === 1) {
      return moveDragSource(container, beforeEl)
    }

    if (firstBatch.parentNode === container && (beforeEl === null || beforeEl === batchEls[batchEls.length - 1].nextElementSibling)) {
      var sameCheck = true
      for (var si = 0; si < batchEls.length - 1; si++) {
        if (batchEls[si].nextElementSibling !== batchEls[si + 1]) { sameCheck = false; break }
      }
      if (sameCheck) return false
    }

    if (_flipCleanupTimer) { clearTimeout(_flipCleanupTimer); _flipCleanupTimer = null }

    const siblings = []
    for (let i = 0; i < container.children.length; i++) {
      const c = container.children[i]
      if (batchEls.indexOf(c) === -1 && c.matches('.nav-child[draggable], .sidebar-folder[draggable]')) {
        siblings.push({ el: c, rect: c.getBoundingClientRect() })
      }
    }

    for (let i = 0; i < batchEls.length; i++) {
      container.removeChild(batchEls[i])
    }

    var refNode = beforeEl
    for (var bi = batchEls.length - 1; bi >= 0; bi--) {
      container.insertBefore(batchEls[bi], refNode)
      refNode = batchEls[bi]
    }

    const moved = []
    for (let i = 0; i < siblings.length; i++) {
      const el = siblings[i].el
      const oldRect = siblings[i].rect
      const newRect = el.getBoundingClientRect()
      const dx = oldRect.left - newRect.left
      const dy = oldRect.top - newRect.top
      if (dx > 0.5 || dx < -0.5 || dy > 0.5 || dy < -0.5) {
        el.style.transition = 'none'
        el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)'
        moved.push(el)
      }
    }
    if (moved.length) {
      void container.offsetHeight
      for (let i = 0; i < moved.length; i++) {
        moved[i].style.transition = 'transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)'
        moved[i].style.transform = 'translate(0, 0)'
      }
      _flipCleanupTimer = setTimeout(function() {
        for (let i = 0; i < moved.length; i++) {
          moved[i].style.transition = ''
          moved[i].style.transform = ''
        }
        _flipCleanupTimer = null
      }, 250)
    }
    return true
  }

  sidebar.addEventListener('dragover', function(e) {
    if (!_sidebarDragData) return
    e.preventDefault()
    clearDragIndicators()

    const p = findProject(state.selectedProjectId)
    if (!p) return

    const folderHeader = e.target.closest('.sidebar-folder-header')
    if (folderHeader && dragSourceType === 'item') {
      const folderEl = folderHeader.closest('.sidebar-folder')
      if (folderEl) {
        const folderId = folderEl.dataset.folderId
        const anyInFolder = getDragKeys().some(function(k) {
          const f = (p.folders || []).find(function(fi) { return fi.itemOrder.indexOf(k) !== -1 })
          return f ? f.id === folderId : false
        })
        if (!anyInFolder) {
          folderHeader.classList.add('drag-over-folder')
        }
      }
      return
    }

    const folderItemsEl = e.target.closest('.sidebar-folder-items')
    if (folderItemsEl && dragSourceType === 'item') {
      const parentFolderEl = folderItemsEl.closest('.sidebar-folder')
      if (!parentFolderEl) return
      if (!isBatchDrag()) {
        const pos = getDropPositionInFolder(folderItemsEl, e.clientY)
        const insertBeforeEl = pos.beforeEl || null
        const posKey = (parentFolderEl.dataset.folderId || '') + ':' + (insertBeforeEl ? insertBeforeEl.dataset.sidebarId : '__end')
        if (posKey === _lastPosKey) return
        _lastPosKey = posKey
        moveDragSource(folderItemsEl, insertBeforeEl)
        return
      }
    }

    if (e.target.closest('.sidebar-folder-items')) { return }

    if (!dragSource) return

    if (isBatchDrag()) {
      const pos = getDropPosition(sidebar, e.clientY)
      const insertBeforeEl = pos.beforeEl || null
      const posKey = '__root:' + (insertBeforeEl ? getItemKeyFromEl(insertBeforeEl) : '__end')
      if (posKey === _lastPosKey) return
      _lastPosKey = posKey
      moveBatchItems(sidebar, insertBeforeEl)
      return
    }

    const pos = getDropPosition(sidebar, e.clientY)
    const insertBeforeEl = pos.beforeEl || null
    const posKey = '__root:' + (insertBeforeEl ? getItemKeyFromEl(insertBeforeEl) : '__end')
    if (posKey === _lastPosKey) return
    _lastPosKey = posKey
    moveDragSource(sidebar, insertBeforeEl)
  })

  function doDrop(p, fn) {
    fn()
    flipRender(function() { render(); if (window.__autoSave) window.__autoSave() })
  }

  function ensureKeysInOrder(p, keys) {
    return keys.slice().filter(function(k) {
      return k.indexOf(':') !== -1 && getItemByType(p, k.split(':')[0], k.split(':')[1])
    })
  }

  function readOrder(container, isRoot) {
    const order = []
    for (let i = 0; i < container.children.length; i++) {
      const c = container.children[i]
      if (isRoot && c.matches('.nav-child[draggable], .sidebar-folder[draggable]')) {
        const key = getItemKeyFromEl(c)
        if (key) order.push(key)
      } else if (!isRoot && c.matches('.nav-child[draggable]')) {
        order.push(c.dataset.sidebarType + ':' + c.dataset.sidebarId)
      }
    }
    return order
  }

  function removeKeysFromSources(p, keys) {
    for (const key of keys) {
      const oi = p.sidebarOrder.indexOf(key)
      if (oi !== -1) p.sidebarOrder.splice(oi, 1)
      for (const f of (p.folders || [])) {
        const fi = f.itemOrder.indexOf(key)
        if (fi !== -1) f.itemOrder.splice(fi, 1)
      }
    }
  }

  function appendKeysToFolder(p, folderId, keys) {
    const dstFolder = getFolderById(p, folderId)
    if (!dstFolder) return
    for (const key of keys) {
      if (dstFolder.itemOrder.indexOf(key) === -1) {
        dstFolder.itemOrder.push(key)
      }
    }
  }

  sidebar.addEventListener('drop', function(e) {
    if (!_sidebarDragData) return
    e.preventDefault()

    if (_dragGhost) { _dragGhost.remove(); _dragGhost = null }
    if (isBatchDrag()) {
      removeClassFromBatchElements('sidebar-drag-preview')
    } else if (dragSource) {
      dragSource.classList.remove('sidebar-drag-preview')
    }

    const p = findProject(state.selectedProjectId)
    if (!p) { _sidebarDragData = null; return }
    ensureSidebarOrder(p)

    if (_flipCleanupTimer) { clearTimeout(_flipCleanupTimer); _flipCleanupTimer = null }
    clearDragIndicators()

    const dragKeys = getDragKeys()
    if (dragKeys.length === 0) { _sidebarDragData = null; return }

    const folderHeader = e.target.closest('.sidebar-folder-header')
    if (folderHeader && dragSourceType === 'item' && dragSourceKey) {
      const folderEl = folderHeader.closest('.sidebar-folder')
      if (folderEl) {
        const folderId = folderEl.dataset.folderId
        const anyInFolder = dragKeys.some(function(k) {
          const f = (p.folders || []).find(function(fi) { return fi.itemOrder.indexOf(k) !== -1 })
          return f ? f.id === folderId : false
        })
        if (!anyInFolder) {
          doDrop(p, function() {
            removeKeysFromSources(p, dragKeys)
            appendKeysToFolder(p, folderId, dragKeys)
          })
        }
      }
      _sidebarDragData = null
      return
    }

    const folderItemsEl = e.target.closest('.sidebar-folder-items')
    if (folderItemsEl && dragSourceType === 'item') {
      const parentFolderEl = folderItemsEl.closest('.sidebar-folder')
      if (parentFolderEl && dragSourceKey) {
        const folderId = parentFolderEl.dataset.folderId
        const folder = getFolderById(p, folderId)
        if (folder) {
          doDrop(p, function() {
            if (isBatchDrag()) {
              removeKeysFromSources(p, dragKeys)
              var beforeRef = null
              if (_lastPosKey && _lastPosKey.indexOf(folderId + ':') === 0) {
                beforeRef = _lastPosKey.substring(folderId.length + 1)
              }
              var insertIdx = -1
              if (beforeRef && beforeRef !== '__end') {
                insertIdx = folder.itemOrder.indexOf(beforeRef)
              }
              if (insertIdx >= 0) {
                folder.itemOrder.splice.apply(folder.itemOrder, [insertIdx, 0].concat(dragKeys))
              } else {
                folder.itemOrder.push.apply(folder.itemOrder, dragKeys)
              }
            } else {
              if (!dragSourceFolder) {
                const oi = p.sidebarOrder.indexOf(dragSourceKey)
                if (oi !== -1) p.sidebarOrder.splice(oi, 1)
              } else if (dragSourceFolder !== folderId) {
                const srcFolder = getFolderById(p, dragSourceFolder)
                if (srcFolder) {
                  const fi = srcFolder.itemOrder.indexOf(dragSourceKey)
                  if (fi !== -1) srcFolder.itemOrder.splice(fi, 1)
                }
              }
              folder.itemOrder = readOrder(folderItemsEl, false)
            }
          })
        }
      }
      _sidebarDragData = null
      return
    }

    if (e.target.closest('.sidebar-folder-items')) { _sidebarDragData = null; return }

    if (dragSourceType === 'folder' && dragSourceKey && dragSource) {
      doDrop(p, function() {
        p.sidebarOrder = readOrder(sidebar, true)
      })
      _sidebarDragData = null
      return
    }

    if (dragSourceType === 'item' && dragSourceKey) {
      const targetFolderEl = e.target.closest('.sidebar-folder')
      if (targetFolderEl && !e.target.closest('.sidebar-folder-header')) {
        const folderId = targetFolderEl.dataset.folderId
        const anyInFolder = dragKeys.some(function(k) {
          const f = (p.folders || []).find(function(fi) { return fi.itemOrder.indexOf(k) !== -1 })
          return f ? f.id === folderId : false
        })
        if (!anyInFolder) {
          doDrop(p, function() {
            removeKeysFromSources(p, dragKeys)
            appendKeysToFolder(p, folderId, dragKeys)
          })
          _sidebarDragData = null
          return
        }
      }

      if (dragSource) {
        doDrop(p, function() {
          if (isBatchDrag()) {
            removeKeysFromSources(p, dragKeys)
            var beforeRef = null
            if (_lastPosKey && _lastPosKey.indexOf('__root:') === 0) {
              beforeRef = _lastPosKey.substring(7)
            }
            var insertIdx = -1
            if (beforeRef && beforeRef !== '__end') {
              insertIdx = p.sidebarOrder.indexOf(beforeRef)
            }
            if (insertIdx >= 0) {
              p.sidebarOrder.splice.apply(p.sidebarOrder, [insertIdx, 0].concat(dragKeys))
            } else {
              p.sidebarOrder.push.apply(p.sidebarOrder, dragKeys)
            }
          } else {
            if (dragSourceFolder) {
              const srcFolder = getFolderById(p, dragSourceFolder)
              if (srcFolder) {
                const fi = srcFolder.itemOrder.indexOf(dragSourceKey)
                if (fi !== -1) srcFolder.itemOrder.splice(fi, 1)
              }
            }
            p.sidebarOrder = readOrder(sidebar, true)
          }
        })
      }
      _sidebarDragData = null
      return
    }

    _sidebarDragData = null
  })
}

export function selectWorkspace(id) {
  state.selectedWorkspaceId = id
  state.selectedProjectId = null
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  if (window.__saveSelectedState) window.__saveSelectedState()
  render()
}

export function selectProject(id) {
  state.selectedProjectId = id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = true
  if (window.__saveSelectedState) window.__saveSelectedState()
  render()
}

export function selectBoard(id) {
  if (state.selectedBoardId !== id) {
    const f = state.filters
    f.search = ''
    f.members = []
    f.tags = []
    f.priority = []
    f.startDateFrom = ''
    f.startDateTo = ''
    f.endDateFrom = ''
    f.endDateTo = ''
    f.completed = 'all'
  }
  state.selectedBoardId = id
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  if (window.__saveSelectedState) window.__saveSelectedState()
  render()
}

export function selectDocument(id) {
  state.selectedDocumentId = id
  state.selectedBoardId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  if (window.__saveSelectedState) window.__saveSelectedState()
  render()
}

export function selectCanvas(id) {
  state.selectedCanvasId = id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedDashboard = false
  if (window.__saveSelectedState) window.__saveSelectedState()
  render()
}

export function selectDashboard() {
  state.selectedDashboard = true
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  if (window.__saveSelectedState) window.__saveSelectedState()
  render()
}

export function toggleFolder(id) {
  const p = findProject(state.selectedProjectId)
  if (!p) return
  const folder = (p.folders || []).find(f => f.id === id)
  if (!folder) return
  folder._open = folder._open === false ? true : false
  render()
}

function finishSidebarItemRename(input) {
  const id = input.dataset.sidebarItemId
  const type = input.dataset.sidebarItemType
  const p = findProject(state.selectedProjectId)
  if (!p) return
  let item = null
  if (type === 'board') item = p.boards.find(b => b.id === id)
  else if (type === 'document') item = (p.documents || []).find(d => d.id === id)
  else if (type === 'canvas') item = (p.canvasBoards || []).find(c => c.id === id)
  if (!item) return
  const oldName = item.name
  const fallback = type === 'board' ? 'New Board' : type === 'document' ? 'New Document' : 'New Canvas Board'
  const newName = input.value.trim() || fallback
  state.renamingSidebarItemId = null
  state.renamingSidebarItemType = null
  if (newName === oldName) {
    render()
    return
  }
  item.name = newName
  render()
  pushCommand({
    undo() { item.name = oldName; render() },
    redo() { item.name = newName; render() },
    description: 'Rename ' + (type === 'board' ? 'Board' : type === 'document' ? 'Document' : 'Canvas')
  })
}

export function toggleAddBoardMenu(e, projectId) {
  e.stopPropagation()
  const existing = document.querySelector('.add-board-menu')
  if (existing) { existing.remove(); return }

  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const btn = e.currentTarget
  const rect = btn.getBoundingClientRect()
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu add-board-menu'
  menu.style.left = (rect.left - 80) + 'px'
  menu.style.top = (rect.bottom + 2) + 'px'
  menu.innerHTML = '<button class="tl-ctx-item" onclick="closeAllColumnMenus();quickCreateBoard(\'' + projectId + '\')">' + _boardIcon + ' Task Board</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();quickCreateDocument(\'' + projectId + '\')">' + _docIcon + ' Document</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();quickCreateCanvas(\'' + projectId + '\')">' + _canvasIcon + ' Canvas Board</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();createFolder(\'' + projectId + '\')">' + _folderIcon + ' Folder</button>'
  
  document.body.appendChild(menu)
}

export function showSidebarContextMenu(e) {
  e.preventDefault()
  e.stopPropagation()
  const p = findProject(state.selectedProjectId)
  if (!p) return
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
  menu.innerHTML =
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();quickCreateBoard(\'' + p.id + '\')">' + _boardIcon + ' New Task Board</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();quickCreateDocument(\'' + p.id + '\')">' + _docIcon + ' New Document</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();quickCreateCanvas(\'' + p.id + '\')">' + _canvasIcon + ' New Canvas Board</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();createFolder(\'' + p.id + '\')">' + _folderIcon + ' New Folder</button>'
  
  document.body.appendChild(menu)
}

export function showNavChildContextMenu(e, type, id) {
  e.preventDefault()
  e.stopPropagation()
  const p = findProject(state.selectedProjectId)
  if (!p) return
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
  const label = type === 'board' ? 'Board' : type === 'document' ? 'Document' : 'Canvas'
  const deleteFn = type === 'board' ? 'deleteBoard' : type === 'document' ? 'deleteDocument' : 'deleteCanvas'
  menu.innerHTML =
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();startRenameSidebarItem(\'' + id + '\',\'' + type + '\')">Rename ' + label + '</button>' +
    '<button class="tl-ctx-item tl-ctx-danger" onclick="closeAllColumnMenus();' + deleteFn + '(\'' + id + '\')">Delete</button>'
  document.body.appendChild(menu)
}

export function initSidebarContextMenu() {
  const sidebar = document.getElementById('sidebarContent')
  if (sidebar._sidebarCtxMenuInited) return
  sidebar._sidebarCtxMenuInited = true
  sidebar.addEventListener('contextmenu', function(e) {
    if (e.target.closest('.nav-child') || e.target.closest('.sidebar-folder') || e.target.closest('.sidebar-project-name')) return
    showSidebarContextMenu(e)
  })
}

export function showFolderContextMenu(e, folderId) {
  e.preventDefault()
  e.stopPropagation()
  const p = findProject(state.selectedProjectId)
  if (!p) return
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
  menu.innerHTML =
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();renameFolder(\'' + folderId + '\')">Rename Folder</button>' +
    '<button class="tl-ctx-item tl-ctx-danger" onclick="closeAllColumnMenus();deleteFolder(\'' + folderId + '\')">Delete Folder</button>'
  
  document.body.appendChild(menu)
}

function getSidebarItemKeys(p) {
  const keys = []
  for (const entry of p.sidebarOrder) {
    if (entry.startsWith('folder:')) {
      keys.push(entry)
      const folderId = entry.split(':')[1]
      const folder = getFolderById(p, folderId)
      if (folder && folder._open !== false) {
        for (const fi of folder.itemOrder) {
          keys.push(fi)
        }
      }
    } else {
      keys.push(entry)
    }
  }
  return keys
}

function handleShiftClick(key) {
  const p = findProject(state.selectedProjectId)
  if (!p) return
  const allKeys = getSidebarItemKeys(p)
  const clickedIdx = allKeys.indexOf(key)
  if (clickedIdx === -1) return
  const lastIdx = _lastClickedKey ? allKeys.indexOf(_lastClickedKey) : -1
  if (lastIdx === -1) {
    state.selectedSidebarItems = [key]
  } else {
    const start = Math.min(lastIdx, clickedIdx)
    const end = Math.max(lastIdx, clickedIdx)
    state.selectedSidebarItems = allKeys.slice(start, end + 1)
  }
  _lastClickedKey = key
  render()
}

function handleCtrlClick(key) {
  const idx = state.selectedSidebarItems.indexOf(key)
  if (idx !== -1) {
    state.selectedSidebarItems.splice(idx, 1)
  } else {
    state.selectedSidebarItems.push(key)
  }
  _lastClickedKey = key
  render()
}

window.handleSidebarItemClick = function(e, type, id) {
  const key = type + ':' + id
  if (e.shiftKey) {
    e.preventDefault()
    handleShiftClick(key)
  } else if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    handleCtrlClick(key)
  } else {
    state.selectedSidebarItems = [key]
    _lastClickedKey = key
    if (type === 'board') selectBoard(id)
    else if (type === 'document') selectDocument(id)
    else if (type === 'canvas') selectCanvas(id)
    else render()
  }
}

window.handleFolderClick = function(e, folderId) {
  const key = 'folder:' + folderId
  if (e.shiftKey) {
    e.preventDefault()
    handleShiftClick(key)
  } else if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    handleCtrlClick(key)
  } else {
    if (state.selectedSidebarItems.length > 0) {
      state.selectedSidebarItems = []
      _lastClickedKey = null
    }
    toggleFolder(folderId)
  }
}

export function clearMultiSelection() {
  state.selectedSidebarItems = []
  _lastClickedKey = null
  render()
}

function initSidebarKeyboardNav() {
  const sidebar = document.getElementById('sidebarContent')
  if (sidebar._sidebarKeyboardNavInited) return
  sidebar._sidebarKeyboardNavInited = true

  function getItemKey(el) {
    if (el.classList.contains('nav-child')) return el.dataset.sidebarType + ':' + el.dataset.sidebarId
    if (el.classList.contains('sidebar-folder-header')) return el.dataset.sidebarKey
    return null
  }

  function getItems() {
    const list = []
    for (let i = 0; i < sidebar.children.length; i++) {
      const child = sidebar.children[i]
      if (child.matches('.nav-child[draggable]')) {
        list.push(child)
      } else if (child.matches('.sidebar-folder[draggable]')) {
        const header = child.querySelector('.sidebar-folder-header')
        if (header) list.push(header)
        const itemsContainer = child.querySelector('.sidebar-folder-items')
        if (itemsContainer && itemsContainer.classList.contains('open')) {
          for (let j = 0; j < itemsContainer.children.length; j++) {
            if (itemsContainer.children[j].matches('.nav-child[draggable]')) {
              list.push(itemsContainer.children[j])
            }
          }
        }
      }
    }
    return list
  }

  function syncNavIndexFromSelection(items) {
    if (state.selectedSidebarItems.length > 0) {
      var lastKey = state.selectedSidebarItems[state.selectedSidebarItems.length - 1]
      for (var i = 0; i < items.length; i++) {
        if (getItemKey(items[i]) === lastKey) {
          _sidebarNavIndex = i
          return
        }
      }
    }
    if (_sidebarNavIndex < 0 || _sidebarNavIndex >= items.length) {
      _sidebarNavIndex = 0
    }
  }

  function isFolderHeader(el) {
    return el && el.classList.contains('sidebar-folder-header')
  }

  function getFolderIdFromHeader(el) {
    if (!el) return null
    var key = el.dataset.sidebarKey
    if (key && key.indexOf('folder:') === 0) return key.substring(7)
    return null
  }

  function toggleFolderByKey(key) {
    if (key && key.indexOf('folder:') === 0) {
      var fid = key.substring(7)
      if (window.toggleFolder) window.toggleFolder(fid)
    }
  }

  function handleKey(e, items) {
    if (e.ctrlKey && e.key === 'a') {
      e.preventDefault()
      e.stopPropagation()
      state.selectedSidebarItems = []
      for (let i = 0; i < items.length; i++) {
        var k = getItemKey(items[i])
        if (k) state.selectedSidebarItems.push(k)
      }
      _lastClickedKey = null
      render()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'ArrowUp') moveSelectedUp()
      else moveSelectedDown()
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'ArrowRight') moveSelectedIntoNearestFolder()
      else moveSelectedOutOfFolder()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      _sidebarNavIndex = Math.min(_sidebarNavIndex + 1, items.length - 1)
      items[_sidebarNavIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      var key = getItemKey(items[_sidebarNavIndex])
      if (!key) { render(); return }
      if (e.shiftKey) {
        if (state.selectedSidebarItems.indexOf(key) === -1) {
          state.selectedSidebarItems.push(key)
        }
        _lastClickedKey = key
      } else {
        state.selectedSidebarItems = [key]
        _lastClickedKey = key
      }
      render()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      _sidebarNavIndex = Math.max(_sidebarNavIndex - 1, 0)
      items[_sidebarNavIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      var key = getItemKey(items[_sidebarNavIndex])
      if (!key) { render(); return }
      if (e.shiftKey) {
        if (state.selectedSidebarItems.indexOf(key) === -1) {
          state.selectedSidebarItems.push(key)
        }
        _lastClickedKey = key
      } else {
        state.selectedSidebarItems = [key]
        _lastClickedKey = key
      }
      render()
      return
    }
    if (e.key === 'ArrowRight' && !e.ctrlKey && !e.shiftKey) {
      if (_sidebarNavIndex >= 0 && _sidebarNavIndex < items.length) {
        var cur = items[_sidebarNavIndex]
        if (isFolderHeader(cur)) {
          e.preventDefault()
          e.stopPropagation()
          var fid = getFolderIdFromHeader(cur)
          if (fid) {
            var p = findProject(state.selectedProjectId)
            if (p) {
              var folder = getFolderById(p, fid)
              if (folder && folder._open === false) {
                toggleFolder(fid)
              }
            }
          }
          return
        }
      }
    }
    if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.shiftKey) {
      if (_sidebarNavIndex >= 0 && _sidebarNavIndex < items.length) {
        var cur = items[_sidebarNavIndex]
        if (isFolderHeader(cur)) {
          e.preventDefault()
          e.stopPropagation()
          var fid = getFolderIdFromHeader(cur)
          if (fid) {
            var p = findProject(state.selectedProjectId)
            if (p) {
              var folder = getFolderById(p, fid)
              if (folder && folder._open !== false) {
                toggleFolder(fid)
              }
            }
          }
          return
        }
      }
    }
    if (e.key === 'Enter') {
      if (_sidebarNavIndex >= 0 && _sidebarNavIndex < items.length) {
        e.preventDefault()
        e.stopPropagation()
        var el = items[_sidebarNavIndex]
        if (isFolderHeader(el)) {
          var fkey = el.dataset.sidebarKey
          if (fkey) toggleFolderByKey(fkey)
        } else {
          el.click()
        }
      }
      return
    }
    if (e.key === ' ' && !e.target.closest('input, .btn-del')) {
      e.preventDefault()
      e.stopPropagation()
      if (_sidebarNavIndex >= 0 && _sidebarNavIndex < items.length) {
        var k = getItemKey(items[_sidebarNavIndex])
        if (k) handleCtrlClick(k)
      }
      return
    }
  }

  sidebar.addEventListener('keydown', function(e) {
    const items = getItems()
    if (items.length === 0) return
    syncNavIndexFromSelection(items)
    handleKey(e, items)
  })
}

function resetSidebarNavFocus() {
  _sidebarNavIndex = -1
  _sidebarNavItems = []
}

function moveSelectedIntoNearestFolder() {
  const p = findProject(state.selectedProjectId)
  if (!p) return
  ensureSidebarOrder(p)
  const selected = state.selectedSidebarItems.slice()
  if (selected.length === 0) return

  var targetFolderId = null
  var targetFolderIdx = -1
  for (var ei = 0; ei < p.sidebarOrder.length; ei++) {
    var entry = p.sidebarOrder[ei]
    if (entry.indexOf('folder:') === 0 && selected.indexOf(entry) === -1) {
      targetFolderId = entry.substring(7)
      targetFolderIdx = ei
    }
    if (selected.indexOf(entry) !== -1) {
      if (!entry.startsWith('folder:') && targetFolderId) {
        var alreadyInFolder = false
        for (var fi = 0; fi < (p.folders || []).length; fi++) {
          if ((p.folders)[fi].id === targetFolderId &&
              (p.folders)[fi].itemOrder.indexOf(entry) !== -1) {
            alreadyInFolder = true
            break
          }
        }
        if (!alreadyInFolder) {
          moveSelectedToFolder(targetFolderId)
          return
        }
      }
      break
    }
  }
}

function moveSelectedOutOfFolder() {
  const p = findProject(state.selectedProjectId)
  if (!p) return
  ensureSidebarOrder(p)
  const selected = state.selectedSidebarItems.slice()
  if (selected.length === 0) return

  var commonFolder = null
  var firstNonFolder = true
  for (var si = 0; si < selected.length; si++) {
    if (selected[si].startsWith('folder:')) continue
    var foundFolder = null
    for (var fi = 0; fi < (p.folders || []).length; fi++) {
      if ((p.folders)[fi].itemOrder.indexOf(selected[si]) !== -1) {
        foundFolder = (p.folders)[fi]
        break
      }
    }
    if (firstNonFolder) {
      commonFolder = foundFolder
      firstNonFolder = false
    } else if (commonFolder !== foundFolder) {
      commonFolder = null
      break
    }
  }
  if (firstNonFolder) return

  if (!commonFolder) return

  var snapshot = {
    sidebarOrder: p.sidebarOrder.slice(),
    folders: JSON.parse(JSON.stringify(p.folders)),
    selected: selected.slice()
  }

  function applyMove() {
    var fIdx = p.sidebarOrder.indexOf('folder:' + commonFolder.id)
    var iIdx = fIdx >= 0 ? fIdx + 1 : p.sidebarOrder.length
    for (var ri = 0; ri < selected.length; ri++) {
      if (selected[ri].startsWith('folder:')) continue
      var itemIdx = commonFolder.itemOrder.indexOf(selected[ri])
      if (itemIdx !== -1) commonFolder.itemOrder.splice(itemIdx, 1)
      if (p.sidebarOrder.indexOf(selected[ri]) === -1) {
        p.sidebarOrder.splice(iIdx, 0, selected[ri])
        iIdx++
      }
    }
    render()
  }

  applyMove()
  pushCommand({
    undo() {
      p.sidebarOrder = snapshot.sidebarOrder
      p.folders = snapshot.folders
      state.selectedSidebarItems = snapshot.selected.slice()
      _lastClickedKey = snapshot.selected[snapshot.selected.length - 1] || null
      render()
    },
    redo() {
      p.sidebarOrder = snapshot.sidebarOrder.slice()
      p.folders = JSON.parse(JSON.stringify(snapshot.folders))
      state.selectedSidebarItems = snapshot.selected.slice()
      _lastClickedKey = snapshot.selected[snapshot.selected.length - 1] || null
      applyMove()
    },
    description: 'Remove Items from Folder'
  })
}

function doMoveSelected(direction) {
  const p = findProject(state.selectedProjectId)
  if (!p) return
  ensureSidebarOrder(p)
  const selected = state.selectedSidebarItems.slice()
  if (selected.length === 0) return

  const snapshot = {
    sidebarOrder: p.sidebarOrder.slice(),
    folders: JSON.parse(JSON.stringify(p.folders)),
    selected: selected.slice()
  }

  function moveInArray(arr, keys, dir) {
    var indices = []
    for (var mi = 0; mi < keys.length; mi++) {
      var idx = arr.indexOf(keys[mi])
      if (idx !== -1) indices.push(idx)
    }
    if (indices.length === 0) return false
    indices.sort(function(a, b) { return a - b })
    if (dir < 0 && indices[0] === 0) return false
    if (dir > 0 && indices[indices.length - 1] === arr.length - 1) return false
    var items = []
    for (var ri = indices.length - 1; ri >= 0; ri--) {
      items.unshift(arr.splice(indices[ri], 1)[0])
    }
    var insertBase = indices[0] + dir
    if (dir > 0) {
      for (var bi = 0; bi < items.length; bi++) {
        arr.splice(insertBase + bi, 0, items[bi])
      }
    } else {
      for (var bi = items.length - 1; bi >= 0; bi--) {
        arr.splice(insertBase + bi, 0, items[bi])
      }
    }
    return true
  }

  function applyMove() {
    const rootSelected = selected.filter(function(k) { return p.sidebarOrder.indexOf(k) !== -1 })
    moveInArray(p.sidebarOrder, rootSelected, direction)
    for (const f of (p.folders || [])) {
      const folderSelected = selected.filter(function(k) { return f.itemOrder.indexOf(k) !== -1 })
      moveInArray(f.itemOrder, folderSelected, direction)
    }
    render()
  }

  applyMove()
  pushCommand({
    undo() {
      p.sidebarOrder = snapshot.sidebarOrder
      p.folders = snapshot.folders
      state.selectedSidebarItems = snapshot.selected.slice()
      _lastClickedKey = snapshot.selected[snapshot.selected.length - 1] || null
      render()
    },
    redo() {
      p.sidebarOrder = snapshot.sidebarOrder.slice()
      p.folders = JSON.parse(JSON.stringify(snapshot.folders))
      state.selectedSidebarItems = snapshot.selected.slice()
      _lastClickedKey = snapshot.selected[snapshot.selected.length - 1] || null
      applyMove()
    },
    description: direction < 0 ? 'Move Items Up' : 'Move Items Down'
  })
}

export function moveSelectedUp() {
  doMoveSelected(-1)
}

export function moveSelectedDown() {
  doMoveSelected(1)
}

export function moveSelectedToFolder(folderId) {
  const p = findProject(state.selectedProjectId)
  if (!p) return
  ensureSidebarOrder(p)
  const folder = getFolderById(p, folderId)
  if (!folder) return
  const selected = state.selectedSidebarItems.slice()
  if (selected.length === 0) return

  const snapshot = {
    sidebarOrder: p.sidebarOrder.slice(),
    folders: JSON.parse(JSON.stringify(p.folders)),
    selected: selected.slice()
  }

  function applyMove() {
    for (const key of selected) {
      const oi = p.sidebarOrder.indexOf(key)
      if (oi !== -1) p.sidebarOrder.splice(oi, 1)
      for (const f of (p.folders || [])) {
        const fi = f.itemOrder.indexOf(key)
        if (fi !== -1) f.itemOrder.splice(fi, 1)
      }
      const dstFolder = getFolderById(p, folderId)
      if (dstFolder && dstFolder.itemOrder.indexOf(key) === -1) {
        dstFolder.itemOrder.push(key)
      }
    }
    render()
  }

  applyMove()
  pushCommand({
    undo() {
      p.sidebarOrder = snapshot.sidebarOrder
      p.folders = snapshot.folders
      state.selectedSidebarItems = snapshot.selected.slice()
      _lastClickedKey = snapshot.selected[snapshot.selected.length - 1] || null
      render()
    },
    redo() {
      p.sidebarOrder = snapshot.sidebarOrder.slice()
      p.folders = JSON.parse(JSON.stringify(snapshot.folders))
      state.selectedSidebarItems = snapshot.selected.slice()
      _lastClickedKey = snapshot.selected[snapshot.selected.length - 1] || null
      applyMove()
    },
    description: 'Move Items to Folder'
  })
}

window.showMoveToFolderMenu = function(e) {
  e.stopPropagation()
  const existing = document.querySelector('.move-to-folder-menu')
  if (existing) { existing.remove(); return }
  const p = findProject(state.selectedProjectId)
  if (!p) return
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
  const btn = e.currentTarget
  const rect = btn.getBoundingClientRect()
  const menu = document.createElement('div')
  menu.className = 'tl-ctx-menu move-to-folder-menu'
  menu.style.left = rect.left + 'px'
  menu.style.top = (rect.bottom + 2) + 'px'
  let html = ''
  for (const f of (p.folders || [])) {
    html += '<button class="tl-ctx-item" onclick="closeAllColumnMenus();moveSelectedToFolder(\'' + f.id + '\')">' + _folderIcon + ' ' + f.name + '</button>'
  }
  if (!html) {
    html = '<div class="tl-ctx-item" style="opacity:0.6;pointer-events:none">No folders</div>'
  }
  menu.innerHTML = html
  document.body.appendChild(menu)
}
