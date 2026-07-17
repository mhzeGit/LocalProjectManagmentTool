import { findCard } from './data.js'
import { escapeHtml } from './utils.js'

export function openModal(type, parentId) {
  const overlay = document.getElementById('modal')
  const title = document.getElementById('modalTitle')
  const body = document.getElementById('modalBody')
  overlay.classList.add('open')

  if (type === 'workspace') {
    title.textContent = 'Create Workspace'
    body.innerHTML = '<label>Workspace Name</label><input id="modalInput" placeholder="e.g. My Workspace" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createWorkspace()">Create</button></div>'
  } else if (type === 'project') {
    title.textContent = 'Create Project'
    body.innerHTML = '<label>Project Name</label><input id="modalInput" placeholder="e.g. My Project" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createProject(\'' + parentId + '\')">Create</button></div>'
  } else if (type === 'board') {
    title.textContent = 'Create Board'
    body.innerHTML = '<label>Board Name</label><input id="modalInput" placeholder="e.g. Kanban Board" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createBoard(\'' + parentId + '\')">Create</button></div>'
  } else if (type === 'column') {
    title.textContent = 'Add Column'
    body.innerHTML = '<label>Column Name</label><input id="modalInput" placeholder="e.g. In Review" autofocus><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createColumn(\'' + parentId + '\')">Add</button></div>'
  } else if (type === 'card') {
    title.textContent = 'Create Card'
    body.innerHTML = '<label>Title</label><input id="modalInput" placeholder="Card title" autofocus><label style="margin-top:8px;">Description</label><textarea id="modalTextarea" placeholder="Optional description"></textarea><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="createCard(\'' + parentId + '\')">Create</button></div>'
  }
}

export function openCardDetail(cardId) {
  const c = findCard(cardId)
  if (!c) return
  const overlay = document.getElementById('modal')
  document.getElementById('modalTitle').textContent = c.title
  document.getElementById('modalBody').innerHTML = '<label>Title</label><input id="modalInput" value="' + escapeHtml(c.title) + '"><label style="margin-top:8px;">Description</label><textarea id="modalTextarea" style="min-height:100px;">' + escapeHtml(c.description || '') + '</textarea><div class="modal-actions"><button class="btn-danger" onclick="deleteCard(\'' + cardId + '\')">Delete</button><button class="btn-cancel" onclick="closeModal()">Cancel</button><button class="btn-confirm" onclick="saveCard(\'' + cardId + '\')">Save</button></div>'
  overlay.classList.add('open')
}

export function closeModal() {
  document.getElementById('modal').classList.remove('open')
}

export function setupModalKeyboard() {
  const overlay = document.getElementById('modal')
  overlay.addEventListener('click', function(e) {
    if (e.target !== this) return
    if (!this.classList.contains('open')) return
    const confirmBtn = this.querySelector('.btn-confirm')
    if (confirmBtn) { confirmBtn.click() }
    else { closeModal() }
  })
  overlay.addEventListener('keydown', function(e) {
    if (!this.classList.contains('open')) return
    if (e.key === 'Escape') { closeModal(); e.preventDefault(); return }
    if (e.key === 'Enter') {
      const target = e.target
      if (target.tagName === 'TEXTAREA') return
      const confirmBtn = this.querySelector('.btn-confirm')
      if (confirmBtn) { e.preventDefault(); confirmBtn.click() }
    }
    if (e.key === 'Tab') {
      const buttons = Array.from(this.querySelectorAll('.modal-actions button:not([disabled])'))
      if (buttons.length < 2) return
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  })
}
