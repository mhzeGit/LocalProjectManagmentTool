import { state, findBoard, findWorkspace } from './data.js'
import { escapeHtml, getProgressColor, getInitials, countChecklistItems, countCompletedChecklistItems } from './utils.js'
import { getResolvedAvatar } from './persistence.js'
import { filterCards, getActiveFilterCount } from './filters.js'
import { openCardDetail } from './modal.js'

const PRIORITY_ORDER = { none: 0, low: 1, '1': 1, '2': 2, medium: 3, '3': 3, high: 4, '4': 4, urgent: 5, '5': 5 }

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

const SORT_FIELDS = [
  { key: 'title', label: 'Name' },
  { key: 'priority', label: 'Priority' },
  { key: 'column', label: 'Column' },
  { key: 'startDate', label: 'Start Date' },
  { key: 'endDate', label: 'End Date' },
  { key: 'completed', label: 'Status' },
]

let _sortKey = 'column'
let _sortAsc = true

function sortItems(items) {
  const sorted = [...items]
  sorted.sort((a, b) => {
    let cmp = 0
    const ca = a.card, cb = b.card
    if (_sortKey === 'title') {
      cmp = ca.title.localeCompare(cb.title)
    } else if (_sortKey === 'priority') {
      cmp = (PRIORITY_ORDER[ca.priority] || 0) - (PRIORITY_ORDER[cb.priority] || 0)
    } else if (_sortKey === 'column') {
      cmp = a.columnName.localeCompare(b.columnName)
    } else if (_sortKey === 'startDate') {
      cmp = (ca.startDate || '').localeCompare(cb.startDate || '')
    } else if (_sortKey === 'endDate') {
      cmp = (ca.endDate || '').localeCompare(cb.endDate || '')
    } else if (_sortKey === 'completed') {
      cmp = (ca.completed ? 1 : 0) - (cb.completed ? 1 : 0)
    }
    return _sortAsc ? cmp : -cmp
  })
  return sorted
}

export function renderListView() {
  const area = document.getElementById('boardArea')
  const b = findBoard(state.selectedBoardId)
  if (!b) return

  const allItems = []
  for (const col of b.columns) {
    for (const c of col.cards) {
      allItems.push({ card: c, columnName: col.name, columnId: col.id })
    }
  }

  const filteredItems = getActiveFilterCount() > 0 ? filterCards(allItems) : allItems
  const sortedItems = sortItems(filteredItems)

  let html = '<div class="lv-wrapper">'

  html += '<div class="lv-toolbar">'
  html += '  <span class="lv-count">' + sortedItems.length + ' card' + (sortedItems.length !== 1 ? 's' : '') + '</span>'
  html += '  <div class="lv-sort-group">'
  html += '    <span class="lv-sort-label">Sort by:</span>'
  html += '    <select class="lv-sort-select" id="lvSortSelect">'
  for (const f of SORT_FIELDS) {
    const selected = f.key === _sortKey ? ' selected' : ''
    html += '      <option value="' + f.key + '"' + selected + '>' + f.label + '</option>'
  }
  html += '    </select>'
  const dirIcon = _sortAsc
    ? '<svg class="lv-sort-icon" viewBox="0 0 24 24" width="16" height="16"><path d="M12 5l-7 7h14l-7-7z" fill="currentColor"/></svg>'
    : '<svg class="lv-sort-icon" viewBox="0 0 24 24" width="16" height="16"><path d="M12 19l7-7H5l7 7z" fill="currentColor"/></svg>'
  html += '    <button class="lv-sort-dir" id="lvSortDir">' + dirIcon + '</button>'
  html += '  </div>'
  html += '</div>'

  html += '<div class="lv-header">'
  html += '  <div class="lv-cell lv-cell-check"></div>'
  html += '  <div class="lv-cell lv-cell-color"></div>'
  html += '  <div class="lv-cell lv-cell-title" data-sort="title">Title</div>'
  html += '  <div class="lv-cell lv-cell-column" data-sort="column">Column</div>'
  html += '  <div class="lv-cell lv-cell-priority" data-sort="priority">Priority</div>'
  html += '  <div class="lv-cell lv-cell-tags">Tags</div>'
  html += '  <div class="lv-cell lv-cell-dates" data-sort="startDate">Start</div>'
  html += '  <div class="lv-cell lv-cell-dates" data-sort="endDate">Due</div>'
  html += '  <div class="lv-cell lv-cell-progress">Progress</div>'
  html += '  <div class="lv-cell lv-cell-members">Members</div>'
  html += '</div>'

  html += '<div class="lv-body">'
  for (const item of sortedItems) {
    const c = item.card
    const completed = c.completed ? ' lv-row-done' : ''
    const cardColorStyle = c.color ? '--card-color:' + c.color + ';' : ''
    const barCfg = PRIORITY_BAR_CONFIG[c.priority] || PRIORITY_BAR_CONFIG.medium
    const checked = c.completed ? ' checked' : ''

    let tagHtml = ''
    if (c.tags && c.tags.length > 0) {
      for (const t of c.tags) {
        tagHtml += '<span class="lv-tag">' + escapeHtml(t) + '</span>'
      }
    }

    let memberHtml = ''
    if (c.members && c.members.length > 0) {
      const w = findWorkspace(state.selectedWorkspaceId)
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
    html += '  <div class="lv-cell lv-cell-column"><span class="lv-column-name">' + escapeHtml(item.columnName) + '</span></div>'
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

  if (sortedItems.length === 0) {
    html += '<div class="lv-empty">No cards match the current filters</div>'
  }

  html += '</div></div>'

  area.innerHTML = html
  initListViewEvents()
}

function initListViewEvents() {
  const area = document.getElementById('boardArea')
  if (!area || area._lvEventsDone) return
  area._lvEventsDone = true

  area.addEventListener('change', function(e) {
    const select = e.target.closest('#lvSortSelect')
    if (select) {
      _sortKey = select.value
      renderListView()
    }
  })

  area.addEventListener('click', function(e) {
    const dirBtn = e.target.closest('#lvSortDir')
    if (dirBtn) {
      _sortAsc = !_sortAsc
      renderListView()
      return
    }

    const header = e.target.closest('.lv-header .lv-cell[data-sort]')
    if (header) {
      const key = header.dataset.sort
      if (_sortKey === key) {
        _sortAsc = !_sortAsc
      } else {
        _sortKey = key
        _sortAsc = true
      }
      renderListView()
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
