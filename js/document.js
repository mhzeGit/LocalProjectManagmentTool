import { findDocument } from './data.js'
import { saveDocumentContent, setDocumentPaperSize } from './store.js'

let _currentEditor = null
let _resizeObserver = null

let _pageEditors = []
let _activePageIndex = 0
let _docId = null
let _pagesEl = null
let _measureEl = null
let _pageBlockCounts = []
let _pageSizes = { free: false, w: 0, h: 0 }
let _reflowTimer = null
let _resizeTimer = null
let _lastFullHtml = null

const TIPTAP_VERSION = '2.6.6'

let _tipTapModules = null
let _tipTapPreloadPromise = null

export function preloadTipTap() {
  if (_tipTapPreloadPromise) return _tipTapPreloadPromise
  _tipTapPreloadPromise = (async function() {
    const modules = await Promise.all([
      import('https://esm.sh/@tiptap/core@' + TIPTAP_VERSION),
      import('https://esm.sh/prosemirror-state@1.4.3'),
      import('https://esm.sh/@tiptap/starter-kit@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-underline@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-link@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-image@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-task-list@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-task-item@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-placeholder@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-text-align@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-highlight@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-table@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-table-row@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-table-cell@' + TIPTAP_VERSION),
      import('https://esm.sh/@tiptap/extension-table-header@' + TIPTAP_VERSION),
    ])
    const [core, pmState, starterKitMod, underlineMod, linkMod, imageMod,
           taskListMod, taskItemMod, placeholderMod, textAlignMod, highlightMod,
           tableMod, tableRowMod, tableCellMod, tableHeaderMod] = modules
    _tipTapModules = {
      Editor: core.Editor,
      Extension: core.Extension,
      TextSelection: pmState.TextSelection,
      StarterKit: starterKitMod.default,
      Underline: underlineMod.default,
      Link: linkMod.default,
      Image: imageMod.default,
      TaskList: taskListMod.default,
      TaskItem: taskItemMod.default,
      Placeholder: placeholderMod.default,
      TextAlign: textAlignMod.default,
      Highlight: highlightMod.default,
      Table: tableMod.default,
      TableRow: tableRowMod.default,
      TableCell: tableCellMod.default,
      TableHeader: tableHeaderMod.default,
    }
  })()
  return _tipTapPreloadPromise
}

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

const PAGE_PAD_X = 40
const PAGE_PAD_Y = 32

function getEditorExtensions(M) {
  const listBehavior = M.Extension.create({
    name: 'listBehavior',
    addKeyboardShortcuts() {
      return {
        Tab: () => this.editor.chain().focus().sinkListItem('listItem').run(),
        'Shift-Tab': () => this.editor.chain().focus().liftListItem('listItem').run(),
        Enter: () => {
          const { editor } = this
          const { $from } = editor.state.selection
          const listItem = $from.node($from.depth - 1)
          if (!listItem || listItem.type.name !== 'listItem') return false
          const para = listItem.firstChild
          const isEmpty = !para || para.textContent === ''
          if (!isEmpty) {
            return editor.chain().focus().splitListItem('listItem').run()
          }
          if (editor.chain().focus().liftListItem('listItem').run()) {
            return true
          }
          const from = $from.before($from.depth - 1)
          const to = $from.after($from.depth - 1)
          const tr = editor.state.tr
          const emptyPara = editor.schema.nodes.paragraph.create()
          tr.replaceWith(from, to, emptyPara)
          tr.setSelection(M.TextSelection.create(tr.doc, from + 1))
          editor.view.dispatch(tr)
          return true
        },
      }
    },
  })
  return [
    M.StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    M.Underline.configure({}),
    M.Link.configure({
      openOnClick: false,
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
    }),
    M.Image.configure({ inline: false, allowBase64: true }),
    M.TaskList.configure({}),
    M.TaskItem.configure({ nested: true }),
    M.Placeholder.configure({ placeholder: 'Start writing your document...' }),
    M.TextAlign.configure({ types: ['heading', 'paragraph'] }),
    M.Highlight.configure({ multicolor: true }),
    M.Table.configure({ resizable: true }),
    M.TableRow.configure({}),
    M.TableCell.configure({}),
    M.TableHeader.configure({}),
    listBehavior,
  ]
}

function computePageSizes(containerEl, size, zoom) {
  if (size === 'free') {
    _pageSizes.free = true
    return
  }
  const cfg = PAPER_CONFIG[size]
  if (!cfg) return
  zoom = zoom || 1.0
  const maxW = Math.min(containerEl.clientWidth, Math.floor(window.innerWidth * 0.5))
  let w = maxW
  let h = Math.floor(w * cfg.ratioH / cfg.ratioW)
  w = Math.floor(w * zoom)
  h = Math.floor(h * zoom)
  _pageSizes.free = false
  _pageSizes.w = w
  _pageSizes.h = h
}

function applyPageSizes() {
  if (!_pagesEl || _pageSizes.free) return
  const pages = _pagesEl.querySelectorAll('.document-page')
  for (let i = 0; i < pages.length; i++) {
    pages[i].style.width = _pageSizes.w + 'px'
    pages[i].style.height = _pageSizes.h + 'px'
  }
}

function extractBlocks(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html || ''
  const blocks = []
  for (let i = 0; i < tmp.children.length; i++) {
    blocks.push(tmp.children[i].outerHTML)
  }
  return blocks
}

function measureBlocks(blocks) {
  if (!_measureEl || !_pagesEl) return blocks.map(function() { return 0 })
  const prose = _measureEl.querySelector('.ProseMirror')
  _measureEl.style.width = (_pageSizes.w - PAGE_PAD_X * 2) + 'px'
  prose.innerHTML = blocks.join('')
  const items = prose.children
  const heights = []
  for (let i = 0; i < items.length; i++) {
    const el = items[i]
    const cs = getComputedStyle(el)
    const mt = parseFloat(cs.marginTop) || 0
    const mb = parseFloat(cs.marginBottom) || 0
    heights.push(el.offsetHeight + mt + mb)
  }
  return heights
}

function packBlocks(blocks) {
  if (blocks.length === 0) return [[]]
  const contentH = _pageSizes.h - PAGE_PAD_Y * 2
  const heights = measureBlocks(blocks)
  const pages = []
  let current = []
  let used = 0
  for (let i = 0; i < blocks.length; i++) {
    const h = heights[i]
    if (current.length > 0 && used + h > contentH) {
      pages.push(current)
      current = [blocks[i]]
      used = h
    } else {
      current.push(blocks[i])
      used += h
    }
  }
  if (current.length > 0) pages.push(current)
  else pages.push([])
  return pages
}

function serializeDocument() {
  let out = ''
  for (let i = 0; i < _pageEditors.length; i++) {
    if (_pageEditors[i]) out += _pageEditors[i].getHTML()
  }
  return out
}

function createEditor(el, html, index) {
  const M = _tipTapModules
  const ed = new M.Editor({
    element: el,
    extensions: getEditorExtensions(M),
    content: html,
    onUpdate: function() {
      if (!_docId) return
      const full = serializeDocument()
      saveDocumentContent(_docId, full)
      if (window.__autoSave) window.__autoSave()
      scheduleReflow()
    },
  })
  ed.on('focus', function() {
    _activePageIndex = index
    _currentEditor = ed
  })
  ed.on('selectionUpdate', function() {
    const toolbar = document.getElementById('toolbar-' + _docId)
    if (toolbar) updateToolbarState(toolbar, ed)
  })
  return ed
}

function createPage(index, html) {
  const page = document.createElement('div')
  page.className = 'document-page'
  page.dataset.pageIndex = String(index)
  const edEl = document.createElement('div')
  edEl.className = 'page-editor'
  page.appendChild(edEl)
  _pagesEl.appendChild(page)
  _pageEditors[index] = createEditor(edEl, html, index)
}

function createFreePage(html) {
  const page = document.createElement('div')
  page.className = 'document-page'
  page.dataset.size = 'free'
  const edEl = document.createElement('div')
  edEl.className = 'page-editor'
  page.appendChild(edEl)
  _pagesEl.appendChild(page)
  _pageEditors[0] = createEditor(edEl, html, 0)
}

function destroyPageEditors() {
  for (let i = 0; i < _pageEditors.length; i++) {
    if (_pageEditors[i]) {
      try { _pageEditors[i].destroy() } catch (e) {}
      _pageEditors[i] = null
    }
  }
  _pageEditors = []
  if (_pagesEl) _pagesEl.innerHTML = ''
  _currentEditor = null
}

function buildPages() {
  const doc = findDocument(_docId)
  if (!doc) return
  destroyPageEditors()
  _lastFullHtml = null
  if (_pageSizes.free) {
    createFreePage(doc.content || '')
    _pageBlockCounts = [1]
    return
  }
  const blocks = extractBlocks(doc.content || '')
  const pages = packBlocks(blocks)
  _pageBlockCounts = pages.map(function(p) { return p.length })
  pages.forEach(function(pageBlocks, i) {
    createPage(i, pageBlocks.join(''))
  })
  applyPageSizes()
}

function findActiveEditor() {
  for (let i = 0; i < _pageEditors.length; i++) {
    const ed = _pageEditors[i]
    if (!ed || !ed.view) continue
    const dom = ed.view.dom
    if (document.activeElement && (dom === document.activeElement || dom.contains(document.activeElement))) {
      return { index: i, editor: ed }
    }
  }
  const idx = _activePageIndex >= 0 && _activePageIndex < _pageEditors.length ? _activePageIndex : 0
  return { index: idx, editor: _pageEditors[idx] }
}

function captureCaret() {
  if (_pageEditors.length === 0) return null
  const active = findActiveEditor()
  if (!active || !active.editor || !active.editor.view) return null
  const dom = active.editor.view.dom
  if (!document.activeElement || !(dom === document.activeElement || dom.contains(document.activeElement))) {
    return null
  }
  const ed = active.editor
  const from = ed.state.selection.from
  const doc = ed.state.doc
  let beforeCount = 0
  for (let i = 0; i < active.index; i++) beforeCount += _pageBlockCounts[i] || 0
  if (from === 0 && doc.childCount > 0) return { globalBlock: beforeCount, offset: 0 }
  let pos = 1
  for (let b = 0; b < doc.childCount; b++) {
    const child = doc.child(b)
    const childSize = child.nodeSize
    if (from >= pos && from < pos + childSize) {
      return { globalBlock: beforeCount + b, offset: Math.min(Math.max(0, from - pos), child.content.size) }
    }
    pos += childSize
  }
  return { globalBlock: beforeCount + doc.childCount, offset: 0 }
}

function restoreCaret(caret) {
  if (!caret) return
  let running = 0
  for (let i = 0; i < _pageBlockCounts.length; i++) {
    if (caret.globalBlock < running + _pageBlockCounts[i] || i === _pageBlockCounts.length - 1) {
      const ed = _pageEditors[i]
      if (!ed) return
      const local = Math.max(0, caret.globalBlock - running)
      const doc = ed.state.doc
      let pos = 1
      let idx = 0
      while (idx < local && idx < doc.childCount) {
        pos += doc.child(idx).nodeSize
        idx++
      }
      const maxPos = doc.content.size + 1
      const target = Math.min(Math.max(0, pos + caret.offset), maxPos)
      try {
        const tr = ed.state.tr.setSelection(_tipTapModules.TextSelection.near(ed.state.doc.resolve(target)))
        ed.view.dispatch(tr)
        ed.view.focus()
        if (ed.view.dom.scrollIntoView) {
          ed.view.dom.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
        _activePageIndex = i
        _currentEditor = ed
      } catch (e) {}
      return
    }
    running += _pageBlockCounts[i]
  }
}

function reflow() {
  if (!_docId || _pageSizes.free) return
  const doc = findDocument(_docId)
  if (!doc) return
  const caret = captureCaret()
  const fullHtml = serializeDocument()
  if (fullHtml === _lastFullHtml) return
  const blocks = extractBlocks(fullHtml)
  const pages = packBlocks(blocks)
  const same = pages.length === _pageEditors.length && pages.every(function(p, i) {
    return _pageEditors[i] && p.join('') === _pageEditors[i].getHTML()
  })
  if (same) {
    _lastFullHtml = fullHtml
    return
  }
  destroyPageEditors()
  _pageBlockCounts = pages.map(function(p) { return p.length })
  pages.forEach(function(pageBlocks, i) {
    createPage(i, pageBlocks.join(''))
  })
  applyPageSizes()
  _currentEditor = _pageEditors[0] || null
  _lastFullHtml = fullHtml
  restoreCaret(caret)
}

function rebuildWithCaretPreserved() {
  const caret = captureCaret()
  buildPages()
  _currentEditor = _pageEditors[0] || null
  restoreCaret(caret)
}

function scheduleReflow() {
  if (_pageSizes.free) return
  clearTimeout(_reflowTimer)
  _reflowTimer = setTimeout(function() {
    _reflowTimer = null
    reflow()
  }, 350)
}

export async function renderDocument(documentId) {
  const area = document.getElementById('boardArea')
  const doc = findDocument(documentId)
  if (!doc) return

  destroyEditor()

  _docId = documentId
  _activePageIndex = 0

  const initialSize = doc.paperSize || 'a4'
  const initialZoom = doc.paperZoom || 1.0

  let html = '<div class="document-editor">'
  html += '  <div class="document-header">'
  html += '    <h2 class="document-title" id="docTitle-' + doc.id + '" style="display:none" ondblclick="startRenameDocument(\'' + doc.id + '\')">' + doc.name + '</h2>'
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
    html += '        <option value="' + key + '"' + (key === initialSize ? ' selected' : '') + '>' + PAPER_CONFIG[key].label + '</option>'
  }
  html += '      </select>'
  html += '      <select class="paper-zoom-select" id="paperZoom-' + doc.id + '" title="Zoom">'
  for (const z of ZOOM_LEVELS) {
    html += '        <option value="' + z.value + '"' + (z.value === initialZoom ? ' selected' : '') + '>' + z.label + '</option>'
  }
  html += '      </select>'
  html += '    </div>'
  html += '  </div>'
  html += '  <div class="editor-content" id="editor-container-' + doc.id + '">'
  html += '    <div class="document-pages" id="doc-pages-' + doc.id + '"></div>'
  html += '  </div>'
  html += '</div>'
  area.innerHTML = html

  const containerEl = document.getElementById('editor-container-' + doc.id)
  _pagesEl = document.getElementById('doc-pages-' + doc.id)
  const paperSelect = document.getElementById('paperSize-' + doc.id)
  const zoomSelect = document.getElementById('paperZoom-' + doc.id)
  if (paperSelect) paperSelect.value = initialSize
  if (zoomSelect) zoomSelect.value = String(initialZoom)

  if (containerEl) {
    if (!_measureEl) {
      _measureEl = document.createElement('div')
      _measureEl.style.position = 'absolute'
      _measureEl.style.visibility = 'hidden'
      _measureEl.style.left = '-99999px'
      _measureEl.style.top = '0'
      const prose = document.createElement('div')
      prose.className = 'ProseMirror'
      _measureEl.appendChild(prose)
    }
    containerEl.appendChild(_measureEl)
  }

  await preloadTipTap()

  computePageSizes(containerEl, initialSize, initialZoom)
  buildPages()
  _currentEditor = _pageEditors[0] || null

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
  }

  if (paperSelect && containerEl) {
    paperSelect.addEventListener('change', function() {
      const size = this.value
      doc.paperSize = size
      const zoom = zoomSelect ? parseFloat(zoomSelect.value) : 1.0
      doc.paperZoom = zoom
      computePageSizes(containerEl, size, zoom)
      rebuildWithCaretPreserved()
      setDocumentPaperSize(doc.id, size)
      if (window.__autoSave) window.__autoSave()
    })
  }
  if (zoomSelect && containerEl) {
    zoomSelect.addEventListener('change', function() {
      const zoom = parseFloat(this.value)
      const size = paperSelect ? paperSelect.value : 'a4'
      doc.paperZoom = zoom
      computePageSizes(containerEl, size, zoom)
      rebuildWithCaretPreserved()
      if (window.__autoSave) window.__autoSave()
    })
  }

  if (containerEl) {
    if (_resizeObserver) {
      _resizeObserver.disconnect()
      _resizeObserver = null
    }
    _resizeObserver = new ResizeObserver(function() {
      clearTimeout(_resizeTimer)
      _resizeTimer = setTimeout(function() {
        const size = paperSelect ? paperSelect.value : 'a4'
        const zoom = zoomSelect ? parseFloat(zoomSelect.value) : 1.0
        computePageSizes(containerEl, size, zoom)
        rebuildWithCaretPreserved()
      }, 150)
    })
    _resizeObserver.observe(containerEl)
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
  destroyPageEditors()
  if (_resizeObserver) {
    _resizeObserver.disconnect()
    _resizeObserver = null
  }
  if (_measureEl && _measureEl.parentNode) {
    _measureEl.parentNode.removeChild(_measureEl)
  }
  clearTimeout(_reflowTimer)
  _reflowTimer = null
  clearTimeout(_resizeTimer)
  _resizeTimer = null
  _docId = null
  _pageSizes = { free: false, w: 0, h: 0 }
}
