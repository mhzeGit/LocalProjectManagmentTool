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
import { openPreferences, closePreferences } from './preferences.js'
import { initPersistence, handleKeyDown } from './persistence.js'

import './dragscroll.js'

setInlineEditRender(render)
setupModalKeyboard()
initSelfMember()
initPersistence()

document.addEventListener('keydown', handleKeyDown)

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
  getSelfMember,
  addMember,
  editMember,
  removeMember,
  openPreferences,
  closePreferences,
})

render()
