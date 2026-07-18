import { state, findCard, findWorkspace, getWorkspaceTags, getTagColor } from './data.js'
import { escapeHtml, getProgressColor, countChecklistItems, countCompletedChecklistItems } from './utils.js'

const PRIORITY_BAR_CONFIG = {
  none:   { filled: 3, color: '#f97316' },
  low:    { filled: 1, color: '#22c55e' },
  medium: { filled: 3, color: '#f97316' },
  high:   { filled: 5, color: '#ef4444' },
  urgent: { filled: 5, color: '#ef4444' },
  '1':    { filled: 1, color: '#22c55e' },
  '2':    { filled: 2, color: '#84cc16' },
  '3':    { filled: 3, color: '#f97316' },
  '4':    { filled: 4, color: '#f43f5e' },
  '5':    { filled: 5, color: '#ef4444' },
}

const PRIORITY_FILLED_ORDER = [
  { filled: 1, value: '1' },
  { filled: 2, value: '2' },
  { filled: 3, value: '3' },
  { filled: 4, value: '4' },
  { filled: 5, value: '5' },
]

function applyPriorityValue(value) {
  const hidden = document.getElementById('cd-priority')
  const label = document.getElementById('cd-pp-label')
  const picker = document.getElementById('cd-priority-picker')
  if (!hidden || !picker) return
  if (hidden.value === value) return
  hidden.value = value
  const cfg = PRIORITY_BAR_CONFIG[value] || PRIORITY_BAR_CONFIG.medium
  const bars = picker.querySelectorAll('.cd-pp-bar')
  for (let i = 0; i < bars.length; i++) {
    const filled = i < cfg.filled
    bars[i].classList.toggle('filled', filled)
    bars[i].style.background = cfg.color
    bars[i].style.color = cfg.color
  }
  const displayVal = (value && value !== 'none') ? value : '3'
  if (label) label.textContent = displayVal
}

function setPriorityFromClientX(clientX, picker) {
  const bars = picker.querySelectorAll('.cd-pp-bar')
  let closestIdx = 0
  let closestDist = Infinity
  for (let i = 0; i < bars.length; i++) {
    const rect = bars[i].getBoundingClientRect()
    const dist = Math.abs(clientX - (rect.left + rect.width / 2))
    if (dist < closestDist) {
      closestDist = dist
      closestIdx = i
    }
  }
  const filledCount = closestIdx + 1
  let best = 'none'
  for (const entry of PRIORITY_FILLED_ORDER) {
    if (entry.filled <= filledCount) best = entry.value
  }
  applyPriorityValue(best)
}

function renderPriorityPicker() {
  const picker = document.getElementById('cd-priority-picker')
  const hidden = document.getElementById('cd-priority')
  const label = document.getElementById('cd-pp-label')
  if (!picker || !hidden) return
  const val = hidden.value || '3'
  const cfg = PRIORITY_BAR_CONFIG[val] || PRIORITY_BAR_CONFIG.medium
  let html = ''
  for (let i = 0; i < 5; i++) {
    const filled = i < cfg.filled ? ' filled' : ''
    html += '<div class="cd-pp-bar' + filled + '" data-index="' + i + '" data-action="set-priority" style="background:' + cfg.color + ';color:' + cfg.color + '"></div>'
  }
  picker.innerHTML = html
  const displayVal = (val && val !== 'none') ? val : '3'
  if (label) label.textContent = displayVal
}

let _editingCardId = null

export function openModal(type, parentId) {
  const overlay = document.getElementById('modal')
  const title = document.getElementById('modalTitle')
  const body = document.getElementById('modalBody')
  overlay.classList.add('open')

  if (type === 'workspace') {
    title.textContent = 'Create Workspace'
    body.innerHTML = '<label>Workspace Name</label><input id="modalInput" placeholder="e.g. My Workspace" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createWorkspace()">Create</button></div>'
  } else if (type === 'project') {
    title.textContent = 'Create Project'
    body.innerHTML = '<label>Project Name</label><input id="modalInput" placeholder="e.g. My Project" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createProject(\'' + parentId + '\')">Create</button></div>'
  } else if (type === 'board') {
    title.textContent = 'Create Board'
    body.innerHTML = '<label>Board Name</label><input id="modalInput" placeholder="e.g. Task Board" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createBoard(\'' + parentId + '\')">Create</button></div>'
  } else if (type === 'column') {
    title.textContent = 'Add Column'
    body.innerHTML = '<label>Column Name</label><input id="modalInput" placeholder="e.g. In Review" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createColumn(\'' + parentId + '\')">Add</button></div>'
  } else if (type === 'card') {
    title.textContent = 'Create Card'
    body.innerHTML = buildCardForm({ title: '', description: '', startDate: null, endDate: null, priority: '3', tags: [], members: [], checklists: [] }, 'createCard(\'' + parentId + '\')')
    renderPriorityPicker()
  } else if (type === 'document') {
    title.textContent = 'Create Document'
    body.innerHTML = '<label>Document Name</label><input id="modalInput" placeholder="e.g. Meeting Notes" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createDocument(\'' + parentId + '\')">Create</button></div>'
  }
}

export function openCardDetail(cardId) {
  const c = findCard(cardId)
  if (!c) return
  _editingCardId = cardId
  const overlay = document.getElementById('modal')
  const title = document.getElementById('modalTitle')
  const body = document.getElementById('modalBody')
  title.textContent = 'Edit Card'
  body.innerHTML = buildCardForm(c, 'saveCard(\'' + cardId + '\')', true)
  overlay.classList.add('open')
  renderPriorityPicker()
  body.querySelector('.cd-title-input')?.focus()
}

function buildCardForm(c, saveAction) {
  const startVal = c.startDate || ''
  const endVal = c.endDate || ''
  const tags = c.tags || []
  const members = c.members || []
  const checklists = c.checklists || []

  let html = ''
  html += '<div class="cd-scroll">'
  html += '  <div class="cd-two-col">'

  html += '    <div class="cd-left">'
  html += '      <div class="cd-left-section">'
  html += '        <input id="cd-title" class="cd-title-input" value="' + escapeHtml(c.title) + '" placeholder="Card title">'
  html += '      </div>'
  html += '      <div class="cd-left-section cd-left-section-desc">'
  html += '        <textarea id="cd-desc" class="cd-desc-textarea" placeholder="Add a more detailed description…">' + escapeHtml(c.description || '') + '</textarea>'
  html += '      </div>'
  html += '      <div class="cd-left-section">'
  html += '        <label>Checklist</label>'
  const clTotal = countChecklistItems(checklists)
  const clDone = countCompletedChecklistItems(checklists)
  const clPct = clTotal > 0 ? Math.round((clDone / clTotal) * 100) : 0
  html += '        <div id="cd-cl-progress" class="cd-cl-progress' + (clTotal > 0 && clDone === clTotal ? ' done' : '') + '">'
  html += '          <div id="cd-cl-progress-bar" class="cd-cl-progress-bar" style="width:' + clPct + '%;background:' + getProgressColor(clPct) + '"></div>'
  html += '          <span class="cd-cl-progress-text">' + clDone + '/' + clTotal + ' · ' + clPct + '%</span>'
  html += '        </div>'
  html += '        <div id="cd-checklist">'
  for (let i = 0; i < checklists.length; i++) {
    html += renderChecklistItem(checklists[i], 0, i === 0)
  }
  html += '        </div>'
  html += '        <div class="cd-checklist-add">'
  html += '          <input class="cd-checklist-input" id="cd-checklist-input" placeholder="Add checklist item...">'
  html += '          <button class="cd-checklist-add-btn" data-action="add-checklist-item">Add</button>'
  html += '        </div>'
  html += '      </div>'
  html += '    </div>'

  html += '    <div class="cd-right">'
  html += '      <div class="cd-date-row">'
  html += '        <div class="cd-field">'
  html += '          <label>Start Date</label>'
  html += '          <input type="date" id="cd-start" class="cd-date-input" value="' + startVal + '">'
  html += '        </div>'
  html += '        <div class="cd-field">'
  html += '          <label>End Date</label>'
  html += '          <input type="date" id="cd-end" class="cd-date-input" value="' + endVal + '">'
  html += '        </div>'
  html += '      </div>'

  html += '      <div class="cd-field">'
  html += '        <label>Priority</label>'
  const initPriority = (c.priority && c.priority !== 'none') ? c.priority : '3'
  html += '        <input type="hidden" id="cd-priority" value="' + initPriority + '">'
  html += '        <div class="cd-priority-row">'
  html += '          <div class="cd-priority-picker" id="cd-priority-picker"></div>'
  html += '          <span class="cd-pp-label" id="cd-pp-label">' + initPriority + '</span>'
  html += '        </div>'
  html += '      </div>'

  html += '      <div class="cd-field">'
  html += '        <label>Tags</label>'
  html += '        <div class="cd-chips" id="cd-tags">'
  for (const t of tags) {
    const color = getTagColor(t)
    html += '          <span class="cd-chip cd-tag" data-type="tag" data-value="' + escapeHtml(t) + '"><span class="cd-tag-dot" style="background:' + color + '"></span>' + escapeHtml(t) + '<span class="cd-chip-remove" data-action="remove-chip">×</span></span>'
  }
  html += '        </div>'
  html += '        <select id="cd-tag-select" class="cd-select cd-tag-select">'
  html += '          <option value="">Select tag\u2026</option>'
  const wsTags = getWorkspaceTags()
  for (const t of wsTags) {
    if (!tags.includes(t.name)) {
      html += '          <option value="' + escapeHtml(t.name) + '">' + escapeHtml(t.name) + '</option>'
    }
  }
  html += '        </select>'
  html += '      </div>'

  html += '      <div class="cd-field">'
  html += '        <label>Members</label>'
  html += '        <div class="cd-chips" id="cd-members">'
  for (const m of members) {
    html += '          <span class="cd-chip cd-member" data-type="member">' + escapeHtml(m) + '<span class="cd-chip-remove" data-action="remove-chip">×</span></span>'
  }
  html += '        </div>'
  html += '        <select id="cd-member-select" class="cd-select cd-member-select">'
  html += '          <option value="">Select member…</option>'
  const wsMembers = getWorkspaceMembersForCard()
  for (const m of wsMembers) {
    if (!members.includes(m.name)) {
      html += '          <option value="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + '</option>'
    }
  }
  html += '        </select>'
  html += '      </div>'

  html += '      <div class="cd-right-footer">'
  html += '        <div class="cd-right-footer-right">'
  html += '          <button class="btn-cancel" onclick="closeModal()">Cancel</button>'
  html += '          <button class="btn-confirm" onclick="' + saveAction + '">Save</button>'
  html += '        </div>'
  html += '      </div>'
  html += '    </div>'

  html += '  </div>'
  html += '</div>'

  return html
}

function renderChecklistItem(item, depth, isFirst) {
  const hasChildren = item.items && item.items.length > 0
  const leafCount = countChecklistItems(hasChildren ? item.items : [])
  const leafDone = countCompletedChecklistItems(hasChildren ? item.items : [])
  const allDone = hasChildren ? leafCount > 0 && leafDone === leafCount : item.completed
  const doneClass = allDone ? ' cd-cl-done' : ''
  const indent = depth * 24
  let html = '<div class="cd-checklist-item' + doneClass + '" draggable="true" style="padding-left:' + indent + 'px">'
  html += '<span class="cd-cl-drag-handle" data-action="drag-handle">⠿</span>'
  if (hasChildren) {
    html += '<label class="cd-cl-checkbox">'
    html += '  <input type="checkbox" disabled' + (allDone ? ' checked' : '') + '>'
    html += '  <span class="cd-cl-checkmark"></span>'
    html += '</label>'
  } else {
    html += '<label class="cd-cl-checkbox">'
    html += '  <input type="checkbox"' + (item.completed ? ' checked' : '') + '>'
    html += '  <span class="cd-cl-checkmark"></span>'
    html += '</label>'
  }
  html += '<span class="cd-cl-text">' + escapeHtml(item.text) + '</span>'
  html += '<button class="cd-cl-nest" data-action="nest-item" title="Nest under item above">→</button>'
  html += '<button class="cd-cl-unparent" data-action="unparent-item" title="Unparent">←</button>'
  html += '<button class="cd-cl-remove" data-action="remove-checklist-item">×</button>'
  if (hasChildren) {
    html += '<div class="cd-cl-children">'
    for (let i = 0; i < item.items.length; i++) {
      html += renderChecklistItem(item.items[i], depth + 1, i === 0)
    }
    html += '</div>'
  }
  html += '</div>'
  return html
}

export function closeModal() {
  document.getElementById('modal').classList.remove('open')
}

export function setupModalKeyboard() {
  const overlay = document.getElementById('modal')

  overlay.addEventListener('change', function(e) {
    if (!this.classList.contains('open')) return
    const target = e.target
    if (target.type === 'checkbox' && target.closest('#cd-checklist')) {
      const item = target.closest('.cd-checklist-item')
      const childrenContainer = item.querySelector(':scope > .cd-cl-children')
      if (!childrenContainer) {
        item.classList.toggle('cd-cl-done', target.checked)
      }
      propagateChecklistUp(item)
      updateChecklistProgress()
      return
    }
    if (target.id === 'cd-member-select') {
      const name = target.value.trim()
      if (!name) return
      addMemberChip(name)
      target.value = ''
      refreshMemberSelect()
    }
    if (target.id === 'cd-tag-select') {
      const name = target.value.trim()
      if (!name) return
      addTagChip(name)
      target.value = ''
      refreshTagSelect()
    }
  })

  overlay.addEventListener('click', function(e) {
    if (!this.classList.contains('open')) return
    const target = e.target
    const action = target.dataset.action

    if (!action) {
      if (e.target === this) {
        const confirmBtn = this.querySelector('.btn-confirm')
        if (confirmBtn) { confirmBtn.click() }
        else { closeModal() }
      }
      return
    }

    if (action === 'remove-chip') {
      const container = target.parentElement.parentElement
      target.parentElement.remove()
      if (container?.id === 'cd-members') refreshMemberSelect()
      return
    }

    if (action === 'remove-checklist-item') {
      const item = target.closest('.cd-checklist-item')
      const parentContainer = item.parentElement
      item.remove()
      if (parentContainer && parentContainer.classList.contains('cd-cl-children')) {
        const grandparent = parentContainer.closest('.cd-checklist-item')
        if (grandparent) propagateChecklistUp(grandparent)
      }
      updateChecklistProgress()
      return
    }

    if (action === 'set-priority') {
      const index = parseInt(target.dataset.index)
      const filledCount = index + 1
      let best = 'none'
      for (const entry of PRIORITY_FILLED_ORDER) {
        if (entry.filled <= filledCount) best = entry.value
      }
      applyPriorityValue(best)
      return
    }

    if (action === 'add-chip') {
      const containerId = target.dataset.target
      const row = target.closest('.cd-chip-add-row')
      const input = row?.querySelector('.cd-chip-input')
      if (input && containerId) addChip(input, containerId)
      return
    }

    if (action === 'add-checklist-item') {
      const row = target.closest('.cd-checklist-add')
      const input = row?.querySelector('.cd-checklist-input')
      if (input) addChecklistItem(input)
      return
    }

    if (action === 'nest-item') {
      const item = target.closest('.cd-checklist-item')
      if (item) nestChecklistItem(item)
      return
    }

    if (action === 'unparent-item') {
      const item = target.closest('.cd-checklist-item')
      if (item) unparentChecklistItem(item)
      return
    }
  })

  overlay.addEventListener('keydown', function(e) {
    if (!this.classList.contains('open')) return
    if (e.key === 'Escape') { closeModal(); e.preventDefault(); return }

    if (e.key === 'Enter') {
      const target = e.target
      if (target.tagName === 'TEXTAREA') return
      if (target.dataset.addChip) {
        e.preventDefault()
        addChip(target, target.dataset.addChip)
        return
      }
      if (target.id === 'cd-checklist-input') {
        e.preventDefault()
        addChecklistItem(target)
        return
      }
      if (target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'date') {
        const confirmBtn = this.querySelector('.btn-confirm')
        if (confirmBtn) { e.preventDefault(); confirmBtn.click() }
      }
    }

    if (e.key === 'Tab') {
      const buttons = Array.from(this.querySelectorAll('.modal-actions button:not([disabled]), .cd-right-footer button:not([disabled])'))
      if (buttons.length < 2) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  })

  let _ppActivePicker = null

  overlay.addEventListener('mousedown', function(e) {
    if (!this.classList.contains('open')) return
    if (e.button !== 0) return
    const picker = e.target.closest('.cd-priority-picker')
    if (!picker) return
    _ppActivePicker = picker
  })

  document.addEventListener('mousemove', function(e) {
    if (!_ppActivePicker) return
    setPriorityFromClientX(e.clientX, _ppActivePicker)
  })

  document.addEventListener('mouseup', function() {
    _ppActivePicker = null
  })

  let dragSrc = null
  overlay.addEventListener('dragstart', function(e) {
    const item = e.target.closest('.cd-checklist-item')
    if (!item) return
    dragSrc = item
    item.classList.add('cd-cl-dragging')
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', '')
  })

  overlay.addEventListener('dragover', function(e) {
    const item = e.target.closest('.cd-checklist-item')
    if (!item || item === dragSrc) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = item.getBoundingClientRect()
    const yRatio = (e.clientY - rect.top) / rect.height
    item.classList.toggle('cd-cl-drop-before', yRatio < 0.25)
    item.classList.toggle('cd-cl-drop-nest', yRatio >= 0.25 && yRatio < 0.75)
    item.classList.toggle('cd-cl-drop-after', yRatio >= 0.75)
  })

  overlay.addEventListener('dragleave', function(e) {
    const item = e.target.closest('.cd-checklist-item')
    if (!item) return
    const related = e.relatedTarget
    if (related && item.contains(related)) return
    item.classList.remove('cd-cl-drop-before', 'cd-cl-drop-nest', 'cd-cl-drop-after')
  })

  overlay.addEventListener('drop', function(e) {
    e.preventDefault()
    const target = e.target.closest('.cd-checklist-item')
    if (!target || !dragSrc || target === dragSrc) return
    const rect = target.getBoundingClientRect()
    const yRatio = (e.clientY - rect.top) / rect.height
    const oldParent = dragSrc.parentElement
    if (yRatio < 0.25) {
      target.parentElement.insertBefore(dragSrc, target)
    } else if (yRatio < 0.75) {
      let childrenContainer = target.querySelector(':scope > .cd-cl-children')
      if (!childrenContainer) {
        childrenContainer = document.createElement('div')
        childrenContainer.className = 'cd-cl-children'
        target.appendChild(childrenContainer)
      }
      childrenContainer.appendChild(dragSrc)
      propagateChecklistUp(target)
    } else {
      target.parentElement.insertBefore(dragSrc, target.nextSibling)
    }
    target.classList.remove('cd-cl-drop-before', 'cd-cl-drop-nest', 'cd-cl-drop-after')
    dragSrc.classList.remove('cd-cl-dragging')
    if (oldParent !== dragSrc.parentElement) {
      if (oldParent.classList.contains('cd-cl-children')) {
        const gp = oldParent.closest('.cd-checklist-item')
        if (gp) propagateChecklistUp(gp)
        if (oldParent.children.length === 0) oldParent.remove()
      }
    } else if (oldParent.classList.contains('cd-cl-children')) {
      const gp = oldParent.closest('.cd-checklist-item')
      if (gp) propagateChecklistUp(gp)
    }
    dragSrc = null
  })

  overlay.addEventListener('dragend', function(e) {
    const item = e.target.closest('.cd-checklist-item')
    if (item) {
      item.classList.remove('cd-cl-dragging', 'cd-cl-drop-before', 'cd-cl-drop-nest', 'cd-cl-drop-after')
    }
    dragSrc = null
  })
}

function addChip(input, containerId) {
  const val = input.value.trim()
  if (!val) return
  const container = document.getElementById(containerId)
  if (!container) return
  const chipType = containerId === 'cd-tags' ? 'tag' : 'member'
  const chipClass = containerId === 'cd-tags' ? 'cd-tag' : 'cd-member'
  const chip = document.createElement('span')
  chip.className = 'cd-chip ' + chipClass
  chip.dataset.type = chipType
  chip.innerHTML = escapeHtml(val) + '<span class="cd-chip-remove" data-action="remove-chip">×</span>'
  container.appendChild(chip)
  input.value = ''
  input.focus()
}

function countChecklistLeafEls(container) {
  let count = 0
  for (const child of container.children) {
    if (!child.classList.contains('cd-checklist-item')) continue
    const childrenContainer = child.querySelector(':scope > .cd-cl-children')
    if (childrenContainer && childrenContainer.children.length > 0) {
      count += countChecklistLeafEls(childrenContainer)
    } else {
      count++
    }
  }
  return count
}

function countCheckedChecklistLeafEls(container) {
  let count = 0
  for (const child of container.children) {
    if (!child.classList.contains('cd-checklist-item')) continue
    const childrenContainer = child.querySelector(':scope > .cd-cl-children')
    if (childrenContainer && childrenContainer.children.length > 0) {
      count += countCheckedChecklistLeafEls(childrenContainer)
    } else {
      const cb = child.querySelector('input[type="checkbox"]')
      if (cb && cb.checked) count++
    }
  }
  return count
}

function updateChecklistProgress() {
  const container = document.getElementById('cd-checklist')
  if (!container) return
  const total = countChecklistLeafEls(container)
  const done = countCheckedChecklistLeafEls(container)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const color = getProgressColor(pct)
  const bar = document.getElementById('cd-cl-progress-bar')
  const prog = document.getElementById('cd-cl-progress')
  if (bar) { bar.style.width = pct + '%'; bar.style.background = color }
  if (prog) prog.classList.toggle('done', total > 0 && done === total)
  const text = prog ? prog.querySelector('.cd-cl-progress-text') : null
  if (text) text.textContent = done + '/' + total + ' · ' + pct + '%'
  if (_editingCardId) {
    document.querySelectorAll('[data-card-id="' + _editingCardId + '"]').forEach(function(el) {
      var cp = el.querySelector('.card-cl-progress, .tl-bar-cl-progress, .tl-ucard-cl-progress, .cal-card-cl-progress, .cal-span-cl-progress, .cal-ucard-cl-progress')
      if (!cp) return
      var cf = cp.querySelector('.card-cl-progress-bar, .tl-bar-cl-progress-fill, .tl-ucard-cl-progress-fill, .cal-card-cl-progress-fill, .cal-span-cl-progress-fill, .cal-ucard-cl-progress-fill')
      if (cf) { cf.style.width = pct + '%'; cf.style.background = color }
      cp.classList.toggle('done', total > 0 && done === total)
    })
  }
}

function propagateChecklistUp(item) {
  const childrenContainer = item.querySelector(':scope > .cd-cl-children')
  if (childrenContainer) {
    const leafCount = countChecklistLeafEls(childrenContainer)
    const leafDone = countCheckedChecklistLeafEls(childrenContainer)
    const allDone = leafCount > 0 && leafDone === leafCount
    const cb = item.querySelector('input[type="checkbox"]')
    if (cb) {
      cb.checked = allDone
      cb.indeterminate = leafDone > 0 && leafDone < leafCount
    }
    item.classList.toggle('cd-cl-done', allDone)
  }
  const parent = item.parentElement
  if (parent && parent.classList.contains('cd-cl-children')) {
    const grandparent = parent.closest('.cd-checklist-item')
    if (grandparent) propagateChecklistUp(grandparent)
  }
}

function nestChecklistItem(item) {
  const prev = item.previousElementSibling
  if (!prev || !prev.classList.contains('cd-checklist-item')) return
  let childrenContainer = prev.querySelector(':scope > .cd-cl-children')
  if (!childrenContainer) {
    childrenContainer = document.createElement('div')
    childrenContainer.className = 'cd-cl-children'
    prev.appendChild(childrenContainer)
  }
  childrenContainer.appendChild(item)
  const prevCb = prev.querySelector('input[type="checkbox"]')
  if (prevCb) prevCb.checked = false
  propagateChecklistUp(prev)
  updateChecklistProgress()
}

function unparentChecklistItem(item) {
  const parent = item.parentElement
  if (!parent || !parent.classList.contains('cd-cl-children')) return
  const grandparent = parent.closest('.cd-checklist-item')
  if (!grandparent) return
  const container = grandparent.parentElement
  if (!container) return
  container.insertBefore(item, grandparent.nextSibling)
  if (parent.children.length === 0) {
    parent.remove()
  }
  const gpCb = grandparent.querySelector('input[type="checkbox"]')
  if (gpCb) {
    gpCb.checked = false
    gpCb.indeterminate = false
  }
  grandparent.classList.remove('cd-cl-done')
  const cb = item.querySelector('input[type="checkbox"]')
  if (cb) {
    cb.indeterminate = false
  }
  propagateChecklistUp(grandparent)
  updateChecklistProgress()
}

function addChecklistItem(input) {
  const val = input.value.trim()
  if (!val) return
  const container = document.getElementById('cd-checklist')
  if (!container) return
  const item = document.createElement('div')
  item.className = 'cd-checklist-item'
  item.draggable = true
  item.innerHTML = '<span class="cd-cl-drag-handle" data-action="drag-handle">⠿</span><label class="cd-cl-checkbox"><input type="checkbox"><span class="cd-cl-checkmark"></span></label><span class="cd-cl-text">' + escapeHtml(val) + '</span><button class="cd-cl-nest" data-action="nest-item" title="Nest under item above">→</button><button class="cd-cl-unparent" data-action="unparent-item" title="Unparent">←</button><button class="cd-cl-remove" data-action="remove-checklist-item">×</button>'
  container.appendChild(item)
  input.value = ''
  input.focus()
  updateChecklistProgress()
}

function addMemberChip(name) {
  const container = document.getElementById('cd-members')
  if (!container) return
  const chip = document.createElement('span')
  chip.className = 'cd-chip cd-member'
  chip.dataset.type = 'member'
  chip.innerHTML = escapeHtml(name) + '<span class="cd-chip-remove" data-action="remove-chip">×</span>'
  container.appendChild(chip)
}

function refreshMemberSelect() {
  const select = document.getElementById('cd-member-select')
  if (!select) return
  const used = new Set()
  document.querySelectorAll('#cd-members .cd-chip[data-type="member"]').forEach(el => {
    const text = el.childNodes[0]?.nodeValue?.trim()
    if (text) used.add(text)
  })
  select.innerHTML = '<option value="">Select member…</option>'
  const wsMembers = getWorkspaceMembersForCard()
  for (const m of wsMembers) {
    if (!used.has(m.name)) {
      select.innerHTML += '<option value="' + escapeHtml(m.name) + '">' + escapeHtml(m.name) + '</option>'
    }
  }
}

function getWorkspaceMembersForCard() {
  const w = state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null
  return w ? w.members || [] : []
}

function addTagChip(name) {
  const container = document.getElementById('cd-tags')
  if (!container) return
  const color = getTagColor(name)
  const chip = document.createElement('span')
  chip.className = 'cd-chip cd-tag'
  chip.dataset.type = 'tag'
  chip.dataset.value = name
  chip.innerHTML = '<span class="cd-tag-dot" style="background:' + color + '"></span>' + escapeHtml(name) + '<span class="cd-chip-remove" data-action="remove-chip">×</span>'
  container.appendChild(chip)
}

function refreshTagSelect() {
  const select = document.getElementById('cd-tag-select')
  if (!select) return
  const used = new Set()
  document.querySelectorAll('#cd-tags .cd-chip[data-type="tag"]').forEach(el => {
    const text = el.dataset.value || el.childNodes[0]?.nodeValue?.trim()
    if (text) used.add(text)
  })
  select.innerHTML = '<option value="">Select tag\u2026</option>'
  const wsTags = getWorkspaceTags()
  for (const t of wsTags) {
    if (!used.has(t.name)) {
      select.innerHTML += '<option value="' + escapeHtml(t.name) + '">' + escapeHtml(t.name) + '</option>'
    }
  }
}
