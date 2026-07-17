import { state, findBoard, findColumn, findCard, findCardColumn, genId } from './data.js'
import { escapeHtml, getProgressColor } from './utils.js'
import { openCardDetail } from './modal.js'
import { wasRightDragged } from './dragscroll.js'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PRIORITY_COLORS = {
  none: '#6b7280',
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444'
}
let DAY_WIDTH = 108

let _tlMinDate = null
let _tlTotalWidth = 0
let _resizing = null
let _moving = null
let _dragCardId = null
let _dragActiveType = null
let _dragRowId = null
let _tlRowInsertLine = null


function getRowInsertLine() {
  if (!_tlRowInsertLine) {
    _tlRowInsertLine = document.createElement('div')
    _tlRowInsertLine.style.cssText = 'position:fixed;height:2px;background:#4f46e5;z-index:99999;pointer-events:none;display:none;'
    document.body.appendChild(_tlRowInsertLine)
  }
  return _tlRowInsertLine
}

function removeRowInsertLine() {
  if (_tlRowInsertLine) _tlRowInsertLine.style.display = 'none'
}

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

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')
}

function formatShortDate(str) {
  if (!str) return ''
  const d = parseDate(str)
  return MONTHS[d.getMonth()] + ' ' + d.getDate()
}

function pixelToDate(px) {
  const dayOffset = Math.round(px / DAY_WIDTH)
  const d = new Date(_tlMinDate)
  d.setDate(d.getDate() + dayOffset)
  return d
}

function snapPx(px) {
  return Math.round(px / DAY_WIDTH) * DAY_WIDTH
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
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

  const todayMinus14 = new Date(now)
  todayMinus14.setDate(todayMinus14.getDate() - 14)

  if (datedItems.length > 0) {
    const allDates = []
    for (const item of datedItems) {
      if (item.card.startDate) allDates.push(parseDate(item.card.startDate))
      if (item.card.endDate) allDates.push(parseDate(item.card.endDate))
    }
    if (_tlMinDate === null) {
      _tlMinDate = new Date(Math.min(...allDates))
      _tlMinDate.setDate(_tlMinDate.getDate() - 7)
      if (_tlMinDate < todayMinus14) _tlMinDate = new Date(todayMinus14)
    }
    const maxDate = new Date(Math.max(...allDates))
    maxDate.setDate(maxDate.getDate() + 14)
    const futureDate = new Date(now.getFullYear(), now.getMonth() + 3, 1)
    const endDate = maxDate > futureDate ? maxDate : futureDate
    _tlTotalWidth = Math.max(daysBetween(_tlMinDate, endDate), 28) * DAY_WIDTH
  } else {
    if (_tlMinDate === null) {
      _tlMinDate = new Date(todayMinus14)
    }
    _tlTotalWidth = Math.max(daysBetween(_tlMinDate, new Date(now.getFullYear(), now.getMonth() + 3, 1)), 28) * DAY_WIDTH
  }

  const totalDays = _tlTotalWidth / DAY_WIDTH
  const totalWidth = _tlTotalWidth

  const months = []
  const mCursor = new Date(_tlMinDate.getFullYear(), _tlMinDate.getMonth(), 1)
  const absMaxDate = new Date(_tlMinDate.getTime() + totalDays * 86400000)
  while (mCursor < absMaxDate) {
    const mStart = new Date(mCursor)
    const mEnd = new Date(mCursor.getFullYear(), mCursor.getMonth() + 1, 1)
    const left = Math.max(0, daysBetween(_tlMinDate, mStart) * DAY_WIDTH)
    const w = Math.min(daysBetween(mStart, mEnd) * DAY_WIDTH, totalWidth - left)
    if (w > 0) months.push({ name: MONTHS[mCursor.getMonth()] + ' ' + mCursor.getFullYear(), left, width: w })
    mCursor.setMonth(mCursor.getMonth() + 1)
  }

  const dayMarkers = []
  const monthBoundaries = []
  for (let i = 1; i < totalDays; i++) {
    const d = new Date(_tlMinDate.getTime() + i * 86400000)
    const isMonthStart = d.getDate() === 1
    const left = i * DAY_WIDTH
    if (isMonthStart) {
      monthBoundaries.push({ left })
    } else {
      dayMarkers.push({ left })
    }
  }

  const todayLeft = daysBetween(_tlMinDate, now) * DAY_WIDTH
  const showToday = todayLeft >= 0 && todayLeft < totalWidth

  let hasDated = false

  let html = '<div class="tl-wrapper">'
  html += '<div class="timeline">'

  html += '<div class="tl-header" style="width:' + (200 + totalWidth) + 'px">'
  html += '  <div class="tl-label-col">Rows Name</div>'
  html += '  <div class="tl-scale" style="width:' + totalWidth + 'px">'
  for (const m of months) {
    html += '    <div class="tl-month" style="left:' + m.left + 'px;width:' + m.width + 'px">' + escapeHtml(m.name) + '</div>'
  }
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(_tlMinDate.getTime() + i * 86400000)
    const left = i * DAY_WIDTH
    const firstCls = i === 0 ? ' tl-day-label-first' : ''
    const todayCls = d.getTime() === now.getTime() ? ' tl-today' : ''
    html += '    <div class="tl-day-label' + firstCls + todayCls + '" style="left:' + left + 'px">' + d.getDate() + '</div>'
  }
  for (const d of dayMarkers) {
    html += '    <div class="tl-day-marker" style="left:' + d.left + 'px"></div>'
  }
  for (const m of monthBoundaries) {
    html += '    <div class="tl-month-marker" style="left:' + m.left + 'px"></div>'
  }
  if (showToday) {
    html += '    <div class="tl-today-line" style="left:' + todayLeft + 'px"></div>'
  }
  html += '  </div>'
  html += '</div>'

  html += '<div class="tl-body" style="width:' + (200 + totalWidth) + 'px">'
  if (showToday) {
    html += '<div class="tl-today-line" style="left:' + (200 + todayLeft) + 'px"></div>'
  }
  html += '<div class="tl-rows">'

  for (const col of b.columns) {
    const colDated = datedItems.filter(x => x.columnId === col.id)
    if (colDated.length > 0) hasDated = true

    const sortedItems = [...colDated].sort(function(a, b) {
      const aS = parseDate(a.card.startDate) || parseDate(a.card.endDate)
      const bS = parseDate(b.card.startDate) || parseDate(b.card.endDate)
      return aS - bS
    })
    const lanes = []
    const laneMap = {}
    for (const item of sortedItems) {
      const c = item.card
      const s = parseDate(c.startDate)
      const e = parseDate(c.endDate)
      if (!s && !e) continue
      const start = s || e
      const end = e || s
      let assigned = false
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] < start) {
          lanes[i] = end
          laneMap[c.id] = i
          assigned = true
          break
        }
      }
      if (!assigned) {
        lanes.push(end)
        laneMap[c.id] = lanes.length - 1
      }
    }
    const numLanes = Math.max(lanes.length, 1)

    const laneBarH = 28
    const laneGap = 4
    const trackPadV = numLanes > 1 ? 6 : Math.floor((52 - laneBarH) / 2)
    const trackHeight = Math.max(52, trackPadV * 2 + numLanes * laneBarH + (numLanes - 1) * laneGap)

    html += '<div class="tl-row" data-col-id="' + col.id + '">'
    html += '  <div class="tl-row-label" draggable="true" data-col-id="' + col.id + '" style="min-height:' + trackHeight + 'px">'
    html += '    <span class="tl-row-name">' + escapeHtml(col.name) + '</span>'
    html += '    <span class="tl-row-count">' + col.cards.length + '</span>'
    html += '  </div>'
    const gridStops = 'transparent 0px, transparent ' + (DAY_WIDTH - 1) + 'px, rgba(255,255,255,0.025) ' + (DAY_WIDTH - 1) + 'px, rgba(255,255,255,0.025) ' + DAY_WIDTH + 'px'
    html += '  <div class="tl-track tl-track-grid" data-col-id="' + col.id + '" style="width:' + totalWidth + 'px;height:' + trackHeight + 'px;background-image:repeating-linear-gradient(90deg,' + gridStops + ')">'

    for (const m of monthBoundaries) {
      html += '    <div class="tl-month-marker-body" style="left:' + m.left + 'px"></div>'
    }

    for (const item of colDated) {
      const c = item.card
      const s = parseDate(c.startDate)
      const e = parseDate(c.endDate)
      if (!s && !e) continue
      const start = s || e
      const end = e || s
      let barLeft = daysBetween(_tlMinDate, start) * DAY_WIDTH
      let barWidth = Math.max(DAY_WIDTH, daysBetween(start, end) * DAY_WIDTH)
      if (barLeft < 0) { barWidth += barLeft; barLeft = 0 }
      if (barLeft + barWidth > totalWidth) barWidth = totalWidth - barLeft
      if (barWidth <= DAY_WIDTH * 0.5) continue

      const lane = laneMap[c.id] ?? 0
      const barTop = trackPadV + lane * (laneBarH + laneGap)

      const color = PRIORITY_COLORS[c.priority] || PRIORITY_COLORS.medium
      const completed = c.completed ? ' tl-bar-done' : ''
      const barLabel = c.title.length > 25 ? c.title.slice(0, 24) + '\u2026' : c.title

      let barStyle = 'left:' + barLeft + 'px;width:' + barWidth + 'px;background:' + color
      if (numLanes > 1) {
        barStyle += ';top:' + barTop + 'px;height:' + laneBarH + 'px;transform:none'
      }
      html += '    <div class="tl-bar' + completed + '" data-card-id="' + c.id + '" style="' + barStyle + '" title="' + escapeHtml(c.title) + ' \u00b7 ' + (c.startDate || 'no date') + ' \u2192 ' + (c.endDate || 'no date') + '">'
      html += '      <div class="tl-bar-resize tl-bar-resize-l" data-resize="start"></div>'
      if (barWidth > 28) {
        html += '      <span class="tl-bar-title">' + escapeHtml(barLabel) + '</span>'
      }
      if (barWidth > 90 && c.startDate && c.endDate) {
        html += '      <span class="tl-bar-dates">' + formatShortDate(c.startDate) + ' - ' + formatShortDate(c.endDate) + '</span>'
      }
      html += '      <div class="tl-bar-resize tl-bar-resize-r" data-resize="end"></div>'
      if (c.checklists && c.checklists.length > 0) {
        const clDone = c.checklists.filter(function(i) { return i.completed }).length
        const clPct = Math.round((clDone / c.checklists.length) * 100)
        const clAllDone = clDone === c.checklists.length ? ' done' : ''
        html += '      <div class="tl-bar-cl-progress' + clAllDone + '"><div class="tl-bar-cl-progress-fill" style="width:' + clPct + '%;background:' + getProgressColor(clPct) + '"></div></div>'
      }
      html += '    </div>'
    }

    if (colDated.length === 0 && undatedItems.filter(x => x.columnId === col.id).length === 0) {
      html += '    <div class="tl-track-empty"></div>'
    }

    html += '  </div>'
    html += '</div>'
  }

  html += '</div>'

  html += '<div class="tl-row tl-row-add">'
  html += '  <div class="tl-label-add" onclick="addColumnDirect(\'' + b.id + '\')">+ Add Row</div>'
  html += '  <div class="tl-track-add" style="width:' + totalWidth + 'px"></div>'
  html += '</div>'

  html += '</div></div>'

  html += '<div class="tl-us">'
  html += '  <div class="tl-us-header">Unscheduled</div>'
  html += '  <div class="tl-us-body">'
  for (const col of b.columns) {
    const colUndated = undatedItems.filter(x => x.columnId === col.id)
    html += '<div class="tl-us-row" data-col-id="' + col.id + '">'
    html += '  <div class="tl-us-label" draggable="true">' + escapeHtml(col.name) + '</div>'
    html += '  <div class="tl-us-cards">'
    for (const item of colUndated) {
      const c = item.card
      const completed = c.completed ? ' tl-ucard-done' : ''
      html += '    <div class="tl-ucard' + completed + '" draggable="true" data-card-id="' + c.id + '" title="' + escapeHtml(c.title) + '">'
      html += '      <span class="tl-ucard-dot" style="background:' + (PRIORITY_COLORS[c.priority] || '#6b7280') + '"></span>'
      html += '      <span class="tl-ucard-title">' + escapeHtml(c.title) + '</span>'
      if (c.checklists && c.checklists.length > 0) {
        const clDone = c.checklists.filter(function(i) { return i.completed }).length
        const clPct = Math.round((clDone / c.checklists.length) * 100)
        const clAllDone = clDone === c.checklists.length ? ' done' : ''
        html += '      <div class="tl-ucard-cl-progress' + clAllDone + '"><div class="tl-ucard-cl-progress-fill" style="width:' + clPct + '%;background:' + getProgressColor(clPct) + '"></div></div>'
      }
      html += '    </div>'
    }
    html += '  </div>'
    html += '</div>'
  }
  html += '  </div>'
  html += '</div></div>'

  const prevScroll = document.querySelector('.timeline')
  const savedScrollLeft = prevScroll ? prevScroll.scrollLeft : null

  area.innerHTML = html
  initTimelineDrag()
  initTimelineZoom()
  if (!arguments[0]) {
    requestAnimationFrame(function() {
      const scrollTarget = document.querySelector('.timeline')
      if (scrollTarget) {
        if (savedScrollLeft !== null) {
          scrollTarget.scrollLeft = savedScrollLeft
        } else {
          const todayPx = daysBetween(_tlMinDate, now) * DAY_WIDTH
          scrollTarget.scrollLeft = Math.max(0, todayPx - 100)
        }
      }
    })
  }
}

function initTimelineDrag() {
  const area = document.getElementById('boardArea')
  if (!area || area._tlDragDone) return
  area._tlDragDone = true

  area.addEventListener('dragstart', function(e) {
    const ucard = e.target.closest('.tl-ucard')
    if (ucard) {
      _dragCardId = ucard.dataset.cardId
      _dragActiveType = 'ucard'
      e.dataTransfer.setData('text/x-tl-ucard', ucard.dataset.cardId)
      e.dataTransfer.effectAllowed = 'move'
      ucard.classList.add('dragging')
      return
    }
    const rowLabel = e.target.closest('.tl-row-label[draggable]')
    if (rowLabel) {
      _dragActiveType = 'tlrow'
      _dragRowId = rowLabel.dataset.colId
      e.dataTransfer.setData('text/x-tl-row', rowLabel.dataset.colId)
      e.dataTransfer.effectAllowed = 'move'
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      e.dataTransfer.setDragImage(img, 0, 0)
      rowLabel.closest('.tl-row').classList.add('tl-row-dragging')
      return
    }
    const usLabel = e.target.closest('.tl-us-label[draggable]')
    if (usLabel) {
      const usRow = usLabel.closest('.tl-us-row')
      _dragActiveType = 'tlrow'
      _dragRowId = usRow.dataset.colId
      e.dataTransfer.setData('text/x-tl-row', usRow.dataset.colId)
      e.dataTransfer.effectAllowed = 'move'
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      e.dataTransfer.setDragImage(img, 0, 0)
      usRow.classList.add('tl-row-dragging')
      return
    }
  })

  area.addEventListener('dragend', function() {
    removeDragPreview()
    removeRowInsertLine()
    area.querySelectorAll('.dragging, .drag-over, .tl-row-dragging').forEach(function(el) {
      el.classList.remove('dragging', 'drag-over', 'tl-row-dragging')
    })
    _dragCardId = null
    _dragActiveType = null
    _dragRowId = null
  })

  area.addEventListener('dragover', function(e) {
    if (_dragActiveType === 'ucard') {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      const track = e.target.closest('.tl-track')
      if (!track) return
      area.querySelectorAll('.tl-track.drag-over').forEach(function(el) {
        if (el !== track) el.classList.remove('drag-over')
      })
      track.classList.add('drag-over')
      if (_dragCardId) showDragPreview(track, e)
      return
    }
    if (_dragActiveType === 'tlrow') {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      removeRowInsertLine()
      let target = e.target.closest('.tl-row, .tl-us-row')
      if (!target) {
        const body = area.querySelector('.tl-body')
        if (body && body.contains(e.target)) {
          const rows = body.querySelectorAll('.tl-row')
          if (rows.length > 0) target = rows[rows.length - 1]
        } else {
          const us = area.querySelector('.tl-us')
          if (us && us.contains(e.target)) {
            const rows = us.querySelectorAll('.tl-us-row')
            if (rows.length > 0) target = rows[rows.length - 1]
          }
        }
      }
      if (!target) return
      const targetRect = target.getBoundingClientRect()
      const insertBefore = e.clientY < targetRect.top + targetRect.height / 2
      const timelineEl = area.querySelector('.timeline')
      if (timelineEl) {
        const tlRect = timelineEl.getBoundingClientRect()
        const line = getRowInsertLine()
        line.style.display = 'block'
        line.style.left = tlRect.left + 'px'
        line.style.width = tlRect.width + 'px'
        line.style.top = (insertBefore ? targetRect.top - 1 : targetRect.bottom - 1) + 'px'
      }
      return
    }
  })

  area.addEventListener('click', function(e) {
    if (e.target.closest('.tl-bar-resize')) return
    const bar = e.target.closest('.tl-bar')
    if (bar && bar.dataset.cardId) { openCardDetail(bar.dataset.cardId); return }
    const ucard = e.target.closest('.tl-ucard')
    if (ucard && ucard.dataset.cardId) openCardDetail(ucard.dataset.cardId)
  })

  area.addEventListener('dblclick', function(e) {
    const rowLabel = e.target.closest('.tl-row-label')
    if (!rowLabel) return
    const colId = rowLabel.dataset.colId
    const col = findColumn(colId)
    if (!col) return
    const nameSpan = rowLabel.querySelector('.tl-row-name')
    if (!nameSpan) return
    const input = document.createElement('input')
    input.value = col.name
    input.className = 'tl-row-rename-input'
    input.style.cssText = 'background:#12121e;border:1px solid #4f46e5;border-radius:4px;color:#e0e0e8;font-size:14px;font-weight:600;padding:2px 6px;width:100%;outline:none;'
    nameSpan.replaceWith(input)
    input.focus()
    input.select()
    function finish() {
      const val = input.value.trim()
      if (val) { col.name = val; renderTimeline() }
      else renderTimeline()
    }
    input.addEventListener('blur', finish)
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur() }
      if (ev.key === 'Escape') { ev.preventDefault(); renderTimeline() }
    })
  })

  area.addEventListener('dragleave', function(e) {
    if (_dragActiveType === 'ucard') {
      const track = e.target.closest('.tl-track')
      if (track && !track.contains(e.relatedTarget)) track.classList.remove('drag-over')
      return
    }
    if (_dragActiveType === 'tlrow') {
      removeRowInsertLine()
      return
    }
  })

  area.addEventListener('drop', function(e) {
    if (_dragActiveType === 'ucard') {
      e.preventDefault()
      removeDragPreview()
      area.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over') })
      const id = _dragCardId
      _dragCardId = null; _dragActiveType = null
      const track = e.target.closest('.tl-track')
      if (!track) return
      handleUndatedCardDrop(id, track.dataset.colId, e, track)
      return
    }
    if (_dragActiveType === 'tlrow') {
      e.preventDefault()
      removeRowInsertLine()
      area.querySelectorAll('.tl-row-dragging').forEach(function(el) {
        el.classList.remove('tl-row-dragging')
      })
      const draggedColId = _dragRowId
      _dragRowId = null; _dragActiveType = null
      let targetEl = e.target.closest('.tl-row, .tl-us-row')
      let targetColId = targetEl ? targetEl.dataset.colId : null
      if (!targetColId || targetColId === draggedColId) return
      const rect = targetEl.getBoundingClientRect()
      const insertBefore = e.clientY < rect.top + rect.height / 2
      const b = findBoard(state.selectedBoardId)
      if (!b) return
      const draggedIdx = b.columns.findIndex(function(c) { return c.id === draggedColId })
      const targetIdx = b.columns.findIndex(function(c) { return c.id === targetColId })
      if (draggedIdx === -1 || targetIdx === -1) return
      const [moved] = b.columns.splice(draggedIdx, 1)
      const newTargetIdx = b.columns.findIndex(function(c) { return c.id === targetColId })
      b.columns.splice(insertBefore ? newTargetIdx : newTargetIdx + 1, 0, moved)
      renderTimeline()
      return
    }
  })

  area.addEventListener('contextmenu', function(e) {
    if (_moving || _resizing || _dragActiveType || wasRightDragged()) return
    const rowLabel = e.target.closest('.tl-row-label')
    if (rowLabel) {
      e.preventDefault()
      document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
      const menu = document.createElement('div')
      menu.className = 'tl-ctx-menu'
      menu.style.left = e.clientX + 'px'
      menu.style.top = e.clientY + 'px'
      menu.dataset.colId = rowLabel.dataset.colId
      menu.dataset.source = 'rowLabel'
      menu.innerHTML = '<button class="tl-ctx-item tl-ctx-danger" data-action="archive">Archive Row</button>'
      menu.addEventListener('mouseleave', function() { menu.remove() })
      document.body.appendChild(menu)
      return
    }

    const track = e.target.closest('.tl-track')
    if (!track) return
    e.preventDefault()
    document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
    const trackRect = track.getBoundingClientRect()
    const x = e.clientX - trackRect.left
    let newPx = snapPx(x)
    newPx = clamp(newPx, 0, _tlTotalWidth - DAY_WIDTH)
    const bar = e.target.closest('.tl-bar')
    const menu = document.createElement('div')
    menu.className = 'tl-ctx-menu'
    menu.style.left = e.clientX + 'px'
    menu.style.top = e.clientY + 'px'
    menu.dataset.colId = track.dataset.colId
    menu.dataset.dayPx = newPx
    let html = '<button class="tl-ctx-item" data-action="add">Add Card</button>'
    if (window.getCopiedCard()) {
      html += '<button class="tl-ctx-item" data-action="paste">Paste</button>'
    }
    if (bar) {
      menu.dataset.cardId = bar.dataset.cardId
      html += '<div class="tl-ctx-divider"></div>'
      html += '<button class="tl-ctx-item" data-action="copy">Copy</button>'
      html += '<button class="tl-ctx-item" data-action="duplicate">Duplicate</button>'
      html += '<div class="tl-ctx-divider"></div>'
      html += '<button class="tl-ctx-item tl-ctx-danger" data-action="archive">Archive</button>'
    }
    menu.innerHTML = html
    menu.addEventListener('mouseleave', function() { menu.remove() })
    document.body.appendChild(menu)
  })

  area.addEventListener('mousedown', function(e) {
    document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
    if (e.button !== 0) return
    const handle = e.target.closest('.tl-bar-resize')
    if (handle) {
      e.preventDefault()
      const bar = handle.closest('.tl-bar')
      if (!bar) return
      _resizing = {
        cardId: bar.dataset.cardId,
        dir: handle.dataset.resize,
        startX: e.clientX,
        barLeft: bar.offsetLeft,
        barWidth: bar.offsetWidth,
        snapLeft: snapPx(bar.offsetLeft),
        snapRight: snapPx(bar.offsetLeft + bar.offsetWidth)
      }
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      return
    }

    const bar = e.target.closest('.tl-bar')
    if (!bar) return
    e.preventDefault()
    _moving = {
      cardId: bar.dataset.cardId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: bar.offsetLeft,
      origWidth: bar.offsetWidth,
      sourceColId: bar.closest('.tl-track')?.dataset.colId || '',
      targetColId: null,
      targetUnscheduled: false
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  })
}

function initTimelineZoom() {
  const area = document.getElementById('boardArea')
  if (area._tlZoomDone) return
  area._tlZoomDone = true

  area.addEventListener('wheel', function(e) {
    if (state.selectedView !== 'timeline') return
    e.preventDefault()

    const oldWidth = DAY_WIDTH
    const delta = e.deltaY > 0 ? -3 : 3
    const factor = e.deltaY > 0 ? 0.88 : 1.12
    DAY_WIDTH = Math.max(16, Math.min(200, Math.round(DAY_WIDTH * factor)))
    if (DAY_WIDTH === oldWidth) return

    const timelineEl = document.querySelector('.timeline')
    if (!timelineEl) return
    const tlRect = timelineEl.getBoundingClientRect()
    const focalXRaw = e.clientX - tlRect.left + timelineEl.scrollLeft - 200
    const focalDay = focalXRaw / oldWidth

    requestAnimationFrame(function() {
      renderTimeline(true)
      const scrollTarget = document.querySelector('.timeline')
      if (scrollTarget) {
        const newFocalX = focalDay * DAY_WIDTH
        const rect = scrollTarget.getBoundingClientRect()
        scrollTarget.scrollLeft = newFocalX + 200 - (e.clientX - rect.left)
        const underMouse = document.elementFromPoint(e.clientX, e.clientY)
        if (underMouse) {
          const row = underMouse.closest('.tl-row')
          if (row) row.classList.add('tl-row-hover')
        }
      }
      function removeForceHover() {
        area.querySelectorAll('.tl-row-hover').forEach(function(r) { r.classList.remove('tl-row-hover') })
        area.removeEventListener('mouseover', removeForceHover)
      }
      area.addEventListener('mouseover', removeForceHover, { once: true })
    })
  }, { passive: false })
}

document.addEventListener('click', function(e) {
  const item = e.target.closest('.tl-ctx-item')
  if (item) {
    const menu = item.closest('.tl-ctx-menu')
    if (menu) {
      const action = item.dataset.action
      const col = findColumn(menu.dataset.colId)
      const newPx = parseInt(menu.dataset.dayPx, 10)
      if (action === 'add' && col) {
        const existing = menu.dataset.cardId ? findCard(menu.dataset.cardId) : null
        const date = existing ? parseDate(existing.startDate) || parseDate(existing.endDate) || new Date() : pixelToDate(newPx)
        const endDate = existing ? parseDate(existing.endDate) || parseDate(existing.startDate) || new Date(date.getTime() + 86400000) : new Date(date.getTime() + 86400000)
        const card = { id: genId(), title: 'New Card', description: '', completed: false, startDate: formatDate(date), endDate: formatDate(endDate), priority: 'medium', tags: [], members: [], checklists: [] }
        col.cards.push(card)
        renderTimeline()
      } else if (action === 'copy') {
        window.copyCard(menu.dataset.cardId)
      } else if (action === 'paste' && col && !Number.isNaN(newPx) && window.getCopiedCard()) {
        const clipCard = window.getCopiedCard()
        const pasteCard = JSON.parse(JSON.stringify(clipCard))
        pasteCard.id = genId()
        const date = pixelToDate(newPx)
        pasteCard.startDate = formatDate(date)
        const newEnd = new Date(date)
        const s = parseDate(clipCard.startDate) || parseDate(clipCard.endDate)
        const ee = parseDate(clipCard.endDate) || parseDate(clipCard.startDate)
        const duration = s && ee ? daysBetween(s, ee) : 1
        newEnd.setDate(newEnd.getDate() + duration)
        pasteCard.endDate = formatDate(newEnd)
        col.cards.push(pasteCard)
        renderTimeline()
      } else if (action === 'paste' && menu.dataset.cardId && window.getCopiedCard()) {
        window.pasteCard(menu.dataset.cardId)
      } else if (action === 'paste' && menu.dataset.colId && window.getCopiedCard()) {
        window.pasteIntoColumn(menu.dataset.colId)
      } else if (action === 'duplicate') {
        window.duplicateCard(menu.dataset.cardId)
      } else if (action === 'archive') {
        if (menu.dataset.cardId) {
          window.archiveCard(menu.dataset.cardId)
        } else {
          const b = findBoard(state.selectedBoardId)
          if (b) {
            const colIdx = b.columns.findIndex(function(c) { return c.id === menu.dataset.colId })
            if (colIdx !== -1) {
              const archived = b.columns.splice(colIdx, 1)[0]
              if (!b.archivedColumns) b.archivedColumns = []
              b.archivedColumns.push(archived)
              renderTimeline()
            }
          }
        }
      }
    }
  }
  document.querySelectorAll('.tl-ctx-menu').forEach(function(el) { el.remove() })
})

document.addEventListener('mousemove', function(e) {
  if (_resizing) {
    const { cardId, dir, startX, barLeft, barWidth, snapLeft: sLeft, snapRight: sRight } = _resizing
    const bar = document.querySelector('.tl-bar[data-card-id="' + cardId + '"]')
    if (!bar) return
    const dx = e.clientX - startX
    let newLeft, newWidth
    if (dir === 'start') {
      let snapped = snapPx(barLeft + dx)
      snapped = clamp(snapped, 0, sRight - DAY_WIDTH)
      newLeft = snapped; newWidth = sRight - snapped
    } else {
      let snapped = snapPx(barLeft + barWidth + dx)
      snapped = clamp(snapped, sLeft + DAY_WIDTH, _tlTotalWidth)
      newLeft = sLeft; newWidth = snapped - sLeft
    }
    bar.style.left = newLeft + 'px'
    bar.style.width = newWidth + 'px'
    bar.classList.add('resizing')
    return
  }

  if (_moving) {
    e.preventDefault()
    const bar = document.querySelector('.tl-bar[data-card-id="' + _moving.cardId + '"]')
    if (!bar) return

    const timeline = document.querySelector('.timeline')
    if (timeline) {
      const rect = timeline.getBoundingClientRect()
      const edgeZone = 50
      let scrollSpeed = 0
      if (e.clientX < rect.left + edgeZone) {
        scrollSpeed = -Math.ceil((rect.left + edgeZone - e.clientX) / 15)
      } else if (e.clientX > rect.right - edgeZone) {
        scrollSpeed = Math.ceil((e.clientX - (rect.right - edgeZone)) / 15)
      }
      if (scrollSpeed !== 0) {
        timeline.scrollLeft += scrollSpeed
        _moving.startX += scrollSpeed
      }
    }

    let newLeft = snapPx(_moving.origLeft + (e.clientX - _moving.startX))
    newLeft = clamp(newLeft, 0, _tlTotalWidth - _moving.origWidth)
    bar.style.left = newLeft + 'px'
    bar.classList.add('moving')

    const tracks = document.querySelectorAll('.tl-track')
    let targetTrack = null
    for (const t of tracks) {
      const r = t.getBoundingClientRect()
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        targetTrack = t
        break
      }
    }
    for (const t of tracks) {
      if (t !== targetTrack) t.classList.remove('drag-over')
    }

    const usRows = document.querySelectorAll('.tl-us-row')
    let targetUsRow = null
    for (const r of usRows) {
      const rr = r.getBoundingClientRect()
      if (e.clientY >= rr.top && e.clientY <= rr.bottom) {
        targetUsRow = r
        break
      }
    }
    for (const r of usRows) {
      if (r !== targetUsRow) r.classList.remove('drag-over-us')
    }

    if (targetTrack) {
      targetTrack.classList.add('drag-over')
      _moving.targetColId = targetTrack.dataset.colId
      _moving.targetUnscheduled = false
    } else if (targetUsRow) {
      targetUsRow.classList.add('drag-over-us')
      _moving.targetColId = targetUsRow.dataset.colId
      _moving.targetUnscheduled = true
    } else {
      _moving.targetColId = null
      _moving.targetUnscheduled = false
    }

    const card = findCard(_moving.cardId)
    if (card) {
      if (_moving.targetColId && _moving.targetColId !== _moving.sourceColId) {
        const sourceCol = findCardColumn(card.id)
        if (sourceCol) {
          const idx = sourceCol.cards.indexOf(card)
          if (idx !== -1) sourceCol.cards.splice(idx, 1)
        }
        const targetCol = findColumn(_moving.targetColId)
        if (targetCol) targetCol.cards.push(card)
        const targetTrack = document.querySelector('.tl-track[data-col-id="' + _moving.targetColId + '"]')
        if (targetTrack && bar.parentNode !== targetTrack) {
          targetTrack.appendChild(bar)
        }
        _moving.sourceColId = _moving.targetColId
      }
    }
  }
})

document.addEventListener('mouseup', function() {
  if (_resizing) {
    const { cardId, dir } = _resizing
    const bar = document.querySelector('.tl-bar[data-card-id="' + cardId + '"]')
    if (bar) {
      const newLeft = snapPx(bar.offsetLeft)
      const newWidth = snapPx(bar.offsetLeft + bar.offsetWidth) - newLeft
      const card = findCard(cardId)
      if (card) {
        if (dir === 'start') {
          card.startDate = formatDate(pixelToDate(newLeft))
          if (card.endDate) {
            const endD = parseDate(card.endDate)
            const startD = parseDate(card.startDate)
            if (endD < startD) card.endDate = card.startDate
          }
        } else {
          card.endDate = formatDate(pixelToDate(newLeft + newWidth))
          if (card.startDate) {
            const startD = parseDate(card.startDate)
            const endD = parseDate(card.endDate)
            if (endD < startD) card.startDate = card.endDate
          }
        }
        bar.classList.remove('resizing')
        renderTimeline()
      }
    }
    _resizing = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    return
  }

  if (_moving) {
    const bar = document.querySelector('.tl-bar[data-card-id="' + _moving.cardId + '"]')
    if (bar) {
      const newLeft = snapPx(bar.offsetLeft)
      const card = findCard(_moving.cardId)
      if (card) {
        const s = parseDate(card.startDate) || parseDate(card.endDate)
        const e = parseDate(card.endDate) || parseDate(card.startDate)
        const duration = daysBetween(s, e)
        const newStart = pixelToDate(newLeft)
        card.startDate = formatDate(newStart)
        const newEnd = new Date(newStart)
        newEnd.setDate(newEnd.getDate() + duration)
        card.endDate = formatDate(newEnd)

        if (_moving.targetColId && _moving.targetColId !== _moving.sourceColId) {
          const sourceCol = findCardColumn(card.id)
          if (sourceCol) {
            const idx = sourceCol.cards.indexOf(card)
            if (idx !== -1) sourceCol.cards.splice(idx, 1)
          }
          const targetCol = findColumn(_moving.targetColId)
          if (targetCol) targetCol.cards.push(card)
        }

        if (_moving.targetUnscheduled) {
          card.startDate = null
          card.endDate = null
        }

        bar.classList.remove('moving')
        renderTimeline()
      }
    }
    document.querySelectorAll('.tl-track.drag-over').forEach(function(el) {
      el.classList.remove('drag-over')
    })
    document.querySelectorAll('.tl-us-row.drag-over-us').forEach(function(el) {
      el.classList.remove('drag-over-us')
    })
    _moving = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
})

function showDragPreview(track, e) {
  removeDragPreview()
  if (!_dragCardId) return
  const card = findCard(_dragCardId)
  if (!card) return

  const cardStart = parseDate(card.startDate)
  const cardEnd = parseDate(card.endDate)
  if (!cardStart && !cardEnd) return
  const start = cardStart || cardEnd
  const end = cardEnd || cardStart
  let previewWidth = daysBetween(start, end) * DAY_WIDTH

  const trackRect = track.getBoundingClientRect()
  const x = e.clientX - trackRect.left
  let newLeft = snapPx(x)
  newLeft = clamp(newLeft, 0, _tlTotalWidth - previewWidth)

  const preview = document.createElement('div')
  preview.className = 'tl-bar-preview'
  preview.style.left = newLeft + 'px'
  preview.style.width = previewWidth + 'px'
  track.appendChild(preview)
}

function removeDragPreview() {
  document.querySelectorAll('.tl-bar-preview').forEach(function(el) { el.remove() })
}

function handleUndatedCardDrop(cardId, targetColId, e, track) {
  const card = findCard(cardId)
  if (!card) return

  const trackRect = track.getBoundingClientRect()
  const x = e.clientX - trackRect.left
  let newPx = snapPx(x)
  newPx = clamp(newPx, 0, _tlTotalWidth - DAY_WIDTH)
  const date = pixelToDate(newPx)
  const dateStr = formatDate(date)
  card.startDate = dateStr
  card.endDate = dateStr

  const sourceCol = findCardColumn(cardId)
  if (sourceCol) {
    const idx = sourceCol.cards.indexOf(card)
    if (idx !== -1) sourceCol.cards.splice(idx, 1)
  }
  const targetCol = findColumn(targetColId)
  if (targetCol) targetCol.cards.push(card)

  renderTimeline()
}
