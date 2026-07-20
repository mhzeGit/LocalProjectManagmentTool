import { render, selectWorkspace, selectProject, selectBoard, selectDocument, selectCanvas, selectDashboard, toggleAddBoardMenu, showSidebarContextMenu, showNavChildContextMenu, showFolderContextMenu, toggleFolder } from './sidebar.js'
import { setupModalKeyboard } from './modal.js'
import { setInlineEditRender } from './inlineEdit.js'

import { switchView, showWsCtxMenu, showProjectCtxMenu, selectWorkspaceHome } from './board.js'
import { openModal, closeModal, openCardDetail } from './modal.js'
import {
  createWorkspace, deleteWorkspace,
  createProject, deleteProject,   archiveProject, copyProject, setProjectColor, setWorkspaceColor,
  createBoard, quickCreateBoard, deleteBoard,
  deleteColumn, archiveColumn, copyColumn, pasteColumn, duplicateColumn, pasteColumnToBoard, setColumnColor,
  createCard, saveCard, deleteCard, archiveCard, copyCard, duplicateCard, pasteCard, pasteIntoColumn, getCopiedCard, toggleCardCompleted, setCardColor, moveCardToBoardColumn,
  addProjectDirect, addCardDirect, addColumnDirect,
  createDocument, quickCreateDocument, deleteDocument, setDocumentPaperSize,
  createCanvas, quickCreateCanvas, deleteCanvas, renameCanvas,
  createFolder, createFolderFromModal, deleteFolder, renameFolder,
  startRenameSidebarItem, moveItemToFolder, removeItemFromFolder, reorderSidebar, reorderFolderItems
} from './store.js'
import { startRenameColumn, startRenameCard, startRenameProject, startRenameWorkspace, startRenameDocument, startRenameCanvas } from './inlineEdit.js'
import { showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus } from './columnMenu.js'

import { calendarPrevMonth, calendarNextMonth, calendarToday, calendarAddCard, calendarCopyCard, calendarDuplicateCard, calendarArchiveCard, calendarPasteCard } from './calendar.js'

import { initSelfMember, renderMemberBar, setSelfMember, getSelfMember, addMember, editMember, removeMember } from './members.js'
import { initFilterEvents, resetFilters, filterCards, getActiveFilterCount } from './filters.js'
import { openPreferences, closePreferences, initTheme, initGlowMultiplier } from './preferences.js'
import { initPersistence, handleKeyDown, setupUserDirectory, openUserFile, createWorkspaceInUser, addExistingWorkspace, locateWorkspaceFile, addProjectToWorkspace, locateExistingProjectInWorkspace, locateProjectFolder, closeUserDirectory, getSaveMode, hasProjectHandle } from './persistence.js'
import { getCurrentWorkspace, state } from './data.js'
import { initMenuBar } from './menubar.js'
import { exportBoardCSV, importBoardCSV } from './io.js'
import { performUndo, performRedo } from './history.js'
import { isCanvasActive } from './canvas.js'
window.__isCanvasActive = isCanvasActive

import './dragscroll.js'

initTheme()
initGlowMultiplier()
setInlineEditRender(render)
setupModalKeyboard()
initSelfMember()
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
  selectWorkspaceHome,
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
  setWorkspaceColor,
  createBoard, quickCreateBoard,
  deleteBoard,
  setColumnColor,
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
  createDocument, quickCreateDocument,
  deleteDocument,
  setDocumentPaperSize,
  createCanvas, quickCreateCanvas,
  deleteCanvas,
  renameCanvas,
  startRenameColumn,
  startRenameCard,
  startRenameProject,
  startRenameWorkspace,
  startRenameDocument,
  startRenameCanvas,
  showColumnContextMenu, showAddColContextMenu, closeAllColumnMenus,
  showSidebarContextMenu, showNavChildContextMenu, showFolderContextMenu, toggleFolder,
  createFolder, createFolderFromModal, deleteFolder, renameFolder,
  startRenameSidebarItem, moveItemToFolder, removeItemFromFolder, reorderSidebar, reorderFolderItems,
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
  closeUserDirectory,
  exportBoardCSV,
  importBoardCSV,
})

Object.assign(window, {
  setupUserDirectory,
  openUserFile,
  createWorkspaceInUser,
  addExistingWorkspace,
  locateWorkspaceFile,
  addProjectToWorkspace,
  locateExistingProjectInWorkspace,
  locateProjectFolder,
  hasProjectHandle,
})

;(function() {
  var _timers = {}
  document.addEventListener('mouseover', function(e) {
    document.querySelectorAll('.tl-ctx-menu, .col-menu.open').forEach(function(menu) {
      var el = document.elementFromPoint(e.clientX, e.clientY)
      var inside = el && menu.contains(el)
      var key = menu.id || menu._uid || (menu._uid = 'm' + Date.now() + Math.random())
      if (inside) {
        if (_timers[key]) { clearTimeout(_timers[key]); delete _timers[key] }
      } else if (!_timers[key]) {
        _timers[key] = setTimeout(function() {
          if (menu.classList.contains('tl-ctx-menu')) {
            if (menu.parentNode) menu.remove()
          } else {
            menu.classList.remove('open')
            menu.style.left = ''
            menu.style.top = ''
          }
          delete _timers[key]
        }, 500)
      }
    })
  })
})()

render()
