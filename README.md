# Local Project Management Tool

A **local-first** project management web app that runs entirely in your browser. All data stays on your machine — no servers, no accounts, no cloud dependency.

**[Launch the App](https://mhzegit.github.io/LocalProjectManagmentTool/)**

---

## Features

- **Multi-level hierarchy** — Workspaces > Projects > Boards > Columns > Cards
- **Three views** — Kanban board, Timeline (Gantt), and Calendar
- **Rich card editor** — Description, due dates, priority, tags, members, nested checklists
- **Inline editing** — Rename projects, boards, columns, and cards on the spot
- **Drag & drop** — Reorder columns, cards, and projects freely
- **Copy / paste** — Duplicate cards and columns across boards
- **Archive** — Archive cards and projects instead of permanent deletion
- **Documents** — Rich-text documents associated with any project
- **Members** — Add members to workspaces and assign them to cards
- **Preferences** — Theme (light/dark), font size, and member management
- **Persistence** — Data saved locally via the File System Access API or browser `localStorage`
- **Filters** — Filter cards by member, tag, priority, and completion status
- **Export** — Save your data as a JSON file on disk

## Data Persistence

Choose between two storage modes:

- **File mode** — Pick a folder on your drive; the app saves a `project-data.json` file there. Shareable, backup-friendly, and survives clearing browser storage.
- **Local mode** — Stores data in `localStorage`. Quick for ephemeral use, but can be lost if storage is cleared.

## Usage

1. [Open the app](https://mhzegit.github.io/LocalProjectManagmentTool/)
2. Create or open a workspace (pick a folder on your computer)
3. Add a project, create boards and columns, then start adding cards
4. Switch between Kanban, Timeline, and Calendar views
5. Use the member bar and filter bar to narrow down what you see

## Tech

Pure vanilla JavaScript, CSS, and HTML — no frameworks, no build step. Runs on any modern browser.
