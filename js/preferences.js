import { state, genId, getCurrentWorkspace, PREDEFINED_COLORS } from './data.js'
import { render } from './sidebar.js'

let activeCategoryId = 'colors'
let _prefEditingMemberId = null

const categories = [
  { id: 'colors', label: 'Workspace Colors', icon: '\ud83c\udfa8', render: renderColorsTab },
  { id: 'members', label: 'Members', icon: '\ud83d\udc65', render: renderMembersTab },
  { id: 'general', label: 'General', icon: '\u2699\ufe0f', render: renderGeneralTab },
]

document.getElementById('preferences-overlay')?.addEventListener('click', function(e) {
  if (e.target === this) closePreferences()
})

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('preferences-overlay')
    if (overlay && overlay.classList.contains('open')) closePreferences()
  }
})

export function openPreferences(categoryId) {
  const overlay = document.getElementById('preferences-overlay')
  overlay.classList.add('open')
  activeCategoryId = categoryId && categories.find(c => c.id === categoryId) ? categoryId : categories[0].id
  _prefEditingMemberId = null
  renderPreferences()
}

export function closePreferences() {
  document.getElementById('preferences-overlay').classList.remove('open')
}

function renderPreferences() {
  const sidebar = document.getElementById('pref-sidebar')
  const content = document.getElementById('pref-content')

  let sidebarHtml = ''
  for (const cat of categories) {
    const active = cat.id === activeCategoryId ? ' active' : ''
    sidebarHtml += '<div class="pref-tab' + active + '" data-category="' + cat.id + '" onclick="selectPrefCategory(\'' + cat.id + '\')">'
    sidebarHtml += '  <span class="pref-tab-icon">' + cat.icon + '</span>'
    sidebarHtml += '  <span class="pref-tab-label">' + cat.label + '</span>'
    sidebarHtml += '</div>'
  }
  sidebar.innerHTML = sidebarHtml

  const category = categories.find(c => c.id === activeCategoryId)
  if (category) {
    content.innerHTML = ''
    category.render(content)
  }
}

window.selectPrefCategory = function(id) {
  activeCategoryId = id
  _prefEditingMemberId = null
  renderPreferences()
}

/* ─── Colors Tab ─── */

function renderColorsTab(container) {
  let html = '<div class="pref-section-title">Predefined Workspace Colors</div>'
  html += '<div class="pref-colors-grid">'

  for (const c of PREDEFINED_COLORS) {
    html += '<div class="pref-color-card">'
    html += '  <div class="pref-color-swatch" style="background:' + c.value + '"></div>'
    html += '  <span class="pref-color-name">' + escapeHtml(c.name) + '</span>'
    html += '  <button class="pref-color-del" onclick="prefRemoveColor(\'' + c.id + '\')" title="Remove color">\u2715</button>'
    html += '</div>'
  }

  html += '</div>'

  html += '<div class="pref-section-title" style="margin-top:4px">Add Color</div>'
  html += '<div class="pref-color-add-form">'
  html += '  <input type="color" id="pref-new-color-value" value="#4f46e5">'
  html += '  <input type="text" id="pref-new-color-name" placeholder="Color name" autofocus>'
  html += '  <button class="pref-color-add-btn" onclick="prefAddColor()">+ Add</button>'
  html += '</div>'

  container.innerHTML = html

  const nameInput = document.getElementById('pref-new-color-name')
  if (nameInput) {
    nameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') prefAddColor()
    })
  }
}

window.prefAddColor = function() {
  const nameInput = document.getElementById('pref-new-color-name')
  const valueInput = document.getElementById('pref-new-color-value')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  const value = valueInput ? valueInput.value : '#4f46e5'
  PREDEFINED_COLORS.push({ id: genId(), name, value })
  renderColorsTab(document.getElementById('pref-content'))
}

window.prefRemoveColor = function(id) {
  const idx = PREDEFINED_COLORS.findIndex(c => c.id === id)
  if (idx !== -1) PREDEFINED_COLORS.splice(idx, 1)
  renderColorsTab(document.getElementById('pref-content'))
}

/* ─── Members Tab ─── */

function renderMembersTab(container) {
  const w = getCurrentWorkspace()
  if (!w) {
    container.innerHTML = '<div class="pref-placeholder"><div class="pref-placeholder-text">No workspace selected.</div></div>'
    return
  }

  const members = w.members || []
  const selfId = state.selfMemberId
  const editing = _prefEditingMemberId ? members.find(m => m.id === _prefEditingMemberId) : null

  let html = '<div class="pref-section-title">Workspace Members</div>'
  html += '<div class="pref-members-header">Manage who has access to this workspace. Members can be assigned to cards.</div>'

  if (editing) {
    html += '<div class="pref-member-add-form">'
    html += '  <input id="pref-member-edit-name" class="pref-member-edit-input" value="' + escapeHtml(editing.name) + '" placeholder="Username" autofocus>'
    html += '  <input id="pref-member-edit-avatar" value="' + escapeHtml(editing.avatar) + '" placeholder="Avatar URL (optional)">'
    html += '  <button class="pref-member-add-btn" onclick="prefSaveMemberEdit()">Save</button>'
    html += '  <button class="pref-color-add-btn" style="background:#2a2a3d" onclick="prefCancelMemberEdit()">Cancel</button>'
    html += '</div>'
  } else {
    html += '<div class="pref-member-add-form">'
    html += '  <input id="pref-new-member-name" placeholder="Username" autofocus>'
    html += '  <input id="pref-new-member-avatar" placeholder="Avatar URL (optional)">'
    html += '  <button class="pref-member-add-btn" onclick="prefAddMember()">+ Add</button>'
    html += '</div>'
  }

  if (members.length === 0) {
    html += '<div class="pref-member-empty">No members yet. Add one above.</div>'
  } else {
    for (const m of members) {
      const isSelf = m.id === selfId
      html += '<div class="pref-member-item' + (isSelf ? ' pref-member-self' : '') + '">'
      if (m.avatar) {
        html += '  <img class="pref-member-avatar" src="' + m.avatar + '" alt="">'
      } else {
        html += '  <span class="pref-member-avatar">' + getInitials(m.name) + '</span>'
      }
      html += '  <span class="pref-member-name">' + escapeHtml(m.name) + '</span>'
      html += '  <span class="pref-member-self-badge">' + (isSelf ? 'YOU' : '') + '</span>'
      html += '  <div class="pref-member-actions">'
      if (!isSelf) {
        html += '    <button class="pref-member-btn pref-member-btn-self" onclick="prefSetSelfMember(\'' + m.id + '\')">Set as Self</button>'
      }
      html += '    <button class="pref-member-btn pref-member-btn-edit" onclick="prefStartEditMember(\'' + m.id + '\')">\u270e</button>'
      html += '    <button class="pref-member-btn pref-member-btn-del" onclick="prefRemoveMember(\'' + m.id + '\')">\u2715</button>'
      html += '  </div>'
      html += '</div>'
    }
  }

  container.innerHTML = html

  const newNameInput = document.getElementById('pref-new-member-name')
  if (newNameInput) {
    newNameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') prefAddMember()
    })
  }
  const editNameInput = document.getElementById('pref-member-edit-name')
  if (editNameInput) {
    editNameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') prefSaveMemberEdit()
    })
  }
}

window.prefAddMember = function() {
  const w = getCurrentWorkspace()
  if (!w) return
  const nameInput = document.getElementById('pref-new-member-name')
  const avatarInput = document.getElementById('pref-new-member-avatar')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  const avatar = avatarInput ? avatarInput.value.trim() : ''
  w.members.push({ id: genId(), name, avatar })
  renderMembersTab(document.getElementById('pref-content'))
  render()
}

window.prefStartEditMember = function(id) {
  _prefEditingMemberId = id
  renderMembersTab(document.getElementById('pref-content'))
}

window.prefCancelMemberEdit = function() {
  _prefEditingMemberId = null
  renderMembersTab(document.getElementById('pref-content'))
}

window.prefSaveMemberEdit = function() {
  if (!_prefEditingMemberId) return
  const w = getCurrentWorkspace()
  if (!w) return
  const m = w.members.find(mem => mem.id === _prefEditingMemberId)
  if (!m) return
  const nameInput = document.getElementById('pref-member-edit-name')
  const avatarInput = document.getElementById('pref-member-edit-avatar')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  m.name = name
  m.avatar = avatarInput ? avatarInput.value.trim() : ''
  _prefEditingMemberId = null
  renderMembersTab(document.getElementById('pref-content'))
  render()
}

window.prefRemoveMember = function(id) {
  const w = getCurrentWorkspace()
  if (!w) return
  const idx = w.members.findIndex(m => m.id === id)
  if (idx === -1) return
  w.members.splice(idx, 1)
  if (state.selfMemberId === id) {
    state.selfMemberId = null
    localStorage.removeItem('kanboard_self_member')
  }
  if (_prefEditingMemberId === id) _prefEditingMemberId = null
  renderMembersTab(document.getElementById('pref-content'))
  render()
}

window.prefSetSelfMember = function(id) {
  state.selfMemberId = id || null
  if (id) {
    localStorage.setItem('kanboard_self_member', JSON.stringify(id))
  } else {
    localStorage.removeItem('kanboard_self_member')
  }
  renderMembersTab(document.getElementById('pref-content'))
  render()
}

/* ─── General Tab (placeholder for future settings) ─── */

function renderGeneralTab(container) {
  container.innerHTML = '<div class="pref-placeholder"><div class="pref-placeholder-icon">\u2699\ufe0f</div><div class="pref-placeholder-text">General settings coming soon</div></div>'
}

/* ─── Helpers ─── */

function getInitials(name) {
  return name.split(/\s+/).map(s => s[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

window.openPreferences = openPreferences
window.closePreferences = closePreferences
