import { state, findBoard, getCurrentWorkspace, getWorkspaceTags, getTagColor } from './data.js'
import { escapeHtml } from './utils.js'
import { render } from './sidebar.js'

const PRIORITIES = [
  { value: '1', label: '1', color: '#22c55e' },
  { value: '2', label: '2', color: '#84cc16' },
  { value: '3', label: '3', color: '#f97316' },
  { value: '4', label: '4', color: '#f43f5e' },
  { value: '5', label: '5', color: '#ef4444' },
]

function getAvailableMembers() {
  const memberSet = new Set()
  const ws = getCurrentWorkspace()
  if (ws) {
    ws.members.forEach(m => { if (m.name) memberSet.add(m.name) })
  }
  const b = state.selectedBoardId ? findBoard(state.selectedBoardId) : null
  if (b) {
    for (const col of b.columns) {
      for (const c of col.cards) {
        if (c.members) c.members.forEach(m => memberSet.add(m))
      }
    }
  }
  return [...memberSet].sort()
}

function getAvailableTags() {
  const tagSet = new Set()
  const wsTags = getWorkspaceTags()
  wsTags.forEach(t => tagSet.add(t.name))
  const b = state.selectedBoardId ? findBoard(state.selectedBoardId) : null
  if (b) {
    for (const col of b.columns) {
      for (const c of col.cards) {
        if (c.tags) c.tags.forEach(t => tagSet.add(t))
      }
    }
  }
  return [...tagSet].sort()
}

export function getActiveFilterCount() {
  const f = state.filters
  let count = 0
  if (f.search) count++
  if (f.members.length > 0) count++
  if (f.tags.length > 0) count++
  if (f.priority.length > 0) count++
  if (f.startDateFrom || f.startDateTo) count++
  if (f.endDateFrom || f.endDateTo) count++
  if (f.completed !== 'all') count++
  return count
}

export function filterCards(allItems) {
  const f = state.filters
  const activeCount = getActiveFilterCount()
  if (activeCount === 0) return allItems

  return allItems.filter(item => {
    const c = item.card
    if (f.search) {
      const q = f.search.toLowerCase()
      if (!c.title.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q))
        return false
    }
    if (f.members.length > 0) {
      if (!c.members || !c.members.some(m => f.members.includes(m)))
        return false
    }
    if (f.tags.length > 0) {
      if (!c.tags || !c.tags.some(t => f.tags.includes(t)))
        return false
    }
    if (f.priority.length > 0) {
      if (!f.priority.includes(c.priority))
        return false
    }
    if (f.completed === 'completed' && !c.completed) return false
    if (f.completed === 'incomplete' && c.completed) return false
    if (f.startDateFrom && c.startDate && c.startDate < f.startDateFrom) return false
    if (f.startDateTo && c.startDate && c.startDate > f.startDateTo) return false
    if (f.endDateFrom && c.endDate && c.endDate < f.endDateFrom) return false
    if (f.endDateTo && c.endDate && c.endDate > f.endDateTo) return false
    return true
  })
}

export function filterBoardCards(board) {
  const allItems = []
  for (const col of board.columns) {
    for (const c of col.cards) {
      allItems.push({ card: c, columnName: col.name, columnId: col.id })
    }
  }
  const filtered = filterCards(allItems)
  const filteredIds = new Set()
  for (const item of filtered) {
    filteredIds.add(item.card.id)
  }
  return filteredIds
}

export function resetFilters() {
  const f = state.filters
  f.search = ''
  f.members = []
  f.tags = []
  f.priority = []
  f.startDateFrom = ''
  f.startDateTo = ''
  f.endDateFrom = ''
  f.endDateTo = ''
  f.completed = 'all'
  render()
}

function closeAllFilterDropdowns() {
  document.querySelectorAll('.filter-dd.open').forEach(el => el.classList.remove('open'))
}

function getCheckedValues(container) {
  const vals = []
  container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
    vals.push(cb.value)
  })
  return vals
}

export function renderFilterBar() {
  const container = document.getElementById('filterBar')
  if (!container) return

  const b = state.selectedBoardId ? findBoard(state.selectedBoardId) : null
  if (!b) {
    container.style.display = 'none'
    container.innerHTML = ''
    return
  }
  container.style.display = ''
  container.classList.remove('hidden')

  const f = state.filters
  const members = getAvailableMembers()
  const tags = getAvailableTags()
  const activeCount = getActiveFilterCount()
  const hasDateFilter = f.startDateFrom || f.startDateTo || f.endDateFrom || f.endDateTo

  let html = '<div class="filter-bar-inner">'

  html += '<div class="filter-group filter-search-group">'
  html += '  <svg class="filter-search-icon" viewBox="0 0 24 24" width="16" height="16"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  html += '  <input type="text" class="filter-search-input" id="filterSearch" placeholder="Search tasks\u2026" value="' + escapeHtml(f.search) + '" spellcheck="false">'
  if (f.search) {
    html += '  <button class="filter-search-clear" id="filterSearchClear">&times;</button>'
  }
  html += '</div>'

  html += '<div class="filter-dd" data-filter="members">'
  html += '  <button class="filter-dd-btn' + (f.members.length > 0 ? ' has-active' : '') + '" id="filterDDMembers">'
  html += '    Members' + (f.members.length > 0 ? ' <span class="filter-dd-badge">' + f.members.length + '</span>' : '')
  html += '  </button>'
  html += '  <div class="filter-dd-panel" id="filterPanelMembers">'
  if (members.length === 0) {
    html += '    <div class="filter-dd-empty">No members available</div>'
  } else {
    for (const m of members) {
      const checked = f.members.includes(m) ? ' checked' : ''
      html += '    <label class="filter-dd-opt' + checked + '"><input type="checkbox" value="' + escapeHtml(m) + '"' + checked + '><span>' + escapeHtml(m) + '</span></label>'
    }
  }
  html += '  </div>'
  html += '</div>'

  html += '<div class="filter-dd" data-filter="tags">'
  html += '  <button class="filter-dd-btn' + (f.tags.length > 0 ? ' has-active' : '') + '" id="filterDDTags">'
  html += '    Tags' + (f.tags.length > 0 ? ' <span class="filter-dd-badge">' + f.tags.length + '</span>' : '')
  html += '  </button>'
  html += '  <div class="filter-dd-panel" id="filterPanelTags">'
  if (tags.length === 0) {
    html += '    <div class="filter-dd-empty">No tags in use</div>'
  } else {
    for (const t of tags) {
      const checked = f.tags.includes(t) ? ' checked' : ''
      const color = getTagColor(t)
      html += '    <label class="filter-dd-opt' + checked + '"><input type="checkbox" value="' + escapeHtml(t) + '"' + checked + '><span class="filter-dd-dot" style="background:' + color + '"></span><span>' + escapeHtml(t) + '</span></label>'
    }
  }
  html += '  </div>'
  html += '</div>'

  html += '<div class="filter-dd" data-filter="priority">'
  html += '  <button class="filter-dd-btn' + (f.priority.length > 0 ? ' has-active' : '') + '" id="filterDDPriority">'
  html += '    Priority' + (f.priority.length > 0 ? ' <span class="filter-dd-badge">' + f.priority.length + '</span>' : '')
  html += '  </button>'
  html += '  <div class="filter-dd-panel" id="filterPanelPriority">'
  for (const p of PRIORITIES) {
    const checked = f.priority.includes(p.value) ? ' checked' : ''
    html += '    <label class="filter-dd-opt' + checked + '"><input type="checkbox" value="' + p.value + '"' + checked + '><span class="filter-dd-dot" style="background:' + p.color + '"></span><span>' + p.label + '</span></label>'
  }
  html += '  </div>'
  html += '</div>'

  html += '<div class="filter-dd" data-filter="dates">'
  html += '  <button class="filter-dd-btn' + (hasDateFilter ? ' has-active' : '') + '" id="filterDDDates">Dates</button>'
  html += '  <div class="filter-dd-panel filter-dd-panel-wide" id="filterPanelDates">'
  html += '    <div class="filter-dd-row"><span class="filter-dd-label">Start</span><div class="filter-dd-inputs"><input type="date" class="filter-date-inp" id="filterStartFrom" value="' + f.startDateFrom + '"><span class="filter-date-sep">\u2013</span><input type="date" class="filter-date-inp" id="filterStartTo" value="' + f.startDateTo + '"></div></div>'
  html += '    <div class="filter-dd-row"><span class="filter-dd-label">End</span><div class="filter-dd-inputs"><input type="date" class="filter-date-inp" id="filterEndFrom" value="' + f.endDateFrom + '"><span class="filter-date-sep">\u2013</span><input type="date" class="filter-date-inp" id="filterEndTo" value="' + f.endDateTo + '"></div></div>'
  html += '  </div>'
  html += '</div>'

  html += '<div class="filter-dd" data-filter="status">'
  html += '  <button class="filter-dd-btn' + (f.completed !== 'all' ? ' has-active' : '') + '" id="filterDDStatus">'
  html += '    Status' + (f.completed !== 'all' ? ' <span class="filter-dd-badge">1</span>' : '')
  html += '  </button>'
  html += '  <div class="filter-dd-panel" id="filterPanelStatus">'
  const statuses = [
    { value: 'all', label: 'All tasks' },
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'completed', label: 'Completed' },
  ]
  for (const s of statuses) {
    const checked = f.completed === s.value ? ' checked' : ''
    html += '    <label class="filter-dd-opt' + checked + '"><input type="radio" name="fStatus" value="' + s.value + '"' + (f.completed === s.value ? ' checked' : '') + '><span>' + s.label + '</span></label>'
  }
  html += '  </div>'
  html += '</div>'

  const archivedActive = state.showArchived
  html += '<button class="filter-dd-btn' + (archivedActive ? ' has-active' : '') + '" id="btnToggleArchived" title="Show archived cards" style="margin-left:4px">'
  html += '  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
  html += '  Archived' + (archivedActive ? ' <span class="filter-dd-badge">ON</span>' : '')
  html += '</button>'

  if (activeCount > 0) {
    const chips = []
    if (f.search) chips.push('"' + f.search + '"')
    if (f.members.length > 0) chips.push(f.members.length + ' member' + (f.members.length > 1 ? 's' : ''))
    if (f.tags.length > 0) chips.push(f.tags.length + ' tag' + (f.tags.length > 1 ? 's' : ''))
    if (f.priority.length > 0) chips.push(f.priority.length + ' priorit' + (f.priority.length > 1 ? 'ies' : 'y'))
    if (hasDateFilter) chips.push('Dates')
    if (f.completed !== 'all') chips.push(f.completed)

    html += '<div class="filter-active">'
    html += '  <span class="filter-active-badge">' + activeCount + '</span>'
    for (const chip of chips) {
      html += '  <span class="filter-chip">' + escapeHtml(chip) + '</span>'
    }
    html += '</div>'

    html += '<button class="filter-clear-btn" id="filterClearAll">Clear</button>'
  }

  html += '</div>'
  container.innerHTML = html
}

export function initFilterEvents() {
  const bar = document.getElementById('filterBar')
  if (!bar || bar._filterEventsDone) return
  bar._filterEventsDone = true

  bar.addEventListener('input', function(e) {
    const inp = e.target.closest('#filterSearch')
    if (inp) {
      state.filters.search = inp.value
      render()
    }
  })

  bar.addEventListener('click', function(e) {
    if (e.target.closest('#btnToggleArchived')) {
      if (window.toggleShowArchived) window.toggleShowArchived()
      return
    }

    if (e.target.closest('#filterSearchClear')) {
      state.filters.search = ''
      render()
      return
    }

    if (e.target.closest('#filterClearAll')) {
      resetFilters()
      return
    }

    const btn = e.target.closest('.filter-dd-btn')
    if (btn) {
      e.stopPropagation()
      const dd = btn.closest('.filter-dd')
      if (!dd) return
      const isOpen = dd.classList.contains('open')
      closeAllFilterDropdowns()
      if (!isOpen) dd.classList.add('open')
    }
  })

  bar.addEventListener('change', function(e) {
    const dateInp = e.target.closest('.filter-date-inp')
    if (dateInp) {
      state.filters.startDateFrom = document.getElementById('filterStartFrom')?.value || ''
      state.filters.startDateTo = document.getElementById('filterStartTo')?.value || ''
      state.filters.endDateFrom = document.getElementById('filterEndFrom')?.value || ''
      state.filters.endDateTo = document.getElementById('filterEndTo')?.value || ''
      render()
      return
    }

    const panel = e.target.closest('.filter-dd-panel')
    if (panel) {
      const dd = panel.closest('.filter-dd')
      if (!dd) return
      const type = dd.dataset.filter
      if (type === 'members') {
        state.filters.members = getCheckedValues(panel)
      } else if (type === 'tags') {
        state.filters.tags = getCheckedValues(panel)
      } else if (type === 'priority') {
        state.filters.priority = getCheckedValues(panel)
      } else if (type === 'status') {
        const checked = panel.querySelector('input[type="radio"]:checked')
        state.filters.completed = checked ? checked.value : 'all'
      }
      render()
    }
  })

  document.addEventListener('click', function(e) {
    const barEl = document.getElementById('filterBar')
    if (!barEl || barEl.style.display === 'none') return
    if (e.target.closest('.filter-dd')) return
    closeAllFilterDropdowns()
  })
}
