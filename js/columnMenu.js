export function showColumnContextMenu(e, id) {
  e.preventDefault()
  e.stopPropagation()
  closeAllColumnMenus()
  const menu = document.getElementById('colMenu-' + id)
  if (!menu) return
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
  menu.classList.add('open')
}

export function closeAllColumnMenus() {
  document.querySelectorAll('.col-menu').forEach(m => {
    m.classList.remove('open')
    m.style.left = ''
    m.style.top = ''
  })
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.col-menu')) closeAllColumnMenus()
})

document.addEventListener('contextmenu', function(e) {
  if (!e.target.closest('.col-menu')) closeAllColumnMenus()
})
