# Simple Gantt

**Live Demo:** [https://adambeltz2.github.io/Simple-Gantt/](https://adambeltz2.github.io/Simple-Gantt/)

A lightweight, purely browser-based Gantt chart and project management tool built with HTML, JavaScript, and CSS. No database deployment or server infrastructure required — everything saves locally to your browser, with optional CSV export and Dropbox backup/sync.

## Features

* **Interactive Dual-Pane View**: Work with a dynamic spreadsheet grid on the left while rendering a drag-and-drop Frappe Gantt chart on the right.
* **Auto-Scheduling & Dependencies**: Link tasks together. The core engine calculates Working Days, skips weekends (if toggled), and cascades dates instantly down the chain.
* **WBS Auto-Outlining**: Assign parent/child tasks to automatically roll up durations and progress, calculating Work Breakdown Structure (WBS) numbers dynamically.
* **Resource Workload Dashboard**:
  * Split capacity logic (e.g., `Alice 50%, Bob 25%`).
  * Check for overallocation with Daily, Weekly, and Monthly resolutions.
  * View total load by Percentage (%) or absolute Hours.
* **Custom Tracking Columns**: Right-click to dynamically add, rename, and delete your own columns (Notes, Statuses, Tags) right inside the table without breaking the math engine.
* **Data Portability**: Import and export CSVs, back up/restore individual projects to Dropbox, and export clean, high-resolution PNGs of your charts for reporting.

## Setup & Installation

You don't need `npm`, `node`, or a database to run Simple Gantt.

1. Clone or download this repository.
2. Double-click the `index.html` file to open it in any modern web browser.
3. Start managing your projects immediately!

## Data & Storage

All project data is stored in your browser's `localStorage` — nothing is sent to a server. This means:

* Data is scoped to a single browser on a single device. Opening the app in a different browser or on another computer starts fresh.
* Clearing your browser's site data (or using "Reset App" in the header) will permanently delete all saved projects.
* To move data between devices/browsers or keep an off-browser backup, use **Export CSV** or the Dropbox sync described below.

## Dropbox Sync

Simple Gantt can back up and restore individual projects as CSV files in your Dropbox, so you can carry a project between devices.

* **⬆ Push to Dropbox** uploads the current project as `/<project-name>.csv` in your Dropbox.
* **⬇ Pull from Dropbox** downloads that file and loads it into the current project, after asking you to confirm (this replaces whatever is currently on screen).
* The app tracks the Dropbox file revision from your last push or pull. If you push and the file was changed elsewhere in the meantime (e.g., pulled and edited on another device, then pushed from there), the push is rejected with a conflict warning instead of silently overwriting those changes — pull first to get the latest version, then push again.

**Notes & limitations:**
* Sync is per-project and file-based, not real-time or automatic — you need to explicitly push/pull.
* There's no merge: pulling replaces the local project's tasks with whatever's in the Dropbox file, and pushing replaces the Dropbox file with whatever's local. Reconcile any conflicting edits yourself before syncing.
* Dropbox login uses a short-lived access token (no refresh token). If it expires, you'll be prompted to log in again — you won't lose local data, just the active Dropbox session.
* The app connects to Dropbox using a personal app key belonging to this project. If you fork/self-host this app under a different domain, you'll need to [create your own Dropbox app](https://www.dropbox.com/developers/apps), set its redirect URI to match your hosting URL, and swap in your own key (`DROPBOX_APP_KEY` near the top of the script in `index.html`).

## CSV Import/Export Format

Exported/imported CSVs include a header row followed by columns in this order: `ID, Outline, Name, Resource, Allocation, % Complete, Start Date, Duration, End Date, Dependencies, Parent ID`, followed by any custom tracking columns you've added. When importing, keep the header row intact so custom columns are recognized correctly.

## Known Limitations

* Single-user, no real-time collaboration — Dropbox sync is a manual backup/restore mechanism, not live multi-user editing.
* No undo/redo — use Export CSV or Dropbox push periodically if you want restore points.
* Best used in a modern desktop browser; not optimized for small/mobile screens.

## Support

If you found this helpful, consider checking out the source code or buying me a coffee!

<a href="https://github.com/adambeltz2/Simple-Gantt" target="_blank">View on GitHub</a> | <a href="https://buymeacoffee.com/adambeltz" target="_blank">Buy me a coffee</a>
