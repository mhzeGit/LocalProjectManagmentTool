// Focus page: the project's home when it has a production plan (project.plan).
// Shows the director's brief, what to do now, this week, the current
// milestone and the roadmap. Agents fill the plan through the pm CLI.
import { state, findProject, findCard, findCardColumn } from './data.js'
import { escapeHtml, countChecklistItems, countCompletedChecklistItems, getProgressColor } from './utils.js'
import { openCardDetail } from './modal.js'
import { render } from './sidebar.js'
import { pushCommand } from './history.js'
import { isServerMode, onSync, serverApi } from './serverSync.js'
import { isGithubMode } from './githubSync.js'

const PRIORITY_COLORS = { '1': '#22c55e', '2': '#84cc16', '3': '#f97316', '4': '#f43f5e', '5': '#ef4444' }
const ROLE_LABELS = { now: 'Now', week: 'This Week', backlog: 'Backlog', parking: 'Parking Lot', done: 'Done' }

let _activity = {}
let _activityLoading = {}
let _area = null

onSync(function(type, detail) {
  if (type === 'activity' && detail && detail.projectId) {
    const list = _activity[detail.projectId] || []
    list.unshift(detail.entry)
    _activity[detail.projectId] = list.slice(0, 12)
    if (_area && state.selectedDashboard && state.selectedProjectId === detail.projectId) {
      const panel = _area.querySelector('#focusActivity')
      if (panel) panel.innerHTML = renderActivity(detail.projectId)
    }
  }
})

/* ---------- helpers ---------- */

function todayIso() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

function daysBetween(a, b) { return Math.round((parseIso(b) - parseIso(a)) / 86400000) }

function shortDate(iso) {
  if (!iso) return ''
  const t = todayIso()
  const diff = daysBetween(t, iso)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  const d = parseIso(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtHours(h) {
  if (h === undefined || h === null || h === '') return ''
  h = Number(h)
  if (h < 1) return Math.round(h * 60) + 'm'
  return (Math.round(h * 10) / 10) + 'h'
}

function ago(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 90) return 'just now'
  if (s < 5400) return Math.round(s / 60) + 'm ago'
  if (s < 129600) return Math.round(s / 3600) + 'h ago'
  return Math.round(s / 86400) + 'd ago'
}

function workdaysBetween(plan, fromIso, toIso) {
  const days = new Set(((plan.capacity || {}).workDays) || [1, 2, 3, 4, 5])
  let n = 0
  const d = parseIso(fromIso), end = parseIso(toIso)
  while (d <= end) {
    const iso = d.getDay() === 0 ? 7 : d.getDay()
    if (days.has(iso)) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

function roleOf(plan, colId) {
  const cols = plan.columns || {}
  for (const r in cols) if (cols[r] === colId) return r
  return null
}

function roleColumn(p, role) {
  const id = (p.plan.columns || {})[role]
  for (const b of p.boards || []) for (const c of b.columns || []) if (c.id === id) return c
  return null
}

function allCards(p) {
  const out = []
  for (const b of p.boards || []) for (const col of b.columns || []) for (const c of col.cards || []) out.push({ card: c, col, board: b })
  return out
}

function milestoneStats(p, m) {
  const plan = p.plan
  let total = 0, done = 0, hoursLeft = 0, unestimated = 0
  for (const { card, col } of allCards(p)) {
    if (card.milestone !== m.id) continue
    const role = roleOf(plan, col.id)
    if (role === 'parking') continue
    total++
    if (card.completed || role === 'done') done++
    else { hoursLeft += Number(card.estimate || 0); if (card.estimate === undefined || card.estimate === null) unestimated++ }
  }
  const t = todayIso()
  const st = { total, done, hoursLeft, unestimated, pct: total ? Math.round(done / total * 100) : 0 }
  if (m.due) {
    st.daysLeft = daysBetween(t, m.due)
    st.workdaysLeft = st.daysLeft >= 0 ? workdaysBetween(plan, t, m.due) : 0
    st.capacity = st.workdaysLeft * Number((plan.capacity || {}).hoursPerDay || 4)
    if (m.closed || (total && done === total)) st.risk = 'done'
    else if (st.daysLeft < 0) st.risk = 'overdue'
    else if ((m.forecast && m.forecast > m.due) || hoursLeft > st.capacity) st.risk = 'at risk'
    else st.risk = 'on track'
  }
  return st
}

function currentMilestone(p) {
  const ms = (p.plan.milestones || []).filter(m => !m.closed)
  for (const m of ms) { const s = milestoneStats(p, m); if (!(s.total && s.done === s.total)) return m }
  return ms[0] || null
}

function findMilestone(p, id) { return (p.plan.milestones || []).find(m => m.id === id) || null }

/* ---------- rendering ---------- */

function riskBadge(risk) {
  if (!risk) return ''
  const cls = risk.replace(' ', '-')
  return '<span class="focus-risk focus-risk-' + cls + '">' + escapeHtml(risk) + '</span>'
}

function prioBars(priority) {
  const n = Number(priority || 3)
  const color = PRIORITY_COLORS[String(n)] || PRIORITY_COLORS['3']
  let html = '<div class="focus-prio" title="Priority ' + n + ' of 5">'
  for (let i = 0; i < 5; i++) html += '<i' + (i < n ? ' class="on" style="background:' + color + '"' : '') + '></i>'
  return html + '</div>'
}

function taskMeta(p, c, opts) {
  let html = ''
  const m = c.milestone ? findMilestone(p, c.milestone) : null
  if (m) html += '<span class="focus-chip focus-chip-ms"><i style="background:' + (m.color || '#a855f7') + '"></i>' + escapeHtml(m.name) + '</span>'
  if (c.estimate !== undefined && c.estimate !== null) html += '<span class="focus-chip">' + fmtHours(c.estimate) + '</span>'
  if (c.endDate) {
    const late = c.endDate < todayIso() && !c.completed
    html += '<span class="focus-chip' + (late ? ' focus-chip-late' : '') + '">' + (late ? 'was due ' : 'due ') + shortDate(c.endDate) + '</span>'
  }
  if (c.checklists && c.checklists.length) {
    const total = countChecklistItems(c.checklists), done = countCompletedChecklistItems(c.checklists)
    const pct = total ? Math.round(done / total * 100) : 0
    html += '<span class="focus-steps"><span class="focus-steps-bar"><span style="width:' + pct + '%;background:' + getProgressColor(pct) + '"></span></span>' + done + '/' + total + '</span>'
  }
  if (opts && opts.column) html += '<span class="focus-chip focus-chip-col">' + escapeHtml(opts.column) + '</span>'
  return html
}

function renderNowTask(p, c) {
  const m = c.milestone ? findMilestone(p, c.milestone) : null
  let html = '<div class="focus-task' + (c.completed ? ' is-done' : '') + '" data-card-id="' + c.id + '" style="--ms-color:' + (m ? m.color : 'var(--accent)') + '">'
  html += '<button class="focus-done-btn" data-action="done" title="' + (c.completed ? 'Done' : 'Mark done') + '"><svg viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
  html += '<div class="focus-task-body">'
  html += '<div class="focus-task-title">' + escapeHtml(c.title) + '</div>'
  if (c.why) html += '<div class="focus-task-why">' + escapeHtml(c.why) + '</div>'
  html += '<div class="focus-task-meta">' + taskMeta(p, c) + '</div>'
  html += '</div>'
  html += prioBars(c.priority)
  html += '</div>'
  return html
}

function renderRow(p, c, action, opts) {
  let html = '<div class="focus-row" data-card-id="' + c.id + '">'
  html += '<div class="focus-row-dot" style="background:' + (PRIORITY_COLORS[c.priority] || PRIORITY_COLORS['3']) + '"></div>'
  html += '<div class="focus-row-main"><div class="focus-row-title">' + escapeHtml(c.title) + '</div>'
  html += '<div class="focus-task-meta">' + taskMeta(p, c, opts) + '</div></div>'
  if (action === 'start') html += '<button class="focus-mini-btn" data-action="start" title="Move to Now">Start</button>'
  html += '</div>'
  return html
}

function renderMilestonePanel(p, m) {
  if (!m) {
    return '<div class="focus-panel focus-ms-empty"><h3>Current milestone</h3><p>No milestones yet. Ask your producer agent to plan them, or run <code>pm milestone add "M1 …" --due 2026-12-01</code>.</p></div>'
  }
  const st = milestoneStats(p, m)
  const r = 34, circ = 2 * Math.PI * r
  const dash = (st.pct / 100) * circ
  let html = '<div class="focus-panel focus-ms" style="--ms-color:' + (m.color || 'var(--accent)') + '">'
  html += '<div class="focus-panel-label">Current milestone</div>'
  html += '<div class="focus-ms-top">'
  html += '<svg class="focus-ring" viewBox="0 0 84 84"><circle cx="42" cy="42" r="' + r + '" class="focus-ring-bg"/>' +
    '<circle cx="42" cy="42" r="' + r + '" class="focus-ring-fg" stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '"/>' +
    '<text x="42" y="47" text-anchor="middle">' + st.pct + '%</text></svg>'
  html += '<div class="focus-ms-info"><div class="focus-ms-name">' + escapeHtml(m.name) + '</div>'
  if (m.goal) html += '<div class="focus-ms-goal">' + escapeHtml(m.goal) + '</div>'
  html += riskBadge(st.risk) + '</div></div>'
  html += '<div class="focus-ms-stats">'
  if (m.due) {
    const label = st.daysLeft >= 0 ? (st.daysLeft === 0 ? 'due today' : st.daysLeft + ' days left') : Math.abs(st.daysLeft) + ' days late'
    html += '<div><b>' + (st.daysLeft >= 0 ? st.workdaysLeft : '!') + '</b><span>' + (st.daysLeft >= 0 ? 'work days' : 'overdue') + '</span></div>'
    html += '<div><b>' + fmtHours(st.hoursLeft) + '</b><span>work left</span></div>'
    html += '<div><b>' + st.done + '/' + st.total + '</b><span>cards done</span></div>'
    html += '</div><div class="focus-ms-due">Due ' + parseIso(m.due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + label
    if (m.forecast) html += ' · forecast ' + shortDate(m.forecast)
    if (st.unestimated) html += ' · ' + st.unestimated + ' without estimate'
    html += '</div>'
  } else {
    html += '<div><b>' + st.done + '/' + st.total + '</b><span>cards done</span></div><div><b>' + fmtHours(st.hoursLeft) + '</b><span>work left</span></div></div>'
  }
  html += '</div>'
  return html
}

function renderRoadmap(p, current) {
  const ms = p.plan.milestones || []
  if (!ms.length) return ''
  let html = '<div class="focus-panel"><div class="focus-panel-label">Roadmap</div><div class="focus-roadmap">'
  for (const m of ms) {
    const st = milestoneStats(p, m)
    const isCur = current && m.id === current.id
    html += '<div class="focus-rm' + (isCur ? ' is-current' : '') + (st.risk === 'done' ? ' is-done' : '') + '" style="--ms-color:' + (m.color || 'var(--accent)') + '">'
    html += '<div class="focus-rm-dot"></div><div class="focus-rm-body">'
    html += '<div class="focus-rm-head"><span class="focus-rm-name">' + escapeHtml(m.name) + '</span>' + (m.due ? '<span class="focus-rm-due">' + parseIso(m.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + '</span>' : '') + '</div>'
    html += '<div class="focus-rm-bar"><span style="width:' + st.pct + '%"></span></div>'
    html += '<div class="focus-rm-foot">' + st.done + '/' + st.total + ' done · ' + fmtHours(st.hoursLeft || 0) + ' left ' + riskBadge(st.risk) + '</div>'
    html += '</div></div>'
  }
  return html + '</div></div>'
}

function renderActivity(pid) {
  const list = _activity[pid]
  if (isGithubMode()) return '<p class="focus-muted">Agent activity is shown on your PC. Agent changes reach this device through the sync.</p>'
  if (!isServerMode()) return '<p class="focus-muted">Open the app through the local server (<code>pm open</code>) to see agent activity live.</p>'
  if (!list) return '<p class="focus-muted">Loading…</p>'
  if (!list.length) return '<p class="focus-muted">No agent activity yet.</p>'
  let html = ''
  for (const e of list.slice(0, 8)) {
    html += '<div class="focus-act"><div class="focus-act-head"><b>' + escapeHtml(e.by || 'agent') + '</b><span>' + ago(e.at) + '</span></div>'
    for (const line of (e.lines || []).slice(0, 3)) html += '<div class="focus-act-line">' + escapeHtml(line) + '</div>'
    if ((e.lines || []).length > 3) html += '<div class="focus-act-line focus-muted">+' + (e.lines.length - 3) + ' more</div>'
    html += '</div>'
  }
  return html
}

function loadActivity(pid) {
  if (!isServerMode() || _activityLoading[pid]) return
  _activityLoading[pid] = true
  serverApi('GET', '/api/activity?project=' + encodeURIComponent(pid) + '&limit=12').then(function(r) {
    _activity[pid] = r.activity || []
    const panel = _area && _area.querySelector('#focusActivity')
    if (panel && state.selectedProjectId === pid) panel.innerHTML = renderActivity(pid)
  }).catch(function() { _activity[pid] = [] }).finally(function() { _activityLoading[pid] = false })
}

function briefHtml(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>')
}

export function renderFocus(area, p) {
  _area = area
  const plan = p.plan
  const t = todayIso()
  const nowCol = roleColumn(p, 'now')
  const weekCol = roleColumn(p, 'week')
  const backlog = roleColumn(p, 'backlog')
  const parking = roleColumn(p, 'parking')
  const doneCol = roleColumn(p, 'done')
  const wip = plan.wipLimit || 3
  const cur = currentMilestone(p)
  const nowCards = nowCol ? nowCol.cards : []
  const openNow = nowCards.filter(c => !c.completed).length
  const weekCards = weekCol ? weekCol.cards.filter(c => !c.completed) : []
  const weekHours = weekCards.reduce((a, c) => a + Number(c.estimate || 0), 0)
  const overdue = allCards(p).filter(({ card, col }) => {
    const role = roleOf(plan, col.id)
    return card.endDate && card.endDate < t && !card.completed && role !== 'done' && role !== 'parking' && role !== 'now'
  })
  const doneThisWeek = doneCol ? doneCol.cards.filter(c => c.doneAt && daysBetween(c.doneAt, t) < 7).length : 0
  const directionDoc = (p.documents || []).find(d => d.id === plan.directionDoc)
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  let html = '<div class="page-view focus-page">'
  html += '<div class="focus-head"><div><div class="focus-eyebrow">Focus · ' + escapeHtml(dateLabel) + '</div>'
  html += '<h1 class="focus-title">' + escapeHtml(p.name) + '</h1></div>'
  html += '<div class="focus-head-actions">'
  if (plan.board) html += '<button class="focus-btn" onclick="selectBoard(\'' + plan.board + '\')">Production board</button>'
  if (directionDoc) html += '<button class="focus-btn focus-btn-ghost" onclick="selectDocument(\'' + directionDoc.id + '\')">Direction</button>'
  html += '</div></div>'

  if (plan.brief && plan.brief.text) {
    html += '<div class="focus-brief"><div class="focus-brief-label"><span class="focus-brief-icon">✦</span>Director\'s brief<span class="focus-muted"> · ' + escapeHtml(plan.brief.by || 'agent') + ' · ' + ago(plan.brief.at) + '</span></div>'
    html += '<div class="focus-brief-text">' + briefHtml(plan.brief.text) + '</div></div>'
  }

  html += '<div class="focus-grid"><div class="focus-main">'

  // NOW
  const wipCls = openNow > wip ? ' over' : (openNow === 0 ? ' empty' : '')
  html += '<section class="focus-section"><div class="focus-section-head"><h2>Now</h2><span class="focus-wip' + wipCls + '" title="Work in progress limit">' + openNow + ' / ' + wip + '</span></div>'
  if (nowCards.length) {
    html += '<div class="focus-tasks">' + nowCards.map(c => renderNowTask(p, c)).join('') + '</div>'
  } else {
    html += '<div class="focus-empty">Nothing in progress. ' + (weekCards.length ? 'Start the top card from This Week.' : 'Ask your producer agent for today\'s plan.') + '</div>'
  }
  if (openNow > wip) html += '<div class="focus-warn">Too much at once: finish or move back ' + (openNow - wip) + ' card' + (openNow - wip > 1 ? 's' : '') + '.</div>'
  html += '</section>'

  // THIS WEEK
  html += '<section class="focus-section"><div class="focus-section-head"><h2>This week</h2><span class="focus-count">' + weekCards.length + (weekHours ? ' · ' + fmtHours(weekHours) : '') + '</span></div>'
  html += weekCards.length ? '<div class="focus-rows">' + weekCards.map(c => renderRow(p, c, 'start')).join('') + '</div>'
    : '<div class="focus-empty">Nothing planned for this week yet.</div>'
  html += '</section>'

  if (overdue.length) {
    html += '<section class="focus-section"><div class="focus-section-head"><h2 class="focus-late-title">Overdue</h2><span class="focus-count">' + overdue.length + '</span></div><div class="focus-rows">'
    html += overdue.map(({ card, col }) => renderRow(p, card, null, { column: col.name })).join('') + '</div></section>'
  }

  html += '</div><aside class="focus-side">'
  html += renderMilestonePanel(p, cur)
  html += '<div class="focus-counters">'
  html += '<div class="focus-counter" data-goto="backlog"><b>' + (backlog ? backlog.cards.filter(c => !c.completed).length : 0) + '</b><span>Backlog</span></div>'
  html += '<div class="focus-counter" data-goto="parking" title="Ideas are parked, not lost"><b>' + (parking ? parking.cards.length : 0) + '</b><span>Parked ideas</span></div>'
  html += '<div class="focus-counter" data-goto="done"><b>' + doneThisWeek + '</b><span>Done in 7 days</span></div>'
  html += '</div>'
  html += renderRoadmap(p, cur)
  html += '<div class="focus-panel"><div class="focus-panel-label">Agent activity</div><div id="focusActivity">' + renderActivity(p.id) + '</div></div>'
  html += '</aside></div></div>'

  area.innerHTML = html
  if (_activity[p.id] === undefined) loadActivity(p.id)

  if (!area._focusEvents) {
    area._focusEvents = true
    area.addEventListener('click', onFocusClick)
  }
}

function onFocusClick(e) {
  if (!state.selectedDashboard || !e.target.closest('.focus-page')) return
  const p = findProject(state.selectedProjectId)
  if (!p || !p.plan) return
  const counter = e.target.closest('.focus-counter')
  if (counter && p.plan.board) { window.selectBoard(p.plan.board); return }
  const actionEl = e.target.closest('[data-action]')
  const host = e.target.closest('[data-card-id]')
  if (!host) return
  const id = host.dataset.cardId
  if (actionEl && actionEl.dataset.action === 'done') { e.stopPropagation(); toggleDone(p, id); return }
  if (actionEl && actionEl.dataset.action === 'start') { e.stopPropagation(); moveToRole(p, id, 'now'); return }
  openCardDetail(id)
}

function moveCard(card, from, to, index) {
  const i = from.cards.indexOf(card)
  if (i !== -1) from.cards.splice(i, 1)
  if (index === undefined) to.cards.push(card); else to.cards.splice(index, 0, card)
}

function moveToRole(p, cardId, role) {
  const card = findCard(cardId), from = findCardColumn(cardId), to = roleColumn(p, role)
  if (!card || !from || !to || from === to) return
  const fromIdx = from.cards.indexOf(card)
  moveCard(card, from, to)
  render()
  pushCommand({
    undo() { moveCard(card, to, from, fromIdx) },
    redo() { moveCard(card, from, to) },
    description: 'Move to ' + ROLE_LABELS[role]
  })
}

function toggleDone(p, cardId) {
  const card = findCard(cardId), from = findCardColumn(cardId), doneCol = roleColumn(p, 'done')
  if (!card || !from) return
  const before = { completed: card.completed, doneAt: card.doneAt, col: from, idx: from.cards.indexOf(card) }
  if (!card.completed) {
    card.completed = true
    card.doneAt = todayIso()
    if (doneCol && doneCol !== from) moveCard(card, from, doneCol, 0)
  } else {
    card.completed = false
    delete card.doneAt
  }
  render()
  pushCommand({
    undo() {
      const cur = findCardColumn(card.id)
      if (cur && cur !== before.col) moveCard(card, cur, before.col, before.idx)
      card.completed = before.completed
      if (before.doneAt) card.doneAt = before.doneAt; else delete card.doneAt
    },
    redo() { card.completed = !before.completed; if (card.completed) { card.doneAt = todayIso(); if (doneCol && doneCol !== before.col) moveCard(card, before.col, doneCol, 0) } },
    description: 'Toggle Done'
  })
}

export function projectHasPlan(p) { return !!(p && p.plan && p.plan.columns) }
