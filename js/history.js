import { render } from './sidebar.js'

const MAX_SIZE = 200
let undoStack = []
let redoStack = []
let isUndoRedoing = false

export function pushCommand(cmd) {
  if (isUndoRedoing) return
  undoStack.push(cmd)
  if (undoStack.length > MAX_SIZE) undoStack.shift()
  redoStack = []
}

function isCanvasActive() {
  try { return window.__isCanvasActive ? window.__isCanvasActive() : false }
  catch (e) { return false }
}

export function performUndo() {
  if (isCanvasActive()) return
  if (undoStack.length === 0) return
  isUndoRedoing = true
  const cmd = undoStack.pop()
  cmd.undo()
  redoStack.push(cmd)
  isUndoRedoing = false
  render()
}

export function performRedo() {
  if (isCanvasActive()) return
  if (redoStack.length === 0) return
  isUndoRedoing = true
  const cmd = redoStack.pop()
  cmd.redo()
  undoStack.push(cmd)
  isUndoRedoing = false
  render()
}

export function clearHistory() {
  undoStack = []
  redoStack = []
}

export function canUndo() {
  return undoStack.length > 0
}

export function canRedo() {
  return redoStack.length > 0
}
