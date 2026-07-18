import { state, findDocument } from './data.js'
import { saveDocumentContent, setDocumentPaperSize } from './store.js'

let _currentEditor = null
let _resizeObserver = null

const TIPTAP_VERSION = '2.6.6'

const PAPER_CONFIG = {
  free:   { label: 'Free' },
  a4:     { label: 'A4',     ratioW: 210, ratioH: 297 },
  letter: { label: 'Letter', ratioW: 216, ratioH: 279 },
  legal:  { label: 'Legal',  ratioW: 216, ratioH: 356 },
  a3:     { label: 'A3',     ratioW: 297, ratioH: 420 },
  a5:     { label: 'A5',     ratioW: 148, ratioH: 210 },
}

const ZOOM_LEVELS = [
  { label: '50%',  value: 0.5 },
  { label: '75%',  value: 0.75 },
  { label: '100%', value: 1.0 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2.0 },
]

function applyPaperSize(paperEl, containerEl, size, zoom) {
  if (size === 'free') {
    paperEl.dataset.size = 'free'
    paperEl.style.width = ''
    paperEl.style.height = ''
    return
  }

  const cfg = PAPER_CONFIG[size]
  if (!cfg) return
  paperEl.dataset.size = size

  zoom = zoom || 1.0

  const cw = containerEl.clientWidth
  const ch = containerEl.clientHeight
  let w = cw
  let h = w * cfg.ratioH / cfg.ratioW

  if (h > ch) {
    h = ch
    w = h * cfg.ratioW / cfg.ratioH
  }

  w *= zoom
  h *= zoom

  paperEl.style.width = Math.floor(w) + 'px'
  paperEl.style.height = Math.floor(h) + 'px'
}

function setupResizeObserver(paperEl, containerEl, getState) {
  if (_resizeObserver) {
    _resizeObserver.disconnect()
    _resizeObserver = null
  }
  _resizeObserver = new ResizeObserver(function() {
    const state = getState()
    if (state.size && state.size !== 'free') {
      applyPaperSize(paperEl, containerEl, state.size, state.zoom)
    }
  })
  _resizeObserver.observe(containerEl)
}

export async function renderDocument(documentId) {
  const area = document.getElementById('boardArea')
  const doc = findDocument(documentId)
  if (!doc) return

  if (_currentEditor) {
    _currentEditor.destroy()
    _currentEditor = null
  }
  if (_resizeObserver) {
    _resizeObserver.disconnect()
    _resizeObserver = null
  }

  let html = '<div class="document-editor">'
  html += '  <div class="document-header">'
  html += '    <h2 class="document-title" id="docTitle-' + doc.id + '" ondblclick="startRenameDocument(\'' + doc.id + '\')">' + doc.name + '</h2>'
  html += '  </div>'
  html += '  <div class="editor-toolbar" id="toolbar-' + doc.id + '">'
  html += '    <div class="editor-toolbar-group">'
  html += '      <button class="editor-btn" data-cmd="undo" title="Undo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>'
  html += '      <button class="editor-btn" data-cmd="redo" title="Redo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>'
  html += '    </div>'
  html += '    <div class="editor-toolbar-sep"></div>'
  html += '    <div class="editor-toolbar-group">'
  html += '      <button class="editor-btn" data-cmd="bold" title="Bold"><strong>B</strong></button>'
  html += '      <button class="editor-btn" data-cmd="italic" title="Italic"><em>I</em></button>'
  html += '      <button class="editor-btn" data-cmd="underline" title="Underline"><span style="text-decoration:underline">U</span></button>'
  html += '      <button class="editor-btn" data-cmd="strike" title="Strikethrough"><span style="text-decoration:line-through">S</span></button>'
  html += '      <button class="editor-btn" data-cmd="highlight" title="Highlight"><span style="background:#fef08a;color:#000">H</span></button>'
  html += '    </div>'
  html += '    <div class="editor-toolbar-sep"></div>'
  html += '    <div class="editor-toolbar-group">'
  html += '      <button class="editor-btn" data-cmd="h1" title="Heading 1">H1</button>'
  html += '      <button class="editor-btn" data-cmd="h2" title="Heading 2">H2</button>'
  html += '      <button class="editor-btn" data-cmd="h3" title="Heading 3">H3</button>'
  html += '    </div>'
  html += '    <div class="editor-toolbar-sep"></div>'
  html += '    <div class="editor-toolbar-group">'
  html += '      <button class="editor-btn" data-cmd="bulletList" title="Bullet List">•</button>'
  html += '      <button class="editor-btn" data-cmd="orderedList" title="Ordered List">1.</button>'
  html += '      <button class="editor-btn" data-cmd="taskList" title="Task List">☑</button>'
  html += '    </div>'
  html += '    <div class="editor-toolbar-sep"></div>'
  html += '    <div class="editor-toolbar-group">'
  html += '      <button class="editor-btn" data-cmd="blockquote" title="Blockquote">"</button>'
  html += '      <button class="editor-btn" data-cmd="codeBlock" title="Code Block">&lt;/&gt;</button>'
  html += '    </div>'
  html += '    <div class="editor-toolbar-sep"></div>'
  html += '    <div class="editor-toolbar-group">'
  html += '      <button class="editor-btn" data-cmd="alignLeft" title="Align Left"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="10" x2="15" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="12" y2="18"/></svg></button>'
  html += '      <button class="editor-btn" data-cmd="alignCenter" title="Align Center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="10" x2="18" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg></button>'
  html += '      <button class="editor-btn" data-cmd="alignRight" title="Align Right"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="12" y1="18" x2="21" y2="18"/></svg></button>'
  html += '    </div>'
  html += '    <div class="editor-toolbar-sep"></div>'
  html += '    <div class="editor-toolbar-group">'
  html += '      <button class="editor-btn" data-cmd="link" title="Link">🔗</button>'
  html += '      <button class="editor-btn" data-cmd="image" title="Image">🖼</button>'
  html += '      <button class="editor-btn" data-cmd="table" title="Table">⊞</button>'
  html += '      <button class="editor-btn" data-cmd="horizontalRule" title="Horizontal Rule">—</button>'
  html += '    </div>'
  html += '    <div class="editor-toolbar-sep"></div>'
  html += '    <div class="editor-toolbar-group">'
  html += '      <select class="paper-size-select" id="paperSize-' + doc.id + '" title="Paper Size">'
  for (const key in PAPER_CONFIG) {
    html += '        <option value="' + key + '">' + PAPER_CONFIG[key].label + '</option>'
  }
  html += '      </select>'
  html += '      <select class="paper-zoom-select" id="paperZoom-' + doc.id + '" title="Zoom">'
  for (const z of ZOOM_LEVELS) {
    html += '        <option value="' + z.value + '">' + z.label + '</option>'
  }
  html += '      </select>'
  html += '    </div>'
  html += '  </div>'
  html += '  <div class="editor-content" id="editor-container-' + doc.id + '">'
  html += '    <div class="document-paper" id="editor-' + doc.id + '"></div>'
  html += '  </div>'
  html += '</div>'
  area.innerHTML = html

  const { Editor } = await import('https://esm.sh/@tiptap/core@' + TIPTAP_VERSION)
  const StarterKit = (await import('https://esm.sh/@tiptap/starter-kit@' + TIPTAP_VERSION)).default
  const Underline = (await import('https://esm.sh/@tiptap/extension-underline@' + TIPTAP_VERSION)).default
  const Link = (await import('https://esm.sh/@tiptap/extension-link@' + TIPTAP_VERSION)).default
  const Image = (await import('https://esm.sh/@tiptap/extension-image@' + TIPTAP_VERSION)).default
  const TaskList = (await import('https://esm.sh/@tiptap/extension-task-list@' + TIPTAP_VERSION)).default
  const TaskItem = (await import('https://esm.sh/@tiptap/extension-task-item@' + TIPTAP_VERSION)).default
  const Placeholder = (await import('https://esm.sh/@tiptap/extension-placeholder@' + TIPTAP_VERSION)).default
  const TextAlign = (await import('https://esm.sh/@tiptap/extension-text-align@' + TIPTAP_VERSION)).default
  const Highlight = (await import('https://esm.sh/@tiptap/extension-highlight@' + TIPTAP_VERSION)).default
  const Table = (await import('https://esm.sh/@tiptap/extension-table@' + TIPTAP_VERSION)).default
  const TableRow = (await import('https://esm.sh/@tiptap/extension-table-row@' + TIPTAP_VERSION)).default
  const TableCell = (await import('https://esm.sh/@tiptap/extension-table-cell@' + TIPTAP_VERSION)).default
  const TableHeader = (await import('https://esm.sh/@tiptap/extension-table-header@' + TIPTAP_VERSION)).default

  _currentEditor = new Editor({
    element: document.getElementById('editor-' + doc.id),
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: 'Start writing your document...',
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({ multicolor: true }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: doc.content || '',
    onUpdate: function() {
      saveDocumentContent(doc.id, _currentEditor.getHTML())
      if (window.__autoSave) window.__autoSave()
    },
  })

  const toolbar = document.getElementById('toolbar-' + doc.id)
  if (toolbar) {
    toolbar.addEventListener('mousedown', function(e) {
      const btn = e.target.closest('[data-cmd]')
      if (!btn || !_currentEditor) return
      e.preventDefault()
      const cmd = btn.dataset.cmd
      const ed = _currentEditor

      const actions = {
        undo: () => ed.chain().focus().undo().run(),
        redo: () => ed.chain().focus().redo().run(),
        bold: () => ed.chain().focus().toggleBold().run(),
        italic: () => ed.chain().focus().toggleItalic().run(),
        underline: () => ed.chain().focus().toggleUnderline().run(),
        strike: () => ed.chain().focus().toggleStrike().run(),
        highlight: () => ed.chain().focus().toggleHighlight().run(),
        h1: () => ed.chain().focus().toggleHeading({ level: 1 }).run(),
        h2: () => ed.chain().focus().toggleHeading({ level: 2 }).run(),
        h3: () => ed.chain().focus().toggleHeading({ level: 3 }).run(),
        bulletList: () => ed.chain().focus().toggleBulletList().run(),
        orderedList: () => ed.chain().focus().toggleOrderedList().run(),
        taskList: () => ed.chain().focus().toggleTaskList().run(),
        blockquote: () => ed.chain().focus().toggleBlockquote().run(),
        codeBlock: () => ed.chain().focus().toggleCodeBlock().run(),
        alignLeft: () => ed.chain().focus().setTextAlign('left').run(),
        alignCenter: () => ed.chain().focus().setTextAlign('center').run(),
        alignRight: () => ed.chain().focus().setTextAlign('right').run(),
        link: () => {
          const prev = ed.getAttributes('link').href
          const url = window.prompt('Enter link URL', prev || 'https://')
          if (url === null) return
          if (url === '') {
            ed.chain().focus().unsetLink().run()
          } else {
            ed.chain().focus().setLink({ href: url }).run()
          }
        },
        image: () => {
          const url = window.prompt('Enter image URL')
          if (url) ed.chain().focus().setImage({ src: url }).run()
        },
        table: () => ed.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        horizontalRule: () => ed.chain().focus().setHorizontalRule().run(),
      }

      if (actions[cmd]) actions[cmd]()
      updateToolbarState(toolbar, ed)
    })

    _currentEditor.on('selectionUpdate', function() {
      updateToolbarState(toolbar, _currentEditor)
    })
  }

  const containerEl = document.getElementById('editor-container-' + doc.id)
  const paperEl = document.getElementById('editor-' + doc.id)
  const paperSelect = document.getElementById('paperSize-' + doc.id)
  const zoomSelect = document.getElementById('paperZoom-' + doc.id)
  const initialSize = doc.paperSize || 'free'
  const initialZoom = doc.paperZoom || 1.0
  if (paperSelect) paperSelect.value = initialSize
  if (zoomSelect) zoomSelect.value = String(initialZoom)
  if (containerEl && paperEl) {
    applyPaperSize(paperEl, containerEl, initialSize, initialZoom)
    setupResizeObserver(paperEl, containerEl, function() {
      return {
        size: paperSelect ? paperSelect.value : 'free',
        zoom: zoomSelect ? parseFloat(zoomSelect.value) : 1.0
      }
    })
  }
  if (paperSelect && containerEl && paperEl) {
    paperSelect.addEventListener('change', function() {
      const size = this.value
      doc.paperSize = size
      const zoom = zoomSelect ? parseFloat(zoomSelect.value) : 1.0
      applyPaperSize(paperEl, containerEl, size, zoom)
      setDocumentPaperSize(doc.id, size)
      if (window.__autoSave) window.__autoSave()
    })
  }
  if (zoomSelect && containerEl && paperEl) {
    zoomSelect.addEventListener('change', function() {
      const zoom = parseFloat(this.value)
      const size = paperSelect ? paperSelect.value : 'free'
      doc.paperZoom = zoom
      applyPaperSize(paperEl, containerEl, size, zoom)
      if (window.__autoSave) window.__autoSave()
    })
  }
}

function updateToolbarState(toolbar, editor) {
  if (!toolbar || !editor) return
  const isActive = function(name, attrs) { return editor.isActive(name, attrs) }
  toolbar.querySelectorAll('[data-cmd]').forEach(function(btn) {
    const cmd = btn.dataset.cmd
    let active = false
    if (cmd === 'bold') active = isActive('bold')
    else if (cmd === 'italic') active = isActive('italic')
    else if (cmd === 'underline') active = isActive('underline')
    else if (cmd === 'strike') active = isActive('strike')
    else if (cmd === 'highlight') active = isActive('highlight')
    else if (cmd === 'h1') active = isActive('heading', { level: 1 })
    else if (cmd === 'h2') active = isActive('heading', { level: 2 })
    else if (cmd === 'h3') active = isActive('heading', { level: 3 })
    else if (cmd === 'bulletList') active = isActive('bulletList')
    else if (cmd === 'orderedList') active = isActive('orderedList')
    else if (cmd === 'taskList') active = isActive('taskList')
    else if (cmd === 'blockquote') active = isActive('blockquote')
    else if (cmd === 'codeBlock') active = isActive('codeBlock')
    else if (cmd === 'alignLeft') active = isActive({ textAlign: 'left' })
    else if (cmd === 'alignCenter') active = isActive({ textAlign: 'center' })
    else if (cmd === 'alignRight') active = isActive({ textAlign: 'right' })
    else if (cmd === 'link') active = isActive('link')
    btn.classList.toggle('editor-btn-active', active)
  })
}

export function destroyEditor() {
  if (_currentEditor) {
    _currentEditor.destroy()
    _currentEditor = null
  }
  if (_resizeObserver) {
    _resizeObserver.disconnect()
    _resizeObserver = null
  }
}
