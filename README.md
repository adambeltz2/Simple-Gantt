# Simple Gantt

A lightweight, browser-based Gantt chart and task management tool. No server required. Works completely offline or syncs with Dropbox.

![Version](https://img.shields.io/badge/version-2.15.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 📊 Core Gantt Functionality
- **Interactive Gantt Chart** – Visual timeline with drag-and-drop tasks
- **Spreadsheet Grid** – Edit tasks in a familiar table format
- **Task Hierarchy** – Support for parent-child task relationships
- **Collapse/Expand** – Fold a parent's children out of view in both the grid and chart, with "Expand All"/"Collapse All" toolbar controls; purely visual, your data is never touched
- **Manual "In Progress" Flag** – Click the marker next to any Task ID to tint that grid row purple for your own ad-hoc tracking; grid-only, never touches the Gantt chart or CSV export
- **Late Indicator** – The End column tints itself automatically: red if it's in the past, yellow if it's today, no color if it's not due yet. Pure date math (doesn't consult % Done), applies to every row including parents. Grid-only, like the In Progress flag
- **Notes Field** – Add a custom column named "Notes" and each row gets a small click-to-expand flag instead of raw inline text. Opens a modal rendering a lightweight Markdown subset (bold, italic, links, lists); still a plain-text cell underneath, so it round-trips through CSV import/export like any other custom column
- **Grid Search/Filter** – Filter rows by Task Name or Resource; matches keep their parent/ancestor chain visible for context, and search composes with Collapse (a manually collapsed section stays collapsed even if something inside it matches)
- **Resource Color-Coding** – Each resource gets a deterministic color, shown as a stripe on the left edge of its bars (first-listed resource wins on multi-resource tasks) and listed in the chart legend; complements the Workload dashboard's per-resource view
- **Critical Path Highlighting** – Opt-in toolbar toggle ("Critical path", off by default) that runs the chain of zero-slack tasks determining the project's overall end date through a standard CPM pass over the Depends graph. Critical tasks get a small ⚡ next to their name in the grid and an outlined bar in the chart; parallel branches with float are correctly left unmarked. Suppressed while a dependency cycle exists, since a cycle has no well-defined critical path.
- **Progress Tracking** – Mark tasks as not started, in progress, complete, or overdue
- **Dependencies** – Link tasks to show sequential relationships
- **Milestones** – Create zero-duration milestone markers

### 🔄 Automatic Date Recalculation
- **Depends** – a finish-to-start constraint. If task B Depends on task A, B's Start is kept equal to A's End date. This runs live on every edit; it's calendar-only and never looks at % Done, so it's on you to keep dates accurate as work runs long or short.
- **Parent dates automatically span all children** – a parent's Start/End/% Done are continuously rolled up from its children (earliest start, latest end, duration-weighted % Done), all the way up through grandparents. Also live on every edit.
- **Manual "Sync Dependencies" button** – both rules above already run automatically, so you shouldn't need this. It forces a full recompute of every row anyway, mainly useful right after pasting in a large block of rows.
- **Dependency cycle detection** – if the Depends graph loops back on itself (A depends on B depends on A, or a longer chain), the affected Task IDs get a red outline with a tooltip naming the cycle, plus a one-time status-bar warning. Purely informational -- it doesn't remove the Depends link or block anything, it just explains why those tasks' dates might not settle.

### 🌐 Flexible Deployment
- **100% Browser-Based** – No server, no installation. Just open the HTML file.
- **Fully Offline** – All data stored in browser's local storage
- **Dropbox Integration** – Optional backup and sync across devices
- **CSV Import/Export** – Move data in and out easily
- **PNG / Paginated PDF Export** – Export the Gantt chart as a PNG, or as a PDF that automatically tiles a long timeline across as many landscape pages as needed (each page a full-height vertical slice, left to right) rather than shrinking it illegibly onto one page

### 📱 User Experience
- **Responsive Design** – Works on desktop, tablet, and mobile
- **Split-View** – Adjustable grid/chart split (or show one side only)
- **Multiple Zoom Levels** – Day, Week, or Month view
- **Resource Workload Dashboard** – See who's overallocated at a glance
- **Dark Mode Header** – Clean, modern interface
- **Project Switching** – Multiple projects in one browser tab

### 🔐 Data Management
- **Automatic Saving** – Changes persist to browser storage instantly
- **Dropbox Backup** – Optional encrypted sync to Dropbox (~1 min after edit)
- **Version History** – Restore any previous backup
- **Project Import** – Discover and import projects from Dropbox across devices
- **Factory Reset** – Clear all data with one confirmation

---

## Getting Started

### Option 1: Use Online (No Setup)
Open in your browser:  
🔗 [https://adambeltz2.github.io/Simple-Gantt/](https://adambeltz2.github.io/Simple-Gantt/)

### Option 2: Download & Open Locally
1. Download `index.html` from this repo
2. Open it in any modern browser (Chrome, Firefox, Safari, Edge)
3. Start creating tasks immediately

No server, no npm, no build step required.

---

## How to Use

### Creating & Editing Tasks

| Action | How |
|--------|-----|
| **Add Task** | Click "➕ Add row" button or right-click → Add row |
| **Edit Cell** | Double-click any cell in the grid |
| **Delete Task** | Right-click row → Delete row |
| **Reorder Tasks** | Drag rows up/down |
| **Add Column** | Right-click column header → Add column |

### Setting Task Dates

**Column Layout:**
- **ID** – Unique task identifier (auto-generated)
- **Outline** – Indentation level (1, 1.1, 1.1.1, etc.)
- **Task Name** – What the task is
- **Resource** – Who's working on it
- **Def. Alloc** – % of their time allocated (0-100)
- **% Done** – Progress (0-100)
- **Start** – Begin date (YYYY-MM-DD format)
- **Dur.** – Duration in days
- **End** – Completion date (YYYY-MM-DD format)
- **Depends** – Parent task IDs (comma-separated)
- **Parent** – Read-only; set via "Depends"

**Example Setup:**
```
ID   Name                    Start       End         Depends  Parent
1    Website Redesign        2024-01-15  2024-03-15  -        -
2    Discovery & Wireframes  2024-01-15  2024-01-20  1        1
3    UI Design              2024-01-21  2024-02-10  2        1
4    Frontend Dev           2024-02-11  2024-03-15  3        1
```

### The Bubble-Up Magic

When child task dates change, parents automatically expand -- live, on every edit, no button required:

```
BEFORE:
Parent Task    Start: 1/15   End: 3/15
└─ Child 1     Start: 1/15   End: 1/20  ← Change to 1/25
└─ Child 2     Start: 1/21   End: 2/10

AFTER (Automatic):
Parent Task    Start: 1/15   End: 2/10  ✅ Parent expanded
└─ Child 1     Start: 1/15   End: 1/25
└─ Child 2     Start: 1/21   End: 2/10
```

The "↻ Sync Dependencies" button just forces a full recompute of every row on demand -- handy after pasting in a large block of data, but not something you need to click for the bubble-up itself.

---

## Zoom & View Options

| Control | Effect |
|---------|--------|
| **Zoom: Day/Week/Month** | Change Gantt chart time scale |
| **Weekends off** | Hide weekends in chart |
| **Grid Only** (100%) | Show spreadsheet, hide chart |
| **Split View** (55/45) | Balanced grid + chart (default) |
| **Chart Only** (~8%) | Full-width Gantt chart |
| **Fit columns** | Auto-resize columns to content |

---

## CSV Import & Export

### Import
1. Click "📤 Import" button
2. Select a CSV file from your computer
3. Data loads instantly; parent dates recalculate automatically

### Export
1. Click "📥 Export CSV" button
2. File downloads with consistent, validated dates
3. Parent dates are pre-calculated before export

**CSV Format:**
```csv
ID,Outline,Task Name,Resource,Def. Alloc,% Done,Start,Dur.,End,Depends,Parent
1,1,Project,,,0,,,,,
2,1.1,Phase 1,Alice,50,100,2024-01-15,5,2024-01-19,,1
3,1.2,Phase 2,Bob,100,50,2024-01-20,7,2024-01-26,2,1
```

---

## Dropbox Integration (Optional)

### Why Use Dropbox?

| Feature | Without Dropbox | With Dropbox |
|---------|-----------------|-------------|
| **Local Storage** | ✅ Yes | ✅ Yes + Dropbox backup |
| **Version History** | ❌ Current version only | ✅ Last 25 backups |
| **Cross-Device** | ❌ Browser-only | ✅ Access anywhere |
| **Backup Safety** | ❌ If you clear cache, data is gone | ✅ Always recoverable |
| **Project Discovery** | ❌ Manual re-entry on new device | ✅ Auto-import found projects |

### Setting Up Dropbox

1. Click **"Back up"** button
2. Choose **"Continue to Dropbox"**
3. Authorize Simple Gantt (read/write access to `/Apps/Simple Gantt Backups/`)
4. Automatic backups start ~1 minute after edits stop
5. Click **"Versions"** anytime to restore a past backup

### Disconnecting
Click **"Disconnect"** – Your local data stays, backups stay in Dropbox, no data deleted.

---

## Resource Workload Dashboard

View team allocation at a glance:

1. Click **"👥 Workload"** button
2. Choose resolution: Daily, Weekly, or Monthly
3. Choose unit: Percentage (%) or Hours (8h/day)
4. Cells show: Green = OK, Red = Overallocated
5. Click **"Export CSV"** to download workload report

---

## Projects & Data

### Create New Project
1. Click project selector dropdown
2. Choose **"➕ Create New Project..."**
3. Enter project name
4. Start adding tasks

### Rename Project
Click **"Rename"** button, enter new name

### Delete Project
Click **"Delete"** button (keeps Dropbox backups intact if connected)

### Switch Project
Select different project from dropdown at top-left

### Factory Reset
⚠️ **Deletes ALL projects locally** (but not Dropbox backups)
1. Click **"Reset"** button
2. Type "DELETE" to confirm
3. All data cleared; reload page to continue

---

## Keyboard & Navigation

| Shortcut | Action |
|----------|--------|
| **Double-click cell** | Edit |
| **Tab** | Move to next cell |
| **Shift + Tab** | Move to previous cell |
| **Enter** | Confirm edit, move down |
| **Esc** | Cancel edit |
| **Right-click** | Context menu (add/delete row/col) |

---

## Troubleshooting

### Grid won't load
- Open DevTools (F12 → Console)
- Check for errors
- Refresh page
- Try in incognito mode

### Dates aren't calculating
- This should be automatic, but you can click **"↻ Sync Dependencies"** to force a full recompute
- "Depends" should reference the task ID(s) this task can't start before -- not its parent
- "Parent" should reference the summary task this row belongs to; a parent needs children with dates set to roll up

### Data lost after browser clear
- If using Dropbox: Click **"Versions"** to restore
- If offline-only: Data is only in browser storage
  - **Prevention:** Export CSV regularly

### Dropbox won't connect
- Check browser permissions (allow cookies)
- Try different browser
- Disconnect and reconnect
- Visit [dropbox.com/account/connected-apps](https://dropbox.com/account/connected-apps) to revoke manually

### Can't find old projects
- Click **"Versions"** → **"Check Dropbox for other projects"**
- Select projects to import
- They'll appear in project dropdown

---

## Data Privacy & Storage

### Local Storage
- 100% in your browser
- Not sent to any server (except Dropbox if you enable it)
- Cleared only if you clear browser cache OR click "Reset"

### Dropbox Storage
- Your choice to enable; disabled by default
- Backups stored in `/Apps/Simple Gantt Backups/` in your Dropbox
- Only you have access (read your Dropbox, not read others)
- 25 backups per project; older ones auto-delete

### No Tracking
- No analytics
- No ads
- No data collection
- Open source – inspect the code yourself

---

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome/Edge (latest) | ✅ Full |
| Firefox (latest) | ✅ Full |
| Safari (latest) | ✅ Full |
| Mobile browsers | ✅ Works but limited (small screens) |
| Internet Explorer | ❌ Not supported |

---

## Tips & Best Practices

### 1. Use Task IDs Consistently
- Keep IDs simple (1, 2, 3...) or hierarchical (1.1, 1.2, 2.1...)
- Set "Depends" to parent ID for auto-hierarchy

### 2. Set Realistic Durations
- **Dur.** should equal (End – Start + 1) days
- Or let Simple Gantt auto-calculate when you enter Start/End

### 3. Export Regularly
- Export CSV weekly as a backup
- You own the file immediately; no cloud needed

### 4. Sync Dependencies After a Bulk Paste
- Dependency and parent dates already recalculate automatically as you edit, including on CSV import
- After pasting in a large block of rows at once, click **"↻ Sync Dependencies"** to force a full recompute in one go

### 5. Use Resources for Workload Tracking
- Enter resource names consistently ("Alice", "Alice", not "Alice", "alice")
- Set "Def. Alloc" for each task (50 = half-time)
- View "Workload" dashboard to spot overallocation

---

## Keyboard Shortcuts Summary

```
F12              Open DevTools (to see console logs)
Ctrl/Cmd+E       Export CSV (if keyboard-enabled)
Ctrl/Cmd+I       Import CSV (if keyboard-enabled)
Tab              Next cell in grid
Shift+Tab        Previous cell
Enter            Confirm edit
Esc              Cancel edit
Double-click     Edit cell
Right-click      Context menu
```

---

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed release notes.

### Latest: v2.11.0 (2026-08-24)
✨ **Grid Search/Filter** – A search box in the toolbar filters rows by Task Name or Resource, keeping a match's parent/ancestor chain visible for outline context. Built on the same `hideRow`/`showRow` mechanism as Collapse (not jexcel's own built-in `search()`, which manages visibility by detaching rows from the DOM and would conflict with it) -- the two compose with AND, so a manually collapsed section stays collapsed even if a search matches something inside it. Resets automatically when you switch projects.

### v2.10.1 (2026-08-24)
🧪 **Test coverage expanded to CSV round-tripping and the Workload dashboard** – no functional changes; closes the last tech-debt item from the original repo review.

### v2.10.0 (2026-08-24)
✨ **Notes Field** – Add a custom column literally named "Notes" (case-insensitive) and it becomes click-to-expand: each cell shows a small flag instead of raw text, opening a modal that renders a self-contained Markdown subset (bold, italic, links, bullet/numbered lists) with an Edit toggle. No new CDN dependency -- the renderer is a small inline subset, not a full library. Still a plain-text cell underneath (readOnly at the grid level so editing only happens through the modal), so it round-trips through CSV import/export exactly like any other custom column.

### v2.9.1 (2026-08-24)
🐛 **Critical date bug fixed: End dates were landing before Start dates for users in most US/Americas timezones** – `new Date("YYYY-MM-DD")` parses as UTC midnight, which silently rolls back to the previous calendar day when read in any timezone behind UTC. This was masked for years by the old exclusive-End convention (fixed in 2.9.0) accidentally canceling it out for 1-day tasks -- removing that convention unmasked it. Every internal date parse now goes through a timezone-safe helper. **If you saw End dates before Start dates after updating to 2.9.0, click "↻ Sync Dependencies" once now** to fix it.

### v2.9.0 (2026-08-24)
✨ **Late Indicator** – The End column colors itself automatically (red = overdue, yellow = due today) on every row, including parents. Grid-only, like the In Progress flag.

🐛 **End date is now inclusive** – "End" now means the actual last day of work, not the day after it. A 1-day task starting 8/20 now shows End=8/20 (previously 8/21). This also fixes two side effects of the old convention: Gantt bars were rendering one day wider than they should have, and the chart's "overdue" red coloring was kicking in a day later than it should have. **If you have existing projects**, their stored End dates were computed under the old convention -- click **"↻ Sync Dependencies"** once after updating to refresh everything to the new one. Successor tasks (via "Depends") still start the very next working day after their dependency finishes; only the stored date's meaning changed, not the actual schedule.

🐛 **Parent rollup now handles 3+ level hierarchies correctly** – Found while fixing the bug above: a grandparent-level task could roll up using a mid-level parent's stale, pre-rollup dates if that parent hadn't been recalculated yet in the same pass. The rollup now repeats to a fixed point (like dependency resolution already did), so it's correct regardless of how deep your outline goes or what order rows appear in.

### v2.8.0 (2026-08-24)
🔒 **CSV import sanitization closed for every ingestion path** – Task Name, Resource, and custom-column text imported from a CSV now have HTML-significant characters stripped, whether the CSV comes from the manual Import button, a Dropbox backup restore, or Dropbox project discovery. Previously only the manual Import path sanitized anything, and even then only Start/End dates.

### v2.7.0 (2026-08-24)
🐛 **Sync Dependencies fixed** – The button, and the docs describing it, previously described a "bubble-up" mechanism that wasn't actually wired into CSV import/export/Dropbox backup, and its standalone implementation misread the Depends column as a parent/child relationship. Removed that dead code; the button now just force-triggers the same dependency (finish-to-start, date-only) and parent (rollup) logic that already runs automatically on every edit.

### v2.6.0 (2026-08-24)
✨ **Manual "In Progress" Flag** – Click the marker next to any Task ID to tint that row purple for your own ad-hoc tracking. Grid-only: never touches the Gantt chart, and has zero effect on CSV export or Dropbox backups.

### v2.5.0 (2026-08-24)
✨ **Collapse/Expand Parent Tasks** – Fold a parent's children out of view via a toggle on its row (or "Expand All"/"Collapse All" in the toolbar). View-only: your task data is never modified, and the collapsed/expanded state is remembered per project.
🔒 **CDN Integrity** – The pinned-version libraries (PapaParse, Frappe Gantt, html2canvas, Dropbox SDK) now load with Subresource Integrity hashes, so a compromised or altered CDN file can no longer execute silently.

---

## Development & Testing

Simple Gantt still ships as a single static `index.html` with no build step. A small `package.json` exists only to run the Playwright UI test suite under `tests/`:

```bash
npm install
npx playwright install chromium   # first time only
npm test
```

---

## Contributing

This is an open-source project. Contributions welcome! Planned features and known follow-ups live in [BACKLOG.md](./BACKLOG.md).

- **Found a bug?** Open an issue with:
  - Browser/OS
  - Steps to reproduce
  - Expected vs. actual behavior

- **Want a feature?** Describe the use case:
  - What problem does it solve?
  - How would you use it?

- **Want to contribute code?** 
  - Fork the repo
  - Make changes
  - Submit a pull request

---

## License

MIT License – Use freely, modify, and redistribute.  
See LICENSE file for details.

---

## Credits & Thanks

- [jExcel](https://bossanova.uk/jspreadsheet/) – Spreadsheet library
- [Frappe Gantt](https://frappe.io/gantt) – Gantt chart library
- [PapaParse](https://www.papaparse.com/) – CSV parsing
- [Dropbox SDK](https://www.dropbox.com/developers) – Cloud sync
- [html2canvas](https://html2canvas.hertzen.com/) – Export to PNG

---

## Support

- 📖 **Documentation** – See above
- 🐛 **Bug Reports** – Open an issue
- 💬 **Questions** – Check existing issues or start a discussion
- ☕ **Support Development** – [Buy me a coffee](https://buymeacoffee.com/adambeltz)

---

## FAQ

**Q: Is my data secure?**  
A: Yes. Data stays in your browser by default. Dropbox backups are encrypted in transit and at rest (Dropbox's security). We don't have access to your data.

**Q: Can I use this for large projects (1000+ tasks)?**  
A: Yes, but performance may slow. Consider splitting into multiple projects.

**Q: Does this work offline?**  
A: Completely. Dropbox is optional. Use offline and export CSV as backup.

**Q: Can I export to Microsoft Project?**  
A: Not directly, but the CSV format is compatible with most project tools (Excel, Sheets, Monday.com, etc.).

**Q: Can teams collaborate in real-time?**  
A: Not yet. Each user has their own local version. Share via CSV exports.

**Q: What if I accidentally delete something?**  
A: If using Dropbox, click "Versions" to restore. If offline-only, use browser's undo (Ctrl+Z) immediately after.

---

## Roadmap

Planned features for future releases:

- 🔒 Real-time collaboration (WebRTC-based)
- 📅 Calendar sync (Google, Outlook)
- 🔗 Kanban board view
- 📊 Advanced reporting & analytics
- 🌐 Multiple language support
- 📱 Dedicated mobile app

---

**Made with ❤️ for project managers everywhere.**

Happy planning! 🚀
