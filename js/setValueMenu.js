import { state, findCard, findWorkspace, getWorkspaceTags, getTagColor, PREDEFINED_COLORS } from './data.js'
import { escapeHtml, getInitials } from './utils.js'
import { getResolvedAvatar } from './persistence.js'

const PRIORITY_CONFIG = [
  { value: 'none',   label: 'None',   filled: 0, color: '#6b7280' },
  { value: '1',     label: '1 - Low',   filled: 1, color: '#22c55e' },
  { value: '2',     label: '2',        filled: 2, color: '#84cc16' },
  { value: '3',     label: '3 - Medium', filled: 3, color: '#f97316' },
  { value: '4',     label: '4',        filled: 4, color: '#f43f5e' },
  { value: '5',     label: '5 - Urgent', filled: 5, color: '#ef4444' },
]

export function buildSetValueMenu(cardId) {
  const c = findCard(cardId)
  const currentTags = c ? (c.tags || []) : []
  const currentMembers = c ? (c.members || []) : []
  const ws = state.selectedWorkspaceId ? findWorkspace(state.selectedWorkspaceId) : null
  const wsTags = getWorkspaceTags()
  const wsMembers = ws ? (ws.members || []) : []

  let html = '<div class="tl-ctx-item tl-ctx-sub-wrap">Set Value'
  html += '<div class="sv-submenu">'

  html += buildColorSection(cardId)
  html += buildPrioritySection(cardId)
  if (wsTags.length) html += buildTagsSection(cardId, wsTags, currentTags)
  if (wsMembers.length) html += buildMembersSection(cardId, wsMembers, currentMembers)
  html += buildDateSection(cardId)
  if (!wsTags.length && !wsMembers.length) {
    html += '<div class="tl-ctx-item sv-empty-hint">No tags or members configured</div>'
  }

  html += '</div></div>'
  return html
}

function buildColorSection(cardId) {
  let swatches = ''
  for (const pc of PREDEFINED_COLORS) {
    swatches += '<button class="ps-color-swatch" data-color="' + pc.value + '" style="background:' + pc.value + '" onclick="event.stopPropagation();setSelectedCardsColor(\'' + cardId + '\',\'' + pc.value + '\');this.closest(\'.tl-ctx-menu\').remove()"></button>'
  }
  swatches += '<button class="ps-color-swatch ps-color-none" onclick="event.stopPropagation();setSelectedCardsColor(\'' + cardId + '\',null);this.closest(\'.tl-ctx-menu\').remove()" title="None">✕</button>'
  return '<div class="tl-ctx-item tl-ctx-sub-wrap">Color<div class="sv-color-submenu">' + swatches + '</div></div>'
}

function buildPrioritySection(cardId) {
  let items = ''
  for (const p of PRIORITY_CONFIG) {
    let barsHtml = ''
    for (let i = 0; i < 5; i++) {
      const filled = i < p.filled ? ' filled' : ''
      barsHtml += '<div class="sv-pbar' + filled + '" style="background:' + (p.filled > 0 ? p.color : '#6b7280') + ';color:' + (p.filled > 0 ? p.color : '#6b7280') + '"></div>'
    }
    items += '<button class="tl-ctx-item" onclick="event.stopPropagation();setSelectedCardsPriority(\'' + cardId + '\',\'' + p.value + '\');this.closest(\'.tl-ctx-menu\').remove()"><span class="sv-priority-bars">' + barsHtml + '</span><span>' + p.label + '</span></button>'
  }
  return '<div class="tl-ctx-item tl-ctx-sub-wrap">Priority<div class="sv-priority-submenu">' + items + '</div></div>'
}

function buildTagsSection(cardId, wsTags, currentTags) {
  let items = ''
  for (const t of wsTags) {
    const checked = currentTags.includes(t.name) ? ' ✓' : ''
    const enc = encodeURIComponent(t.name)
    items += '<button class="tl-ctx-item" onclick="event.stopPropagation();toggleSelectedCardsTag(\'' + cardId + '\',decodeURIComponent(\'' + enc + '\'));this.closest(\'.tl-ctx-menu\').remove()"><span class="sv-tag-dot" style="background:' + t.color + '"></span>' + escapeHtml(t.name) + '<span class="sv-check-mark">' + checked + '</span></button>'
  }
  return '<div class="tl-ctx-item tl-ctx-sub-wrap">Tags<div class="sv-tags-submenu">' + items + '</div></div>'
}

function buildMembersSection(cardId, wsMembers, currentMembers) {
  let items = ''
  for (const m of wsMembers) {
    const checked = currentMembers.includes(m.name) ? ' ✓' : ''
    const enc = encodeURIComponent(m.name)
    const avatarUrl = getResolvedAvatar(m)
    let avatarHtml = ''
    if (avatarUrl) {
      avatarHtml = '<img class="sv-member-avatar" src="' + avatarUrl + '">'
    } else {
      avatarHtml = '<span class="sv-member-avatar sv-member-avatar-initials">' + getInitials(m.name) + '</span>'
    }
    items += '<button class="tl-ctx-item" onclick="event.stopPropagation();toggleSelectedCardsMember(\'' + cardId + '\',decodeURIComponent(\'' + enc + '\'));this.closest(\'.tl-ctx-menu\').remove()">' + avatarHtml + '<span>' + escapeHtml(m.name) + '</span><span class="sv-check-mark">' + checked + '</span></button>'
  }
  return '<div class="tl-ctx-item tl-ctx-sub-wrap">Members<div class="sv-members-submenu">' + items + '</div></div>'
}

function buildDateSection(cardId) {
  const dateStyle = 'width:130px;padding:4px 6px;font-size:12px;border:1px solid var(--border-strong);border-radius:4px;background:var(--bg-surface);color:var(--text-primary);margin:4px 8px'
  return '<div class="tl-ctx-item tl-ctx-sub-wrap">Start Date<div class="sv-date-submenu"><input type="date" class="sv-date-input" style="' + dateStyle + '" onchange="event.stopPropagation();setSelectedCardsStartDate(\'' + cardId + '\',this.value);this.closest(\'.tl-ctx-menu\').remove()"></div></div>' +
    '<div class="tl-ctx-item tl-ctx-sub-wrap">End Date<div class="sv-date-submenu"><input type="date" class="sv-date-input" style="' + dateStyle + '" onchange="event.stopPropagation();setSelectedCardsEndDate(\'' + cardId + '\',this.value);this.closest(\'.tl-ctx-menu\').remove()"></div></div>'
}
