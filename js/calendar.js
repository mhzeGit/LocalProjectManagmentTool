import { state, findBoard, findCard, genId } from './data.js'
import { escapeHtml, getProgressColor, countChecklistItems, countCompletedChecklistItems } from './utils.js'
import { openCardDetail } from './modal.js'
import { wasRightDragged } from './dragscroll.js'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PRIORITY_COLORS = {
  none: '#6b7280',
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444'
}

let _calMonth = null
let _dragCardId = null
let _dragActiveType = null
let _resizing = null
let _moving = null
let _calGridStartDate = null
let _calTotalRows = 0

function parseDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}

function daysBetween(a, b) {
  const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.floor((utc2 - utc1) / 86400000)
}

function cellIndexToDate(cellIdx) {
  const d = new Date(_calGridStartDate)
  d.setDate(d.getDate() + cellIdx)
  return d
}

function gridPosToDates(colStart, colEnd, row) {
  const startIdx = (row - 1) * 7 + (colStart - 1)
  const endIdx = (row - 1) * 7 + (colEnd - 2)
  return { start: cellIndexToDate(startIdx), end: cellIndexToDate(endIdx) }
}

export function calendarPrevMonth() {
  _calMonth.setMonth(_calMonth.getMonth() - 1)
  renderCalendar()
}

export function calendarNextMonth() {
  _calMonth.setMonth(_calMonth.getMonth() + 1)
  renderCalendar()
}

export function calendarToday() {
  const now = new Date()
  _calMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  renderCalendar()
}

export function calendarAddCard(dateStr) {
  const b = findBoard(state.selectedBoardId)
  if (!b || !b.columns.length) return
  const date = parseDate(dateStr)
  if (!date) return
  const endDate = new Date(date)
  endDate.setDate(endDate.getDate() + 1)
  const card = {
    id: genId(),
    title: 'New Card',
    description: '',
    completed: false,
    startDate: formatDate(date),
    endDate: formatDate(endDate),
    priority: 'medium',
    tags: [],
    members: [],
    checklists: []
  }
  b.columns[0].cards.push(card)
  renderCalendar()
}

function initCalendarDrag() {
  const area = document.getElementById('boardArea')
  if (!area || area._calDragDone) return
  area._calDragDone = true

  area.addEventListener('dragstart', function(e) {
    const ucard = e.target.closest('.cal-ucard')
    if (ucard) {
      _dragCardId = ucard.dataset.cardId
      _dragActiveType = 'ucard'
      e.dataTransfer.setData('text/x-cal-ucard', ucard.dataset.cardId)
      e.dataTransfer.effectAllowed = 'move'
      ucard.classList.add('dragging')
    }
  })

  area.addEventListener('dragend', function() {
    area.querySelectorAll('.dragging, .drag-over').forEach(function(el) {
      el.classList.remove('dragging', 'drag-over')
    })
    _dragCardId = null
    _dragActiveType = null
  })

  area.addEventListener('dragover', function(e) {
    if (!_dragActiveType) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    let cell = e.target.closest('.cal-cell')
    if (!cell) {
      const els = document.elementsFromPoint(e.clientX, e.clientY)
      for (const el of els) {
        if (el.classList && el.classList.contains('cal-cell')) {
          cell = el
          break
        }
      }
    }
    area.querySelectorAll('.cal-cell.drag-over').forEach(function(el) {
      if (el !== cell) el.classList.remove('drag-over')
    })
    if (cell) cell.classList.add('drag-over')
  })

  area.addEventListener('dragleave', function(e) {
    if (!_dragActiveType) return
    let cell = e.target.closest('.cal-cell')
    if (!cell) {
      const els = document.elementsFromPoint(e.clientX, e.clientY)
      for (const el of els) {
        if (el.classList && el.classList.contains('cal-cell')) {
          cell = el
          break
        }
      }
    }
    if (cell && !cell.contains(e.relatedTarget)) cell.classList.remove('drag-over')
  })

  area.addEventListener('drop', function(e) {
    if (!_dragActiveType) return
    e.preventDefault()
    area.querySelectorAll('.drag-over').forEach(function(el) {
      el.classList.remove('drag-over')
    })
    const id = _dragCardId
    _dragCardId = null
    _dragActiveType = null

    let cell = e.target.closest('.cal-cell')
    if (!cell) {
      const els = document.elementsFromPoint(e.clientX, e.clientY)
      for (const el of els) {
        if (el.classList && el.classList.contains('cal-cell')) {
          cell = el
          break
        }
      }
    }
    if (!cell || !cell.dataset.date) return

    const card = findCard(id)
    if (!card) return

    const newDate = parseDate(cell.dataset.date)
    if (!newDate) return

    card.startDate = formatDate(newDate)
    card.endDate = formatDate(newDate)
    renderCalendar()
  })

  area.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return
    const spanCard = e.target.closest('.cal-span-card')
    if (!spanCard) return

    const handle = e.target.closest('.cal-span-resize')
    const gc = spanCard.style.gridColumn || ''
    const parts = gc.split('/')
    if (parts.length < 2) return

    const startCol = parseInt(parts[0])
    const endCol = parseInt(parts[1])

    if (handle) {
      e.preventDefault()
      const gr = spanCard.style.gridRow || '1'
      const origRow = parseInt(gr)
      _resizing = {
        cardId: spanCard.dataset.cardId,
        dir: handle.dataset.side,
        startX: e.clientX,
        startY: e.clientY,
        el: spanCard,
        origStartCol: startCol,
        origEndCol: endCol,
        origRow: origRow,
        mouseCol: null,
        mouseRow: null
      }
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      return
    }

    e.preventDefault()
    _moving = {
      cardId: spanCard.dataset.cardId,
      startX: e.clientX,
      startY: e.clientY,
      el: spanCard,
      durCols: endCol - startCol
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    spanCard.style.opacity = '0.5'
  })

  area.addEventListener('click', function(e) {
    const card = e.target.closest('.cal-span-card')
    if (card && card.dataset.cardId) {
      openCardDetail(card.dataset.cardId)
      return
    }
    const ucard = e.target.closest('.cal-ucard')
    if (ucard && ucard.dataset.cardId) {
      openCardDetail(ucard.dataset.cardId)
    }
  })

  area.addEventListener('contextmenu', function(e) {
    if (wasRightDragged()) return
    const cell = e.target.closest('.cal-cell')
    if (!cell) return
    e.preventDefault()
    document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })

    const card = e.target.closest('.cal-span-card')
    const menu = document.createElement('div')
    menu.className = 'tl-ctx-menu'
    menu.style.left = e.clientX + 'px'
    menu.style.top = e.clientY + 'px'

    let html = ''
    if (card) {
      menu.dataset.cardId = card.dataset.cardId
      html += '<button class="tl-ctx-item" onclick="closeAllColumnMenus();calendarCopyCard(\'' + card.dataset.cardId + '\')">Copy</button>'
      html += '<button class="tl-ctx-item" onclick="closeAllColumnMenus();calendarDuplicateCard(\'' + card.dataset.cardId + '\')">Duplicate</button>'
      html += '<div class="tl-ctx-divider"></div>'
      html += '<button class="tl-ctx-item tl-ctx-danger" onclick="closeAllColumnMenus();calendarArchiveCard(\'' + card.dataset.cardId + '\')">Archive</button>'
    } else {
      html += '<button class="tl-ctx-item" onclick="closeAllColumnMenus();calendarAddCard(\'' + cell.dataset.date + '\')">Add Card</button>'
      if (window.getCopiedCard && window.getCopiedCard()) {
        html += '<button class="tl-ctx-item" onclick="closeAllColumnMenus();calendarPasteCard(\'' + cell.dataset.date + '\')">Paste</button>'
      }
    }

    menu.innerHTML = html
    menu.addEventListener('mouseleave', function() { menu.remove() })
    document.body.appendChild(menu)
  })
}

document.addEventListener('mousemove', function(e) {
  if (state.selectedView !== 'calendar') return

  const grid = document.querySelector('.cal-grid')
  if (!grid) return
  const rect = grid.getBoundingClientRect()
  const cellW = rect.width / 7
  const cellH = _calTotalRows > 0 ? rect.height / _calTotalRows : rect.height

  if (_resizing && _resizing.el) {
    e.preventDefault()
    const mouseCol = Math.floor((e.clientX - rect.left) / cellW) + 1
    const mouseRow = Math.max(1, Math.min(Math.floor((e.clientY - rect.top) / cellH) + 1, _calTotalRows))
    _resizing.mouseCol = mouseCol
    _resizing.mouseRow = mouseRow

    var s = _resizing.origStartCol
    var e2 = _resizing.origEndCol
    var r = _resizing.origRow
    if (mouseRow !== r) {
      if (_resizing.dir === 'start') { s = 1 } else { e2 = 8 }
    } else {
      if (_resizing.dir === 'start') { s = Math.max(1, Math.min(mouseCol, e2 - 1)) }
      else { e2 = Math.max(s + 1, mouseCol + 1) }
    }
    _resizing.el.style.gridColumn = s + '/' + e2
    return
  }

  if (_moving && _moving.el) {
    e.preventDefault()
    const col = Math.floor((e.clientX - rect.left) / cellW) + 1
    const row = Math.max(1, Math.min(Math.floor((e.clientY - rect.top) / cellH) + 1, _calTotalRows))

    var newCol = Math.max(1, Math.min(col, 8 - _moving.durCols))
    _moving.el.style.gridColumn = newCol + '/' + (newCol + _moving.durCols)
    _moving.el.style.gridRow = String(row)
    return
  }
})

document.addEventListener('mouseup', function(ev) {
  if (state.selectedView !== 'calendar') return

  if (_resizing) {
    const moved = Math.abs(ev.clientX - _resizing.startX) > 3
    if (!moved || !_resizing.el) {
      if (_resizing.el) { _resizing.el.style.opacity = '' }
      _resizing = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      return
    }
    var card = findCard(_resizing.cardId)
    if (card) {
      var mRow = _resizing.mouseRow != null ? _resizing.mouseRow : _resizing.origRow
      var mCol = _resizing.mouseCol != null ? _resizing.mouseCol : (_resizing.dir === 'start' ? _resizing.origStartCol : _resizing.origEndCol - 1)
      var sIdx, eIdx
      if (_resizing.dir === 'start') {
        sIdx = (mRow - 1) * 7 + (mCol - 1)
        eIdx = (_resizing.origRow - 1) * 7 + (_resizing.origEndCol - 2)
      } else {
        sIdx = (_resizing.origRow - 1) * 7 + (_resizing.origStartCol - 1)
        eIdx = (mRow - 1) * 7 + (mCol - 1)
      }
      if (sIdx > eIdx) { var tmp = sIdx; sIdx = eIdx; eIdx = tmp }
      card.startDate = formatDate(cellIndexToDate(sIdx))
      card.endDate = formatDate(cellIndexToDate(eIdx))
    }
    if (_resizing.el) _resizing.el.style.opacity = ''
    _resizing = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    renderCalendar()
    return
  }

  if (_moving) {
    const moved = Math.abs(ev.clientX - _moving.startX) > 3
    if (!moved || !_moving.el) {
      if (_moving.el) { _moving.el.style.opacity = '' }
      _moving = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      return
    }
    const gc = _moving.el.style.gridColumn || ''
    const gr = _moving.el.style.gridRow || '1'
    const parts = gc.split('/')
    if (parts.length >= 2) {
      const finalCol = parseInt(parts[0])
      const finalRow = parseInt(gr)
      const card = findCard(_moving.cardId)
      if (card) {
        const dates = gridPosToDates(finalCol, finalCol + _moving.durCols, finalRow)
        if (dates.start && dates.end) {
          card.startDate = formatDate(dates.start)
          card.endDate = formatDate(dates.end)
        }
      }
    }
    _moving.el.style.opacity = ''
    _moving = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    renderCalendar()
    return
  }
})

export function renderCalendar() {
  const area = document.getElementById('boardArea')
  const b = findBoard(state.selectedBoardId)
  if (!b) return

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (!_calMonth) {
    _calMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  const year = _calMonth.getFullYear()
  const month = _calMonth.getMonth()

  const allItems = []
  for (const col of b.columns) {
    for (const c of col.cards) {
      allItems.push({ card: c, columnName: col.name, columnId: col.id })
    }
  }

  const datedItems = allItems.filter(function(x) { return x.card.startDate || x.card.endDate })
  const undatedItems = allItems.filter(function(x) { return !x.card.startDate && !x.card.endDate })

  const firstOfMonth = new Date(year, month, 1)
  const firstDayOfWeek = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalRows = Math.ceil((firstDayOfWeek + daysInMonth) / 7)
  const totalCells = totalRows * 7
  const gridStartDate = new Date(year, month, 1 - firstDayOfWeek)
  _calTotalRows = totalRows
  _calGridStartDate = gridStartDate

  const spanningSegments = []
  for (const item of datedItems) {
    const c = item.card
    const s = parseDate(c.startDate) || parseDate(c.endDate)
    const e = parseDate(c.endDate) || parseDate(c.startDate)
    if (!s || !e) continue

    const endGrid = new Date(gridStartDate.getTime() + totalCells * 86400000)
    const clampStart = s < gridStartDate ? new Date(gridStartDate) : new Date(s)
    const clampEnd = e >= endGrid ? new Date(endGrid.getTime() - 86400000) : new Date(e)
    if (clampStart > clampEnd) continue

    const startOffset = daysBetween(gridStartDate, clampStart)
    const endOffset = daysBetween(gridStartDate, clampEnd)
    const startRow = Math.floor(startOffset / 7)
    const endRow = Math.min(Math.floor(endOffset / 7), totalRows - 1)

    for (let r = startRow; r <= endRow; r++) {
      const colStart = r === startRow ? (startOffset % 7) + 1 : 1
      const colEnd = r === endRow ? (endOffset % 7) + 2 : 8
      if (colStart >= colEnd) continue
      spanningSegments.push({ card: c, colStart: colStart, colEnd: colEnd, row: r + 1 })
    }
  }

  let html = '<div class="cal-wrapper">'

  html += '<div class="cal-header">'
  html += '  <div class="cal-nav-group">'
  html += '    <button class="cal-nav-btn" onclick="calendarPrevMonth()">\u25C0</button>'
  html += '    <h2 class="cal-title">' + MONTHS[month] + ' ' + year + '</h2>'
  html += '    <button class="cal-nav-btn" onclick="calendarNextMonth()">\u25B6</button>'
  html += '  </div>'
  html += '  <button class="cal-today-btn" onclick="calendarToday()">Today</button>'
  html += '</div>'

  html += '<div class="cal-dow-row">'
  for (let di = 0; di < DAYS.length; di++) {
    html += '  <div class="cal-dow">' + DAYS[di] + '</div>'
  }
  html += '</div>'

  html += '<div class="cal-grid">'

  let gridDate = new Date(gridStartDate)
  for (let i = 0; i < totalCells; i++) {
    const dateKey = formatDate(gridDate)
    const dayNum = gridDate.getDate()
    const isCurrentMonth = gridDate.getMonth() === month
    const isToday = gridDate.getTime() === now.getTime()
    const isWeekend = gridDate.getDay() === 0 || gridDate.getDay() === 6
    const col = (i % 7) + 1
    const row = Math.floor(i / 7) + 1

    let cls = 'cal-cell'
    if (!isCurrentMonth) cls += ' cal-other'
    if (isToday) cls += ' cal-today'
    if (isWeekend) cls += ' cal-weekend'

    html += '<div class="' + cls + '" style="grid-column:' + col + ';grid-row:' + row + '" data-date="' + dateKey + '">'
    html += '  <div class="cal-day-head">'
    html += '    <span class="cal-day-num">' + dayNum + '</span>'
    html += '  </div>'
    html += '</div>'

    gridDate.setDate(gridDate.getDate() + 1)
  }

  for (const seg of spanningSegments) {
    const c = seg.card
    const color = PRIORITY_COLORS[c.priority] || '#6b7280'
    const completed = c.completed ? ' cal-span-done' : ''

    html += '<div class="cal-span-card' + completed + '" data-card-id="' + c.id + '" style="grid-column:' + seg.colStart + '/' + seg.colEnd + ';grid-row:' + seg.row + ';background:' + color + '" title="' + escapeHtml(c.title) + '">'
    html += '    <div class="cal-span-resize cal-span-resize-l" data-side="start"></div>'
    html += '    <span class="cal-span-title">' + escapeHtml(c.title) + '</span>'
    html += '    <div class="cal-span-resize cal-span-resize-r" data-side="end"></div>'
    if (c.checklists && c.checklists.length > 0) {
      const clTotal = countChecklistItems(c.checklists)
      const clDone = countCompletedChecklistItems(c.checklists)
      const clPct = clTotal > 0 ? Math.round((clDone / clTotal) * 100) : 0
      const allDone = clTotal > 0 && clDone === clTotal ? ' done' : ''
      html += '    <div class="cal-span-cl-progress' + allDone + '"><div class="cal-span-cl-progress-fill" style="width:' + clPct + '%;background:' + getProgressColor(clPct) + '"></div></div>'
    }
    html += '  </div>'
  }

  html += '</div>'

  if (undatedItems.length > 0) {
    html += '<div class="cal-us">'
    html += '  <div class="cal-us-header">Unscheduled</div>'
    html += '  <div class="cal-us-body">'
    for (const col of b.columns) {
      const colUndated = undatedItems.filter(function(x) { return x.columnId === col.id })
      if (colUndated.length === 0) continue
      html += '    <div class="cal-us-row" data-col-id="' + col.id + '">'
      html += '      <span class="cal-us-label">' + escapeHtml(col.name) + '</span>'
      html += '      <div class="cal-us-cards">'
      for (const item of colUndated) {
        const c = item.card
        const completed = c.completed ? ' cal-ucard-done' : ''
        html += '        <div class="cal-ucard' + completed + '" draggable="true" data-card-id="' + c.id + '">'
        html += '          <span class="cal-ucard-dot" style="background:' + (PRIORITY_COLORS[c.priority] || '#6b7280') + '"></span>'
        html += '          <span class="cal-ucard-title">' + escapeHtml(c.title) + '</span>'
        if (c.checklists && c.checklists.length > 0) {
          const clTotal = countChecklistItems(c.checklists)
          const clDone = countCompletedChecklistItems(c.checklists)
          const clPct = clTotal > 0 ? Math.round((clDone / clTotal) * 100) : 0
          const allDone = clTotal > 0 && clDone === clTotal ? ' done' : ''
          html += '          <div class="cal-ucard-cl-progress' + allDone + '"><div class="cal-ucard-cl-progress-fill" style="width:' + clPct + '%;background:' + getProgressColor(clPct) + '"></div></div>'
        }
        html += '        </div>'
      }
      html += '      </div>'
      html += '    </div>'
    }
    html += '  </div>'
    html += '</div>'
  }

  html += '</div>'

  area.innerHTML = html
  initCalendarDrag()
}

export function calendarCopyCard(cardId) {
  window.copyCard(cardId)
}

export function calendarDuplicateCard(cardId) {
  window.duplicateCard(cardId)
}

export function calendarArchiveCard(cardId) {
  window.archiveCard(cardId)
}

export function calendarPasteCard(dateStr) {
  if (!window.getCopiedCard()) return
  const b = findBoard(state.selectedBoardId)
  if (!b || !b.columns.length) return
  const date = parseDate(dateStr)
  if (!date) return
  const clipCard = window.getCopiedCard()
  const pasteCard = JSON.parse(JSON.stringify(clipCard))
  pasteCard.id = genId()
  pasteCard.startDate = formatDate(date)
  const newEnd = new Date(date)
  const s = parseDate(clipCard.startDate) || parseDate(clipCard.endDate)
  const e = parseDate(clipCard.endDate) || parseDate(clipCard.startDate)
  const duration = s && e ? daysBetween(s, e) : 0
  newEnd.setDate(newEnd.getDate() + duration)
  pasteCard.endDate = formatDate(newEnd)
  b.columns[0].cards.push(pasteCard)
  renderCalendar()
}
