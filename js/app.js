import { render } from './sidebar.js'
import { setupModalKeyboard } from './modal.js'
import { setInlineEditRender } from './inlineEdit.js'

import { selectWorkspace, selectProject, selectBoard } from './sidebar.js'
import { switchView } from './board.js'
import { openModal, closeModal, openCardDetail } from './modal.js'
import {
  createWorkspace, deleteWorkspace,
  createProject, deleteProject,
  createBoard, deleteBoard,
  deleteColumn,
  createCard, saveCard, deleteCard, toggleCardCompleted,
  addCardDirect, addColumnDirect
} from './store.js'
import { startRenameColumn, startRenameCard } from './inlineEdit.js'
import { toggleColumnMenu } from './columnMenu.js'

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
  deleteColumn,
  createCard,
  saveCard,
  deleteCard,
  toggleCardCompleted,
  addCardDirect,
  addColumnDirect,
  startRenameColumn,
  startRenameCard,
  toggleColumnMenu,
  openCardDetail,
})

render()
