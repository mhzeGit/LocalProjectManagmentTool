import { render, selectWorkspace, selectProject, selectBoard, selectDocument, selectCanvas, selectDashboard, toggleAddBoardMenu } from './sidebar.js'
import { setupModalKeyboard } from './modal.js'
import { setInlineEditRender } from './inlineEdit.js'

import { switchView, showWsCtxMenu, showProjectCtxMenu } from './board.js'
import { openModal, closeModal, openCardDetail } from './modal.js'
import {
  createWorkspace, deleteWorkspace,
  createProject, deleteProject,   archiveProject, copyProject, setProjectColor,
  createBoard, deleteBoard,
  deleteColumn, archiveColumn, copyColumn, pasteColumn, duplicateColumn, pasteColumnToBoard,
  createCard, saveCard, deleteCard, archiveCard, copyCard, duplicateCard, pasteCard, pasteIntoColumn, getCopiedCard, toggleCardCompleted, setCardColor, moveCardToBoardColumn,
  addProjectDirect, addCardDirect, addColumnDirect,
  createDocument, deleteDocument, setDocumentPaperSize,
  createCanvas, deleteCanvas, renameCanvas
} from './store.js'
import { startRenameColumn, startRenameCard, startRenameProject, startRenameDocument, startRenameCanvas } from './inlineEdit.js'
import { showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus } from './columnMenu.js'

import { calendarPrevMonth, calendarNextMonth, calendarToday, calendarAddCard, calendarCopyCard, calendarDuplicateCard, calendarArchiveCard, calendarPasteCard } from './calendar.js'

import { initSelfMember, renderMemberBar, setSelfMember, getSelfMember, addMember, editMember, removeMember } from './members.js'
import { initFilterEvents, resetFilters, filterCards, getActiveFilterCount } from './filters.js'
import { openPreferences, closePreferences, initTheme, initGlowMultiplier } from './preferences.js'
import { initPersistence, handleKeyDown, createWorkspaceFile, openWorkspaceFile, addProjectFolder, locateExistingProject, locateProjectFolder, closeWorkspace, getSaveMode, hasProjectHandle } from './persistence.js'
import { getCurrentWorkspace, state } from './data.js'
import { initMenuBar } from './menubar.js'
import { exportBoardCSV, importBoardCSV } from './io.js'
import { performUndo, performRedo } from './history.js'
import { isCanvasActive } from './canvas.js'
window.__isCanvasActive = isCanvasActive
import { setCloseWorkspaceFn } from './store.js'

import './dragscroll.js'

initTheme()
initGlowMultiplier()
setInlineEditRender(render)
setupModalKeyboard()
initSelfMember()
setCloseWorkspaceFn(closeWorkspace)
initPersistence()
initMenuBar()

document.addEventListener('keydown', handleKeyDown)

document.addEventListener('keydown', function(e) {
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.isContentEditable) return
  if (isCanvasActive()) return
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); performUndo()
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); performRedo()
  }
})

initFilterEvents()

Object.assign(window, {
  performUndo,
  performRedo,
  selectWorkspace,
  selectProject,
  selectBoard,
  selectDocument,
  selectCanvas,
  selectDashboard,
  toggleAddBoardMenu,
  switchView,
  showWsCtxMenu,
  showProjectCtxMenu,
  openModal,
  closeModal,
  createWorkspace,
  deleteWorkspace,
  createProject,
  deleteProject,
  archiveProject,
  copyProject,
  setProjectColor,
  createBoard,
  deleteBoard,
  deleteColumn, archiveColumn, copyColumn, pasteColumn, duplicateColumn, pasteColumnToBoard,
  createCard,
  saveCard,
  deleteCard,
  archiveCard,
  copyCard,
  duplicateCard,
  pasteCard,
  pasteIntoColumn,
  getCopiedCard,
  toggleCardCompleted,
  setCardColor,
  moveCardToBoardColumn,
  addProjectDirect,
  addCardDirect,
  addColumnDirect,
  createDocument,
  deleteDocument,
  setDocumentPaperSize,
  createCanvas,
  deleteCanvas,
  renameCanvas,
  startRenameColumn,
  startRenameCard,
  startRenameProject,
  startRenameDocument,
  startRenameCanvas,
  showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus,
  openCardDetail,
  calendarPrevMonth,
  calendarNextMonth,
  calendarToday,
  calendarAddCard,
  calendarCopyCard,
  calendarDuplicateCard,
  calendarArchiveCard,
  calendarPasteCard,
  renderMemberBar,
  setSelfMember,
  resetFilters,
  getSelfMember,
  addMember,
  editMember,
  removeMember,
  openPreferences,
  closePreferences,
  closeWorkspace,
  exportBoardCSV,
  importBoardCSV,
})

async function onboardingCreateWorkspace() {
  await createWorkspaceFile()
  if (getSaveMode() === 'workspace') {
    openModal('workspace')
  }
}

async function onboardingOpenWorkspace() {
  await openWorkspaceFile()
  const w = getCurrentWorkspace()
  if (w && w.members.length > 0 && !state.selfMemberId) {
    openPreferences('members')
  }
}

Object.assign(window, {
  createWorkspaceFile,
  openWorkspaceFile,
  addProjectFolder,
  locateExistingProject,
  locateProjectFolder,
  hasProjectHandle,
  onboardingCreateWorkspace,
  onboardingOpenWorkspace,
})

render()
