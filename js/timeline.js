import { state, findBoard } from './data.js'
import { escapeHtml } from './utils.js'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PRIORITY_COLORS = {
  none: '#6b7280',
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444'
}
const DAY_WIDTH = 36

function daysBetween(a, b) {
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.floor((utc2 - utc1) / 86400000)
}

function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatShortDate(str) {
  if (!str) return ''
  const d = parseDate(str)
  return MONTHS[d.getMonth()] + ' ' + d.getDate()
}

export function renderTimeline() {
  const area = document.getElementById('boardArea')
  const b = findBoard(state.selectedBoardId)
  if (!b) return

  const allItems = []
  for (const col of b.columns) {
    for (const c of col.cards) {
      allItems.push({ card: c, columnName: col.name, columnId: col.id })
    }
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const datedItems = allItems.filter(x => x.card.startDate || x.card.endDate)
  const undatedItems = allItems.filter(x => !x.card.startDate && !x.card.endDate)

  let minDate, maxDate
  if (datedItems.length > 0) {
    const allDates = []
    for (const item of datedItems) {
      if (item.card.startDate) allDates.push(parseDate(item.card.startDate))
      if (item.card.endDate) allDates.push(parseDate(item.card.endDate))
    }
    minDate = new Date(Math.min(...allDates))
    maxDate = new Date(Math.max(...allDates))
    minDate.setDate(minDate.getDate() - 7)
    maxDate.setDate(maxDate.getDate() + 14)
  } else {
    minDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    maxDate = new Date(now.getFullYear(), now.getMonth() + 3, 1)
  }

  const totalDays = Math.max(daysBetween(minDate, maxDate), 28)
  const totalWidth = totalDays * DAY_WIDTH

  const months = []
  const mCursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  while (mCursor < maxDate) {
    const mStart = new Date(mCursor)
    const mEnd = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 1)
    const left = Math.max(0, daysBetween(minDate, mStart) * DAY_WIDTH)
    const w = Math.min(daysBetween(mStart, mEnd) * DAY_WIDTH, totalWidth - left)
    if (w > 0) months.push({ name: MONTHS[mCursor.getMonth()] + ' ' + mCursor.getFullYear(), left, width: w })
    mCursor.setMonth(mCursor.getMonth() + 1)
  }

  const weekMarkers = []
  const wCursor = new Date(minDate)
  wCursor.setDate(wCursor.getDate() - wCursor.getDay())
  while (wCursor <= maxDate) {
    const left = daysBetween(minDate, wCursor) * DAY_WIDTH
    if (left > 0 && left < totalWidth) weekMarkers.push({ left })
    wCursor.setDate(wCursor.getDate() + 7)
  }

  const todayLeft = daysBetween(minDate, now) * DAY_WIDTH
  const showToday = todayLeft >= 0 && todayLeft < totalWidth

  let hasDated = false

  let html = '<div class="timeline">'

  html += '<div class="tl-header" style="width:' + (200 + totalWidth) + 'px">'
  html += '  <div class="tl-label-col">Task</div>'
  html += '  <div class="tl-scale" style="width:' + totalWidth + 'px">'
  for (const m of months) {
    html += '    <div class="tl-month" style="left:' + m.left + 'px;width:' + m.width + 'px">' + escapeHtml(m.name) + '</div>'
  }
  for (const w of weekMarkers) {
    html += '    <div class="tl-week-marker" style="left:' + w.left + 'px"></div>'
  }
  if (showToday) {
    html += '    <div class="tl-today-line" style="left:' + todayLeft + 'px"></div>'
    html += '    <div class="tl-today-label" style="left:' + todayLeft + 'px">Today</div>'
  }
  html += '  </div>'
  html += '</div>'

  html += '<div class="tl-body" style="width:' + (200 + totalWidth) + 'px">'

  for (const col of b.columns) {
    const colDated = datedItems.filter(x => x.columnId === col.id)
    const colUndated = undatedItems.filter(x => x.columnId === col.id)
    if (colDated.length > 0) hasDated = true

    html += '<div class="tl-row">'
    html += '  <div class="tl-row-label">'
    html += '    <span class="tl-row-name">' + escapeHtml(col.name) + '</span>'
    html += '    <span class="tl-row-count">' + col.cards.length + '</span>'
    html += '  </div>'
    html += '  <div class="tl-track" style="width:' + totalWidth + 'px">'

    for (const item of colDated) {
      const c = item.card
      const s = parseDate(c.startDate)
      const e = parseDate(c.endDate)
      if (!s && !e) continue
      const start = s || e
      const end = e || s
      let barLeft = daysBetween(minDate, start) * DAY_WIDTH
      let barWidth = Math.max(6, (daysBetween(start, end) + 1) * DAY_WIDTH)
      if (barLeft < 0) { barWidth += barLeft; barLeft = 0 }
      if (barLeft + barWidth > totalWidth) barWidth = totalWidth - barLeft
      if (barWidth <= 0) continue

      const color = PRIORITY_COLORS[c.priority] || PRIORITY_COLORS.medium
      const completed = c.completed ? ' tl-bar-done' : ''
      const barLabel = c.title.length > 25 ? c.title.slice(0, 24) + '\u2026' : c.title

      html += '    <div class="tl-bar' + completed + '" style="left:' + barLeft + 'px;width:' + barWidth + 'px;background:' + color + '" onclick="openCardDetail(\'' + c.id + '\')" title="' + escapeHtml(c.title) + ' \u00b7 ' + (c.startDate || 'no date') + ' \u2192 ' + (c.endDate || 'no date') + '">'
      if (barWidth > 28) {
        html += '      <span class="tl-bar-title">' + escapeHtml(barLabel) + '</span>'
      }
      if (barWidth > 90 && c.startDate && c.endDate) {
        html += '      <span class="tl-bar-dates">' + formatShortDate(c.startDate) + ' - ' + formatShortDate(c.endDate) + '</span>'
      }
      html += '    </div>'
    }

    if (colDated.length === 0 && colUndated.length === 0) {
      html += '    <div class="tl-track-empty"></div>'
    }

    html += '  </div>'
    html += '</div>'

    if (colUndated.length > 0) {
      html += '<div class="tl-row tl-row-undated">'
      html += '  <div class="tl-row-label tl-label-undated">'
      html += '    <span class="tl-undated-icon">\u2299</span>'
      html += '    <span class="tl-row-name">Unscheduled</span>'
      html += '    <span class="tl-row-count">' + colUndated.length + '</span>'
      html += '  </div>'
      html += '  <div class="tl-track" style="width:' + totalWidth + 'px">'
      for (const item of colUndated) {
        const c = item.card
        const completed = c.completed ? ' tl-ucard-done' : ''
        html += '    <div class="tl-ucard' + completed + '" onclick="openCardDetail(\'' + c.id + '\')" title="' + escapeHtml(c.title) + '">'
        html += '      <span class="tl-ucard-dot" style="background:' + (PRIORITY_COLORS[c.priority] || '#6b7280') + '"></span>'
        html += '      <span class="tl-ucard-title">' + escapeHtml(c.title) + '</span>'
        html += '    </div>'
      }
      html += '  </div>'
      html += '</div>'
    }
  }

  if (!hasDated && undatedItems.length === 0 && b.columns.length > 0) {
    html += '<div class="tl-empty-msg">Add dates to cards to see them on the timeline</div>'
  }

  html += '</div></div>'

  area.innerHTML = html
}
