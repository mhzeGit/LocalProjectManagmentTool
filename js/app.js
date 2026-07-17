import { render, selectWorkspace, selectProject, selectBoard, toggleAddBoardMenu } from './sidebar.js'
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
  addProjectDirect, addCardDirect, addColumnDirect
} from './store.js'
import { startRenameColumn, startRenameCard, startRenameProject } from './inlineEdit.js'
import { showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus } from './columnMenu.js'

import './dragscroll.js'

setInlineEditRender(render)
setupModalKeyboard()

Object.assign(window, {
  selectWorkspace,
  selectProject,
  selectBoard,
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
  startRenameColumn,
  startRenameCard,
  startRenameProject,
  showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus,
  openCardDetail,
})

render()
