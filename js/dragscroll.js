const board = document.getElementById('boardArea')
let dragging = false, startX = 0, scrollLeft = 0

board.addEventListener('mousedown', function(e) {
  if (e.button !== 2) return
  dragging = true
  startX = e.pageX - board.offsetLeft
  scrollLeft = board.scrollLeft
  board.classList.add('grabbing')
  e.preventDefault()
})

document.addEventListener('mousemove', function(e) {
  if (!dragging) return
  e.preventDefault()
  const x = e.pageX - board.offsetLeft
  const walk = x - startX
  board.scrollLeft = scrollLeft - walk
})

document.addEventListener('mouseup', function() {
  if (!dragging) return
  dragging = false
  board.classList.remove('grabbing')
})

board.addEventListener('contextmenu', function(e) { e.preventDefault() })
