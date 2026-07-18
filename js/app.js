import { render, selectWorkspace, selectProject, selectBoard, selectDocument, selectDashboard, toggleAddBoardMenu } from './sidebar.js'
import { setupModalKeyboard } from './modal.js'
import { setInlineEditRender } from './inlineEdit.js'

import { switchView, showWsCtxMenu, showProjectCtxMenu } from './board.js'
import { openModal, closeModal, openCardDetail } from './modal.js'
import {
  createWorkspace, deleteWorkspace,
  createProject, deleteProject,   archiveProject, copyProject, setProjectColor,
  createBoard, deleteBoard,
  deleteColumn, archiveColumn, copyColumn, pasteColumn, duplicateColumn, pasteColumnToBoard,
  createCard, saveCard, deleteCard, archiveCard, copyCard, duplicateCard, pasteCard, pasteIntoColumn, getCopiedCard, toggleCardCompleted,
  addProjectDirect, addCardDirect, addColumnDirect,
  createDocument, deleteDocument
} from './store.js'
import { startRenameColumn, startRenameCard, startRenameProject, startRenameDocument } from './inlineEdit.js'
import { showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus } from './columnMenu.js'

import { calendarPrevMonth, calendarNextMonth, calendarToday, calendarAddCard, calendarCopyCard, calendarDuplicateCard, calendarArchiveCard, calendarPasteCard } from './calendar.js'

import { initSelfMember, renderMemberBar, setSelfMember, getSelfMember, addMember, editMember, removeMember } from './members.js'
import { initFilterEvents, resetFilters, filterCards, getActiveFilterCount } from './filters.js'
import { openPreferences, closePreferences, initTheme, initGlowMultiplier } from './preferences.js'
import { initPersistence, handleKeyDown, openFolder, closeFolder, getSaveMode } from './persistence.js'
import { getCurrentWorkspace, state } from './data.js'
import { initMenuBar } from './menubar.js'
import { exportBoardCSV, importBoardCSV } from './io.js'

import './dragscroll.js'

initTheme()
initGlowMultiplier()
setInlineEditRender(render)
setupModalKeyboard()
initSelfMember()
initPersistence()
initMenuBar()

document.addEventListener('keydown', handleKeyDown)

initFilterEvents()

Object.assign(window, {
  selectWorkspace,
  selectProject,
  selectBoard,
  selectDocument,
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
  addProjectDirect,
  addCardDirect,
  addColumnDirect,
  createDocument,
  deleteDocument,
  startRenameColumn,
  startRenameCard,
  startRenameProject,
  startRenameDocument,
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
  closeFolder,
  exportBoardCSV,
  importBoardCSV,
})

async function onboardingCreateWorkspace() {
  if (getSaveMode() !== 'file') {
    await openFolder()
    if (getSaveMode() !== 'file') return
  }
  openModal('workspace')
}

async function onboardingOpenWorkspace() {
  await openFolder()
  const w = getCurrentWorkspace()
  if (w && w.members.length > 0 && !state.selfMemberId) {
    openPreferences('members')
  }
}

Object.assign(window, {
  onboardingCreateWorkspace,
  onboardingOpenWorkspace,
})

render()
