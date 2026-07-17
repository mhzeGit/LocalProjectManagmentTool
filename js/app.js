import { render, selectWorkspace, selectProject, selectBoard } from './sidebar.js'
import { setupModalKeyboard } from './modal.js'
import { setInlineEditRender } from './inlineEdit.js'

import { switchView } from './board.js'
import { openModal, closeModal, openCardDetail } from './modal.js'
import {
  createWorkspace, deleteWorkspace,
  createProject, deleteProject,
  createBoard, deleteBoard,
  deleteColumn, archiveColumn, copyColumn, pasteColumn, duplicateColumn, pasteColumnToBoard,
  createCard, saveCard, deleteCard, archiveCard, copyCard, duplicateCard, pasteCard, pasteIntoColumn, getCopiedCard, toggleCardCompleted,
  addCardDirect, addColumnDirect
} from './store.js'
import { startRenameColumn, startRenameCard } from './inlineEdit.js'
import { showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus } from './columnMenu.js'

import './dragscroll.js'

setInlineEditRender(render)
setupModalKeyboard()

Object.assign(window, {
  selectWorkspace,
  selectProject,
  selectBoard,
  switchView,
  openModal,
  closeModal,
  createWorkspace,
  deleteWorkspace,
  createProject,
  deleteProject,
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
  addCardDirect,
  addColumnDirect,
  startRenameColumn,
  startRenameCard,
  showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus,
  openCardDetail,
})

render()
