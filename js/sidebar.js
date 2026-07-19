import { state, findProject } from './data.js'
import { renderBoard } from './board.js'
import { initDragDrop, isCardDragActive } from './dragdrop.js'
import { renderMemberBar } from './members.js'
import { updateMenuBar } from './menubar.js'

let _sidebarDragData = null

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
    return
  }

  const p = findProject(state.selectedProjectId)
  if (!p) {
    sidebar.innerHTML = ''
    renderBoard()
    renderMemberBar()
    updateMenuBar()
    return
  }

  ensureSidebarOrder(p)

  let html = '<div class="sidebar-project-name">' + p.name + '</div>'
  const dashActive = state.selectedDashboard ? ' active' : ''
  html += `<div class="nav-child${dashActive}" onclick="selectDashboard()">
    <span class="name">Dashboard</span>
  </div>`
  html += '<div class="section-title" style="margin-top:12px"><span>Items</span><span class="btn-add-board" onclick="toggleAddBoardMenu(event,\'' + p.id + '\')">+</span></div>'

  const boardIcon = '<svg class="item-icon item-icon-board" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M3.2 4l.8.8L6 3.2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 4h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><rect x="2.5" y="6.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M7 8h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><rect x="2.5" y="10.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1"/><path d="M7 12h5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>'
  const docIcon = '<svg class="item-icon item-icon-document" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="1.5" width="11" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M10 1.5V4.5H13" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/><line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="9.5" x2="11" y2="9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
  const canvasIcon = '<svg class="item-icon item-icon-canvas" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="0.5" y="0.5" width="15" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="5.5" y1="0.5" x2="5.5" y2="15.5" stroke="currentColor" stroke-width="1"/><line x1="10.5" y1="0.5" x2="10.5" y2="15.5" stroke="currentColor" stroke-width="1"/><line x1="0.5" y1="5.5" x2="15.5" y2="5.5" stroke="currentColor" stroke-width="1"/><line x1="0.5" y1="10.5" x2="15.5" y2="10.5" stroke="currentColor" stroke-width="1"/></svg>'
  const folderIcon = '<svg class="item-icon item-icon-folder" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1.5 4.5V13C1.5 13.5523 1.94772 14 2.5 14H13.5C14.0523 14 14.5 13.5523 14.5 13V5.5C14.5 4.94772 14.0523 4.5 13.5 4.5H8L6.5 3H2.5C1.94772 3 1.5 3.44772 1.5 4V4.5Z" stroke="currentColor" stroke-width="1.3"/></svg>'

  const icons = { board: boardIcon, document: docIcon, canvas: canvasIcon }

  for (const entry of p.sidebarOrder) {
    const colonIdx = entry.indexOf(':')
    const entryType = entry.substring(0, colonIdx)
    const entryId = entry.substring(colonIdx + 1)

    if (entryType === 'folder') {
      const folder = getFolderById(p, entryId)
      if (!folder) continue
      const isOpen = folder._open !== false
      html += '<div class="sidebar-folder" data-folder-id="' + folder.id + '" draggable="true">'
      html += '<div class="sidebar-folder-header" onclick="toggleFolder(\'' + folder.id + '\')" oncontextmenu="event.stopPropagation();showFolderContextMenu(event,\'' + folder.id + '\')">'
      html += '<span class="arrow' + (isOpen ? ' open' : '') + '">' + String.fromCharCode(9654) + '</span>'
      html += folderIcon
      html += '<span class="name">' + folder.name + '</span>'
      html += '<button class="btn-del" onclick="event.stopPropagation();deleteFolder(\'' + folder.id + '\')">' + String.fromCharCode(10005) + '</button>'
      html += '</div>'
      html += '<div class="sidebar-folder-items' + (isOpen ? ' open' : '') + '">'
      for (const fi of folder.itemOrder) {
        const fcolonIdx = fi.indexOf(':')
        const fiType = fi.substring(0, fcolonIdx)
        const fiId = fi.substring(fcolonIdx + 1)
        const item = getItemByType(p, fiType, fiId)
        if (!item) continue
        html += renderNavChild(p, fiType, item, icons, folder.id)
      }
      html += '</div></div>'
    } else {
      const item = getItemByType(p, entryType, entryId)
      if (!item) continue
      html += renderNavChild(p, entryType, item, icons, null)
    }
  }

  sidebar.innerHTML = html
  renderBoard()
  initDragDrop(render)
  initSidebarDrag()
  initSidebarReorder()
  initSidebarContextMenu()
  renderMemberBar()
  updateMenuBar()
  if (window.__autoSave) window.__autoSave()
}

function renderNavChild(p, type, item, icons, folderId) {
  let active = false
  let selectFn = ''
  if (type === 'board') { active = state.selectedBoardId === item.id; selectFn = 'selectBoard' }
  else if (type === 'document') { active = state.selectedDocumentId === item.id; selectFn = 'selectDocument' }
  else if (type === 'canvas') { active = state.selectedCanvasId === item.id; selectFn = 'selectCanvas' }
  const activeClass = active ? ' active' : ''
  const boardAttr = type === 'board' ? ' data-board-id="' + item.id + '"' : ''
  const folderAttr = folderId ? ' data-folder-id="' + folderId + '"' : ''
  return '<div class="nav-child' + activeClass + '" draggable="true"' + boardAttr + folderAttr + ' data-sidebar-type="' + type + '" data-sidebar-id="' + item.id + '" onclick="' + selectFn + '(\'' + item.id + '\')" oncontextmenu="event.stopPropagation();showSidebarContextMenu(event)">' +
    icons[type] +
    '<span class="name">' + item.name + '</span>' +
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

  function flipSiblings(container, movedEl, oldRects) {
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
        if (all[i] !== movedEl && all[i].style.transform && all[i].style.transform !== 'none') {
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

  sidebar.addEventListener('dragstart', function(e) {
    const navChild = e.target.closest('.nav-child[draggable]')
    if (navChild) {
      dragSource = navChild
      dragSourceType = 'item'
      dragSourceKey = navChild.dataset.sidebarType + ':' + navChild.dataset.sidebarId
      dragSourceFolder = navChild.dataset.folderId || null

      const p = findProject(state.selectedProjectId)
      if (!p) { e.preventDefault(); return }
      ensureSidebarOrder(p)

      _sidebarDragData = { key: dragSourceKey, folder: dragSourceFolder }

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-sidebar-item', dragSourceKey)
      e.dataTransfer.setDragImage(new Image(), 0, 0)
      return
    }

    const folderEl = e.target.closest('.sidebar-folder[draggable]')
    if (folderEl && !e.target.closest('.btn-del') && !e.target.closest('.sidebar-folder-header .arrow')) {
      const folderId = folderEl.dataset.folderId
      dragSource = folderEl
      dragSourceType = 'folder'
      dragSourceKey = 'folder:' + folderId

      _sidebarDragData = { key: dragSourceKey, folder: null }

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-sidebar-folder', folderId)
      e.dataTransfer.setDragImage(new Image(), 0, 0)
      return
    }

    e.preventDefault()
  })

  document.addEventListener('dragend', function() {
    if (_flipCleanupTimer) { clearTimeout(_flipCleanupTimer); _flipCleanupTimer = null }
    clearDragIndicators()
    _sidebarDragData = null
    dragSource = null
    dragSourceType = null
    dragSourceKey = null
    dragSourceFolder = null
    _lastPosKey = null
  })

  function getDropPosition(containerEl, clientY) {
    const items = []
    for (let i = 0; i < containerEl.children.length; i++) {
      const child = containerEl.children[i]
      if (child.matches('.nav-child[draggable], .sidebar-folder[draggable]')) {
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
    const items = folderEl.querySelectorAll('.nav-child[draggable]')
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
        if (folderId !== dragSourceFolder) {
          folderHeader.classList.add('drag-over-folder')
          _lastPosKey = null
        }
      }
      return
    }

    const folderItemsEl = e.target.closest('.sidebar-folder-items')
    if (folderItemsEl && dragSourceType === 'item') {
      const parentFolderEl = folderItemsEl.closest('.sidebar-folder')
      if (!parentFolderEl || !dragSource) { _lastPosKey = null; return }
      const folderId = parentFolderEl.dataset.folderId
      const pos = getDropPositionInFolder(folderItemsEl, e.clientY)
      const insertBeforeEl = pos.beforeEl || null

      if (dragSource.parentNode !== folderItemsEl) {
        if (pos.beforeEl) { pos.beforeEl.classList.add('drag-indicator-top') }
        else if (pos.afterEl) { pos.afterEl.classList.add('drag-indicator-bottom') }
        _lastPosKey = null
        return
      }

      const posKey = folderId + ':' + (insertBeforeEl ? insertBeforeEl.dataset.sidebarId : '__end')
      if (posKey === _lastPosKey) return
      _lastPosKey = posKey

      const oldRects = []
      const siblings = folderItemsEl.querySelectorAll('.nav-child[draggable]')
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] !== dragSource) {
          oldRects.push({ el: siblings[i], rect: siblings[i].getBoundingClientRect() })
        }
      }

      folderItemsEl.insertBefore(dragSource, insertBeforeEl)
      flipSiblings(folderItemsEl, dragSource, oldRects)
      return
    }

    if (e.target.closest('.sidebar-folder-items')) { _lastPosKey = null; return }

    if (!dragSource) { _lastPosKey = null; return }

    const currentContainer = dragSource.parentNode
    const sameContainer = currentContainer === sidebar

    if (!sameContainer) {
      const pos = getDropPosition(sidebar, e.clientY)
      if (pos.beforeEl) { pos.beforeEl.classList.add('drag-indicator-top') }
      else if (pos.afterEl) { pos.afterEl.classList.add('drag-indicator-bottom') }
      _lastPosKey = null
      return
    }

    const pos = getDropPosition(sidebar, e.clientY)
    const insertBeforeEl = pos.beforeEl || null
    const posKey = '__root:' + (insertBeforeEl ? getItemKeyFromEl(insertBeforeEl) : '__end')
    if (posKey === _lastPosKey) return
    _lastPosKey = posKey

    const oldRects = []
    const siblings = []
    for (let i = 0; i < sidebar.children.length; i++) {
      const child = sidebar.children[i]
      if (child.matches('.nav-child[draggable], .sidebar-folder[draggable]') && child !== dragSource) {
        siblings.push(child)
        oldRects.push({ el: child, rect: child.getBoundingClientRect() })
      }
    }

    sidebar.insertBefore(dragSource, insertBeforeEl)
    flipSiblings(sidebar, dragSource, oldRects)
  })

  sidebar.addEventListener('drop', function(e) {
    if (!_sidebarDragData) return
    e.preventDefault()

    const p = findProject(state.selectedProjectId)
    if (!p) return
    ensureSidebarOrder(p)

    if (_flipCleanupTimer) { clearTimeout(_flipCleanupTimer); _flipCleanupTimer = null }
    clearDragIndicators()

    const folderHeader = e.target.closest('.sidebar-folder-header')
    if (folderHeader && dragSourceType === 'item') {
      const folderEl = folderHeader.closest('.sidebar-folder')
      if (folderEl) {
        const folderId = folderEl.dataset.folderId
        if (folderId !== dragSourceFolder && dragSourceKey) {
          if (dragSourceFolder) {
            const srcFolder = getFolderById(p, dragSourceFolder)
            if (srcFolder) {
              const fi = srcFolder.itemOrder.indexOf(dragSourceKey)
              if (fi !== -1) srcFolder.itemOrder.splice(fi, 1)
            }
          } else {
            const oi = p.sidebarOrder.indexOf(dragSourceKey)
            if (oi !== -1) p.sidebarOrder.splice(oi, 1)
          }
          const dstFolder = getFolderById(p, folderId)
          if (dstFolder) {
            dstFolder.itemOrder.push(dragSourceKey)
          }
          flipRender(function() { render(); if (window.__autoSave) window.__autoSave() })
          _sidebarDragData = null
          return
        }
      }
    }

    const folderItemsEl = e.target.closest('.sidebar-folder-items')
    if (folderItemsEl && dragSourceType === 'item') {
      const parentFolderEl = folderItemsEl.closest('.sidebar-folder')
      if (parentFolderEl && dragSourceKey) {
        const folderId = parentFolderEl.dataset.folderId
        const folder = getFolderById(p, folderId)
        if (!folder) { _sidebarDragData = null; return }

        if (dragSourceFolder === folderId && dragSource && dragSource.parentNode === folderItemsEl) {
          folder.itemOrder = []
          const children = folderItemsEl.querySelectorAll('.nav-child[draggable]')
          for (let i = 0; i < children.length; i++) {
            const key = children[i].dataset.sidebarType + ':' + children[i].dataset.sidebarId
            folder.itemOrder.push(key)
          }
        } else {
          const pos = getDropPositionInFolder(folderItemsEl, e.clientY)
          let newOrder = folder.itemOrder.slice()
          if (dragSourceFolder === folderId) {
            const fromIdx = newOrder.indexOf(dragSourceKey)
            if (fromIdx !== -1) newOrder.splice(fromIdx, 1)
          } else {
            if (dragSourceFolder) {
              const srcFolder = getFolderById(p, dragSourceFolder)
              if (srcFolder) {
                const sfi = srcFolder.itemOrder.indexOf(dragSourceKey)
                if (sfi !== -1) srcFolder.itemOrder.splice(sfi, 1)
              }
            } else {
              const oi = p.sidebarOrder.indexOf(dragSourceKey)
              if (oi !== -1) p.sidebarOrder.splice(oi, 1)
            }
          }
          let insertIdx = newOrder.length
          if (pos.beforeEl) {
            const bk = pos.beforeEl.dataset.sidebarType + ':' + pos.beforeEl.dataset.sidebarId
            const bi = newOrder.indexOf(bk)
            if (bi !== -1) insertIdx = bi
          } else if (pos.afterEl) {
            const ak = pos.afterEl.dataset.sidebarType + ':' + pos.afterEl.dataset.sidebarId
            const ai = newOrder.indexOf(ak)
            if (ai !== -1) insertIdx = ai + 1
          }
          newOrder.splice(insertIdx, 0, dragSourceKey)
          folder.itemOrder = newOrder
        }
        if (window.__autoSave) window.__autoSave()
        _sidebarDragData = null
        return
      }
    }

    if (e.target.closest('.sidebar-folder-items')) { _sidebarDragData = null; return }

    if (dragSourceType === 'folder' && dragSourceKey && dragSource && dragSource.parentNode === sidebar) {
      p.sidebarOrder = []
      const children = sidebar.querySelectorAll(':scope > .nav-child[draggable], :scope > .sidebar-folder[draggable]')
      for (let i = 0; i < children.length; i++) {
        const key = getItemKeyFromEl(children[i])
        if (key) p.sidebarOrder.push(key)
      }
      p.sidebarOrder = p.sidebarOrder.filter(function(k, idx, self) { return self.indexOf(k) === idx })
      if (window.__autoSave) window.__autoSave()
      _sidebarDragData = null
      return
    }

    if (dragSourceType === 'item' && dragSourceKey) {
      const targetFolderEl = e.target.closest('.sidebar-folder')
      if (targetFolderEl && !e.target.closest('.sidebar-folder-header')) {
        const folderId = targetFolderEl.dataset.folderId
        if (folderId !== dragSourceFolder) {
          if (dragSourceFolder) {
            const srcFolder = getFolderById(p, dragSourceFolder)
            if (srcFolder) {
              const fi = srcFolder.itemOrder.indexOf(dragSourceKey)
              if (fi !== -1) srcFolder.itemOrder.splice(fi, 1)
            }
          } else {
            const oi = p.sidebarOrder.indexOf(dragSourceKey)
            if (oi !== -1) p.sidebarOrder.splice(oi, 1)
          }
          const dstFolder = getFolderById(p, folderId)
          if (dstFolder) {
            dstFolder.itemOrder.push(dragSourceKey)
          }
          flipRender(function() { render(); if (window.__autoSave) window.__autoSave() })
          _sidebarDragData = null
          return
        }
      }

      if (dragSource && dragSource.parentNode === sidebar) {
        p.sidebarOrder = []
        const children = sidebar.querySelectorAll(':scope > .nav-child[draggable], :scope > .sidebar-folder[draggable]')
        for (let i = 0; i < children.length; i++) {
          const key = getItemKeyFromEl(children[i])
          if (key) p.sidebarOrder.push(key)
        }
      } else {
        const pos = getDropPosition(sidebar, e.clientY)
        if (dragSourceFolder) {
          const srcFolder = getFolderById(p, dragSourceFolder)
          if (srcFolder) {
            const fi = srcFolder.itemOrder.indexOf(dragSourceKey)
            if (fi !== -1) srcFolder.itemOrder.splice(fi, 1)
          }
          let newRootOrder = p.sidebarOrder.slice()
          let insertIdx = newRootOrder.length
          if (pos.beforeEl) {
            const bk = getItemKeyFromEl(pos.beforeEl)
            if (bk) { const bi = newRootOrder.indexOf(bk); if (bi !== -1) insertIdx = bi }
          } else if (pos.afterEl) {
            const ak = getItemKeyFromEl(pos.afterEl)
            if (ak) { const ai = newRootOrder.indexOf(ak); if (ai !== -1) insertIdx = ai + 1 }
          }
          newRootOrder.splice(insertIdx, 0, dragSourceKey)
          p.sidebarOrder = newRootOrder
        } else {
          let newOrder = p.sidebarOrder.slice()
          const fromIdx = newOrder.indexOf(dragSourceKey)
          if (fromIdx !== -1) newOrder.splice(fromIdx, 1)
          let insertIdx = newOrder.length
          if (pos.beforeEl) {
            const bk = getItemKeyFromEl(pos.beforeEl)
            if (bk) { const bi = newOrder.indexOf(bk); if (bi !== -1) insertIdx = bi }
          } else if (pos.afterEl) {
            const ak = getItemKeyFromEl(pos.afterEl)
            if (ak) { const ai = newOrder.indexOf(ak); if (ai !== -1) insertIdx = ai + 1 }
          }
          newOrder.splice(insertIdx, 0, dragSourceKey)
          p.sidebarOrder = newOrder
        }
      }
      if (window.__autoSave) window.__autoSave()
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
  render()
}

export function selectProject(id) {
  state.selectedProjectId = id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
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
  render()
}

export function selectDocument(id) {
  state.selectedDocumentId = id
  state.selectedBoardId = null
  state.selectedCanvasId = null
  state.selectedDashboard = false
  render()
}

export function selectCanvas(id) {
  state.selectedCanvasId = id
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedDashboard = false
  render()
}

export function selectDashboard() {
  state.selectedDashboard = true
  state.selectedBoardId = null
  state.selectedDocumentId = null
  state.selectedCanvasId = null
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
  menu.innerHTML = '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'board\',\'' + projectId + '\')">Task Board</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'document\',\'' + projectId + '\')">Document</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'canvas\',\'' + projectId + '\')">Canvas Board</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();createFolder(\'' + projectId + '\')">Folder</button>'
  menu.addEventListener('mouseleave', function() { menu.remove() })
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
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();createFolder(\'' + p.id + '\')">New Folder</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'board\',\'' + p.id + '\')">New Task Board</button>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'document\',\'' + p.id + '\')">New Document</button>' +
    '<div class="tl-ctx-divider"></div>' +
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();openModal(\'canvas\',\'' + p.id + '\')">New Canvas Board</button>'
  menu.addEventListener('mouseleave', function() { menu.remove() })
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
    '<button class="tl-ctx-item" onclick="closeAllColumnMenus();deleteFolder(\'' + folderId + '\')">Delete Folder</button>'
  menu.addEventListener('mouseleave', function() { menu.remove() })
  document.body.appendChild(menu)
}
