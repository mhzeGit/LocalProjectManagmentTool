import { findColumn, findCard, findProject, findDocument, findCanvas } from './data.js'
import { pushCommand } from './history.js'

let _renderFn = null

export function setInlineEditRender(renderFn) {
  _renderFn = renderFn
}

export function startRenameColumn(e, id) {
  e.stopPropagation()
  const span = document.getElementById('colTitle-' + id)
  const col = findColumn(id)
  if (!span || !col) return
  const oldName = col.name
  const input = document.createElement('input')
  input.value = col.name
  input.className = 'col-rename-input'
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:14px;font-weight:600;padding:2px 6px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val && val !== oldName) {
      col.name = val
      if (_renderFn) _renderFn()
      pushCommand({
        undo() { col.name = oldName; if (_renderFn) _renderFn() },
        redo() { col.name = val; if (_renderFn) _renderFn() },
        description: 'Rename Column'
      })
    } else if (_renderFn) _renderFn()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur() }
    if (ev.key === 'Escape') { ev.preventDefault(); if (_renderFn) _renderFn() }
  })
}

export function startRenameCard(e, id) {
  e.stopPropagation()
  const span = document.getElementById('cardTitle-' + id)
  const card = findCard(id)
  if (!span || !card) return
  const oldTitle = card.title
  const input = document.createElement('input')
  input.value = card.title
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:14px;font-weight:600;padding:2px 6px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val && val !== oldTitle) {
      card.title = val
      if (_renderFn) _renderFn()
      pushCommand({
        undo() { card.title = oldTitle; if (_renderFn) _renderFn() },
        redo() { card.title = val; if (_renderFn) _renderFn() },
        description: 'Rename Card'
      })
    } else if (_renderFn) _renderFn()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur() }
    if (ev.key === 'Escape') { ev.preventDefault(); if (_renderFn) _renderFn() }
  })
}

export function startRenameProject(projectId) {
  const span = document.getElementById('projectTitle-' + projectId)
  const p = findProject(projectId)
  if (!span || !p) return
  const oldName = p.name
  const input = document.createElement('input')
  input.value = p.name
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:15px;font-weight:600;padding:2px 6px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val && val !== oldName) {
      p.name = val
      if (_renderFn) _renderFn()
      pushCommand({
        undo() { p.name = oldName; if (_renderFn) _renderFn() },
        redo() { p.name = val; if (_renderFn) _renderFn() },
        description: 'Rename Project'
      })
    } else if (_renderFn) _renderFn()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur() }
    if (ev.key === 'Escape') { ev.preventDefault(); if (_renderFn) _renderFn() }
  })
}

export function startRenameCanvas(canvasId) {
  const span = document.getElementById('canvasTitle-' + canvasId)
  const c = findCanvas(canvasId)
  if (!span || !c) return
  const oldName = c.name
  const input = document.createElement('input')
  input.value = c.name
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:24px;font-weight:700;padding:4px 8px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val && val !== oldName) {
      c.name = val
      if (_renderFn) _renderFn()
      pushCommand({
        undo() { c.name = oldName; if (_renderFn) _renderFn() },
        redo() { c.name = val; if (_renderFn) _renderFn() },
        description: 'Rename Canvas'
      })
    } else if (_renderFn) _renderFn()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur() }
    if (ev.key === 'Escape') { ev.preventDefault(); if (_renderFn) _renderFn() }
  })
}

export function startRenameDocument(documentId) {
  const span = document.getElementById('docTitle-' + documentId)
  const d = findDocument(documentId)
  if (!span || !d) return
  const oldName = d.name
  const input = document.createElement('input')
  input.value = d.name
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:24px;font-weight:700;padding:4px 8px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val && val !== oldName) {
      d.name = val
      if (_renderFn) _renderFn()
      pushCommand({
        undo() { d.name = oldName; if (_renderFn) _renderFn() },
        redo() { d.name = val; if (_renderFn) _renderFn() },
        description: 'Rename Document'
      })
    } else if (_renderFn) _renderFn()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur() }
    if (ev.key === 'Escape') { ev.preventDefault(); if (_renderFn) _renderFn() }
  })
}
