let _editor = null

const TIPTAP_VERSION = '2.6.6'

export async function initCardEditor(content) {
  destroyCardEditor()

  const containerEl = document.getElementById('cd-desc-editor')
  if (!containerEl) return

  const { Editor } = await import('https://esm.sh/@tiptap/core@' + TIPTAP_VERSION)
  const StarterKit = (await import('https://esm.sh/@tiptap/starter-kit@' + TIPTAP_VERSION)).default
  const Underline = (await import('https://esm.sh/@tiptap/extension-underline@' + TIPTAP_VERSION)).default
  const Link = (await import('https://esm.sh/@tiptap/extension-link@' + TIPTAP_VERSION)).default
  const Placeholder = (await import('https://esm.sh/@tiptap/extension-placeholder@' + TIPTAP_VERSION)).default

  _editor = new Editor({
    element: containerEl,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      Placeholder.configure({
        placeholder: 'Add a more detailed description…',
      }),
    ],
    content: content || '',
  })

  setupToolbar()
}

function setupToolbar() {
  const toolbar = document.getElementById('cd-editor-toolbar')
  if (!toolbar || !_editor) return

  toolbar.addEventListener('mousedown', function(e) {
    const btn = e.target.closest('[data-cmd]')
    if (!btn || !_editor) return
    e.preventDefault()
    const cmd = btn.dataset.cmd
    const ed = _editor

    const actions = {
      bold: () => ed.chain().focus().toggleBold().run(),
      italic: () => ed.chain().focus().toggleItalic().run(),
      underline: () => ed.chain().focus().toggleUnderline().run(),
      strike: () => ed.chain().focus().toggleStrike().run(),
      h1: () => ed.chain().focus().toggleHeading({ level: 1 }).run(),
      h2: () => ed.chain().focus().toggleHeading({ level: 2 }).run(),
      h3: () => ed.chain().focus().toggleHeading({ level: 3 }).run(),
      bulletList: () => ed.chain().focus().toggleBulletList().run(),
      orderedList: () => ed.chain().focus().toggleOrderedList().run(),
      blockquote: () => ed.chain().focus().toggleBlockquote().run(),
      codeBlock: () => ed.chain().focus().toggleCodeBlock().run(),
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
    }

    if (actions[cmd]) actions[cmd]()
    updateToolbarState(toolbar)
  })

  _editor.on('selectionUpdate', function() {
    updateToolbarState(toolbar)
  })

  updateToolbarState(toolbar)
}

function updateToolbarState(toolbar) {
  if (!toolbar || !_editor) return
  toolbar.querySelectorAll('[data-cmd]').forEach(function(btn) {
    const cmd = btn.dataset.cmd
    let active = false
    if (cmd === 'bold') active = _editor.isActive('bold')
    else if (cmd === 'italic') active = _editor.isActive('italic')
    else if (cmd === 'underline') active = _editor.isActive('underline')
    else if (cmd === 'strike') active = _editor.isActive('strike')
    else if (cmd === 'h1') active = _editor.isActive('heading', { level: 1 })
    else if (cmd === 'h2') active = _editor.isActive('heading', { level: 2 })
    else if (cmd === 'h3') active = _editor.isActive('heading', { level: 3 })
    else if (cmd === 'bulletList') active = _editor.isActive('bulletList')
    else if (cmd === 'orderedList') active = _editor.isActive('orderedList')
    else if (cmd === 'blockquote') active = _editor.isActive('blockquote')
    else if (cmd === 'codeBlock') active = _editor.isActive('codeBlock')
    else if (cmd === 'link') active = _editor.isActive('link')
    btn.classList.toggle('editor-btn-active', active)
  })
}

export function destroyCardEditor() {
  if (_editor) {
    _editor.destroy()
    _editor = null
  }
}

export function getCardEditorHTML() {
  if (!_editor) return ''
  const text = _editor.getText().trim()
  if (!text) return ''
  return _editor.getHTML()
}
