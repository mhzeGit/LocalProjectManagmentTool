import { findBoard, findColumn, findCard, findCardColumn, state } from './data.js'
import { openCardDetail } from './modal.js'

let _dragActive = false
let _dragCardHeight = 0
let _dragTimer = null
let _dragGhostEl = null
let _dragOffsetX = 0
let _dragOffsetY = 0
let _renderFn = null

let _colOriginalIdx = -1
let _colCurrentPosKey = null
let _colFlipTimer = null
let _colDraggedId = null
let _colGrabOffsetX = 0
let _colDomLeft = 0

export function initDragDrop(renderFn) {
  _renderFn = renderFn
  const board = document.getElementById('boardArea')
  if (board._dragInited) return
  board._dragInited = true

  board.addEventListener('dragstart', function(e) {
    if (state.selectedView !== 'kanban') return
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
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      e.dataTransfer.setDragImage(img, 0, 0)
      e.dataTransfer.setData('text/x-column', col.dataset.columnId)
      _colDraggedId = col.dataset.columnId
      const colRect = col.getBoundingClientRect()
      _colGrabOffsetX = e.clientX - colRect.left
      _colDomLeft = colRect.left
      const container = board.querySelector('.board-columns')
      if (container) {
        const allCols = container.querySelectorAll('.board-column:not(.add-column)')
        _colOriginalIdx = Array.from(allCols).indexOf(col)
      }
      return
    }
    e.preventDefault()
  })

  function clearFlipTransforms(container) {
    if (!container) container = document.getElementById('boardArea')
    container.querySelectorAll('.board-column').forEach(function(el) {
      if (_colDraggedId && el.dataset.columnId === _colDraggedId) return
      el.style.transition = ''
      el.style.transform = ''
    })
  }

  function cleanupDrag() {
    if (_dragTimer) { clearTimeout(_dragTimer); _dragTimer = null }
    if (_colFlipTimer) { clearTimeout(_colFlipTimer); _colFlipTimer = null }
    _dragActive = false
    _dragCardHeight = 0
    if (_dragGhostEl) { _dragGhostEl.remove(); _dragGhostEl = null }
    _colOriginalIdx = -1
    _colCurrentPosKey = null
    _colDraggedId = null
    _colGrabOffsetX = 0
    _colDomLeft = 0
    const b = document.getElementById('boardArea')
    if (b) {
      b.querySelectorAll('.board-column').forEach(function(el) {
        el.style.transition = ''
        el.style.transform = ''
        el.style.zIndex = ''
      })
      b.querySelectorAll('.dragging, .drag-over').forEach(function(el) { el.classList.remove('dragging', 'drag-over') })
      b.querySelectorAll('.dragging-collapsed').forEach(function(el) { el.classList.remove('dragging-collapsed') })
      b.querySelectorAll('.card-placeholder').forEach(function(el) { el.remove() })
    }
  }
  document.addEventListener('dragend', cleanupDrag)
  document.addEventListener('mouseup', function() { if (_dragGhostEl) cleanupDrag() })

  board.addEventListener('dragenter', function(e) {
    if (e.target.closest('.board-column, .column-cards')) e.preventDefault()
  })

  function flipColumn(container, draggedCol, insertBeforeNode, columnId) {
    if (_colFlipTimer) { clearTimeout(_colFlipTimer); _colFlipTimer = null }

    draggedCol.style.transition = 'none'
    draggedCol.style.transform = 'none'

    const allCols = container.querySelectorAll('.board-column:not(.add-column)')
    const oldPositions = Array.from(allCols).map(function(el) {
      return { el: el, rect: el.getBoundingClientRect() }
    })

    container.insertBefore(draggedCol, insertBeforeNode)

    _colDomLeft = draggedCol.getBoundingClientRect().left

    const newCols = container.querySelectorAll('.board-column:not(.add-column)')
    const newPositions = Array.from(newCols).map(function(el) {
      return { el: el, rect: el.getBoundingClientRect() }
    })

    newPositions.forEach(function(newItem) {
      if (newItem.el === draggedCol) return
      const oldItem = oldPositions.find(function(o) { return o.el === newItem.el })
      if (oldItem) {
        const dx = oldItem.rect.left - newItem.rect.left
        if (dx !== 0) {
          newItem.el.style.transition = 'none'
          newItem.el.style.transform = 'translate(' + dx + 'px, 0)'
        }
      }
    })

    container.offsetHeight

    newPositions.forEach(function(newItem) {
      if (newItem.el === draggedCol) return
      if (newItem.el.style.transform) {
        newItem.el.style.transition = 'transform 0.18s cubic-bezier(0.25, 0.8, 0.25, 1)'
        newItem.el.style.transform = 'translate(0, 0)'
      }
    })

    _colFlipTimer = setTimeout(function() {
      clearFlipTransforms(container)
      _colFlipTimer = null
    }, 220)

    const b = findBoard(state.selectedBoardId)
    if (b) {
      const newIdx = Array.from(newCols).findIndex(function(el) { return el.dataset.columnId === columnId })
      if (_colOriginalIdx !== -1 && newIdx !== -1 && newIdx !== _colOriginalIdx) {
        const moved = b.columns.splice(_colOriginalIdx, 1)[0]
        b.columns.splice(newIdx, 0, moved)
        _colOriginalIdx = newIdx
      }
    }
  }

  document.addEventListener('dragover', function(e) {
    if (_dragGhostEl) {
      _dragGhostEl.style.left = (e.clientX - _dragOffsetX) + 'px'
      _dragGhostEl.style.top = (e.clientY - _dragOffsetY) + 'px'
    }
    if (_colDraggedId) {
      var _c = document.querySelector('.board-column[data-column-id="' + _colDraggedId + '"]')
      if (_c) {
        _c.style.transition = 'none'
        _c.style.transform = 'translateX(' + ((e.clientX - _colGrabOffsetX) - _colDomLeft) + 'px)'
        _c.style.zIndex = '100'
      }
    }
  })

  board.addEventListener('dragover', function(e) {
    var _overCol = e.target.closest('.board-column, .column-cards')
    if (!_overCol && !_colDraggedId) return
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
      if (!_colDraggedId) return

      const container = board.querySelector('.board-columns')
      if (!container) return

      const draggedCol = container.querySelector('.board-column[data-column-id="' + _colDraggedId + '"]')
      if (!draggedCol) return

      const cols = container.querySelectorAll('.board-column:not(.add-column)')
      const others = Array.from(cols).filter(function(c) { return c !== draggedCol })
      let targetCol = null
      let insertSide = 'left'

      if (others.length > 0) {
        var lastRect = others[others.length - 1].getBoundingClientRect()
        if (e.clientX >= lastRect.right) {
          targetCol = others[others.length - 1]
          insertSide = 'right'
        }
      }

      if (!targetCol) {
        for (const c of others) {
          const r = c.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX <= r.right) {
            targetCol = c
            insertSide = e.clientX < r.left + r.width / 2 ? 'left' : 'right'
            break
          }
        }
      }

      if (!targetCol) {
        for (let i = 0; i < others.length; i++) {
          const cur = others[i].getBoundingClientRect()
          if (e.clientX >= cur.left && e.clientX <= cur.right) continue
          const next = others[i + 1]
          if (next) {
            const nextRect = next.getBoundingClientRect()
            if (e.clientX > cur.right && e.clientX < nextRect.left) {
              targetCol = next
              insertSide = 'left'
              break
            }
          } else if (e.clientX > cur.right) {
            targetCol = cur
            insertSide = 'right'
            break
          }
        }
        if (!targetCol && others.length > 0) {
          const first = others[0].getBoundingClientRect()
          if (e.clientX < first.left) {
            targetCol = others[0]
            insertSide = 'left'
          } else {
            targetCol = others[others.length - 1]
            insertSide = 'right'
          }
        }
      }

      if (targetCol) {
        const posKey = targetCol.dataset.columnId + '-' + insertSide
        if (posKey !== _colCurrentPosKey) {
          const insertBeforeNode = insertSide === 'left' ? targetCol : targetCol.nextSibling
          if (draggedCol.nextSibling !== insertBeforeNode && draggedCol !== insertBeforeNode) {
            _colCurrentPosKey = posKey
            flipColumn(container, draggedCol, insertBeforeNode, _colDraggedId)
          }
        }
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
      if (_colFlipTimer) { clearTimeout(_colFlipTimer); _colFlipTimer = null }
      const container = board.querySelector('.board-columns')
      if (!container) return

      const draggedCol = container.querySelector('.board-column[data-column-id="' + columnId + '"]')
      if (draggedCol) {
        draggedCol.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)'
        draggedCol.style.transform = 'translate(0, 0)'
        draggedCol.style.zIndex = ''
      }

      container.querySelectorAll('.board-column').forEach(function(el) {
        if (el !== draggedCol) {
          el.style.transition = ''
          el.style.transform = ''
        }
      })

      const newCols = container.querySelectorAll('.board-column:not(.add-column)')
      const b = findBoard(state.selectedBoardId)
      if (!b) return
      const newIdx = Array.from(newCols).findIndex(function(el) { return el.dataset.columnId === columnId })
      const oldIdx = b.columns.findIndex(function(c) { return c.id === columnId })
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const moved = b.columns.splice(oldIdx, 1)[0]
        b.columns.splice(newIdx, 0, moved)
      }

      _colOriginalIdx = -1
      _colCurrentPosKey = null
      _colDraggedId = null
      if (window.__autoSave) window.__autoSave()
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
