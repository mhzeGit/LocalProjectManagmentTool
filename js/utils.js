export function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

export function getProgressColor(pct) {
  var h = Math.round((pct / 100) * 120)
  return 'hsl(' + h + ', 80%, 55%)'
}
