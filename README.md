 Simple Gantt
 
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
* **Data Portability**: Import and export CSVs, keep automatic versioned backups of individual projects in Dropbox, and export clean, high-resolution PNGs of your charts for reporting.
## Setup & Installation
 
You don't need `npm`, `node`, or a database to run Simple Gantt.
 
1. Clone or download this repository.
2. Double-click the `index.html` file to open it in any modern web browser.
3. Start managing your projects immediately!
## Data & Storage
 
All project data is stored in your browser's `localStorage` — nothing is sent to a server. This means:
 
* Data is scoped to a single browser on a single device. Opening the app in a different browser or on another computer starts fresh.
* Clearing your browser's site data (or using "Reset App" in the header) will permanently delete all saved projects.
* To move data between devices/browsers or keep an off-browser backup, use **Export CSV** or the Dropbox backups described below.
## Dropbox Backups
 
Simple Gantt can automatically back up each project to Dropbox as a series of timestamped versions, so you always have somewhere to revert to.
 
* **Back up** immediately snapshots the current project to `/Simple Gantt Backups/<project-name>/<timestamp>.csv` in your Dropbox. Every backup is a new file — nothing is ever overwritten.
* Backups also happen **automatically** about a minute after you stop editing (only while logged into Dropbox), so you don't have to remember to click the button.
* **Versions** opens a list of your project's backups, newest first. Pick any one to restore it — after a confirmation, since restoring replaces what's currently on screen.
* Each project keeps its **25 most recent** backups; older ones are pruned automatically after a new backup succeeds.
**Notes & limitations:**
* Backups are per-project, one-way (local → Dropbox). There's no live sync between devices — restoring a version is a manual, deliberate action.
* Dropbox login uses a short-lived access token (no refresh token). If it expires, you'll be prompted to log in again — your local data isn't affected, just the active Dropbox session.
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
