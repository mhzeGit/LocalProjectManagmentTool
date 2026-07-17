import { findColumn, findCard, findProject, findDocument } from './data.js'

let _renderFn = null

export function setInlineEditRender(renderFn) {
  _renderFn = renderFn
}

export function startRenameColumn(e, id) {
  e.stopPropagation()
  const span = document.getElementById('colTitle-' + id)
  const col = findColumn(id)
  if (!span || !col) return
  const input = document.createElement('input')
  input.value = col.name
  input.className = 'col-rename-input'
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:14px;font-weight:600;padding:2px 6px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val) { col.name = val; if (_renderFn) _renderFn() }
    else if (_renderFn) _renderFn()
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
  const input = document.createElement('input')
  input.value = card.title
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:14px;font-weight:600;padding:2px 6px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val) { card.title = val; if (_renderFn) _renderFn() }
    else if (_renderFn) _renderFn()
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
  const input = document.createElement('input')
  input.value = p.name
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:15px;font-weight:600;padding:2px 6px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val) { p.name = val; if (_renderFn) _renderFn() }
    else if (_renderFn) _renderFn()
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
  const input = document.createElement('input')
  input.value = d.name
  input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:24px;font-weight:700;padding:4px 8px;width:100%;outline:none;'
  span.replaceWith(input)
  input.focus()
  input.select()
  function finish() {
    const val = input.value.trim()
    if (val) { d.name = val; if (_renderFn) _renderFn() }
    else if (_renderFn) _renderFn()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur() }
    if (ev.key === 'Escape') { ev.preventDefault(); if (_renderFn) _renderFn() }
  })
}
