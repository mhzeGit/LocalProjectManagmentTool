import { state, genId, findBoard } from './data.js'
import { render } from './sidebar.js'

const CSV_COLS = ['title','description','completed','priority','startDate','endDate','tags','members','checklists']

function escapeCSV(val) {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function unescapeCSV(val) {
  if (val == null) return ''
  let s = String(val).trim()
  if (s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"')
  }
  return s
}

function parseCSVRow(line) {
  const row = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  row.push(current)
  return row
}

function parseCSV(text) {
  const lines = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      current += ch
      if (ch === '"' && (i + 1 >= text.length || text[i + 1] !== '"')) {
        inQuotes = false
      } else if (ch === '"' && i + 1 < text.length && text[i + 1] === '"') {
        current += '"'
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        current += ch
      } else if (ch === '\n') {
        if (current.length > 0) {
          lines.push(current)
        }
        current = ''
      } else if (ch === '\r') {
      } else {
        current += ch
      }
    }
  }
  if (current.length > 0) {
    lines.push(current)
  }
  return lines
}

function serializeValue(val) {
  if (val == null) return ''
  if (Array.isArray(val)) {
    return val.map(v => String(v).replace(/;/g, '\\;')).join(';')
  }
  if (typeof val === 'object') {
    return JSON.stringify(val)
  }
  return String(val)
}

function deserializeValue(val, type) {
  if (!val) {
    if (type === 'array') return []
    if (type === 'object') return []
    if (type === 'boolean') return false
    return type === 'string' ? '' : null
  }
  if (type === 'array') {
    if (val.startsWith('[')) {
      try { return JSON.parse(val) } catch { return val.split(';').map(s => s.replace(/\\;/g, ';')).filter(Boolean) }
    }
    return val.split(';').map(s => s.replace(/\\;/g, ';')).filter(Boolean)
  }
  if (type === 'boolean') {
    return val.toLowerCase() === 'true' || val === '1'
  }
  if (type === 'object') {
    try { return JSON.parse(val) } catch { return [] }
  }
  return val
}

function showNotification(msg, duration) {
  duration = duration || 3000
  const el = document.getElementById('saveNotification')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(el._timeout)
  el._timeout = setTimeout(() => el.classList.remove('show'), duration)
}

export function exportBoardCSV() {
  const boardId = state.selectedBoardId
  if (!boardId) {
    showNotification('Select a board first', 3000)
    return
  }
  const board = findBoard(boardId)
  if (!board) return

  const lines = [CSV_COLS.join(',')]

  for (const col of board.columns) {
    for (const card of col.cards) {
      const row = [
        escapeCSV(card.title),
        escapeCSV(card.description || ''),
        escapeCSV(card.completed ? 'true' : 'false'),
        escapeCSV(card.priority || '3'),
        escapeCSV(card.startDate || ''),
        escapeCSV(card.endDate || ''),
        escapeCSV(serializeValue(card.tags || [])),
        escapeCSV(serializeValue(card.members || [])),
        escapeCSV(JSON.stringify(card.checklists || [])),
      ]
      lines.push(row.join(','))
    }
  }

  const csv = lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })

  if (window.showSaveFilePicker) {
    showSaveFilePicker({
      suggestedName: board.name.replace(/[^a-z0-9]/gi, '_') + '_tasks.csv',
      types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }]
    }).then(fileHandle => {
      return fileHandle.createWritable().then(w => w.write(blob).then(() => w.close()))
    }).then(() => {
      showNotification('Board exported as CSV')
    }).catch(err => {
      if (err.name !== 'AbortError') showNotification('Export failed: ' + err.message, 4000)
    })
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = board.name.replace(/[^a-z0-9]/gi, '_') + '_tasks.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    showNotification('Board exported as CSV')
  }
}

export function importBoardCSV() {
  const boardId = state.selectedBoardId
  if (!boardId) {
    showNotification('Select a board first', 3000)
    return
  }
  const board = findBoard(boardId)
  if (!board) return
  if (!board.columns.length) {
    showNotification('Board has no columns. Add a column first.', 3000)
    return
  }

  const targetCol = board.columns[0]

  function processFile(file) {
    const reader = new FileReader()
    reader.onload = function(e) {
      const text = e.target.result
      const lines = parseCSV(text)
      if (lines.length < 2) {
        showNotification('CSV file is empty or has no data rows', 3000)
        return
      }

      const headers = parseCSVRow(lines[0])
      const colIndex = {}
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i].trim().toLowerCase()
        colIndex[h] = i
      }

      let imported = 0
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVRow(lines[i])
        if (row.length < 1) continue
        if (row.every(c => !c.trim())) continue

        const title = unescapeCSV(colIndex.title !== undefined ? row[colIndex.title] : '')
        if (!title.trim()) continue

        const card = {
          id: genId(),
          title: title.trim(),
          description: colIndex.description !== undefined ? unescapeCSV(row[colIndex.description]) : '',
          completed: colIndex.completed !== undefined ? deserializeValue(unescapeCSV(row[colIndex.completed]), 'boolean') : false,
          priority: colIndex.priority !== undefined ? unescapeCSV(row[colIndex.priority]) : '3',
          startDate: colIndex.startdate !== undefined ? unescapeCSV(row[colIndex.startdate]) || null : null,
          endDate: colIndex.enddate !== undefined ? unescapeCSV(row[colIndex.enddate]) || null : null,
          tags: colIndex.tags !== undefined ? deserializeValue(unescapeCSV(row[colIndex.tags]), 'array') : [],
          members: colIndex.members !== undefined ? deserializeValue(unescapeCSV(row[colIndex.members]), 'array') : [],
          checklists: colIndex.checklists !== undefined ? deserializeValue(unescapeCSV(row[colIndex.checklists]), 'object') : [],
        }
        targetCol.cards.push(card)
        imported++
      }

      render()
      showNotification('Imported ' + imported + ' card(s) from CSV')
    }
    reader.readAsText(file)
  }

  if (window.showOpenFilePicker) {
    showOpenFilePicker({
      multiple: false,
      types: [{ description: 'CSV File', accept: { 'text/csv': ['.csv'] } }]
    }).then(([handle]) => {
      return handle.getFile()
    }).then(file => {
      processFile(file)
    }).catch(err => {
      if (err.name !== 'AbortError') showNotification('Import failed: ' + err.message, 4000)
    })
  } else {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv'
    input.addEventListener('change', function() {
      if (input.files && input.files[0]) {
        processFile(input.files[0])
      }
    })
    input.click()
  }
}
