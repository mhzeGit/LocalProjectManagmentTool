import { findBoard, findColumn, findCard, findCardColumn, state } from './data.js'
import { openCardDetail } from './modal.js'

let _dragActive = false
let _dragCardHeight = 0
let _dragTimer = null
let _dragGhostEl = null
let _dragOffsetX = 0
let _dragOffsetY = 0
let _renderFn = null

let _colGhostEl = null
let _colOffsetX = 0
let _colOffsetY = 0
let _colIndicatorEl = null
let _colInsertPos = null

export function initDragDrop(renderFn) {
  _renderFn = renderFn
  const board = document.getElementById('boardArea')
  if (board._dragInited) return
  board._dragInited = true

  board.addEventListener('dragstart', function(e) {
    const card = e.target.closest('.card')
    if (card && card.closest('.board-column')) {
      _dragActive = true
      _dragCardHeight = card.offsetHeight
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-card', card.dataset.cardId)
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      e.dataTransfer.setDragImage(img, 0, 0)
      const rect = card.getBoundingClientRect()
      _dragOffsetX = e.clientX - rect.left
      _dragOffsetY = e.clientY - rect.top
      _dragGhostEl = card.cloneNode(true)
      _dragGhostEl.style.cssText = 'position:fixed;opacity:0.85;transform:rotate(3deg) scale(1.02);width:' + card.offsetWidth + 'px;border-radius:6px;background:#26263a;border:1px solid #4f46e5;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,0.5);pointer-events:none;z-index:99999;'
      _dragGhostEl.style.left = (e.clientX - _dragOffsetX) + 'px'
      _dragGhostEl.style.top = (e.clientY - _dragOffsetY) + 'px'
      document.body.appendChild(_dragGhostEl)
      _dragTimer = setTimeout(function() {
        card.classList.add('dragging')
        requestAnimationFrame(function() { card.classList.add('dragging-collapsed') })
      }, 0)
      return
    }
    const col = e.target.closest('.board-column:not(.add-column)')
    if (col && !e.target.closest('.column-header button') && !e.target.closest('.card') && !e.target.closest('.column-footer') && !e.target.closest('.col-menu')) {
      _dragActive = true
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/x-column', col.dataset.columnId)
      const rect = col.getBoundingClientRect()
      _colOffsetX = e.clientX - rect.left
      _colOffsetY = e.clientY - rect.top
      _colGhostEl = col.cloneNode(true)
      _colGhostEl.style.cssText = 'position:fixed;opacity:0.92;transform:rotate(0.5deg) scale(1.01);width:' + col.offsetWidth + 'px;border-radius:8px;background:#1e1e2e;border:2px solid #4f46e5;box-shadow:0 12px 40px rgba(0,0,0,0.45);pointer-events:none;z-index:99999;overflow:hidden;'
      _colGhostEl.style.left = (e.clientX - _colOffsetX) + 'px'
      _colGhostEl.style.top = (e.clientY - _colOffsetY) + 'px'
      document.body.appendChild(_colGhostEl)
      col.classList.add('dragging')
      return
    }
    e.preventDefault()
  })

  function cleanupDrag() {
    if (_dragTimer) { clearTimeout(_dragTimer); _dragTimer = null }
    _dragActive = false
    _dragCardHeight = 0
    if (_dragGhostEl) { _dragGhostEl.remove(); _dragGhostEl = null }
    if (_colGhostEl) { _colGhostEl.remove(); _colGhostEl = null }
    if (_colIndicatorEl) { _colIndicatorEl.remove(); _colIndicatorEl = null }
    _colInsertPos = null
    const b = document.getElementById('boardArea')
    if (b) {
      b.querySelectorAll('.dragging, .drag-over').forEach(function(el) { el.classList.remove('dragging', 'drag-over') })
      b.querySelectorAll('.dragging-collapsed').forEach(function(el) { el.classList.remove('dragging-collapsed') })
      b.querySelectorAll('.card-placeholder').forEach(function(el) { el.remove() })
      b.querySelectorAll('.col-drop-indicator').forEach(function(el) { el.remove() })
    }
  }
  document.addEventListener('dragend', cleanupDrag)
  document.addEventListener('mouseup', function() { if (_dragGhostEl || _colGhostEl) cleanupDrag() })

  board.addEventListener('dragenter', function(e) {
    if (e.target.closest('.board-column:not(.add-column), .column-cards')) e.preventDefault()
  })

  board.addEventListener('dragover', function(e) {
    if (_dragGhostEl) {
      _dragGhostEl.style.left = (e.clientX - _dragOffsetX) + 'px'
      _dragGhostEl.style.top = (e.clientY - _dragOffsetY) + 'px'
    }
    if (_colGhostEl) {
      _colGhostEl.style.left = (e.clientX - _colOffsetX) + 'px'
      _colGhostEl.style.top = (e.clientY - _colOffsetY) + 'px'
    }
    if (!e.target.closest('.board-column:not(.add-column), .column-cards')) return
    e.preventDefault()
    if (!e.dataTransfer.types) return
    if (e.dataTransfer.types.includes('text/x-card')) {
      const colEl = e.target.closest('.board-column:not(.add-column)')
      if (colEl) {
        const zone = colEl.querySelector('.column-cards')
        zone.classList.add('drag-over')
        if (!zone.querySelector('.card-placeholder') && _dragCardHeight) {
          const ph = document.createElement('div')
          ph.className = 'card-placeholder'
          ph.style.cssText = 'border-radius:6px;margin-bottom:8px;border:1px dashed #4f46e5;height:' + _dragCardHeight + 'px;'
          zone.appendChild(ph)
        }
      }
    }
    if (e.dataTransfer.types.includes('text/x-column')) {
      const container = board.querySelector('.board-columns')
      if (!container) return

      const cols = container.querySelectorAll('.board-column:not(.add-column)')
      let targetCol = null
      let insertSide = 'left'

      for (const c of cols) {
        const r = c.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right) {
          targetCol = c
          insertSide = e.clientX < r.left + r.width / 2 ? 'left' : 'right'
          break
        }
      }

      if (!targetCol && cols.length > 0) {
        const first = cols[0].getBoundingClientRect()
        const last = cols[cols.length - 1].getBoundingClientRect()
        if (e.clientX < first.left) {
          targetCol = cols[0]
          insertSide = 'left'
        } else if (e.clientX > last.right) {
          targetCol = cols[cols.length - 1]
          insertSide = 'right'
        }
      }

      const posKey = targetCol ? targetCol.dataset.columnId + '-' + insertSide : null
      if (posKey === _colInsertPos) return

      if (_colIndicatorEl) { _colIndicatorEl.remove(); _colIndicatorEl = null }

      if (targetCol) {
        const indicator = document.createElement('div')
        indicator.className = 'col-drop-indicator'
        if (insertSide === 'left') {
          container.insertBefore(indicator, targetCol)
        } else {
          container.insertBefore(indicator, targetCol.nextSibling)
        }
        _colIndicatorEl = indicator
        _colInsertPos = posKey
      } else {
        _colInsertPos = null
      }
    }
  })

  board.addEventListener('dragleave', function(e) {
    const colEl = e.target.closest('.board-column:not(.add-column)')
    if (!colEl) return
    if (e.relatedTarget && colEl.contains(e.relatedTarget)) return
    colEl.classList.remove('drag-over')
    const zone = colEl.querySelector('.column-cards')
    if (zone) { zone.classList.remove('drag-over'); const ph = zone.querySelector('.card-placeholder'); if (ph) ph.remove() }
  })

  board.addEventListener('drop', function(e) {
    e.preventDefault()
    if (_dragGhostEl) { _dragGhostEl.remove(); _dragGhostEl = null }
    if (_colGhostEl) { _colGhostEl.remove(); _colGhostEl = null }
    board.querySelectorAll('.card-placeholder').forEach(function(el) { el.remove() })

    const cardId = e.dataTransfer.getData('text/x-card')
    if (cardId) {
      let colEl = e.target.closest('.board-column:not(.add-column)')
      if (!colEl) {
        const ptr = document.elementFromPoint(e.clientX, e.clientY)
        if (ptr) colEl = ptr.closest('.board-column:not(.add-column)')
        if (!colEl) return
      }
      const targetZone = colEl.querySelector('.column-cards')
      if (!targetZone) return
      const targetColId = targetZone.dataset.colId
      const targetCol = findColumn(targetColId)
      const sourceCol = findCardColumn(cardId)
      if (!sourceCol || !targetCol || sourceCol.id === targetCol.id) return
      const card = findCard(cardId)
      if (!card) return
      const idx = sourceCol.cards.findIndex(function(c) { return c.id === cardId })
      if (idx !== -1) sourceCol.cards.splice(idx, 1)
      targetCol.cards.push(card)
      if (_renderFn) _renderFn()
      return
    }

    const columnId = e.dataTransfer.getData('text/x-column')
    if (columnId) {
      const container = board.querySelector('.board-columns')
      if (!container) return
      const draggedCol = container.querySelector('.board-column[data-column-id="' + columnId + '"]')
      if (!draggedCol) return

      if (_colIndicatorEl) {
        const indicator = _colIndicatorEl
        _colIndicatorEl = null
        _colInsertPos = null

        if (indicator.previousElementSibling === draggedCol || indicator.nextElementSibling === draggedCol) return

        const allCols = container.querySelectorAll('.board-column:not(.add-column)')
        const oldPositions = Array.from(allCols).map(function(el) {
          return { el: el, rect: el.getBoundingClientRect() }
        })

        container.insertBefore(draggedCol, indicator)
        indicator.remove()

        const newCols = container.querySelectorAll('.board-column:not(.add-column)')
        const newPositions = Array.from(newCols).map(function(el) {
          return { el: el, rect: el.getBoundingClientRect() }
        })

        newPositions.forEach(function(newItem) {
          const oldItem = oldPositions.find(function(o) { return o.el === newItem.el })
          if (oldItem) {
            const dx = oldItem.rect.left - newItem.rect.left
            const dy = oldItem.rect.top - newItem.rect.top
            if (dx !== 0 || dy !== 0) {
              newItem.el.style.transition = 'none'
              newItem.el.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)'
            }
          }
        })

        container.offsetHeight

        newPositions.forEach(function(newItem) {
          newItem.el.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)'
          newItem.el.style.transform = 'translate(0, 0)'
        })

        setTimeout(function() {
          newPositions.forEach(function(item) {
            item.el.style.transition = ''
            item.el.style.transform = ''
          })
        }, 400)

        const b = findBoard(state.selectedBoardId)
        if (!b) return
        const oldIdx = b.columns.findIndex(function(c) { return c.id === columnId })
        const newIdx = Array.from(newCols).findIndex(function(el) { return el.dataset.columnId === columnId })
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          const moved = b.columns.splice(oldIdx, 1)[0]
          b.columns.splice(newIdx, 0, moved)
        }
      }
    }
  })

  board.addEventListener('click', function(e) {
    if (_dragActive) { _dragActive = false; return }
    const card = e.target.closest('.card')
    if (card && card.dataset.cardId) {
      openCardDetail(card.dataset.cardId)
    }
  })
}
