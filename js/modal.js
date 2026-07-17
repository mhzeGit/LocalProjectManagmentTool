import { findCard, PREDEFINED_MEMBERS } from './data.js'
import { escapeHtml } from './utils.js'

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
    body.innerHTML = '<label>Board Name</label><input id="modalInput" placeholder="e.g. Kanban Board" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createBoard(\'' + parentId + '\')">Create</button></div>'
  } else if (type === 'column') {
    title.textContent = 'Add Column'
    body.innerHTML = '<label>Column Name</label><input id="modalInput" placeholder="e.g. In Review" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createColumn(\'' + parentId + '\')">Add</button></div>'
  } else if (type === 'card') {
    title.textContent = 'Create Card'
    body.innerHTML = buildCardForm({ title: '', description: '', startDate: null, endDate: null, priority: 'medium', tags: [], members: [], checklists: [] }, 'createCard(\'' + parentId + '\')', false)
  }
}

export function openCardDetail(cardId) {
  const c = findCard(cardId)
  if (!c) return
  const overlay = document.getElementById('modal')
  const title = document.getElementById('modalTitle')
  const body = document.getElementById('modalBody')
  title.textContent = 'Edit Card'
  body.innerHTML = buildCardForm(c, 'saveCard(\'' + cardId + '\')', true)
  overlay.classList.add('open')
  body.querySelector('.cd-title-input')?.focus()
}

function buildCardForm(c, saveAction, showDelete) {
  const startVal = c.startDate || ''
  const endVal = c.endDate || ''
  const tags = c.tags || []
  const members = c.members || []
  const checklists = c.checklists || []

  const sel = (v) => c.priority === v || (!c.priority && v === 'medium') ? ' selected' : ''

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
  html += '        <div id="cd-checklist">'
  for (let i = 0; i < checklists.length; i++) {
    const item = checklists[i]
    const doneClass = item.completed ? ' cd-cl-done' : ''
    html += '          <div class="cd-checklist-item' + doneClass + '">'
    html += '            <label class="cd-cl-checkbox">'
    html += '              <input type="checkbox"' + (item.completed ? ' checked' : '') + '>'
    html += '              <span class="cd-cl-checkmark"></span>'
    html += '            </label>'
  html += '            <span class="cd-cl-text">' + escapeHtml(item.text) + '</span>'
  html += '            <button class="cd-cl-remove" data-action="remove-checklist-item">×</button>'
  html += '          </div>'
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
  html += '        <select id="cd-priority" class="cd-select">'
  html += '          <option value="none"' + sel('none') + '>None</option>'
  html += '          <option value="low"' + sel('low') + '>Low</option>'
  html += '          <option value="medium"' + sel('medium') + '>Medium</option>'
  html += '          <option value="high"' + sel('high') + '>High</option>'
  html += '          <option value="urgent"' + sel('urgent') + '>Urgent</option>'
  html += '        </select>'
  html += '      </div>'

  html += '      <div class="cd-field">'
  html += '        <label>Tags</label>'
  html += '        <div class="cd-chips" id="cd-tags">'
  for (const t of tags) {
    html += '          <span class="cd-chip cd-tag" data-type="tag">' + escapeHtml(t) + '<span class="cd-chip-remove" data-action="remove-chip">×</span></span>'
  }
  html += '        </div>'
  html += '        <div class="cd-chip-add-row">'
  html += '          <input class="cd-chip-input" data-add-chip="cd-tags" placeholder="Add tag...">'
  html += '          <button class="cd-chip-add-btn" data-action="add-chip" data-target="cd-tags">+</button>'
  html += '        </div>'
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
  for (const pm of PREDEFINED_MEMBERS) {
    if (!members.includes(pm)) {
      html += '          <option value="' + escapeHtml(pm) + '">' + escapeHtml(pm) + '</option>'
    }
  }
  html += '        </select>'
  html += '      </div>'

  html += '      <div class="cd-right-footer">'
  if (showDelete) html += '        <button class="btn-danger" onclick="deleteCard(\'' + c.id + '\')">Delete</button>'
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

export function closeModal() {
  document.getElementById('modal').classList.remove('open')
}

export function setupModalKeyboard() {
  const overlay = document.getElementById('modal')

  overlay.addEventListener('change', function(e) {
    if (!this.classList.contains('open')) return
    const target = e.target
    if (target.type === 'checkbox' && target.closest('#cd-checklist')) {
      target.closest('.cd-checklist-item').classList.toggle('cd-cl-done', target.checked)
      return
    }
    if (target.id === 'cd-member-select') {
      const name = target.value.trim()
      if (!name) return
      addMemberChip(name)
      target.value = ''
      refreshMemberSelect()
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
      target.closest('.cd-checklist-item').remove()
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
      const row = target.closest('.cd-chip-add-row')
      const input = row?.querySelector('.cd-chip-input')
      if (input) addChecklistItem(input)
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

function addChecklistItem(input) {
  const val = input.value.trim()
  if (!val) return
  const container = document.getElementById('cd-checklist')
  if (!container) return
  const item = document.createElement('div')
  item.className = 'cd-checklist-item'
  item.innerHTML = '<label class="cd-cl-checkbox"><input type="checkbox"><span class="cd-cl-checkmark"></span></label><span class="cd-cl-text">' + escapeHtml(val) + '</span><button class="cd-cl-remove" data-action="remove-checklist-item">×</button>'
  container.appendChild(item)
  input.value = ''
  input.focus()
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
  for (const pm of PREDEFINED_MEMBERS) {
    if (!used.has(pm)) {
      select.innerHTML += '<option value="' + escapeHtml(pm) + '">' + escapeHtml(pm) + '</option>'
    }
  }
}
