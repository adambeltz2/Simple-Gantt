# Simple Gantt

**Live Demo:** [https://adambeltz2.github.io/Simple-Gantt/](https://adambeltz2.github.io/Simple-Gantt/)

A lightweight, purely browser-based Gantt chart and project management tool built with HTML, JavaScript, and CSS. No database deployment or server infrastructure required — everything saves locally to your browser, with optional CSV export and Dropbox backup/sync.

The current version number is shown in the footer of the app (bottom-left) — handy to reference if you're reporting a bug.

## Features

* **Interactive Dual-Pane View**: Work with a dynamic spreadsheet grid on the left while rendering a drag-and-drop Frappe Gantt chart on the right.
* **Auto-Scheduling & Dependencies**: Link tasks together. The core engine calculates Working Days, skips weekends (if toggled), and cascades dates instantly down the chain.
* **WBS Auto-Outlining**: Assign parent/child tasks to automatically roll up durations and progress, calculating Work Breakdown Structure (WBS) numbers dynamically.
* **Resource Workload Dashboard**:
  * Split capacity logic (e.g., `Alice 50%, Bob 25%`).
  * Check for overallocation with Daily, Weekly, and Monthly resolutions.
  * View total load by Percentage (%) or absolute Hours.
* **Custom Tracking Columns**: Right-click to dynamically add, rename, and delete your own columns (Notes, Statuses, Tags) right inside the table without breaking the math engine.
* **Data Portability**: Import and export CSVs, keep automatic versioned backups of individual projects in Dropbox, and export clean, high-resolution PNGs of your charts for reporting.

## Setup & Installation

You don't need `npm`, `node`, or a database to run Simple Gantt.

1. Clone or download this repository.
2. Double-click the `index.html` file to open it in any modern web browser.
3. Start managing your projects immediately!

## Data & Storage

All project data is stored in your browser's `localStorage` — nothing is sent to a server. This means:

* Data is scoped to a single browser on a single device. Opening the app in a different browser or on another computer starts fresh.
* Clearing your browser's site data (or using "Reset App" in the header) will permanently delete all saved projects in this browser. This doesn't touch anything already backed up to Dropbox, and doesn't log you out of Dropbox -- use "Disconnect" (next to the Dropbox buttons, visible while logged in) if you want to log this browser out of Dropbox separately.
* To move data between devices/browsers or keep an off-browser backup, use **Export CSV** or the Dropbox backups described below.

### With Dropbox vs. without

Dropbox is entirely optional — the app is fully functional without ever signing in. The trade-off:

| | Without Dropbox | With Dropbox |
|---|---|---|
| Where data lives | This browser only | This browser + Dropbox |
| Version history | None — only the current state exists | Up to 25 automatic backups per project, any of which can be restored |
| Undo a bad edit / accidental delete | Not possible unless you happened to export a CSV beforehand | Restore any recent backup from before the edit |
| New device / browser | Starts empty | Existing projects can be found and imported |
| Setup | None | One-time Dropbox login |

In short: without signing in, there is no way to control or roll back versions — the app has no undo, and localStorage only ever holds the single current state. A manually exported CSV is the only point-in-time copy you'd have on your own. This trade-off is also shown in-app the first time you click a Dropbox action.

## Dropbox Backups

Simple Gantt can automatically back up each project to Dropbox as a series of timestamped versions, so you always have somewhere to revert to.

* **Back up** immediately snapshots the current project into its own dedicated folder in `/Simple Gantt Backups/` in your Dropbox. Every backup is a new timestamped file — nothing is ever overwritten.
* Backups also happen **automatically** about a minute after you stop editing (only while logged into Dropbox), so you don't have to remember to click the button.
* **Versions** opens a list of your project's backups, newest first. Pick any one to restore it — after a confirmation, since restoring replaces what's currently on screen.
* Each project keeps its **25 most recent** backups; older ones are pruned automatically after a new backup succeeds.
* Each project is tracked in Dropbox by a **stable internal ID**, not by its display name — so renaming a project never orphans its backup history, and two projects that happen to share a name never collide in Dropbox.

**Finding projects on a new device:** After logging into Dropbox (or re-logging in after your session expires), Simple Gantt checks for project backups in your Dropbox that aren't in this browser yet and offers to import them — each as its own project, using its latest backup. You can also trigger this check manually from the Versions modal ("Check Dropbox for other projects"). If an imported project happens to share a name with one already in this browser, it's imported as a separate project rather than merged — you can rename or delete either one afterward.

**Notes & limitations:**
* Backups are per-project, one-way (local → Dropbox). There's no live sync between devices — restoring a version is a manual, deliberate action.
* Dropbox login uses a short-lived access token (no refresh token). If it expires, you'll be prompted to log in again — your local data isn't affected, just the active Dropbox session.
* The app connects to Dropbox using a personal app key belonging to this project. If you fork/self-host this app under a different domain, you'll need to [create your own Dropbox app](https://www.dropbox.com/developers/apps), set its redirect URI to match your hosting URL, and swap in your own key (`DROPBOX_APP_KEY` near the top of the script in `index.html`).

## Working with the Grid

* **Task ID vs. Outline vs. row position** are three different things that can look similar at a glance: **Task ID** is a permanent identifier assigned when a task is created and never changes — it's what Dependencies and Parent links point to. **Outline** is the WBS number (1, 1.1, 2...) and reflects a task's current position and hierarchy, so it updates as you reorder or reparent tasks. The unlabeled leftmost column is just jspreadsheet's own row-position indicator and has no meaning beyond that.
* **Reordering tasks**: right-click any row → **Move row up** / **Move row down**. This is the reliable way to reorder — it also recalculates WBS numbers, dependency arrows, and the Gantt chart immediately. (jspreadsheet's built-in drag-to-reorder, via the row-number gutter, may also work depending on your browser, but isn't guaranteed.)
* **Column sorting is intentionally disabled.** Sorting by any column would physically reorder rows, which would scramble the parent-child adjacency that WBS numbering and hierarchy rollups depend on. Use row reordering or the **Parent** field to restructure instead.
* **Column widths auto-fit** to their content automatically whenever a project opens, switches, imports, or restores. Use the **Fit columns** button in the toolbar to re-trigger it manually after editing. Depends and Parent are excluded, since they display a formatted label rather than their raw stored value.
* Right-click a row for **Insert row above/below** and **Delete row** as well.

## Reading the Gantt Chart

* A summary bar above the chart shows the project's overall date range, duration, current zoom level, and today's date (when it falls within range) — this is included when you export a PNG, so exported images are self-contained.
* Task bars use a standard status color scheme, shown in a legend above the chart: gray = not started, blue = in progress, green = complete, red = overdue, amber diamond = milestone, dark slate = summary/parent row.
* Use the **Grid / Split / Chart** buttons in the toolbar to snap the divider between the grid and chart to preset widths, or drag it manually. Whichever layout you land on is remembered and restored next time you open the app.

## CSV Import/Export Format

Exported/imported CSVs include a header row followed by columns in this order: `Task ID, Outline, Name, Resource, Allocation, % Complete, Start Date, Duration, End Date, Dependencies, Parent ID`, followed by any custom tracking columns you've added. When importing, keep the header row intact so custom columns are recognized correctly.

## Known Limitations

* Single-user, no real-time collaboration — Dropbox backups are a manual/automatic snapshot mechanism, not live multi-user editing.
* No in-app undo/redo — without Dropbox, your only restore point is a CSV you exported yourself; with Dropbox, use the Versions modal.
* Best used in a modern desktop browser; not optimized for small/mobile screens.

## Support

If you found this helpful, consider checking out the source code or buying me a coffee!

<a href="https://github.com/adambeltz2/Simple-Gantt" target="_blank">View on GitHub</a> | <a href="https://buymeacoffee.com/adambeltz" target="_blank">Buy me a coffee</a>
