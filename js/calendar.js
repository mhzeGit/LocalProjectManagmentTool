import { state, findBoard, findCard, genId } from './data.js'
import { escapeHtml, getProgressColor, countChecklistItems, countCompletedChecklistItems } from './utils.js'
import { filterCards, getActiveFilterCount } from './filters.js'
import { openCardDetail } from './modal.js'
import { wasRightDragged } from './dragscroll.js'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const PRIORITY_COLORS = {
  none: '#6b7280',
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444',
  '1': '#22c55e',
  '2': '#84cc16',
  '3': '#f97316',
  '4': '#f43f5e',
  '5': '#ef4444'
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

function dateTextFromRange(sCol, sRow, eCol, eRow) {
  var sIdx = (sRow - 1) * 7 + (sCol - 1)
  var eIdx = (eRow - 1) * 7 + (eCol - 1)
  if (sIdx > eIdx) { var t = sIdx; sIdx = eIdx; eIdx = t }
  var sd = cellIndexToDate(sIdx)
  var ed = cellIndexToDate(eIdx)
  if (sd.getTime() === ed.getTime()) return formatShortDate(formatDate(sd))
  return formatShortDate(formatDate(sd)) + ' - ' + formatShortDate(formatDate(ed))
}

function updateCardDates(el, sCol, sRow, eCol, eRow) {
  var text = dateTextFromRange(sCol, sRow, eCol, eRow)
  var datesEl = el.querySelector('.cal-span-dates')
  if (datesEl) { datesEl.textContent = text }
  else {
    var titleEl = el.querySelector('.cal-span-title')
    if (titleEl && titleEl.nextSibling) {
      var span = document.createElement('span')
      span.className = 'cal-span-dates'
      span.textContent = text
      titleEl.parentNode.insertBefore(span, titleEl.nextSibling)
    }
  }
  el.title = text
}

function formatShortDate(str) {
  if (!str) return ''
  var d = parseDate(str)
  if (!d) return ''
  return MONTHS[d.getMonth()] + ' ' + d.getDate()
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
    priority: '3',
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
    if (handle) {
      e.preventDefault()
      const card = findCard(spanCard.dataset.cardId)
      if (!card) return
      const s = parseDate(card.startDate) || new Date(_calGridStartDate)
      const ed = parseDate(card.endDate) || s
      const effectiveEnd = (card.startDate && card.endDate && card.startDate !== card.endDate) ? new Date(ed.getTime() - 86400000) : ed
      const startOff = daysBetween(_calGridStartDate, s)
      const endOff = daysBetween(_calGridStartDate, effectiveEnd)
      const sCol = (startOff % 7) + 1
      const sRow = Math.floor(startOff / 7) + 1
      const eColLast = (endOff % 7) + 1
      const eRow = Math.floor(endOff / 7) + 1
      const allSegs = document.querySelectorAll('.cal-span-card[data-card-id="' + spanCard.dataset.cardId + '"]')
      const otherSegs = []
      for (let si = 0; si < allSegs.length; si++) {
        if (allSegs[si] !== spanCard) otherSegs.push(allSegs[si])
      }
      _resizing = {
        cardId: spanCard.dataset.cardId,
        dir: handle.dataset.side,
        startX: e.clientX,
        startY: e.clientY,
        el: spanCard,
        origStartCol: sCol,
        origEndCol: eColLast + 1,
        origRow: sRow,
        origEndRow: eRow,
        clones: [],
        otherSegments: otherSegs
      }
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      return
    }

    e.preventDefault()
    var c2 = findCard(spanCard.dataset.cardId)
    var dur = 1
    if (c2 && c2.startDate && c2.endDate) {
      dur = Math.max(1, daysBetween(parseDate(c2.startDate), parseDate(c2.endDate)))
    }
    _moving = {
      cardId: spanCard.dataset.cardId,
      startX: e.clientX,
      startY: e.clientY,
      el: spanCard,
      durCols: dur
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

    for (let ci = 0; ci < _resizing.clones.length; ci++) {
      if (_resizing.clones[ci].parentNode) _resizing.clones[ci].parentNode.removeChild(_resizing.clones[ci])
    }
    _resizing.clones = []

    let mouseCol = Math.floor((e.clientX - rect.left) / cellW) + 1
    let mouseRow = Math.max(1, Math.min(Math.floor((e.clientY - rect.top) / cellH) + 1, _calTotalRows))
    mouseCol = Math.max(1, Math.min(mouseCol, 7))

    let anchorCol = _resizing.dir === 'start' ? _resizing.origEndCol - 1 : _resizing.origStartCol
    let anchorRow = _resizing.dir === 'start' ? _resizing.origEndRow : _resizing.origRow
    let anchorIdx = (anchorRow - 1) * 7 + (anchorCol - 1)
    let mouseIdx = (mouseRow - 1) * 7 + (mouseCol - 1)

    if (_resizing.dir === 'start') {
      if (mouseIdx >= anchorIdx) {
        mouseCol = anchorCol; mouseRow = anchorRow; mouseIdx = anchorIdx
      }
    } else {
      if (mouseIdx <= anchorIdx) {
        mouseCol = anchorCol; mouseRow = anchorRow; mouseIdx = anchorIdx
      }
    }

    for (let si = 0; si < _resizing.otherSegments.length; si++) {
      _resizing.otherSegments[si].style.display = ''
    }

    let s = anchorCol
    let e2 = anchorCol + 1
    if (_resizing.dir === 'start') {
      if (mouseRow === anchorRow) {
        s = Math.max(1, Math.min(mouseCol, _resizing.origEndCol - 1))
        _resizing.el.style.gridRow = String(mouseRow)
      } else {
        s = 1
        for (let rr = mouseRow; rr <= anchorRow; rr++) {
          if (rr === anchorRow) continue
          let ss = rr === mouseRow ? mouseCol : 1
          let se = rr === anchorRow ? _resizing.origEndCol : 8
          let cl = _resizing.el.cloneNode(true)
          cl.classList.add('cal-span-clone')
          cl.style.pointerEvents = 'none'
          cl.style.gridColumn = ss + '/' + se
          cl.style.gridRow = String(rr)
          _resizing.el.parentNode.appendChild(cl)
          _resizing.clones.push(cl)
        }
      }
      _resizing.el.style.gridColumn = s + '/' + _resizing.origEndCol
    } else {
      if (mouseRow === anchorRow) {
        e2 = Math.max(anchorCol + 1, mouseCol + 1)
        _resizing.el.style.gridRow = String(mouseRow)
      } else {
        e2 = 8
        for (let rr = anchorRow; rr <= mouseRow; rr++) {
          if (rr === anchorRow) continue
          let ss2 = rr === anchorRow ? _resizing.origStartCol : 1
          let se2 = rr === mouseRow ? mouseCol + 1 : 8
          let cl2 = _resizing.el.cloneNode(true)
          cl2.classList.add('cal-span-clone')
          cl2.style.pointerEvents = 'none'
          cl2.style.gridColumn = ss2 + '/' + se2
          cl2.style.gridRow = String(rr)
          _resizing.el.parentNode.appendChild(cl2)
          _resizing.clones.push(cl2)
        }
      }
      _resizing.el.style.gridColumn = _resizing.origStartCol + '/' + e2
    }

    if (_resizing.dir === 'end' && mouseRow !== anchorRow && mouseRow < _resizing.origEndRow) {
      _resizing.el.style.gridRow = String(mouseRow)
      _resizing.el.style.gridColumn = _resizing.origStartCol + '/' + (mouseCol + 1)
      for (let ci = _resizing.clones.length - 1; ci >= 0; ci--) {
        if (parseInt(_resizing.clones[ci].style.gridRow) === mouseRow) {
          if (_resizing.clones[ci].parentNode) _resizing.clones[ci].parentNode.removeChild(_resizing.clones[ci])
          _resizing.clones.splice(ci, 1)
        }
      }
    }
    if (_resizing.dir === 'start' && mouseRow !== anchorRow && mouseRow > _resizing.origRow) {
      _resizing.el.style.gridRow = String(mouseRow)
      _resizing.el.style.gridColumn = mouseCol + '/' + _resizing.origEndCol
      for (let ci = _resizing.clones.length - 1; ci >= 0; ci--) {
        if (parseInt(_resizing.clones[ci].style.gridRow) === mouseRow) {
          if (_resizing.clones[ci].parentNode) _resizing.clones[ci].parentNode.removeChild(_resizing.clones[ci])
          _resizing.clones.splice(ci, 1)
        }
      }
    }

    const curRow = parseInt(_resizing.el.style.gridRow) || (_resizing.dir === 'start' ? _resizing.origRow : _resizing.origEndRow)
    for (let si = 0; si < _resizing.otherSegments.length; si++) {
      const osRow = parseInt(_resizing.otherSegments[si].style.gridRow)
      if (osRow === curRow) {
        _resizing.otherSegments[si].style.display = 'none'
      }
    }

    _resizing._mouseCol = mouseCol
    _resizing._mouseRow = mouseRow

    let dsCol = _resizing.dir === 'start' ? mouseCol : _resizing.origStartCol
    let dsRow = _resizing.dir === 'start' ? mouseRow : _resizing.origRow
    let deCol = _resizing.dir === 'start' ? _resizing.origEndCol - 1 : mouseCol
    let deRow = _resizing.dir === 'start' ? _resizing.origEndRow : mouseRow
    updateCardDates(_resizing.el, dsCol, dsRow, deCol, deRow)
    for (let ci2 = 0; ci2 < _resizing.clones.length; ci2++) {
      updateCardDates(_resizing.clones[ci2], dsCol, dsRow, deCol, deRow)
    }
    return
  }

  if (_moving && _moving.el) {
    e.preventDefault()
    const col = Math.floor((e.clientX - rect.left) / cellW) + 1
    const row = Math.max(1, Math.min(Math.floor((e.clientY - rect.top) / cellH) + 1, _calTotalRows))

    var newCol = Math.max(1, Math.min(col, 8 - _moving.durCols))
    _moving.el.style.gridColumn = newCol + '/' + (newCol + _moving.durCols)
    _moving.el.style.gridRow = String(row)
    updateCardDates(_moving.el, newCol, row, newCol + _moving.durCols - 1, row)
    return
  }
})

document.addEventListener('mouseup', function(ev) {
  if (state.selectedView !== 'calendar') return

  if (_resizing) {
    for (var ci = 0; ci < _resizing.clones.length; ci++) {
      if (_resizing.clones[ci].parentNode) _resizing.clones[ci].parentNode.removeChild(_resizing.clones[ci])
    }
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
      var mRow = _resizing._mouseRow != null ? _resizing._mouseRow : _resizing.origRow
      var mCol = _resizing._mouseCol != null ? _resizing._mouseCol : _resizing.origStartCol
      var startIdx2 = (_resizing.origRow - 1) * 7 + (_resizing.origStartCol - 1)
      var endIdx2 = (_resizing.origEndRow - 1) * 7 + (_resizing.origEndCol - 2)
      var mouseIdx2 = (mRow - 1) * 7 + (mCol - 1)
      if (_resizing.dir === 'start') {
        if (mouseIdx2 >= endIdx2) mouseIdx2 = endIdx2
        card.startDate = formatDate(cellIndexToDate(mouseIdx2))
        card.endDate = formatDate(cellIndexToDate(endIdx2 + 1))
      } else {
        if (mouseIdx2 <= startIdx2) mouseIdx2 = startIdx2
        card.startDate = formatDate(cellIndexToDate(startIdx2))
        card.endDate = formatDate(cellIndexToDate(mouseIdx2 + 1))
      }
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
      const cardId = _moving.cardId
      _moving = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (cardId) openCardDetail(cardId)
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
          card.endDate = formatDate(new Date(dates.end.getTime() + 86400000))
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

  const filteredItems = getActiveFilterCount() > 0 ? filterCards(allItems) : allItems

  const datedItems = filteredItems.filter(function(x) { return x.card.startDate || x.card.endDate })
  const undatedItems = filteredItems.filter(function(x) { return !x.card.startDate && !x.card.endDate })

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
    let e = parseDate(c.endDate) || parseDate(c.startDate)
    if (!s || !e) continue

    if (c.startDate && c.endDate && c.startDate !== c.endDate) {
      e = new Date(e.getTime() - 86400000)
    }

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

  const segsByRow = {}
  for (const seg of spanningSegments) {
    if (!segsByRow[seg.row]) segsByRow[seg.row] = []
    segsByRow[seg.row].push(seg)
  }

  const rowMaxLanes = {}
  for (const row in segsByRow) {
    const segs = segsByRow[row]
    segs.sort((a, b) => a.colStart - b.colStart)
    const lanes = []
    for (const seg of segs) {
      let assigned = false
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] <= seg.colStart) {
          lanes[i] = seg.colEnd
          seg.lane = i
          assigned = true
          break
        }
      }
      if (!assigned) {
        lanes.push(seg.colEnd)
        seg.lane = lanes.length - 1
      }
    }
    rowMaxLanes[row] = lanes.length
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

    const maxLanes = rowMaxLanes[row] || 0
    let cellMinHeight = 100
    if (maxLanes > 1) {
      cellMinHeight = 26 + 26 + maxLanes * 30 + 6
    }

    html += '<div class="' + cls + '" style="grid-column:' + col + ';grid-row:' + row + ';min-height:' + cellMinHeight + 'px" data-date="' + dateKey + '">'
    html += '  <div class="cal-day-head">'
    html += '    <span class="cal-day-num">' + dayNum + '</span>'
    html += '  </div>'
    html += '</div>'

    gridDate.setDate(gridDate.getDate() + 1)
  }

  for (const seg of spanningSegments) {
    const c = seg.card
    const completed = c.completed ? ' cal-span-done' : ''

    var dateStr = ''
    if (c.startDate && c.endDate) {
      dateStr = formatShortDate(c.startDate) + ' - ' + formatShortDate(c.endDate)
    } else if (c.startDate) {
      dateStr = formatShortDate(c.startDate)
    } else if (c.endDate) {
      dateStr = formatShortDate(c.endDate)
    }

    const calSpanColorStyle = c.color ? '--card-color:' + c.color + ';' : ''
    const lane = seg.lane || 0
    const marginTop = 26 + lane * 30
    html += '<div class="cal-span-card' + completed + '" data-card-id="' + c.id + '" style="grid-column:' + seg.colStart + '/' + seg.colEnd + ';grid-row:' + seg.row + ';margin-top:' + marginTop + 'px;background:var(--bg-card);' + calSpanColorStyle + '" title="' + escapeHtml(c.title) + '">'
    html += '    <div class="cal-span-resize cal-span-resize-l" data-side="start"></div>'
    html += '    <span class="cal-span-title">' + escapeHtml(c.title) + '</span>'
    if (dateStr) {
      html += '    <span class="cal-span-dates">' + dateStr + '</span>'
    }
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
        const calUcardColorStyle = c.color ? '--card-color:' + c.color + ';' : ''
        html += '        <div class="cal-ucard' + completed + '" draggable="true" data-card-id="' + c.id + '" style="' + calUcardColorStyle + '">'
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
