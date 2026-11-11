// Phone helpers: the sidebar becomes a drawer opened with the ☰ button.
export function initMobile() {
  const btn = document.getElementById('mobileNavBtn')
  let lastToggle = 0
  if (btn) btn.addEventListener('click', function(e) {
    e.stopPropagation()
    if (Date.now() - lastToggle < 350) return   // a tap can arrive as two clicks
    lastToggle = Date.now()
    document.body.classList.toggle('nav-open')
  })
  // close the drawer after picking something, or when tapping outside it
  document.addEventListener('click', function(e) {
    if (!document.body.classList.contains('nav-open')) return
    const inSidebar = e.target.closest('#sidebar')
    if (!inSidebar) { document.body.classList.remove('nav-open'); return }
    if (e.target.closest('.nav-child, .sidebar-nav-item')) {
      setTimeout(function() { document.body.classList.remove('nav-open') }, 120)
    }
  }, true)
  // workspace and project tiles open on double-click; one tap is enough on touch screens
  document.addEventListener('click', function(e) {
    if (!isTouchDevice()) return
    const tile = e.target.closest('.page-card[ondblclick]')
    if (tile) tile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  })
}

export function isTouchDevice() {
  return window.matchMedia && window.matchMedia('(pointer: coarse)').matches
}
