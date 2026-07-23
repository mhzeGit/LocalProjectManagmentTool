import { state } from './data.js'

let _items = []
let _index = -1

export function initNavigation() {
  document.addEventListener('keydown', onGlobalKeyDown)
}

export function setupGrid(items) {
  cleanupGrid()
  _items = items
  _index = 0
  items.forEach(el => {
    el.addEventListener('mouseenter', onMouseEnter)
  })
  updateFocus()
}

export function cleanupGrid() {
  _items.forEach(el => {
    el.classList.remove('nav-focused')
    el.removeEventListener('mouseenter', onMouseEnter)
  })
  _items = []
  _index = -1
}

function onMouseEnter(e) {
  const el = e.currentTarget
  const idx = _items.indexOf(el)
  if (idx !== -1 && idx !== _index) {
    _index = idx
    updateFocus()
  }
}

function updateFocus() {
  _items.forEach((el, i) => {
    el.classList.toggle('nav-focused', i === _index)
  })
}

function handleF2Rename() {
  if (_items.length > 0 && _items[_index]) {
    const id = _items[_index].dataset.id
    if (id) {
      if (!state.selectedWorkspaceId) {
        if (window.startRenameWorkspace) window.startRenameWorkspace(id)
      } else if (!state.selectedProjectId) {
        if (window.startRenameProject) window.startRenameProject(id)
      }
      return
    }
  }

  if (state.selectedCanvasId && window.startRenameCanvas) {
    window.startRenameCanvas(state.selectedCanvasId)
  } else if (state.selectedDocumentId && window.startRenameDocument) {
    window.startRenameDocument(state.selectedDocumentId)
  } else if (state.selectedBoardId && window.startRenameSidebarItem) {
    window.startRenameSidebarItem(state.selectedBoardId, 'board')
  } else if (state.selectedProjectId && window.startRenameProject) {
    window.startRenameProject(state.selectedProjectId)
  } else if (state.selectedWorkspaceId && window.startRenameWorkspace) {
    window.startRenameWorkspace(state.selectedWorkspaceId)
  }
}

function isInputEvent(e) {
  const el = e.target
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

function inputFocused() {
  const t = document.activeElement
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
}

function onGlobalKeyDown(e) {
  if (_items.length > 0) {
    const fromInput = isInputEvent(e)
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      if (!fromInput) {
        e.preventDefault()
        _index = Math.min(_index + 1, _items.length - 1)
        updateFocus()
        _items[_index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if (!fromInput) {
        e.preventDefault()
        _index = Math.max(_index - 1, 0)
        updateFocus()
        _items[_index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
      return
    }
    if (e.key === 'Enter') {
      if (!fromInput && _items[_index]) {
        e.preventDefault()
        const id = _items[_index].dataset.id
        if (id) {
          if (!state.selectedWorkspaceId) {
            window.selectWorkspace(id)
          } else if (!state.selectedProjectId) {
            window.selectProject(id)
          }
        }
      }
      return
    }
  }

  if (e.key === 'F2') {
    if (inputFocused()) return
    e.preventDefault()
    handleF2Rename()
    return
  }

  if (e.key === 'Escape') {
    if (e.defaultPrevented) return
    if (isInputEvent(e)) return
    if (window.__isCanvasActive && window.__isCanvasActive()) return

    const ctxMenus = document.querySelectorAll('.tl-ctx-menu')
    if (ctxMenus.length > 0) {
      ctxMenus.forEach(el => el.remove())
      e.preventDefault()
      return
    }

    const colMenus = document.querySelectorAll('.col-menu.open')
    if (colMenus.length > 0) {
      if (window.closeAllColumnMenus) window.closeAllColumnMenus()
      e.preventDefault()
      return
    }

    const modal = document.getElementById('modal')
    if (modal && modal.classList.contains('open')) return

    const prefOverlay = document.getElementById('preferences-overlay')
    if (prefOverlay && prefOverlay.classList.contains('open')) return

    e.preventDefault()
    const { selectedWorkspaceId: wsId, selectedProjectId: pId } = state
    if (pId && wsId) {
      window.selectWorkspace(wsId)
    } else if (wsId) {
      window.selectWorkspaceHome()
    }
  }
}
