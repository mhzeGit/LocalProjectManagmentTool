import { state, findBoard, findColumn, findCard, findCardColumn } from './data.js'
import { escapeHtml } from './utils.js'
import { openCardDetail } from './modal.js'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const PRIORITY_COLORS = {
  none: '#6b7280',
  low: '#22c55e',
  medium: '#3b82f6',
  high: '#f59e0b',
  urgent: '#ef4444'
}
const DAY_WIDTH = 36

let _tlMinDate = null
let _tlTotalWidth = 0
let _resizing = null
let _dragStartX = 0
let _dragStartY = 0
let _dragCardId = null

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

  if (datedItems.length > 0) {
    const allDates = []
    for (const item of datedItems) {
      if (item.card.startDate) allDates.push(parseDate(item.card.startDate))
      if (item.card.endDate) allDates.push(parseDate(item.card.endDate))
    }
    _tlMinDate = new Date(Math.min(...allDates))
    const maxDate = new Date(Math.max(...allDates))
    _tlMinDate.setDate(_tlMinDate.getDate() - 7)
    maxDate.setDate(maxDate.getDate() + 14)
    _tlTotalWidth = Math.max(daysBetween(_tlMinDate, maxDate), 28) * DAY_WIDTH
  } else {
    _tlMinDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
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

  const weekMarkers = []
  const wCursor = new Date(_tlMinDate)
  wCursor.setDate(wCursor.getDate() - wCursor.getDay())
  while (wCursor <= absMaxDate) {
    const left = daysBetween(_tlMinDate, wCursor) * DAY_WIDTH
    if (left > 0 && left < totalWidth) weekMarkers.push({ left })
    wCursor.setDate(wCursor.getDate() + 7)
  }

  const todayLeft = daysBetween(_tlMinDate, now) * DAY_WIDTH
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
    html += '  <div class="tl-track" data-col-id="' + col.id + '" style="width:' + totalWidth + 'px">'

    for (const item of colDated) {
      const c = item.card
      const s = parseDate(c.startDate)
      const e = parseDate(c.endDate)
      if (!s && !e) continue
      const start = s || e
      const end = e || s
      let barLeft = daysBetween(_tlMinDate, start) * DAY_WIDTH
      let barWidth = Math.max(DAY_WIDTH, (daysBetween(start, end) + 1) * DAY_WIDTH)
      if (barLeft < 0) { barWidth += barLeft; barLeft = 0 }
      if (barLeft + barWidth > totalWidth) barWidth = totalWidth - barLeft
      if (barWidth <= DAY_WIDTH * 0.5) continue

      const color = PRIORITY_COLORS[c.priority] || PRIORITY_COLORS.medium
      const completed = c.completed ? ' tl-bar-done' : ''
      const barLabel = c.title.length > 25 ? c.title.slice(0, 24) + '\u2026' : c.title

      html += '    <div class="tl-bar' + completed + '" draggable="true" data-card-id="' + c.id + '" style="left:' + barLeft + 'px;width:' + barWidth + 'px;background:' + color + '" title="' + escapeHtml(c.title) + ' \u00b7 ' + (c.startDate || 'no date') + ' \u2192 ' + (c.endDate || 'no date') + '">'
      html += '      <div class="tl-bar-resize tl-bar-resize-l" data-resize="start"></div>'
      if (barWidth > 28) {
        html += '      <span class="tl-bar-title">' + escapeHtml(barLabel) + '</span>'
      }
      if (barWidth > 90 && c.startDate && c.endDate) {
        html += '      <span class="tl-bar-dates">' + formatShortDate(c.startDate) + ' - ' + formatShortDate(c.endDate) + '</span>'
      }
      html += '      <div class="tl-bar-resize tl-bar-resize-r" data-resize="end"></div>'
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
      html += '  <div class="tl-track" data-col-id="' + col.id + '" style="width:' + totalWidth + 'px">'
      for (const item of colUndated) {
        const c = item.card
        const completed = c.completed ? ' tl-ucard-done' : ''
        html += '    <div class="tl-ucard' + completed + '" draggable="true" data-card-id="' + c.id + '" title="' + escapeHtml(c.title) + '">'
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
  initTimelineDrag()
}

function initTimelineDrag() {
  const area = document.getElementById('boardArea')
  if (!area || area._tlDragDone) return
  area._tlDragDone = true

  area.addEventListener('dragstart', function(e) {
    if (e.target.closest('.tl-bar-resize')) {
      e.preventDefault()
      return
    }
    const bar = e.target.closest('.tl-bar')
    if (bar) {
      _dragStartX = e.clientX
      _dragStartY = e.clientY
      _dragCardId = bar.dataset.cardId
      e.dataTransfer.setData('text/x-tl-card', bar.dataset.cardId)
      e.dataTransfer.effectAllowed = 'move'
      bar.classList.add('dragging')
      return
    }
    const ucard = e.target.closest('.tl-ucard')
    if (ucard) {
      _dragStartX = e.clientX
      _dragStartY = e.clientY
      _dragCardId = ucard.dataset.cardId
      e.dataTransfer.setData('text/x-tl-ucard', ucard.dataset.cardId)
      e.dataTransfer.effectAllowed = 'move'
      ucard.classList.add('dragging')
    }
  })

  area.addEventListener('dragend', function(e) {
    removeDragPreview()
    area.querySelectorAll('.dragging, .drag-over').forEach(function(el) {
      el.classList.remove('dragging', 'drag-over')
    })
    _dragCardId = null
  })

  area.addEventListener('dragover', function(e) {
    const track = e.target.closest('.tl-track')
    if (!track) return
    const hasCard = e.dataTransfer.types.includes('text/x-tl-card')
    const hasUcard = e.dataTransfer.types.includes('text/x-tl-ucard')
    if (!hasCard && !hasUcard) return

    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    area.querySelectorAll('.tl-track.drag-over').forEach(function(el) {
      if (el !== track) el.classList.remove('drag-over')
    })
    track.classList.add('drag-over')

    if (_dragCardId) {
      showDragPreview(track, e)
    }
  })

  area.addEventListener('click', function(e) {
    if (e.target.closest('.tl-bar-resize')) return
    const bar = e.target.closest('.tl-bar')
    if (bar && bar.dataset.cardId) {
      openCardDetail(bar.dataset.cardId)
      return
    }
    const ucard = e.target.closest('.tl-ucard')
    if (ucard && ucard.dataset.cardId) {
      openCardDetail(ucard.dataset.cardId)
    }
  })

  area.addEventListener('dragleave', function(e) {
    const track = e.target.closest('.tl-track')
    if (track && !track.contains(e.relatedTarget)) {
      track.classList.remove('drag-over')
    }
  })

  area.addEventListener('drop', function(e) {
    e.preventDefault()
    removeDragPreview()
    area.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over') })
    _dragCardId = null

    const track = e.target.closest('.tl-track')
    if (!track) return
    const targetColId = track.dataset.colId
    if (!targetColId) return

    const cardId = e.dataTransfer.getData('text/x-tl-card')
    if (cardId) {
      handleDatedCardDrop(cardId, targetColId, e, track)
      return
    }

    const ucardId = e.dataTransfer.getData('text/x-tl-ucard')
    if (ucardId) {
      handleUndatedCardDrop(ucardId, targetColId, e, track)
      return
    }
  })

  area.addEventListener('mousedown', function(e) {
    const handle = e.target.closest('.tl-bar-resize')
    if (!handle) return
    e.preventDefault()
    const bar = handle.closest('.tl-bar')
    if (!bar) return
    const cardId = bar.dataset.cardId
    const dir = handle.dataset.resize
    const track = bar.closest('.tl-track')
    if (!track) return
    const trackRect = track.getBoundingClientRect()
    const barLeft = bar.offsetLeft
    const barWidth = bar.offsetWidth

    _resizing = {
      cardId, dir,
      startX: e.clientX,
      barLeft, barWidth,
      trackLeft: trackRect.left,
      snapLeft: snapPx(barLeft),
      snapRight: snapPx(barLeft + barWidth)
    }
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  })
}

document.addEventListener('mousemove', function(e) {
  if (!_resizing) return
  const { cardId, dir, startX, barLeft, barWidth, trackLeft, snapLeft: sLeft, snapRight: sRight } = _resizing
  const bar = document.querySelector('.tl-bar[data-card-id="' + cardId + '"]')
  if (!bar) return

  const dx = e.clientX - startX
  let newLeft, newWidth

  if (dir === 'start') {
    let rawLeft = barLeft + dx
    let snapped = snapPx(rawLeft)
    snapped = clamp(snapped, 0, sRight - DAY_WIDTH)
    newLeft = snapped
    newWidth = sRight - snapped
  } else {
    let rawRight = barLeft + barWidth + dx
    let snapped = snapPx(rawRight)
    snapped = clamp(snapped, sLeft + DAY_WIDTH, _tlTotalWidth)
    newLeft = sLeft
    newWidth = snapped - sLeft
  }

  bar.style.left = newLeft + 'px'
  bar.style.width = newWidth + 'px'
  bar.classList.add('resizing')
})

document.addEventListener('mouseup', function(e) {
  if (!_resizing) return
  const { cardId, dir } = _resizing

  const bar = document.querySelector('.tl-bar[data-card-id="' + cardId + '"]')
  if (bar) {
    const track = bar.closest('.tl-track')
    if (track) {
      const newLeft = snapPx(bar.offsetLeft)
      const newWidth = snapPx(bar.offsetLeft + bar.offsetWidth) - newLeft

      const card = findCard(cardId)
      if (card) {
        if (dir === 'start') {
          card.startDate = formatDate(pixelToDate(newLeft))
          if (card.endDate) {
            const endD = parseDate(card.endDate)
            const startD = parseDate(card.startDate)
            if (endD < startD) {
              card.endDate = card.startDate
            }
          }
        } else {
          card.endDate = formatDate(pixelToDate(newLeft + newWidth - 1))
          if (card.startDate) {
            const startD = parseDate(card.startDate)
            const endD = parseDate(card.endDate)
            if (endD < startD) {
              card.startDate = card.endDate
            }
          }
        }
        bar.classList.remove('resizing')
        renderTimeline()
      }
    }
  }

  _resizing = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
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
  let previewWidth = (daysBetween(start, end) + 1) * DAY_WIDTH

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

function handleDatedCardDrop(cardId, targetColId, e, track) {
  const card = findCard(cardId)
  if (!card) return
  const sourceCol = findCardColumn(cardId)

  const dx = Math.abs(e.clientX - _dragStartX)
  const dy = Math.abs(e.clientY - _dragStartY)
  const isVertical = dy > dx && sourceCol && sourceCol.id !== targetColId

  if (isVertical) {
    if (sourceCol && sourceCol.id !== targetColId) {
      const idx = sourceCol.cards.indexOf(card)
      if (idx !== -1) sourceCol.cards.splice(idx, 1)
      const targetCol = findColumn(targetColId)
      if (targetCol) targetCol.cards.push(card)
    }
  } else {
    if (sourceCol && sourceCol.id !== targetColId) {
      const idx = sourceCol.cards.indexOf(card)
      if (idx !== -1) sourceCol.cards.splice(idx, 1)
      const targetCol = findColumn(targetColId)
      if (targetCol) targetCol.cards.push(card)
    }

    const trackRect = track.getBoundingClientRect()
    const x = e.clientX - trackRect.left
    let newStartPx = snapPx(x)
    newStartPx = clamp(newStartPx, 0, _tlTotalWidth - DAY_WIDTH)
    const newStart = pixelToDate(newStartPx)

    if (card.startDate && card.endDate) {
      const oldStart = parseDate(card.startDate)
      const oldEnd = parseDate(card.endDate)
      const duration = daysBetween(oldStart, oldEnd)
      card.startDate = formatDate(newStart)
      const newEnd = new Date(newStart)
      newEnd.setDate(newEnd.getDate() + duration)
      card.endDate = formatDate(newEnd)
    } else if (card.startDate) {
      card.startDate = formatDate(newStart)
    } else if (card.endDate) {
      card.endDate = formatDate(newStart)
    }
  }

  renderTimeline()
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
