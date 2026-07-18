import { state, genId, getCurrentWorkspace } from './data.js'
import { render } from './sidebar.js'

const LS_KEY = 'kanboard_self_member'

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

export function renderMemberBar() {
  const bar = document.getElementById('memberBar')
  if (!bar) return

  const members = getWorkspaceMembers()
  const selfId = state.selfMemberId

  if (members.length === 0) {
    bar.innerHTML = ''
    return
  }

  const sorted = [...members].sort((a, b) => {
    if (a.id === selfId) return -1
    if (b.id === selfId) return 1
    return 0
  })

  let html = '<div class="mb-avatars" style="cursor:pointer" onclick="openPreferences(\'members\')">'
  for (const m of sorted) {
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

window.renderMemberBar = renderMemberBar
