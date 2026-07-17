function scrollEl() {
  return document.querySelector('.timeline') || document.getElementById('boardArea')
}

document.addEventListener('mousedown', function(e) {
  if (e.button !== 2) return
  const board = document.getElementById('boardArea')
  if (!board || !board.contains(e.target)) return
  const el = scrollEl()
  el._panX = e.clientX
  el._panY = e.clientY
  el._panLX = el.scrollLeft
  el._panLY = el.scrollTop
  el._panning = true
  e.preventDefault()
})

document.addEventListener('mousemove', function(e) {
  const el = scrollEl()
  if (!el._panning) return
  e.preventDefault()
  el.scrollLeft = el._panLX - (e.clientX - el._panX)
  el.scrollTop = el._panLY - (e.clientY - el._panY)
})

document.addEventListener('mouseup', function() {
  const el = scrollEl()
  el._panning = false
})

document.addEventListener('contextmenu', function(e) {
  const board = document.getElementById('boardArea')
  if (board && board.contains(e.target)) e.preventDefault()
})
