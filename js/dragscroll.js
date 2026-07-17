let _panning = false
let _panX = 0, _panY = 0, _panLX = 0, _panLY = 0

function hEl() {
  return document.querySelector('.timeline') || document.getElementById('boardArea')
}

function vEl() {
  return document.getElementById('boardArea')
}

document.addEventListener('mousedown', function(e) {
  if (e.button !== 2) return
  const board = document.getElementById('boardArea')
  if (!board || !board.contains(e.target)) return
  const h = hEl()
  _panX = e.clientX
  _panY = e.clientY
  _panLX = h.scrollLeft
  _panLY = board.scrollTop
  _panning = true
  e.preventDefault()
})

document.addEventListener('mousemove', function(e) {
  if (!_panning) return
  e.preventDefault()
  const h = hEl()
  const v = vEl()
  h.scrollLeft = _panLX - (e.clientX - _panX)
  v.scrollTop = _panLY - (e.clientY - _panY)
})

document.addEventListener('mouseup', function() {
  _panning = false
})

document.addEventListener('contextmenu', function(e) {
  const board = document.getElementById('boardArea')
  if (board && board.contains(e.target)) e.preventDefault()
})
