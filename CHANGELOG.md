# Changelog

All notable changes to Simple Gantt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.0] - 2026-08-24

### ✨ Added

#### Manual "In Progress" Flag
- Click the ● marker next to any Task ID to tint that grid row purple -- a manual, ad-hoc tracking aid independent of the computed status coloring
- Applies to every row, including milestones and parent/summary rows
- Grid-only by design: never changes the Gantt chart's bar colors, and the flag itself is never written to CSV export or Dropbox backups -- it's stored per project alongside the collapse/expand state, not as part of the task data
- State persists per project across reloads

#### Testing
- Added `tests/flag-in-progress.spec.js` covering the toggle, purple tint, data-integrity (grid data and column count unchanged), zero effect on the Gantt chart, CSV-export unaffected, and reload persistence

---

## [2.5.0] - 2026-08-24

### ✨ Added

#### Collapse/Expand Parent Tasks
- Click the ▶/▼ toggle next to any parent task's name to fold or unfold its children, in both the spreadsheet grid and the Gantt chart
- New **"Expand All"** / **"Collapse All"** toolbar buttons act on every parent task at once
- Collapsed/expanded state is remembered per project (stored locally, alongside your other project settings) and survives a reload
- Purely a display concern: collapsing never removes, reorders, or otherwise modifies task data. `sheet.getData()` and CSV/Dropbox exports are unaffected regardless of what's currently folded
- Dependency arrows in the Gantt chart are pruned to only reference currently-visible tasks, so collapsing never leaves a dangling arrow

#### Testing
- Added a Playwright UI test suite (`tests/`) covering the collapse/expand feature: toggle behavior, data-integrity, persistence across reload, the bulk toolbar buttons, and compatibility with normal grid editing
- Added `package.json` / `playwright.config.js` for running it (`npm install && npm test`); this is dev-only tooling and does not change how the app itself is deployed or run

### 🔒 Security
- Pinned the four already-versioned CDN libraries (PapaParse 5.4.1, Frappe Gantt 0.6.1, html2canvas 1.4.1, Dropbox SDK 10.34.0) to Subresource Integrity (SRI) hashes verified against the actual published npm packages, served via jsdelivr's npm mirror. A tampered or altered file at that host can no longer execute
- `jsuites.js`/`jsuites.css` and `jexcel.js`/`jexcel.css` remain intentionally un-pinned for now (see the `TODO(security)` comment in `index.html`) -- their upstream URLs don't expose a version, so pinning them requires first confirming exactly which build is currently live rather than guessing

---

## [2.4.5] - 2026-08-21

### ✨ Added

#### 🔄 Parent Date Bubble-Up (Major Feature)
- **Automatic parent date recalculation** – Parent task dates now automatically span the earliest start and latest end of all children
  - When a child task date changes, parent/grandparent dates cascade upward
  - Supports unlimited hierarchy depth (child → parent → grandparent → root)
  
- **Three integration points for automatic recalculation:**
  - ✅ **On CSV Import** – Imported data is validated and parent dates recalculated
  - ✅ **On CSV Export** – Ensures all exported dates are consistent with hierarchy
  - ✅ **On Dropbox Backup** – Backups always have correct parent-child alignment

- **"Sync Dependencies" button** (new toolbar button)
  - Manual trigger to recalculate parent dates anytime
  - Shows status: number of parent tasks updated
  - Useful for offline users who edit dates and want to verify cascading
  - Works alongside automatic recalculation (button is optional, not required)

#### Core Recalculation Functions
- `recalculateDatesUpstream(tasks, changedTaskId)` – Core bubble-up algorithm
  - Traverses task hierarchy using "Depends" field
  - Parent date = min(children.start) and max(children.end)
  - Cascades changes upward through multiple levels
  - Returns: tasks updated, change count, recursion depth

- `processImportedTasks(data)` – Normalizes imported CSV
  - Validates and cleans dates
  - Auto-calculates missing durations
  - Runs recalculation before storing
  
- `processBeforeExport(data)` – Pre-export consistency check
  - Deep copies data to avoid mutations
  - Recalculates parent dates before export
  - Returns cleaned data ready for download

### 🐛 Fixed
- Date parsing now handles both string and Date object formats
- CSV export ensures all parent dates span children correctly
- Dropbox backups now contain validated, consistent parent dates

### 📚 Documentation
- Added comprehensive README.md with examples
- Documented bubble-up feature and use cases
- Added troubleshooting section
- Included tips for setting up hierarchies

### 🎨 UI/UX
- New "↻ Sync Dependencies" button in toolbar
- Tooltip: "Recalculate parent dates to span children"
- Status messages show how many parent tasks were updated
- Console logging for debugging recalculation flow

---

## [2.4.4] - 2026-07-15

### ✨ Added
- Improved date formatting and validation
- Better handling of timezone-aware dates
- Format function now handles both string and Date inputs

### 🐛 Fixed
- Date timezone issues in CSV export/import
- Improved formatDateForCSV function
- Better fallback for invalid date values

### 📝 Changed
- Refined date parsing logic for consistency

---

## [2.4.3] - 2026-06-20

### ✨ Added
- Workload Dashboard with Daily/Weekly/Monthly views
- Resource allocation tracking (percentage and hours)
- Workload CSV export

### 🐛 Fixed
- Workload calculation accuracy
- Column header alignment in workload table

### 📝 Changed
- Improved workload table styling
- Better responsive design for workload modal

---

## [2.4.2] - 2026-05-10

### ✨ Added
- Factory Reset functionality with confirmation
- Improved Dropbox project discovery
- Better error handling for Dropbox auth failures

### 🐛 Fixed
- Dropbox auth error handling
- Project deletion with Dropbox backups
- Improved legacy database migration

### 📝 Changed
- Enhanced UI for factory reset modal
- Better status messages for cloud operations

---

## [2.4.1] - 2026-04-05

### ✨ Added
- Dropbox version history restore
- Discovered projects import from Dropbox
- Better backup pruning (keeps 25 most recent)

### 🐛 Fixed
- Dropbox version list rendering
- File download handling for large backups
- Meta.json parsing for project names

### 📝 Changed
- Improved version modal UI
- Better file naming with timestamps

---

## [2.4.0] - 2026-03-01

### ✨ Added
- **Dropbox Integration** (optional)
  - Automatic backup ~1 minute after edits stop
  - Full version history (last 25 backups)
  - Cross-device project sync
  - Project discovery across devices

- Dropbox login flow with OAuth
- Cloud status indicator (synced/syncing/error/pending)
- Automatic project ID generation for Dropbox sync
- Backup pruning (keeps latest 25 backups)

### 🐛 Fixed
- Improved localStorage quota management
- Better handling of large projects
- Fallback for missing Dropbox session

### 📝 Changed
- Header now shows cloud sync status
- "Back up" button changes to "Login" if not connected
- Better visual feedback for backup operations

---

## [2.3.5] - 2026-02-15

### ✨ Added
- Export to PNG functionality
- html2canvas integration for chart export
- Better image quality settings

### 🐛 Fixed
- Canvas rendering on different browsers
- Image download naming

---

## [2.3.4] - 2026-02-01

### ✨ Added
- Custom columns support
- Ability to add/delete custom fields per project
- Custom column persistence

### 🐛 Fixed
- Column management in spreadsheet
- Data structure normalization for custom columns

### 📝 Changed
- Improved column operations UX

---

## [2.3.3] - 2026-01-20

### ✨ Added
- Improved Gantt chart legend
- Task status color indicators
- Better visual hierarchy in chart

### 🐛 Fixed
- Legend rendering
- Color consistency across view modes

---

## [2.3.2] - 2026-01-10

### ✨ Added
- Gantt range bar showing project timeline
- Date range display in chart header
- Today indicator in range bar
- Zoom level display in range bar

### 🐛 Fixed
- Range calculation for empty projects
- Today date positioning

---

## [2.3.1] - 2025-12-28

### ✨ Added
- Jump to Today functionality
- Jump to Project Start functionality
- Better date navigation

### 🐛 Fixed
- Scroll positioning for date navigation

---

## [2.3.0] - 2025-12-15

### ✨ Added
- **Multiple Zoom Levels**
  - Day view (default)
  - Week view
  - Month view
  - Dropdown selector in toolbar

- Frappe Gantt integration improvements
- Better date axis labeling

### 🐛 Fixed
- Gantt chart rendering on zoom change
- Date alignment across zoom levels

### 📝 Changed
- Improved chart responsiveness

---

## [2.2.5] - 2025-12-01

### ✨ Added
- Weekends toggle ("Weekends off" checkbox)
- Improved task filtering

### 🐛 Fixed
- Weekend display in charts

---

## [2.2.4] - 2025-11-15

### ✨ Added
- Split view pane resizing with drag divider
- Grid/Chart/Split view buttons
- Adjustable layout

### 🐛 Fixed
- Pane resize calculations
- Min/max width enforcement

### 📝 Changed
- Smoother resize experience

---

## [2.2.3] - 2025-11-01

### ✨ Added
- Better column auto-fit algorithm
- Canvas-based text measurement

### 🐛 Fixed
- Column width calculations
- Fit columns for long text

---

## [2.2.2] - 2025-10-20

### ✨ Added
- Task context menu (right-click)
- Add/Delete row from context menu
- Add/Delete column from context menu

### 🐛 Fixed
- Context menu positioning

---

## [2.2.1] - 2025-10-10

### ✨ Added
- Row drag-and-drop reordering
- Column drag-and-drop reordering

### 🐛 Fixed
- Drag state management
- Drop position calculation

---

## [2.2.0] - 2025-09-25

### ✨ Added
- **CSV Import/Export**
  - Import from CSV file
  - Export spreadsheet to CSV
  - Header detection
  - Custom column support

- Papa Parse library integration
- Proper date formatting for CSV

### 🐛 Fixed
- CSV parsing robustness
- Empty line handling

### 📝 Changed
- Improved export file naming

---

## [2.1.5] - 2025-09-15

### ✨ Added
- Task status indicators (Not Started, In Progress, Complete, Overdue)
- Color-coded task bars in Gantt chart
- Milestone detection (zero-duration tasks)
- Parent task visual distinction

### 🐛 Fixed
- Status color calculations
- Milestone rendering

---

## [2.1.4] - 2025-09-01

### ✨ Added
- Dependency rendering in Gantt chart
- Better task relationship visualization

### 🐛 Fixed
- Dependency link accuracy

---

## [2.1.3] - 2025-08-20

### ✨ Added
- Progress bar in Gantt tasks
- Real-time progress sync from spreadsheet

### 🐛 Fixed
- Progress calculation accuracy

---

## [2.1.2] - 2025-08-10

### ✨ Added
- Better date parsing from spreadsheet
- Frappe Gantt library integration
- Initial Gantt chart rendering

### 🐛 Fixed
- Date format consistency
- Chart rendering on load

---

## [2.1.1] - 2025-08-01

### ✨ Added
- Grid/Chart split view
- Synchronized scrolling between grid and chart
- Initial jExcel integration

### 🐛 Fixed
- Scroll position sync

---

## [2.1.0] - 2025-07-15

### ✨ Added
- **Spreadsheet Grid** with jExcel
  - Task ID (read-only, auto-increment)
  - Outline level (read-only, hierarchical)
  - Task Name (editable)
  - Resource assignment
  - Default allocation percentage
  - Progress percentage
  - Start date (YYYY-MM-DD)
  - Duration in days
  - End date (YYYY-MM-DD)
  - Dependencies (task IDs)
  - Parent (read-only, derived)

- Cell editing with date masks
- Column header management
- Spreadsheet sync with Gantt chart

### 🐛 Fixed
- Data structure normalization

---

## [2.0.5] - 2025-07-01

### ✨ Added
- Project renaming
- Project deletion with confirmation
- Better project management UI

### 🐛 Fixed
- Project dropdown updates

---

## [2.0.4] - 2025-06-20

### ✨ Added
- Create new projects
- Project selector dropdown
- Multiple projects in single browser tab

### 🐛 Fixed
- Active project tracking
- LocalStorage per-project persistence

---

## [2.0.3] - 2025-06-10

### ✨ Added
- Dark-themed header
- Status indicator styling
- Improved button styling

### 🐛 Fixed
- Button hover states
- Color scheme consistency

---

## [2.0.2] - 2025-06-01

### ✨ Added
- Toolbar with common actions
- Responsive header layout
- Better mobile support

### 🐛 Fixed
- Toolbar responsiveness
- Button sizing on mobile

---

## [2.0.1] - 2025-05-20

### ✨ Added
- Save status indicator
- Auto-save to localStorage
- Better error feedback

### 🐛 Fixed
- Save timing issues
- Status message display

---

## [2.0.0] - 2025-05-01

### ✨ Added
- Complete UI redesign
- Modern color scheme
- New toolbar layout
- Responsive design
- Multiple zoom levels
- Split pane interface

### 🐛 Fixed
- Many UI bugs from v1
- Better touch support

### ⚠️ Breaking Changes
- Data format updated (v26 schema)
- Old projects may need re-import

---

## [1.5.0] - 2025-04-01

### ✨ Added
- Initial Gantt chart visualization
- jExcel spreadsheet integration
- Basic task hierarchy support

---

## [1.0.0] - 2025-03-01

### ✨ Added
- Initial release
- Basic HTML file
- Browser-based Gantt chart
- LocalStorage persistence
- CSV export

---

## Format Legend

- ✨ **Added** – New features
- 🐛 **Fixed** – Bug fixes
- 📝 **Changed** – Changes to existing features
- ⚠️ **Breaking Changes** – Changes requiring user action
- 📚 **Documentation** – Documentation updates
- 🎨 **UI/UX** – User interface improvements
- 🔄 **Dependencies** – Library updates

---

## How to Upgrade

1. **Automatic** (Online Users)
   - Changes deploy automatically
   - No action needed

2. **Manual** (Downloaded File)
   - Download new `index.html`
   - Open in browser
   - Old projects will auto-migrate if possible

3. **With Dropbox**
   - Dropbox-backed projects auto-sync
   - Version history is maintained
   - Can restore to any previous version

---

## Versioning Scheme

Simple Gantt follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (first number) – Breaking changes, major features
- **MINOR** (second number) – New features, backwards compatible
- **PATCH** (third number) – Bug fixes, small improvements

Examples:
- v2.4.5 = Major 2, Minor 4, Patch 5
- v3.0.0 = Breaking changes (major version bump)
- v2.5.0 = New features, no breaking changes

---

## Support & Issues

- **Bug Report** – Please include version number and browser
- **Feature Request** – Describe use case
- **Question** – Check documentation or open an issue

Visit: [https://github.com/adambeltz2/Simple-Gantt/issues](https://github.com/adambeltz2/Simple-Gantt/issues)

---

## Roadmap

### Planned for v3.0
- 🔒 Real-time collaboration (WebRTC)
- 📅 Calendar sync (Google, Outlook)
- 🔗 Kanban board view
- 📊 Advanced reporting

### Planned for v2.5
- 🌐 Multiple language support
- 📱 Mobile app version
- 🎯 Agile sprint planning
- 📈 Better analytics

### Under Consideration
- AI-powered scheduling
- Integration with Slack/Teams
- Time tracking
- Budget tracking

---

**Last Updated:** August 21, 2026  
**Latest Version:** 2.4.5
