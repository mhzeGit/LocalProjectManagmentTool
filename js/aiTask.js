// "Start with AI": hands a card to a coding agent with a ready-made prompt.
// Claude (desktop) takes the prompt and folder through its claude://code/new link; other
// agents (T3 Code, a phone) get the prompt on the clipboard. The prompt names the card id,
// so the agent reads the card itself with the do-task skill and ticks it off when done.

import { data, state, findProject, findCard } from './data.js'
import { escapeHtml } from './utils.js'
import { isServerMode, getCodeDir, flushNow as flushServer } from './serverSync.js'
import { isGithubMode, flushNow as flushGithub } from './githubSync.js'

function coarsePointer() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
}

// the project that holds the card (not necessarily the selected one)
function projectOfCard(cardId) {
  for (const w of data.workspaces) {
    for (const p of w.projects) {
      for (const b of p.boards || []) {
        for (const col of (b.columns || []).concat(b.archivedColumns || [])) {
          if ((col.cards || []).some(c => c.id === cardId)) return p
        }
      }
    }
  }
  return state.selectedProjectId ? findProject(state.selectedProjectId) : null
}

function codeDirFor(project) {
  if (!project) return ''
  if (project.plan && project.plan.codeDir) return project.plan.codeDir
  return isServerMode() ? getCodeDir(project.id) : ''
}

export function aiTaskPrompt(cardId, title, projectName) {
  return 'Do the task "' + title + '" from my production plan board (card ' + cardId +
    (projectName ? ', project "' + projectName + '"' : '') +
    ') using the do-task skill: read the card, do and verify the work, and once it is fully done and I confirm, tick it off on the board.'
}

export function aiTaskButtonHtml(cardId) {
  return '<div class="ai-task">' +
    '<button type="button" class="btn-ai-task" onclick="__aiTaskMenu(\'' + cardId + '\', this)" title="Hand this card to a coding agent">' +
    '<span class="ai-task-spark">✦</span> Start with AI</button></div>'
}

function notify(msg, ms) {
  const el = document.getElementById('saveNotification')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._timeout)
  el._timeout = setTimeout(() => el.classList.remove('show'), ms || 3000)
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text))
  }
  return Promise.resolve(legacyCopy(text))
}

function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch (e) { ok = false }
  ta.remove()
  return ok
}

function openExternal(url) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function closeMenu() {
  const m = document.getElementById('aiTaskMenu')
  if (m) m.remove()
  document.removeEventListener('pointerdown', outside, true)
}

function outside(e) {
  const m = document.getElementById('aiTaskMenu')
  if (m && !m.contains(e.target) && !e.target.closest('.btn-ai-task')) closeMenu()
}

// Saves the modal (so the agent reads what the user sees) and pushes it out right away.
function saveAndFlush(cardId) {
  if (window.saveCard) window.saveCard(cardId)
  if (isServerMode()) flushServer()
  else if (isGithubMode()) flushGithub()
}

function run(kind, cardId) {
  const card = findCard(cardId)
  if (!card) return
  const project = projectOfCard(cardId)
  const titleInput = document.getElementById('cd-title')
  const title = (titleInput && titleInput.value.trim()) || card.title || ''
  const prompt = aiTaskPrompt(cardId, title, project && project.name)
  closeMenu()
  if (kind === 'claude') {
    const dir = codeDirFor(project)
    // launch first, while the click still counts as a user gesture
    openExternal('claude://code/new?' + (dir ? 'folder=' + encodeURIComponent(dir) + '&' : '') + 'q=' + encodeURIComponent(prompt))
    copyText(prompt)
    saveAndFlush(cardId)
    notify('Opening Claude… (prompt also copied)', 3500)
    return
  }
  copyText(prompt).then(ok => {
    if (kind === 't3') openExternal('t3code://')
    notify(ok ? (kind === 't3' ? 'Prompt copied: paste it into a new T3 Code thread' : 'Prompt copied') : 'Could not copy the prompt', 4000)
  })
  saveAndFlush(cardId)
}

window.__aiTaskMenu = function(cardId, btn) {
  if (document.getElementById('aiTaskMenu')) { closeMenu(); return }
  const project = projectOfCard(cardId)
  const desktop = !coarsePointer()
  const dir = codeDirFor(project)
  const folderName = dir ? dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : ''
  const items = []
  if (desktop) {
    items.push(['claude', 'Open in Claude', dir ? 'New Code session in ' + folderName + ', prompt filled in' : 'New Code session, prompt filled in (pick the folder there)'])
    items.push(['t3', 'Copy prompt and open T3 Code', 'Paste it into a new thread'])
  }
  items.push(['copy', 'Copy prompt', 'For any agent: paste it into a new chat'])
  const menu = document.createElement('div')
  menu.id = 'aiTaskMenu'
  menu.className = 'ai-task-menu'
  menu.innerHTML = items.map(([k, label, sub]) =>
    '<button type="button" data-kind="' + k + '"><span class="ai-task-menu-label">' + escapeHtml(label) + '</span>' +
    '<span class="ai-task-menu-sub">' + escapeHtml(sub) + '</span></button>').join('') +
    '<div class="ai-task-menu-note">The agent follows the do-task skill and asks you before ticking the card off.</div>'
  menu.addEventListener('click', e => {
    const b = e.target.closest('button[data-kind]')
    if (b) run(b.dataset.kind, cardId)
  })
  btn.parentElement.appendChild(menu)
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0)
}

window.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('aiTaskMenu')) { e.stopPropagation(); closeMenu() } }, true)
