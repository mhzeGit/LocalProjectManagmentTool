export function escapeHtml(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

export function getProgressColor(pct) {
  var h = Math.round((pct / 100) * 120)
  return 'hsl(' + h + ', 80%, 55%)'
}

export function countChecklistItems(items) {
  let count = 0
  for (const item of items) {
    if (item.items && item.items.length > 0) {
      count += countChecklistItems(item.items)
    } else {
      count++
    }
  }
  return count
}

export function getInitials(name) {
  return name.split(/\s+/).map(s => s[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export function countCompletedChecklistItems(items) {
  let count = 0
  for (const item of items) {
    if (item.items && item.items.length > 0) {
      count += countCompletedChecklistItems(item.items)
    } else if (item.completed) {
      count++
    }
  }
  return count
}

export function isLeafItem(item) {
  return !item.items || item.items.length === 0
}

export function isParentDone(item) {
  if (!item.items || item.items.length === 0) return item.completed
  return item.items.every(isParentDone)
}
