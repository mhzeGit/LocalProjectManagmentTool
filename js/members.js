import { state, genId, getCurrentWorkspace } from './data.js'
import { render } from './sidebar.js'

const LS_KEY = 'kanboard_self_member'
let _editingMemberId = null

export function initSelfMember() {
  const saved = localStorage.getItem(LS_KEY)
  if (saved) {
    try {
      state.selfMemberId = JSON.parse(saved)
    } catch (e) {
      state.selfMemberId = null
    }
  }
}

export function getWorkspaceMembers() {
  const w = getCurrentWorkspace()
  return w ? w.members || [] : []
}

export function setSelfMember(id) {
  state.selfMemberId = id || null
  if (id) {
    localStorage.setItem(LS_KEY, JSON.stringify(id))
  } else {
    localStorage.removeItem(LS_KEY)
  }
  renderMemberBar()
}

export function getSelfMember() {
  if (!state.selfMemberId) return null
  const members = getWorkspaceMembers()
  return members.find(m => m.id === state.selfMemberId) || null
}

export function addMember(name, avatar) {
  const w = getCurrentWorkspace()
  if (!w || !name.trim()) return null
  const member = { id: genId(), name: name.trim(), avatar: avatar || '' }
  w.members.push(member)
  render()
  return member
}

export function editMember(memberId, name, avatar) {
  const w = getCurrentWorkspace()
  if (!w || !name.trim()) return null
  const m = w.members.find(m => m.id === memberId)
  if (!m) return null
  m.name = name.trim()
  m.avatar = avatar || ''
  render()
  return m
}

export function removeMember(memberId) {
  const w = getCurrentWorkspace()
  if (!w) return
  const idx = w.members.findIndex(m => m.id === memberId)
  if (idx === -1) return
  w.members.splice(idx, 1)
  if (state.selfMemberId === memberId) {
    state.selfMemberId = null
    localStorage.removeItem(LS_KEY)
  }
  render()
}

export function openMemberManager() {
  const overlay = document.getElementById('modal')
  const title = document.getElementById('modalTitle')
  const body = document.getElementById('modalBody')
  _editingMemberId = null
  overlay.classList.add('open')
  title.textContent = 'Manage Members'
  renderMemberManagerBody(body)
}

function renderMemberManagerBody(body) {
  const members = getWorkspaceMembers()
  const selfId = state.selfMemberId
  const editing = _editingMemberId ? members.find(m => m.id === _editingMemberId) : null

  let html = '<div class="mm-container">'

  html += '<div class="mm-add-form">'
  if (editing) {
    html += '  <h4 class="mm-add-title">Edit Member</h4>'
  } else {
    html += '  <h4 class="mm-add-title">Add Member</h4>'
  }
  html += '  <div class="mm-add-row">'
  html += '    <input id="mm-name" class="mm-input" placeholder="Username" value="' + escapeHtml(editing ? editing.name : '') + '" autofocus>'
  html += '  </div>'
  html += '  <div class="mm-add-row">'
  html += '    <input id="mm-avatar-url" class="mm-input" placeholder="Avatar URL (optional)" value="' + escapeHtml(editing ? editing.avatar : '') + '">'
  html += '    <span style="color:#555;font-size:12px;align-self:center;">or</span>'
  html += '    <input type="file" id="mm-avatar-file" class="mm-file-input" accept="image/*">'
  html += '  </div>'
  if (editing) {
    html += '  <div class="mm-add-actions">'
    html += '    <button class="btn-confirm mm-add-btn" onclick="membersSaveEdit()">Save</button>'
    html += '    <button class="btn-cancel mm-add-btn" onclick="membersCancelEdit()">Cancel</button>'
    html += '  </div>'
  } else {
    html += '  <button class="btn-confirm mm-add-btn" onclick="membersAddMember()">+ Add</button>'
  }
  html += '</div>'

  if (members.length === 0) {
    html += '<p class="mm-empty">No members yet. Add one above.</p>'
  } else {
    html += '<div class="mm-list">'
    for (const m of members) {
      const isSelf = m.id === selfId
      const avatarHtml = m.avatar
        ? '<img class="mm-avatar" src="' + m.avatar + '" alt="">'
        : '<span class="mm-avatar mm-avatar-initials">' + getInitials(m.name) + '</span>'
      html += '<div class="mm-item' + (isSelf ? ' mm-self' : '') + '">'
      html += '  ' + avatarHtml
      html += '  <span class="mm-name">' + escapeHtml(m.name) + '</span>'
      html += '  <span class="mm-self-badge">' + (isSelf ? 'YOU' : '') + '</span>'
      html += '  <div class="mm-item-actions">'
      if (!isSelf) {
        html += '    <button class="mm-btn mm-btn-self" onclick="membersSetSelf(\'' + m.id + '\')">Set as Self</button>'
      }
      html += '    <button class="mm-btn mm-btn-edit" onclick="membersStartEdit(\'' + m.id + '\')">✎</button>'
      html += '    <button class="mm-btn mm-btn-del" onclick="membersRemoveMember(\'' + m.id + '\')">✕</button>'
      html += '  </div>'
      html += '</div>'
    }
    html += '</div>'
  }

  html += '<div class="modal-actions">'
  html += '  <button class="btn-cancel" onclick="closeModal()">Close</button>'
  html += '</div>'
  html += '</div>'

  body.innerHTML = html

  body.querySelector('#mm-avatar-file')?.addEventListener('change', function(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = function(ev) {
      const urlInput = document.getElementById('mm-avatar-url')
      if (urlInput) urlInput.value = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

window.membersAddMember = function() {
  const nameInput = document.getElementById('mm-name')
  const urlInput = document.getElementById('mm-avatar-url')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  const avatar = urlInput ? urlInput.value.trim() : ''

  const body = document.getElementById('modalBody')

  if (addMember(name, avatar)) {
    nameInput.value = ''
    if (urlInput) urlInput.value = ''
    nameInput.focus()
    const fileInput = document.getElementById('mm-avatar-file')
    if (fileInput) fileInput.value = ''
    renderMemberManagerBody(body)
  }
}

window.membersStartEdit = function(id) {
  _editingMemberId = id
  const body = document.getElementById('modalBody')
  renderMemberManagerBody(body)
}

window.membersCancelEdit = function() {
  _editingMemberId = null
  const body = document.getElementById('modalBody')
  renderMemberManagerBody(body)
}

window.membersSaveEdit = function() {
  if (!_editingMemberId) return
  const nameInput = document.getElementById('mm-name')
  const urlInput = document.getElementById('mm-avatar-url')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  const avatar = urlInput ? urlInput.value.trim() : ''

  if (editMember(_editingMemberId, name, avatar)) {
    _editingMemberId = null
    const body = document.getElementById('modalBody')
    renderMemberManagerBody(body)
  }
}

window.membersRemoveMember = function(id) {
  removeMember(id)
  if (_editingMemberId === id) _editingMemberId = null
  const body = document.getElementById('modalBody')
  if (body) renderMemberManagerBody(body)
}

window.membersSetSelf = function(id) {
  setSelfMember(id)
  const body = document.getElementById('modalBody')
  renderMemberManagerBody(body)
}

export function renderMemberBar() {
  const bar = document.getElementById('memberBar')
  if (!bar) return

  const members = getWorkspaceMembers()
  const selfId = state.selfMemberId

  if (members.length === 0) {
    bar.innerHTML = '<button class="mb-manage-btn" onclick="openMemberManager()">+ Members</button>'
    return
  }

  let html = '<div class="mb-avatars">'
  for (const m of members) {
    const isSelf = m.id === selfId
    if (m.avatar) {
      html += '<div class="mb-avatar-wrap' + (isSelf ? ' mb-self' : '') + '" title="' + escapeHtml(m.name) + (isSelf ? ' (You)' : '') + '">'
      html += '  <img class="mb-avatar" src="' + m.avatar + '">'
      html += '</div>'
    } else {
      html += '<div class="mb-avatar-wrap' + (isSelf ? ' mb-self' : '') + '" title="' + escapeHtml(m.name) + (isSelf ? ' (You)' : '') + '">'
      html += '  <span class="mb-avatar mb-avatar-initials">' + getInitials(m.name) + '</span>'
      html += '</div>'
    }
  }
  html += '</div>'
  html += '<button class="mb-manage-btn" onclick="openMemberManager()" title="Manage Members">⚙</button>'

  bar.innerHTML = html
}

function getInitials(name) {
  return name.split(/\s+/).map(s => s[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

window.openMemberManager = openMemberManager
window.renderMemberBar = renderMemberBar
