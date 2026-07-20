import { data, state, findWorkspace } from './data.js'
import { getSelfMember } from './members.js'
import { escapeHtml, getInitials, getProgressColor, countChecklistItems, countCompletedChecklistItems } from './utils.js'
import { getResolvedAvatar } from './persistence.js'
import { openCardDetail } from './modal.js'

let _sortKey = 'endDate'
let _sortAsc = true

const PRIORITY_ORDER = { none: 0, low: 1, '1': 1, '2': 2, medium: 3, '3': 3, high: 4, '4': 4, urgent: 5, '5': 5 }

function getTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function collectTodaysTasks() {
  const self = getSelfMember()
  if (!self) return []

  const workspace = state.selectedWorkspaceId ? data.workspaces.find(w => w.id === state.selectedWorkspaceId) : null
  if (!workspace) return []

  const today = getTodayStr()
  const tasks = []

  const selfName = (self.name || '').trim()
  if (!selfName) return []

  for (const p of workspace.projects) {
    for (const b of p.boards || []) {
      for (const col of b.columns || []) {
        for (const c of col.cards || []) {
          if (!c.members || !c.members.some(m => m.trim() === selfName)) continue
          const exactMatch = c.startDate === today || c.endDate === today
          const rangeMatch = c.startDate && c.endDate && today >= c.startDate && today <= c.endDate
          if (!exactMatch && !rangeMatch) continue
          tasks.push({
            card: c,
            columnName: col.name,
            boardName: b.name,
          })
        }
      }
    }
  }

  return tasks
}

function sortTasks(tasks) {
  const sorted = [...tasks]
  sorted.sort((a, b) => {
    const ca = a.card, cb = b.card
    let cmp = 0
    if (_sortKey === 'title') {
      cmp = (ca.title || '').localeCompare(cb.title || '')
    } else if (_sortKey === 'board') {
      cmp = (a.boardName + a.columnName).localeCompare(b.boardName + b.columnName)
    } else if (_sortKey === 'priority') {
      cmp = (PRIORITY_ORDER[ca.priority] || 0) - (PRIORITY_ORDER[cb.priority] || 0)
    } else if (_sortKey === 'tags') {
      const ta = ca.tags && ca.tags.length > 0 ? ca.tags[0] : ''
      const tb = cb.tags && cb.tags.length > 0 ? cb.tags[0] : ''
      cmp = ta.localeCompare(tb)
    } else if (_sortKey === 'startDate') {
      cmp = (ca.startDate || '').localeCompare(cb.startDate || '')
    } else if (_sortKey === 'endDate') {
      cmp = (ca.endDate || '').localeCompare(cb.endDate || '')
    } else if (_sortKey === 'progress') {
      const pctA = ca.checklists && ca.checklists.length > 0
        ? Math.round((countCompletedChecklistItems(ca.checklists) / countChecklistItems(ca.checklists)) * 100) : 0
      const pctB = cb.checklists && cb.checklists.length > 0
        ? Math.round((countCompletedChecklistItems(cb.checklists) / countChecklistItems(cb.checklists)) * 100) : 0
      cmp = pctA - pctB
    } else if (_sortKey === 'members') {
      const ma = ca.members && ca.members.length > 0 ? ca.members[0] : ''
      const mb = cb.members && cb.members.length > 0 ? cb.members[0] : ''
      cmp = ma.localeCompare(mb)
    }
    return _sortAsc ? cmp : -cmp
  })
  return sorted
}

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

export function renderDashboard(area) {
  const self = getSelfMember()
  const rawTasks = collectTodaysTasks()
  const tasks = sortTasks(rawTasks)
  const today = getTodayStr()

  function sortIcon(key) {
    if (_sortKey !== key) return ''
    return _sortAsc
      ? ' <svg class="lv-sort-icon" viewBox="0 0 24 24" width="12" height="12" style="display:inline-block;vertical-align:middle"><path d="M12 5l-7 7h14l-7-7z" fill="currentColor"/></svg>'
      : ' <svg class="lv-sort-icon" viewBox="0 0 24 24" width="12" height="12" style="display:inline-block;vertical-align:middle"><path d="M12 19l7-7H5l7 7z" fill="currentColor"/></svg>'
  }

  let html = '<div class="page-view">'

  if (!self) {
    html += '<div class="dash-nodes"><div class="dash-node">'
    html += '<div class="dash-node-body"><p class="dash-empty">Set your identity in Preferences → Members to see your tasks.</p></div>'
    html += '</div></div>'
  } else {
    html += '<div class="dash-nodes">'
    html += '<div class="dash-node">'
    html += '<div class="dash-node-header">'
    html += '  <h3>Today\'s Tasks</h3>'
    html += '  <span class="dash-node-count">' + tasks.length + '</span>'
    html += '</div>'

    if (tasks.length === 0) {
      html += '<div class="dash-node-body">'
      html += '<p class="dash-empty">No tasks for today. You\'re all caught up!</p>'
      html += '</div>'
    } else {
      html += '<div class="lv-wrapper" style="border:none;background:transparent">'
      html += '<div class="lv-header" style="border-radius:0;border-left:none;border-right:none">'
      html += '  <div class="lv-cell lv-cell-check"></div>'
      html += '  <div class="lv-cell lv-cell-color"></div>'
      html += '  <div class="lv-cell lv-cell-title" data-sort="title" style="cursor:pointer">Title' + sortIcon('title') + '</div>'
      html += '  <div class="lv-cell lv-cell-column" data-sort="board" style="cursor:pointer">Board' + sortIcon('board') + '</div>'
      html += '  <div class="lv-cell lv-cell-priority" data-sort="priority" style="cursor:pointer">Priority' + sortIcon('priority') + '</div>'
      html += '  <div class="lv-cell lv-cell-tags" data-sort="tags" style="cursor:pointer">Tags' + sortIcon('tags') + '</div>'
      html += '  <div class="lv-cell lv-cell-dates" data-sort="startDate" style="cursor:pointer">Start' + sortIcon('startDate') + '</div>'
      html += '  <div class="lv-cell lv-cell-dates" data-sort="endDate" style="cursor:pointer">Due' + sortIcon('endDate') + '</div>'
      html += '  <div class="lv-cell lv-cell-progress" data-sort="progress" style="cursor:pointer">Progress' + sortIcon('progress') + '</div>'
      html += '  <div class="lv-cell lv-cell-members" data-sort="members" style="cursor:pointer">Members' + sortIcon('members') + '</div>'
      html += '</div>'
      html += '<div class="lv-body" style="border:none;background:transparent">'

      const w = findWorkspace(state.selectedWorkspaceId)

      for (const t of tasks) {
        const c = t.card
        const completed = c.completed ? ' lv-row-done' : ''
        const cardColorStyle = c.color ? '--card-color:' + c.color + ';' : ''
        const barCfg = PRIORITY_BAR_CONFIG[c.priority] || PRIORITY_BAR_CONFIG.medium
        const checked = c.completed ? ' checked' : ''

        let tagHtml = ''
        if (c.tags && c.tags.length > 0) {
          for (const tag of c.tags) {
            tagHtml += '<span class="lv-tag">' + escapeHtml(tag) + '</span>'
          }
        }

        let memberHtml = ''
        if (c.members && c.members.length > 0) {
          for (const m of c.members) {
            const mo = w && w.members ? w.members.find(wm => wm.name === m) : null
            if (mo) {
              const avatarUrl = getResolvedAvatar(mo)
              if (avatarUrl) {
                memberHtml += '<img class="lv-member-avatar" src="' + avatarUrl + '">'
              } else {
                memberHtml += '<span class="lv-member-avatar lv-member-avatar-initials">' + getInitials(m) + '</span>'
              }
            }
          }
        }

        let progressHtml = ''
        if (c.checklists && c.checklists.length > 0) {
          const total = countChecklistItems(c.checklists)
          const done = countCompletedChecklistItems(c.checklists)
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          const allDone = total > 0 && done === total ? ' done' : ''
          progressHtml = '<div class="lv-cl-progress' + allDone + '"><div class="lv-cl-progress-bar" style="width:' + pct + '%;background:' + getProgressColor(pct) + '"></div><span class="lv-cl-progress-text">' + done + '/' + total + '</span></div>'
        }

        html += '<div class="lv-row' + completed + '" data-card-id="' + c.id + '" style="' + cardColorStyle + '">'
        html += '  <div class="lv-cell lv-cell-check"><div class="lv-check' + checked + '" onclick="event.stopPropagation();toggleCardCompleted(\'' + c.id + '\')"><div class="lv-check-circle"><svg class="lv-check-check" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div></div>'
        html += '  <div class="lv-cell lv-cell-color"><div class="lv-color-dot" style="background:' + (c.color || 'transparent') + '"></div></div>'
        html += '  <div class="lv-cell lv-cell-title"><span class="lv-title-text">' + escapeHtml(c.title || 'Untitled') + '</span></div>'
        html += '  <div class="lv-cell lv-cell-column"><span class="lv-column-name">' + escapeHtml(t.boardName) + ' › ' + escapeHtml(t.columnName) + '</span></div>'
        html += '  <div class="lv-cell lv-cell-priority">'
        html += '    <div class="lv-priority-bars">'
        for (let i = 0; i < 5; i++) {
          const filled = i < barCfg.filled ? ' filled' : ''
          html += '<div class="lv-priority-bar' + filled + '" style="background:' + barCfg.color + ';color:' + barCfg.color + '"></div>'
        }
        html += '    </div>'
        html += '  </div>'
        html += '  <div class="lv-cell lv-cell-tags"><div class="lv-tags-wrap">' + tagHtml + '</div></div>'
        html += '  <div class="lv-cell lv-cell-dates">' + (c.startDate || '') + '</div>'
        html += '  <div class="lv-cell lv-cell-dates">' + (c.endDate || '') + '</div>'
        html += '  <div class="lv-cell lv-cell-progress">' + progressHtml + '</div>'
        html += '  <div class="lv-cell lv-cell-members"><div class="lv-members-wrap">' + memberHtml + '</div></div>'
        html += '</div>'
      }

      html += '</div></div>'
    }

    html += '</div></div>'
  }

  html += '</div>'
  area.innerHTML = html

  if (!area._dashEventsDone) {
    area._dashEventsDone = true
    area.addEventListener('click', function(e) {
      const header = e.target.closest('.lv-header .lv-cell[data-sort]')
      if (header) {
        const key = header.dataset.sort
        if (_sortKey === key) {
          _sortAsc = !_sortAsc
        } else {
          _sortKey = key
          _sortAsc = true
        }
        renderDashboard(area)
        return
      }

      const row = e.target.closest('.lv-row')
      if (row && row.dataset.cardId) {
        const check = e.target.closest('.lv-check')
        if (!check) {
          openCardDetail(row.dataset.cardId)
        }
      }
    })
  }
}
