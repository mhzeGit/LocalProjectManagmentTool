import { state, genId, getCurrentWorkspace, PREDEFINED_COLORS } from './data.js'
import { render } from './sidebar.js'
import { saveAvatarFile, deleteAvatarFile, loadAvatarBlobUrl, getResolvedAvatar, clearAvatarFromCache } from './persistence.js'

let activeCategoryId = 'colors'
let _prefEditingMemberId = null
let _prefEditingTagId = null

const categories = [
  { id: 'colors', label: 'Workspace Colors', icon: '\ud83c\udfa8', render: renderColorsTab },
  { id: 'tags', label: 'Tags', icon: '\ud83c\udff7\ufe0f', render: renderTagsTab },
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
  _prefEditingTagId = null
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
  _prefEditingTagId = null
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
    html += '<div class="pref-member-add-form pref-member-add-form-edit">'
    html += '  <div class="pref-avatar-edit-section">'
    var editAvatarUrl = getResolvedAvatar(editing)
    if (editAvatarUrl) {
      html += '    <img class="pref-avatar-preview-img" src="' + editAvatarUrl + '" id="pref-edit-avatar-preview">'
    } else {
      html += '    <div class="pref-avatar-preview-img pref-avatar-preview-placeholder" id="pref-edit-avatar-preview">' + getInitials(editing.name) + '</div>'
    }
    html += '    <div class="pref-avatar-upload-area">'
    html += '      <input type="file" id="pref-member-edit-avatar-file" accept="image/*" onchange="prefEditAvatarFileChanged(event)">'
    html += '      <label for="pref-member-edit-avatar-file" class="pref-avatar-upload-label">Choose Photo</label>'
    if (editing.avatar) {
      html += '      <button class="pref-avatar-remove-btn" onclick="prefRemoveMemberAvatar(\'' + editing.id + '\')" title="Remove avatar">\u2715</button>'
    }
    html += '    </div>'
    html += '  </div>'
    html += '  <input id="pref-member-edit-name" class="pref-member-edit-input" value="' + escapeHtml(editing.name) + '" placeholder="Username" autofocus>'
    html += '  <div class="pref-member-edit-buttons">'
    html += '    <button class="pref-member-add-btn" onclick="prefSaveMemberEdit()">Save</button>'
    html += '    <button class="pref-color-add-btn" style="background:#2a2a3d" onclick="prefCancelMemberEdit()">Cancel</button>'
    html += '  </div>'
    html += '</div>'
  } else {
    html += '<div class="pref-member-add-form">'
    html += '  <div class="pref-avatar-edit-section">'
    html += '    <div class="pref-avatar-preview-img pref-avatar-preview-placeholder" id="pref-new-avatar-preview">\ud83d\udc64</div>'
    html += '    <div class="pref-avatar-upload-area">'
    html += '      <input type="file" id="pref-new-member-avatar-file" accept="image/*" onchange="prefNewAvatarFileChanged(event)">'
    html += '      <label for="pref-new-member-avatar-file" class="pref-avatar-upload-label">Choose Photo</label>'
    html += '    </div>'
    html += '  </div>'
    html += '  <input id="pref-new-member-name" placeholder="Username" autofocus>'
    html += '  <button class="pref-member-add-btn" onclick="prefAddMember()">+ Add</button>'
    html += '</div>'
  }

  if (members.length === 0) {
    html += '<div class="pref-member-empty">No members yet. Add one above.</div>'
  } else {
    for (const m of members) {
      const isSelf = m.id === selfId
      var mAvatarUrl = getResolvedAvatar(m)
      html += '<div class="pref-member-item' + (isSelf ? ' pref-member-self' : '') + '">'
      if (mAvatarUrl) {
        html += '  <img class="pref-member-avatar" src="' + mAvatarUrl + '" alt="">'
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

var _prefNewAvatarFile = null
var _prefEditAvatarFile = null

window.prefNewAvatarFileChanged = function(e) {
  _prefNewAvatarFile = e.target.files && e.target.files[0] || null
  var preview = document.getElementById('pref-new-avatar-preview')
  if (preview && _prefNewAvatarFile) {
    var reader = new FileReader()
    reader.onload = function(ev) {
      preview.innerHTML = '<img class="pref-avatar-preview-img" src="' + ev.target.result + '">'
      preview.className = 'pref-avatar-preview-img'
    }
    reader.readAsDataURL(_prefNewAvatarFile)
  }
}

window.prefEditAvatarFileChanged = function(e) {
  _prefEditAvatarFile = e.target.files && e.target.files[0] || null
  var preview = document.getElementById('pref-edit-avatar-preview')
  if (preview && _prefEditAvatarFile) {
    var reader = new FileReader()
    reader.onload = function(ev) {
      preview.innerHTML = '<img class="pref-avatar-preview-img" src="' + ev.target.result + '">'
      preview.className = 'pref-avatar-preview-img'
    }
    reader.readAsDataURL(_prefEditAvatarFile)
  }
}

window.prefAddMember = async function() {
  const w = getCurrentWorkspace()
  if (!w) return
  const nameInput = document.getElementById('pref-new-member-name')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  const memberId = genId()
  let avatar = ''
  if (_prefNewAvatarFile) {
    const filename = await saveAvatarFile(memberId, _prefNewAvatarFile)
    if (filename) {
      avatar = filename
      await loadAvatarBlobUrl(memberId, filename)
    }
    _prefNewAvatarFile = null
  }
  w.members.push({ id: memberId, name, avatar })
  renderMembersTab(document.getElementById('pref-content'))
  render()
}

window.prefStartEditMember = function(id) {
  _prefEditingMemberId = id
  _prefEditAvatarFile = null
  renderMembersTab(document.getElementById('pref-content'))
}

window.prefCancelMemberEdit = function() {
  _prefEditingMemberId = null
  _prefEditAvatarFile = null
  renderMembersTab(document.getElementById('pref-content'))
}

window.prefSaveMemberEdit = async function() {
  if (!_prefEditingMemberId) return
  const w = getCurrentWorkspace()
  if (!w) return
  const m = w.members.find(mem => mem.id === _prefEditingMemberId)
  if (!m) return
  const nameInput = document.getElementById('pref-member-edit-name')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  m.name = name
  if (_prefEditAvatarFile) {
    if (m.avatar && m.avatar.indexOf('://') === -1 && m.avatar.indexOf('data:') !== 0) {
      deleteAvatarFile(m.avatar)
    }
    clearAvatarFromCache(m.id)
    const filename = await saveAvatarFile(m.id, _prefEditAvatarFile)
    if (filename) {
      m.avatar = filename
      await loadAvatarBlobUrl(m.id, filename)
    }
    _prefEditAvatarFile = null
  }
  _prefEditingMemberId = null
  renderMembersTab(document.getElementById('pref-content'))
  render()
}

window.prefRemoveMemberAvatar = function(id) {
  const w = getCurrentWorkspace()
  if (!w) return
  const m = w.members.find(mem => mem.id === id)
  if (!m) return
  if (m.avatar && m.avatar.indexOf('://') === -1 && m.avatar.indexOf('data:') !== 0) {
    deleteAvatarFile(m.avatar)
  }
  clearAvatarFromCache(id)
  m.avatar = ''
  _prefEditAvatarFile = null
  if (_prefEditingMemberId === id) {
    renderMembersTab(document.getElementById('pref-content'))
  }
  render()
}

window.prefRemoveMember = function(id) {
  const w = getCurrentWorkspace()
  if (!w) return
  const idx = w.members.findIndex(m => m.id === id)
  if (idx === -1) return
  const m = w.members[idx]
  if (m.avatar && m.avatar.indexOf('://') === -1 && m.avatar.indexOf('data:') !== 0) {
    deleteAvatarFile(m.avatar)
  }
  clearAvatarFromCache(id)
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

/* ─── Tags Tab ─── */

function renderTagsTab(container) {
  const w = getCurrentWorkspace()
  if (!w) {
    container.innerHTML = '<div class="pref-placeholder"><div class="pref-placeholder-text">No workspace selected.</div></div>'
    return
  }

  const tags = w.tags || []
  const editing = _prefEditingTagId ? tags.find(t => t.id === _prefEditingTagId) : null

  let html = '<div class="pref-section-title">Workspace Tags</div>'

  if (editing) {
    html += '<div class="pref-tag-add-form">'
    html += '  <input type="color" id="pref-tag-edit-color" value="' + escapeHtml(editing.color) + '">'
    html += '  <input id="pref-tag-edit-name" value="' + escapeHtml(editing.name) + '" placeholder="Tag name" autofocus>'
    html += '  <button class="pref-member-add-btn" onclick="prefSaveTagEdit()">Save</button>'
    html += '  <button class="pref-color-add-btn" style="background:#2a2a3d" onclick="prefCancelTagEdit()">Cancel</button>'
    html += '</div>'
  } else {
    html += '<div class="pref-tag-add-form">'
    html += '  <input type="color" id="pref-new-tag-color" value="#4f46e5">'
    html += '  <input id="pref-new-tag-name" placeholder="Tag name" autofocus>'
    html += '  <button class="pref-member-add-btn" onclick="prefAddTag()">+ Add</button>'
    html += '</div>'
  }

  html += '<div class="pref-tags-list">'
  if (tags.length === 0) {
    html += '<div class="pref-member-empty">No tags yet. Add one above.</div>'
  } else {
    for (const t of tags) {
      html += '<div class="pref-tag-item">'
      html += '  <span class="pref-tag-color" style="background:' + t.color + '"></span>'
      html += '  <span class="pref-color-name">' + escapeHtml(t.name) + '</span>'
      html += '  <div class="pref-member-actions">'
      html += '    <button class="pref-member-btn pref-member-btn-edit" onclick="prefStartEditTag(\'' + t.id + '\')">\u270e</button>'
      html += '    <button class="pref-member-btn pref-member-btn-del" onclick="prefRemoveTag(\'' + t.id + '\')">\u2715</button>'
      html += '  </div>'
      html += '</div>'
    }
  }
  html += '</div>'

  container.innerHTML = html

  const newNameInput = document.getElementById('pref-new-tag-name')
  if (newNameInput) {
    newNameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') prefAddTag()
    })
  }
  const editNameInput = document.getElementById('pref-tag-edit-name')
  if (editNameInput) {
    editNameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') prefSaveTagEdit()
    })
  }
}

window.prefAddTag = function() {
  const w = getCurrentWorkspace()
  if (!w) return
  const nameInput = document.getElementById('pref-new-tag-name')
  const colorInput = document.getElementById('pref-new-tag-color')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  const color = colorInput ? colorInput.value : '#4f46e5'
  if (!w.tags) w.tags = []
  w.tags.push({ id: genId(), name, color })
  renderTagsTab(document.getElementById('pref-content'))
  render()
}

window.prefRemoveTag = function(id) {
  const w = getCurrentWorkspace()
  if (!w) return
  const idx = w.tags.findIndex(t => t.id === id)
  if (idx !== -1) w.tags.splice(idx, 1)
  if (_prefEditingTagId === id) _prefEditingTagId = null
  renderTagsTab(document.getElementById('pref-content'))
  render()
}

window.prefStartEditTag = function(id) {
  _prefEditingTagId = id
  renderTagsTab(document.getElementById('pref-content'))
}

window.prefCancelTagEdit = function() {
  _prefEditingTagId = null
  renderTagsTab(document.getElementById('pref-content'))
}

window.prefSaveTagEdit = function() {
  if (!_prefEditingTagId) return
  const w = getCurrentWorkspace()
  if (!w) return
  const t = w.tags.find(tag => tag.id === _prefEditingTagId)
  if (!t) return
  const nameInput = document.getElementById('pref-tag-edit-name')
  const colorInput = document.getElementById('pref-tag-edit-color')
  const name = nameInput ? nameInput.value.trim() : ''
  if (!name) return
  t.name = name
  t.color = colorInput ? colorInput.value : '#4f46e5'
  _prefEditingTagId = null
  renderTagsTab(document.getElementById('pref-content'))
  render()
}

/* ─── General Tab ─── */

const THEMES = [
  { id: 'default', label: 'Midnight (Dark)', desc: 'Default dark theme with blue accents', preview: ['#111118', '#1e1e2f', '#4f46e5'] },
  { id: 'light', label: 'Light', desc: 'Clean light theme', preview: ['#f4f4f7', '#ffffff', '#4f46e5'] },
  { id: 'slate', label: 'Slate (Dark)', desc: 'Desaturated, high-contrast dark theme', preview: ['#08080c', '#0e0e14', '#7878a8'] },
]

function renderGeneralTab(container) {
  const current = getCurrentTheme()

  let html = '<div class="pref-section-title">Theme</div>'
  html += '<div class="pref-theme-selector">'
  for (const t of THEMES) {
    const checked = current === t.id ? ' checked' : ''
    const activeClass = current === t.id ? ' active' : ''
    html += '<label class="pref-theme-option' + activeClass + '">'
    html += '  <input type="radio" name="theme" value="' + t.id + '"' + checked + ' onchange="setTheme(\'' + t.id + '\')">'
    html += '  <div>'
    html += '    <div class="pref-theme-label">' + t.label + '</div>'
    html += '    <div class="pref-theme-desc">' + t.desc + '</div>'
    html += '  </div>'
    html += '  <div class="pref-theme-preview">'
    for (const swatch of t.preview) {
      html += '    <span class="pref-theme-swatch" style="background:' + swatch + '"></span>'
    }
    html += '  </div>'
    html += '</label>'
  }
  html += '</div>'

  const currentGlow = getGlowMultiplier()
  html += '<div class="pref-section-title" style="margin-top:24px">Glow Intensity</div>'
  html += '<div class="pref-glow-setting">'
  html += '  <div class="pref-glow-value" id="pref-glow-display">' + currentGlow.toFixed(1) + 'x</div>'
  html += '  <input type="range" id="pref-glow-slider" min="0" max="2" step="0.1" value="' + currentGlow + '" oninput="setGlowMultiplier(this.value)">'
  html += '  <div class="pref-glow-labels">'
  html += '    <span>0</span><span>1</span><span>2</span>'
  html += '  </div>'
  html += '</div>'

  container.innerHTML = html
}

export function getCurrentTheme() {
  return localStorage.getItem('kanboard_theme') || 'default'
}

function setTheme(themeId) {
  localStorage.setItem('kanboard_theme', themeId)
  applyTheme(themeId)
  renderGeneralTab(document.getElementById('pref-content'))
}

function applyTheme(themeId) {
  document.documentElement.className = 'theme-' + themeId
}

export function initTheme() {
  const theme = getCurrentTheme()
  applyTheme(theme)
}

window.setTheme = setTheme

/* ─── Glow Multiplier ─── */

export function getGlowMultiplier() {
  const v = parseFloat(localStorage.getItem('kanboard_glow_multiplier'))
  return isFinite(v) ? v : 1
}

function setGlowMultiplier(value) {
  const num = parseFloat(value)
  localStorage.setItem('kanboard_glow_multiplier', String(num))
  document.documentElement.style.setProperty('--glow-multiplier', String(num))
  const display = document.getElementById('pref-glow-display')
  if (display) display.textContent = num.toFixed(1) + 'x'
}

export function initGlowMultiplier() {
  const value = getGlowMultiplier()
  document.documentElement.style.setProperty('--glow-multiplier', String(value))
}

window.setGlowMultiplier = setGlowMultiplier

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
