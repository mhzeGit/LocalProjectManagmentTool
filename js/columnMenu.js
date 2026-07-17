export function toggleColumnMenu(id) {
  const menu = document.getElementById('colMenu-' + id)
  if (!menu) return
  const isOpen = menu.classList.contains('open')
  closeAllColumnMenus()
  if (!isOpen) menu.classList.add('open')
}

export function closeAllColumnMenus() {
  document.querySelectorAll('.col-menu').forEach(m => m.classList.remove('open'))
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.col-menu-btn')) closeAllColumnMenus()
})
