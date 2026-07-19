import { state, findProject } from './data.js'
import { getSelfMember } from './members.js'
import { escapeHtml } from './utils.js'
import { openCardDetail } from './modal.js'

function getTodayStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function collectTodaysTasks() {
  const self = getSelfMember()
  if (!self) return []

  const project = findProject(state.selectedProjectId)
  if (!project) return []

  const today = getTodayStr()
  const tasks = []

  for (const b of project.boards) {
    for (const col of b.columns) {
      for (const c of col.cards) {
        if (!c.members || !c.members.includes(self.name)) continue
        if (c.endDate !== today && c.startDate !== today) continue
        tasks.push({
          card: c,
          columnName: col.name,
          boardName: b.name,
        })
      }
    }
  }

  tasks.sort((a, b) => {
    if (a.card.completed !== b.card.completed) {
      return a.card.completed ? 1 : -1
    }
    const aDate = a.card.endDate || a.card.startDate || ''
    const bDate = b.card.endDate || b.card.startDate || ''
    return aDate.localeCompare(bDate)
  })

  return tasks
}

function getPriorityColor(priority) {
  if (!priority || priority === 'none') return '#6b7280'
  if (priority === 'low' || priority === '1') return '#22c55e'
  if (priority === 'medium' || priority === '3') return '#f97316'
  if (priority === 'high' || priority === '4') return '#f43f5e'
  if (priority === 'urgent' || priority === '5') return '#ef4444'
  if (priority === '2') return '#84cc16'
  return '#6b7280'
}

export function renderDashboard(area) {
  const self = getSelfMember()
  const tasks = collectTodaysTasks()
  const today = getTodayStr()

  let html = '<div class="page-view">'

  if (!self) {
    html += '<div class="dash-nodes"><div class="dash-node">'
    html += '<div class="dash-node-body"><p class="dash-empty">Set your identity in Preferences → Members to see your tasks.</p></div>'
    html += '</div></div>'
  } else {
    html += '<div class="dash-nodes">'
    html += '<div class="dash-node">'
    html += '<div class="dash-node-header">'
    html += '  <h3>Today\'s Tasks</h3>'
    html += '  <span class="dash-node-count">' + tasks.length + '</span>'
    html += '</div>'
    html += '<div class="dash-node-body">'

    if (tasks.length === 0) {
      html += '<p class="dash-empty">No tasks for today. You\'re all caught up!</p>'
    } else {
      html += '<div class="dash-list">'
      for (const t of tasks) {
        const c = t.card
        const isDone = c.completed ? ' dash-item-done' : ''
        const checked = c.completed ? ' checked' : ''
        const priColor = getPriorityColor(c.priority)
        let dateLabel = ''
        if (c.endDate === today && c.startDate === today) {
          dateLabel = 'Due & starts today'
        } else if (c.endDate === today) {
          dateLabel = 'Due today'
        } else if (c.startDate === today) {
          dateLabel = 'Starts today'
        }

        html += '<div class="dash-list-item' + isDone + '" data-card-id="' + c.id + '">'
        html += '  <div class="dash-item-check' + checked + '" onclick="event.stopPropagation();toggleCardCompleted(\'' + c.id + '\')"><div class="dash-check-circle"><svg class="dash-check-check" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>'
        html += '  <div class="dash-item-body">'
        html += '    <div class="dash-item-title">' + escapeHtml(c.title || 'Untitled') + '</div>'
        html += '    <div class="dash-item-meta">'
        html += '      <span class="dash-item-board">' + escapeHtml(t.boardName) + ' › ' + escapeHtml(t.columnName) + '</span>'
        html += '      <span class="dash-item-prio" style="color:' + priColor + '">●</span>'
        html += '      <span class="dash-item-meta-sep">·</span>'
        html += '      <span class="dash-item-date">' + dateLabel + '</span>'
        html += '    </div>'
        html += '  </div>'
        html += '</div>'
      }
      html += '</div>'
    }

    html += '</div></div></div>'
  }

  html += '</div>'
  area.innerHTML = html

  if (!area._dashEventsDone) {
    area._dashEventsDone = true
    area.addEventListener('click', function(e) {
      const item = e.target.closest('.dash-list-item')
      if (item && item.dataset.cardId) {
        const check = e.target.closest('.dash-item-check')
        if (!check) {
          openCardDetail(item.dataset.cardId)
        }
      }
    })
  }
}
