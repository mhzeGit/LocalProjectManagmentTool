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

## Local server and AI agents (pm)

Run the app through the bundled local server to get autosave, live updates and an agent CLI:

```
python server/pm.py open        # starts the server in the background and opens the app in its own window
python server/pm.py guide       # the protocol for AI agents
python server/pm.py status      # plan overview of the project linked under the current folder
```

- **Same files.** The server reads and writes the same `user.json`, workspace files and project folders as File mode, so the hosted app keeps working on them too. Where each file lives is in `~/.pmtool/library.json` (`pm link <folder>` adds a project folder).
- **Autosave and live updates.** The page saves changes as you make them (no Ctrl+S) and shows changes made by agents within a second. When you and an agent edit the same project at once, both changes are kept; for the same field, yours wins.
- **Production plans.** `pm setup` gives a project a Production board (Now, This Week, Backlog, Parking Lot, Done), milestones and a Direction document. The project's home becomes a **Focus** page: the director's brief, what to do now, this week, the current milestone and the roadmap. Cards gain an estimate, a milestone and a one-line "why".
- **Agent commands.** Add, edit, move, split and finish cards; manage milestones; `pm schedule` dates the work from estimates and capacity and forecasts each milestone; `pm brief` posts the note on the Focus page; `pm doc` reads and writes documents as Markdown.
- **Local only.** The server listens on 127.0.0.1:7420 and refuses requests from other sites. Python 3.9+, no packages.

## Phone and other devices (GitHub sync)

Your PC's server can mirror your projects into a **private** GitHub repository. Any browser (your iPhone included) opens the hosted app, connects to that repository with a token that can only reach it, and reads and writes your boards there. Free: a private repo plus GitHub Pages.

```
python server/pm.py sync setup YOUR_NAME/planner-data --create   # once: creates the private repo and pushes your projects
python server/pm.py sync status                                  # last sync pass
python server/pm.py autostart on                                 # optional: start the server when you sign in to Windows
```

- **How it syncs.** While the server runs it pushes local changes within seconds and pulls phone changes every 30 seconds. The phone saves about 1.5 s after an edit and checks for PC changes every 20 seconds and whenever you return to the app.
- **Conflicts.** Each card, column and document merges field by field, so edits to different things never clash. If the phone and the PC change the same field, the phone wins.
- **When the PC is off.** Phone edits wait in the repository and reach the PC the next time its server runs.
- **On the phone.** Workspaces and projects are created and linked on the PC; everything inside them (boards, cards, documents, plans) works on the phone. Move cards with the card's **Column** field (drag and drop is unreliable on touch screens).

### Set up your iPhone

1. **Create a token** on github.com: Settings > Developer settings > Personal access tokens > **Fine-grained tokens** > Generate new token. Name it "Planner phone", pick an expiration, **Repository access: Only select repositories > planner-data**, **Permissions > Repository permissions > Contents: Read and write**. Generate and copy it (you only see it once). Easiest is to do this on the phone itself so you can paste it directly.
2. **Open the app** in Safari: https://mhzegit.github.io/LocalProjectManagmentTool/
3. Tap **Connect GitHub Sync**, enter `YOUR_NAME/planner-data` and paste the token, then tap **Connect**.
4. **Add it to the Home Screen:** Share button > **Add to Home Screen**. It opens full screen like an app.
5. Later: **File > GitHub Sync…** changes the token or disconnects this device.

The token is stored only in that browser. If the phone is lost, delete the token on github.com and nothing else is exposed.

## Tech

Pure vanilla JavaScript, CSS, and HTML — no frameworks, no build step. Runs on any modern browser.
