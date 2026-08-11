import { findDocument } from './data.js'
import { saveDocumentContent, setDocumentPaperSize } from './store.js'

let _currentEditor = null
let _resizeObserver = null
let _docId = null
let _measureEl = null
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
      Node: core.Node,
      mergeAttributes: core.mergeAttributes,
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

function createPageExtension(M) {
  const { Node, mergeAttributes } = M
  return Node.create({
    name: 'page',
    group: 'block',
    content: 'block+',
    defining: true,

    parseHTML() {
      return [{ tag: 'div[data-type="page"]' }]
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'page', class: 'document-page' }), 0]
    },
  })
}

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
    M.StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
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
    createPageExtension(M),
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

function applyPaperLayout(paperEl) {
  if (!paperEl) return
  if (_pageSizes.free) {
    paperEl.dataset.size = 'free'
    paperEl.style.width = ''
    paperEl.style.height = ''
    paperEl.style.removeProperty('--page-height')
    return
  }
  paperEl.dataset.size = 'fixed'
  paperEl.style.width = _pageSizes.w + 'px'
  paperEl.style.height = ''
  paperEl.style.setProperty('--page-height', _pageSizes.h + 'px')
}

function extractBlocksHtml(html) {
  const tmp = document.createElement('div')
  tmp.innerHTML = html || ''
  const blocks = []
  function collect(el) {
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i]
      if (child.dataset && child.dataset.type === 'page') {
        collect(child)
      } else {
        blocks.push(child.outerHTML)
      }
    }
  }
  collect(tmp)
  return blocks
}

function measureBlocks(blocks) {
  if (!_measureEl || !_currentEditor) return blocks.map(function() { return 0 })
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

function buildPagesHtml(pages) {
  if (pages.length === 0) pages = [[]]
  return pages.map(function(p) {
    return '<div data-type="page" class="document-page">' + (p.length ? p.join('') : '<p></p>') + '</div>'
  }).join('')
}

function serializeDocument() {
  return _currentEditor ? _currentEditor.getHTML() : ''
}

function captureCaretInDoc(doc) {
  if (!_currentEditor || !_currentEditor.view) return null
  const dom = _currentEditor.view.dom
  if (!document.activeElement || !(dom === document.activeElement || dom.contains(document.activeElement))) {
    return null
  }
  const from = _currentEditor.state.selection.from
  if (from === 0 && doc.childCount > 0) return { block: 0, offset: 0 }
  let pos = 1
  let global = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name === 'page') {
      let inner = pos + 1
      for (let j = 0; j < child.childCount; j++) {
        const b = child.child(j)
        if (from >= inner && from <= inner + b.content.size) {
          return { block: global, offset: from - inner }
        }
        inner += b.nodeSize
        global++
      }
      pos += child.nodeSize
    } else {
      if (from >= pos && from <= pos + child.content.size) {
        return { block: global, offset: from - pos }
      }
      pos += child.nodeSize
      global++
    }
  }
  return { block: global, offset: 0 }
}

function restoreCaretInDoc(doc, caret) {
  if (!caret || !_currentEditor) return
  let pos = 1
  let global = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    if (child.type.name === 'page') {
      let inner = pos + 1
      for (let j = 0; j < child.childCount; j++) {
        const b = child.child(j)
        if (global === caret.block) {
          const maxPos = inner + b.content.size
          const target = Math.min(Math.max(inner, inner + caret.offset), maxPos)
          setCaret(target)
          return
        }
        inner += b.nodeSize
        global++
      }
      pos += child.nodeSize
    } else {
      if (global === caret.block) {
        const maxPos = pos + child.content.size
        const target = Math.min(Math.max(pos, pos + caret.offset), maxPos)
        setCaret(target)
        return
      }
      pos += child.nodeSize
      global++
    }
  }
}

function setCaret(pos) {
  if (!_currentEditor) return
  try {
    const tr = _currentEditor.state.tr.setSelection(
      _tipTapModules.TextSelection.near(_currentEditor.state.doc.resolve(pos))
    )
    _currentEditor.view.dispatch(tr)
    _currentEditor.view.focus()
  } catch (e) {}
}

function fragFromNodes(schema, nodes) {
  return schema.topNodeType.create(null, nodes).content
}

function reflow() {
  if (!_docId || _pageSizes.free) return
  const editor = _currentEditor
  if (!editor) return
  if (editor.view.composing) {
    scheduleReflow()
    return
  }
  const caret = captureCaretInDoc(editor.state.doc)
  const fullHtml = editor.getHTML()
  if (fullHtml === _lastFullHtml) return
  const blocksHtml = extractBlocksHtml(fullHtml)
  const pages = packBlocks(blocksHtml)
  const newHtml = buildPagesHtml(pages)
  if (newHtml === fullHtml) {
    _lastFullHtml = fullHtml
    return
  }

  const doc = editor.state.doc
  const schema = editor.schema
  const pageType = schema.nodes.page
  const blockNodes = []
  function collectBlocks(node) {
    if (node.type.name === 'page') {
      node.content.forEach(function(b) { collectBlocks(b) })
    } else {
      blockNodes.push(node)
    }
  }
  doc.content.forEach(function(child) { collectBlocks(child) })

  const pageNodes = []
  let idx = 0
  for (let i = 0; i < pages.length; i++) {
    const inner = []
    for (let j = 0; j < pages[i].length; j++) {
      inner.push(blockNodes[idx] || schema.nodes.paragraph.create())
      idx++
    }
    if (inner.length === 0) inner.push(schema.nodes.paragraph.create())
    pageNodes.push(pageType.create(null, fragFromNodes(schema, inner)))
  }

  const docFragment = fragFromNodes(schema, pageNodes)
  const tr = editor.state.tr
  try {
    tr.replaceWith(0, doc.content.size, docFragment)
    tr.setMeta('addToHistory', false)
    editor.view.dispatch(tr)
  } catch (e) {
    console.error('Document reflow error:', e)
    return
  }
  _lastFullHtml = serializeDocument()
  restoreCaretInDoc(editor.state.doc, caret)
}

function refreshLayout() {
  const doc = findDocument(_docId)
  if (!doc) return
  const editor = _currentEditor
  const paperEl = editor ? editor.view.dom : null
  if (!editor || !paperEl) return
  _lastFullHtml = null
  if (_pageSizes.free) {
    const blocks = extractBlocksHtml(doc.content || '')
    editor.commands.setContent(blocks.join('') || '<p></p>', true)
    applyPaperLayout(paperEl)
    return
  }
  applyPaperLayout(paperEl)
  reflow()
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
  _lastFullHtml = null

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
  html += '    <div class="document-paper" id="editor-' + doc.id + '"></div>'
  html += '  </div>'
  html += '</div>'
  area.innerHTML = html

  const containerEl = document.getElementById('editor-container-' + doc.id)
  const paperEl = document.getElementById('editor-' + doc.id)
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
  const M = _tipTapModules

  computePageSizes(containerEl, initialSize, initialZoom)
  applyPaperLayout(paperEl)

  _currentEditor = new M.Editor({
    element: paperEl,
    extensions: getEditorExtensions(M),
    content: doc.content || '',
    onUpdate: function() {
      if (!_docId) return
      const full = serializeDocument()
      saveDocumentContent(_docId, full)
      if (window.__autoSave) window.__autoSave()
      scheduleReflow()
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

  if (paperSelect && containerEl) {
    paperSelect.addEventListener('change', function() {
      const size = this.value
      doc.paperSize = size
      const zoom = zoomSelect ? parseFloat(zoomSelect.value) : 1.0
      doc.paperZoom = zoom
      computePageSizes(containerEl, size, zoom)
      refreshLayout()
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
      refreshLayout()
      if (window.__autoSave) window.__autoSave()
    })
  }

  refreshLayout()

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
        refreshLayout()
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
  if (_currentEditor) {
    try { _currentEditor.destroy() } catch (e) {}
    _currentEditor = null
  }
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
  _lastFullHtml = null
}
