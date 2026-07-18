import { state } from './data.js'
import { openFolder, saveNow, closeFolder } from './persistence.js'
import { openModal } from './modal.js'
import { openPreferences } from './preferences.js'
import { switchView } from './board.js'

let openMenuIndex = -1
let isMenuOpen = false

function renderFilterBarToggleLabel() {
  const bar = document.getElementById('filterBar')
  return !bar || bar.classList.contains('hidden') || bar.style.display === 'none' ? 'Show Filters' : 'Hide Filters'
}

function toggleFilterBar() {
  const bar = document.getElementById('filterBar')
  if (!bar) return
  const hidden = bar.classList.contains('hidden') || bar.style.display === 'none'
  bar.classList.toggle('hidden', !hidden)
  if (hidden) {
    bar.style.display = ''
  } else {
    bar.style.display = 'none'
  }
}

function showAbout() {
  const overlay = document.getElementById('modal')
  const title = document.getElementById('modalTitle')
  const body = document.getElementById('modalBody')
  title.textContent = 'About Task Board'
  body.innerHTML =
    '<div style="text-align:center;padding:20px 0;">' +
    '  <h2 style="margin:0 0 8px;font-size:20px;color:var(--text-primary)">Task Board</h2>' +
    '  <p style="margin:0 0 4px;color:var(--text-secondary);font-size:13px;">A project management tool</p>' +
    '  <p style="margin:0;color:var(--text-dim);font-size:12px;">Organize projects, manage tasks, and collaborate with your team.</p>' +
    '</div>' +
    '<div class="modal-actions" style="justify-content:center;">' +
    '  <button class="btn-confirm" onclick="closeModal()">OK</button>' +
    '</div>'
  overlay.classList.add('open')
}

const menuDefs = [
  {
    label: 'File',
    items: [
      { label: 'New Workspace', shortcut: 'Ctrl+Shift+N', action: () => openModal('workspace') },
      { separator: true },
      { label: 'Open Workspace\u2026', shortcut: 'Ctrl+O', action: () => openFolder() },
      { label: 'Close Workspace', action: closeFolder },
      { separator: true },
      { label: 'Save', shortcut: 'Ctrl+S', action: () => saveNow() },
    ]
  },
  {
    label: 'Edit',
    items: [
      { label: 'Preferences\u2026', shortcut: 'Ctrl+,', action: () => openPreferences() },
    ]
  },
  {
    label: 'View',
    items: [
      { label: 'Kanban', type: 'view', viewId: 'kanban', action: () => switchView('kanban') },
      { label: 'Timeline', type: 'view', viewId: 'timeline', action: () => switchView('timeline') },
      { label: 'Calendar', type: 'view', viewId: 'calendar', action: () => switchView('calendar') },
      { separator: true },
      { label: renderFilterBarToggleLabel(), dynamic: true, action: toggleFilterBar },
    ]
  },
  {
    label: 'Workspace',
    items: [
      { label: 'New Project', shortcut: 'Ctrl+Shift+P', action: () => { if (state.selectedWorkspaceId) openModal('project', state.selectedWorkspaceId) } },
      { separator: true },
      { label: 'Workspace Colors\u2026', action: () => openPreferences('colors') },
      { label: 'Workspace Tags\u2026', action: () => openPreferences('tags') },
      { label: 'Manage Members\u2026', action: () => openPreferences('members') },
    ]
  },
  {
    label: 'Help',
    items: [
      { label: 'About Task Board', action: showAbout },
    ]
  },
]

function closeAllMenus() {
  document.querySelectorAll('.menubar-dropdown.open').forEach(el => el.classList.remove('open'))
  document.querySelectorAll('.menubar-label.open').forEach(el => el.classList.remove('open'))
  openMenuIndex = -1
  isMenuOpen = false
}

function updateViewCheckmarks() {
  document.querySelectorAll('.menubar-item[data-view-id]').forEach(btn => {
    const check = btn.querySelector('.menubar-check')
    if (check) {
      check.classList.toggle('checked', btn.dataset.viewId === state.selectedView)
    }
  })
}

function updateFilterToggleLabel() {
  document.querySelectorAll('.menubar-item[data-dynamic]').forEach(btn => {
    const textNode = btn.childNodes[0]
    if (textNode) {
      textNode.textContent = renderFilterBarToggleLabel()
    }
  })
}

function buildMenuBar() {
  const container = document.getElementById('menubar')
  if (!container) return

  container.innerHTML = ''

  for (let mi = 0; mi < menuDefs.length; mi++) {
    const menu = menuDefs[mi]
    const menuEl = document.createElement('div')
    menuEl.className = 'menubar-menu'

    const label = document.createElement('button')
    label.className = 'menubar-label'
    label.textContent = menu.label
    label.dataset.menuIndex = mi
    menuEl.appendChild(label)

    const dropdown = document.createElement('div')
    dropdown.className = 'menubar-dropdown'
    dropdown.dataset.menuIndex = mi

    for (const item of menu.items) {
      if (item.separator) {
        const sep = document.createElement('div')
        sep.className = 'menubar-separator'
        dropdown.appendChild(sep)
      } else {
        const btn = document.createElement('button')
        btn.className = 'menubar-item'
        if (item.type === 'view' && item.viewId) {
          btn.dataset.viewId = item.viewId
        }
        if (item.dynamic) {
          btn.dataset.dynamic = '1'
        }

        const check = document.createElement('span')
        check.className = 'menubar-check'
        btn.appendChild(check)

        const textSpan = document.createElement('span')
        textSpan.textContent = item.label
        btn.appendChild(textSpan)

        if (item.shortcut) {
          const sc = document.createElement('span')
          sc.className = 'menubar-shortcut'
          sc.textContent = item.shortcut
          btn.appendChild(sc)
        }

        btn.addEventListener('click', function(e) {
          e.stopPropagation()
          if (item.action) item.action()
          closeAllMenus()
        })

        dropdown.appendChild(btn)
      }
    }

    menuEl.appendChild(dropdown)

    label.addEventListener('click', function(e) {
      e.stopPropagation()
      if (isMenuOpen && openMenuIndex === mi) {
        closeAllMenus()
        return
      }
      closeAllMenus()
      dropdown.classList.add('open')
      label.classList.add('open')
      openMenuIndex = mi
      isMenuOpen = true
      updateViewCheckmarks()
    })

    label.addEventListener('mouseenter', function() {
      if (isMenuOpen && openMenuIndex !== mi) {
        closeAllMenus()
        dropdown.classList.add('open')
        label.classList.add('open')
        openMenuIndex = mi
        isMenuOpen = true
        updateViewCheckmarks()
      }
    })

    container.appendChild(menuEl)
  }
}

document.addEventListener('click', function(e) {
  if (isMenuOpen && !e.target.closest('.menubar-menu')) {
    closeAllMenus()
  }
})

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && isMenuOpen) {
    closeAllMenus()
    e.preventDefault()
  }
})

export function initMenuBar() {
  buildMenuBar()
  updateViewCheckmarks()
}

export function updateMenuBar() {
  updateViewCheckmarks()
  updateFilterToggleLabel()
}
