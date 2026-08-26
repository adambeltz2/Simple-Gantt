# Changelog

All notable changes to Simple Gantt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.15.0] - 2026-08-26

### ✨ Added

#### Paginated PDF Export
- New "Export PDF" toolbar button, next to Export PNG, produces a proper paginated print/PDF view of the Gantt chart instead of a single oversized image.
- Built on a new CDN dependency, [jsPDF](https://github.com/parallax/jsPDF) 2.5.2 (pinned, SRI-hashed against the real npm-published `dist/jspdf.umd.min.js` bytes) -- chosen over a print-stylesheet-only approach because a wide scrolling timeline needs actual raster pagination (splitting one continuous canvas into discrete pages), which CSS `@media print` alone can't do cleanly for an arbitrarily wide SVG chart.
- Reuses the exact same rasterization the existing PNG export already relies on (`html2canvas` on `.chart-panel` at `scale: 2`) rather than a second, parallel rendering path -- the one captured canvas is then sliced into a grid of landscape-Letter pages sized for ~150dpi print quality.
- Each page gets the project name and today's date in a header, and a "Page X of Y (row R of Rows, col C of Cols)" footer when there's more than one page -- the row/col coordinates are there specifically so a multi-page printout can be reassembled back into the original layout, since pagination on a wide timeline is 2-dimensional (across for date range, down for row count), not just a simple top-to-bottom split.
- A Day-zoom view over a multi-year plan can paginate into a very large PDF -- generating more than 40 pages prompts for confirmation first (showing the exact page grid it's about to produce) rather than silently writing out a huge file.
- Grid-only export concern like PNG: never touches task data, the live Gantt chart, CSV export, or Dropbox backups.

### 🧪 Testing
- Added `tests/pdf-export.spec.js`: the toolbar button's presence, a real download producing a structurally valid PDF (`%PDF-` header, `%%EOF` trailer, at least one real page object), zero effect on grid data and the Gantt chart, the status-bar completion message, and no uncaught errors during export.
- The jsPDF UMD build and this file's exact pagination/slicing algorithm were additionally verified in a throwaway harness (real npm-fetched `jspdf.umd.min.js` bytes, run headless) against both a single-page-sized canvas (1 page) and a wide multi-year-shaped canvas (9000x1200px -> 6 cols x 2 rows = 12 pages), confirming the generated PDF's actual page count matches the computed grid in both cases.

---

## [2.14.0] - 2026-08-25

### ✨ Added

#### Critical Path Highlighting
- A new "Critical path" toolbar toggle, off by default, runs a standard CPM (Critical Path Method) forward/backward pass over the Depends graph and highlights the chain of zero-slack tasks that determines the project's overall end date.
- Deliberately not a separate/parallel date model -- the pass is expressed with the exact same working-day-aware date arithmetic `calculateEndDate` and the live dependency scheduler already use (`subtractWorkingDays`/`workdayBefore` are direct inverses of that forward logic), so "zero slack" lines up exactly with the Start/End dates already on screen.
- Critical tasks get a small ⚡ next to their name in the grid, an outlined bar in the Gantt chart (layered on top of the status fill and resource stripe, not replacing them), and a "Critical path" entry in the chart legend while the toggle is on.
- Parent/summary rows are excluded, same convention as the Workload dashboard -- their dates are a rollup, not a real scheduled duration, so they're never themselves marked critical (only their children can be).
- A parallel branch with float (a shorter path that isn't the long pole) is correctly left unmarked -- verified with a dedicated test fixture (two branches off one root, rejoining at one task) rather than just the trivial all-critical case of a single linear chain.
- Suppressed entirely while a dependency cycle exists (see 2.13.0's cycle detection) -- a cycle has no well-defined critical path, and the app already has a dedicated warning for that case.

### 🧪 Testing
- Added `tests/critical-path.spec.js`: the toggle off by default, an all-critical linear chain, a parallel branch with float correctly excluded, a milestone on the critical path, an isolated task with slack, a lone task trivially critical, parent rows never marked, suppression during a dependency cycle, that toggling never mutates task data, the legend entry appearing only when appropriate, and no uncaught errors.
- Full suite: 15 spec files, 104 tests, all pass.

---

## [2.13.0] - 2026-08-25

### ✨ Added

#### Explicit Dependency Cycle Detection
- The self-reference guard already stripped a task depending on/parented to itself, but a longer cycle in the Depends graph (A depends on B depends on A, or a longer chain) went completely undetected -- the fixed-point scheduling loop that resolves Start dates would just keep changing something every pass until it silently hit its own 100-iteration safety valve, with no explanation for why the dates never settled.
- Added a real graph traversal (`detectDependencyCycles`, three-color DFS over the same Depends edges `syncToGantt` already builds into `tasksMap`) that runs once per sync, before the fixed-point loop, and finds every cycle -- not just two-task loops, arbitrary-length chains.
- Purely additive: it never removes a Depends link or blocks scheduling (the existing iteration limit already protects against a runaway loop) -- it only explains what's happening. A detected cycle gets a red outline + tooltip (naming the exact cycle path) on the Task ID cell of every task involved, plus a one-time amber status-bar warning when the cycle first appears or its membership changes (not re-shown on every subsequent edit while it's unresolved, so it doesn't spam the status bar).
- A diamond-shaped dependency graph (two tasks sharing a common ancestor/descendant) is correctly *not* flagged -- only genuine cycles are.

### 🐛 Fixed

#### Status-bar warnings were being silently overwritten by "✓ Saved" (pre-existing bug, found while wiring up the cycle warning)
- `syncToGantt()` always calls `saveToLocal()` in its `finally` block, and `saveToLocal()` always shows its own "✓ Saved" status last. Any warning set earlier in the same sync pass -- including the existing self-reference warning -- was being overwritten before the user could ever see it, since both happen synchronously in the same tick.
- Fixed by queuing warnings (`pendingWarning`) during the sync and showing them *after* `saveToLocal()`'s own status call, so an actionable warning is what's left on screen, not a routine save confirmation. This also makes the pre-existing self-reference warning visible for the first time.

### 🧪 Testing
- Added `tests/dependency-cycle-detection.spec.js`: a two-task cycle, a three-task chain cycle, a normal linear chain (no false positive), a diamond shape (no false positive), that detection never mutates the Depends column, that a plain self-reference still shows its own message and not a cycle message, that fixing the cycle clears the outline and status, and no uncaught errors across the whole flow.
- Full suite: 14 spec files, 93 tests, all pass.

---

## [2.12.0] - 2026-08-25

### ✨ Added

#### Resource Color-Coding in the Gantt Chart
- Each resource gets a deterministic color, assigned alphabetically from a fixed categorical palette, so the same roster always produces the same colors across renders regardless of task/row order.
- Rendered as a thin (4px) colored stripe on the left edge of each bar, layered on top of the existing status fill and progress overlay -- so it stays visible at any completion percentage, and the status colors (not started/in progress/complete/overdue/summary) keep doing their existing job of showing schedule health.
- For a multi-resource task, the first-listed resource's color wins the stripe. This matches the Workload dashboard's own "primary assignee" framing and keeps the visual simple rather than trying to split a 4px stripe further.
- Milestones and unassigned tasks are skipped -- a milestone's diamond shape has no meaningful "left edge," and an unassigned task has no resource to color by.
- The palette is deliberately disjoint from the status-fill hues (no blue/green/red/amber/slate), so a resource's color is never mistaken for a status.
- The chart legend gains a second section listing every resource currently in use with its swatch, separated from the status legend by a thin divider. Resource names are HTML-escaped the same way task/note content already is elsewhere in the app.

### 🧪 Testing
- Added `tests/resource-colors.spec.js`: stripe presence/absence (assigned vs. unassigned vs. milestone), first-resource-wins on multi-resource tasks, color stability across row-order changes, distinct colors for distinct resources, legend content/ordering/color-matching, the no-resources-assigned empty state, and XSS-safety of resource names in the legend.
- Full suite: 13 spec files, 85 tests, all pass.

---

## [2.11.0] - 2026-08-24

### ✨ Added

#### Grid Search/Filter
- A search box in the toolbar filters rows by Task Name or Resource (case-insensitive substring match).
- A match's ancestor chain (parent, grandparent, ...) stays visible too, for outline context -- otherwise a matched leaf task would show up orphaned with no indication of where it lives in the hierarchy.
- Composes with Collapse via AND, not override: a manually collapsed section stays collapsed even if something inside it matches the search. Neither mechanism fights the other for control of a row's visibility.
- Deliberately not built on jexcel's own built-in `search()`: that function detaches non-matching `<tr>` elements from the DOM entirely and manages its own display state, which would directly conflict with the `hideRow`/`showRow` calls the existing Collapse feature already relies on. Instead, `applyRowVisibility()` (already the single source of truth for Collapse) was extended to also account for the active search query in the same pass.
- Purely a display concern, like Collapse and the In Progress flag -- `sheet.getData()` and CSV export are always the full, unfiltered data regardless of what's currently visible.
- Resets automatically on project switch/create/delete, since it's a transient "find it right now" tool rather than a saved-per-project preference.

### 🧪 Testing
- Added `tests/grid-search.spec.js`: matching by name and resource, case-insensitivity, the ancestor-visibility behavior, the no-matches empty state, clearing via the X button, composition with manual collapse, data-integrity (search never touches `sheet.getData()`), and reset on project switch.
- Full suite: 12 spec files, 75 tests, all pass.

---

## [2.10.1] - 2026-08-24

### 🧪 Testing

- Added `tests/csv-roundtrip.spec.js`: exported CSV headers match the live columns (core + custom, in order), exported dates/parent-rollup values match the live engine's own computed state, a full export → re-import cycle reproduces the same data, the "Notes" column's raw content survives the round trip, and importing a CSV with no header row doesn't crash.
- Added `tests/workload-dashboard.spec.js`: single- and multi-resource daily allocation, overallocation flagging, parent/summary rows correctly excluded, the Hours-vs-Percentage unit toggle, multiple comma-separated resources on one task, Weekly-view aggregation, the dashboard's own CSV export, and the empty-state message when nothing is assigned.
- No functional changes -- this closes the last tech-debt item from the original repo review (CSV round-tripping and the Workload dashboard were the only two areas without coverage). Full suite: 11 spec files, 67 tests, all pass.

---

## [2.10.0] - 2026-08-24

### ✨ Added

#### Notes Field
- A custom column literally named "Notes" (case-insensitive, matching what several real projects already had as a plain-text custom column) now renders as a small click-to-expand flag (📝 if it has content, + if empty) instead of raw inline text.
- Clicking it opens a modal titled with the task's name, rendering the note through a lightweight, self-contained Markdown subset -- bold (`**x**`/`__x__`), italic (`*x*`/`_x_`), links (`[text](https://...)`), and bullet/numbered lists. Deliberately not a full CommonMark library: no new CDN dependency to version-pin and SRI-hash, given how much of this project's recent history has been about hardening exactly that.
- An Edit toggle switches to a raw-text textarea; Save writes the raw Markdown source back to the cell (still a plain-text value, so CSV export/import round-trips it unchanged like any other custom column) and re-renders; Cancel discards changes.
- The column is readOnly at the grid level -- the modal is the only way to change it, so a stray double-click can't leave half-typed Markdown syntax sitting in a tiny cell.
- Always escapes user text before inserting any Markdown-derived HTML, so typed `<script>`/`<img onerror>`-style content can never execute -- it renders as inert visible text.
- Renaming a column to or from "Notes" (via the existing right-click Rename) picks up or drops the treatment immediately.

### 🧪 Testing
- Added `tests/notes-field.spec.js`: the icon vs raw-text rendering, readOnly enforcement, modal title/rendering, the empty-note placeholder, edit/save writing raw Markdown back to the cell, Cancel discarding edits, HTML-escaping safety, non-"Notes" custom columns being unaffected, and CSV-header round-tripping.
- Found and fixed a real bug while writing these tests: `escapeHtml()`'s `innerText`/`innerHTML` round-trip silently converts embedded newlines into `<br>` in the browser, which broke multi-line note list-detection (it split on `\n` *after* escaping, by which point the newlines were already gone). Fixed by escaping each line individually, after splitting -- caught immediately by the new list-rendering test rather than shipping silently broken.
- Full suite: 9 spec files, 54 tests, all pass.

---

## [2.9.1] - 2026-08-24

### 🐛 Fixed

#### Critical: End dates could land before Start dates (real bug report)
- Found via a follow-up bug report right after 2.9.0 shipped: a 1-day task starting 2026-08-20 was showing End=2026-08-19 -- one day *before* its own Start.
- Root cause: `new Date("YYYY-MM-DD")` is parsed as **UTC midnight** per the ECMAScript spec. In any timezone behind UTC (most of the Americas), reading that Date back with local getters (`getDate()`, `getDay()`, etc.) silently rolls the calendar date back by one day. This bug predates every other change in this release -- it's been in the codebase since the beginning.
- It was invisible until now because the old **exclusive** End convention (fixed in 2.9.0, one day *after* the last day of work) happened to add back exactly the one day this bug subtracts, for 1-day tasks, in behind-UTC timezones. Two independent bugs were canceling each other out. Fixing the first (2.9.0) unmasked the second.
- It was also invisible in this project's own automated tests, because the test sandbox's default timezone is UTC, where this bug class cannot manifest at all -- `new Date("YYYY-MM-DD")` in UTC needs no correction.
- Fixed by adding `parseLocalDate()`, a timezone-safe replacement for `new Date(str)` used everywhere this app parses its own YYYY-MM-DD strings back into `Date` objects: `calculateEndDate`, `calculateWorkingDays`, dependency scheduling, parent rollup, the Late indicator, the workload dashboard, the Gantt date-range banner, and the chart's milestone/overdue logic.
- **`playwright.config.js` now pins the test browser to `timezoneId: 'America/New_York'`** (a real, behind-UTC timezone) instead of the host machine's default, so this entire class of bug is caught automatically going forward instead of depending on where CI happens to run.
- If you saw End dates before Start dates after updating to 2.9.0, click "↻ Sync Dependencies" once to fix it -- same as any other date recalculation.

### 🧪 Testing
- Added `tests/timezone-safety.spec.js`: a sanity check that the test browser is genuinely running in a non-UTC, behind-UTC timezone (so these tests can't silently stop testing anything), an exact reproduction of the reported regression, an invariant check that End is never before Start across a range of durations and weekend settings, direct verification of `parseLocalDate()` against several calendar dates, and a full reproduction of the production bug's exact data shape.
- Full suite: 8 spec files, 45 tests, all pass under the new non-UTC timezone default.

---

## [2.9.0] - 2026-08-24

### ✨ Added

#### Late Indicator
- The End column now colors itself automatically: red if the date is in the past, yellow if it's today, no color if it's not due yet
- Pure date math -- % Done is deliberately never consulted, same "dates are on the user" decision as dependency scheduling
- Applies uniformly to every row, including parents and milestones (a parent's End is already its own rolled-up value)
- Grid-only, matching the In Progress flag: no effect on the Gantt chart, CSV export, or Dropbox backups

### 🐛 Fixed

#### End date is now inclusive (real bug report)
- Found via a user-reported bug: a multi-level parent task wasn't reflecting its children's current dates.
- Root cause: `calculateEndDate`/`calculateWorkingDays` used an **exclusive** End convention (End = the day *after* the last day of work) rather than the inclusive convention ("End" = the actual last day) that matches what the app's own users -- and most people filling in a spreadsheet -- expect.
- This one convention bug had three visible symptoms, all fixed by the same change:
  1. A 1-day task starting 8/20 showed End=8/21 instead of 8/20.
  2. Direct testing against the real frappe-gantt library showed it renders bar width using an **inclusive** end date -- so every non-milestone Gantt bar was rendering one day wider than it should have, this whole time.
  3. The chart's automatic "overdue" (red) coloring was triggering one day later than the actual due date, for the same reason.
- Dependency scheduling ("Depends") is adjusted to match: a successor now explicitly advances to the day after its dependency's (now-inclusive) End, skipping to the next working day if that lands on a weekend. The real-world schedule computed is identical to before -- only the stored End date's meaning changed.
- **Existing projects' stored End dates were computed under the old convention.** They self-correct the next time a row is edited, or immediately if you click "↻ Sync Dependencies" once.

#### Parent rollup now converges correctly for 3+ level hierarchies (found while fixing the bug above)
- The rollup that computes a parent's Start/End/% Done from its children ran in a single pass over all parent IDs, in the order those IDs first appear in the data -- not guaranteed to be bottom-up. For a hierarchy like grandparent → parent → children, the grandparent could roll up using the parent's stale, pre-rollup values if the parent hadn't been recalculated yet in that same pass.
- The rollup now repeats to a fixed point (same `while (changed)` pattern the dependency-resolution loop already used), so it converges correctly regardless of nesting depth or row order.

### 🧪 Testing
- Added `tests/late-flag.spec.js`: red/yellow/no-color thresholds, the tooltip, % Done being ignored, parent rows coloring from their own rolled-up End, zero effect on the chart/CSV columns.
- Added `tests/inclusive-end-dates.spec.js`: `calculateEndDate`/`calculateWorkingDays` as exact inverses, a direct reproduction of the reported bug (the exact 3-row shape from the report), a direct reproduction of the second (grandparent) bug found while investigating the first, Gantt bar width verified against the real frappe-gantt library, and the corrected overdue-coloring timing.
- Updated `tests/dependency-scheduling.spec.js`'s date-relationship assertion for the new inclusive-End adjacency rule.
- Reran the full suite (7 spec files, 40 tests) -- all pass.

---

## [2.8.0] - 2026-08-24

### 🔒 Security

#### CSV import sanitization, closed for every ingestion path
- Previously, only the manual "Import" button sanitized anything, and even then only the Start/End date columns -- Task Name, Resource, and custom columns passed through raw. The other two CSV ingestion paths (Dropbox backup restore via `restoreBackup()`, and Dropbox project discovery via `importDiscoveredProject()`) didn't sanitize at all.
- Centralized sanitization into `applyImportedCSVData()` (used by the Import button and Dropbox restore) and a new shared `sanitizeImportedRows()` helper (also called directly by `importDiscoveredProject()`, which builds its project object without going through `applyImportedCSVData()`). Every path now sanitizes by construction instead of relying on each caller to remember to.
- `sanitizeImportedCell()` now strips `<`/`>` from any text field, not just dates -- these are free-text fields that only ever need to render as plain text, so this removes the actual ability to inject markup rather than relying solely on every render site remembering to escape.

### 🧪 Testing
- Added `tests/csv-sanitization.spec.js`: verifies sanitization on the `restoreBackup()`/`applyImportedCSVData()` path, on `sanitizeImportedRows()` directly for arbitrary custom columns, that date parsing still works correctly alongside it, that legitimate text (parentheses, `%`, `@`) is left untouched, and an end-to-end test importing a crafted CSV through the actual file input.

---

## [2.7.0] - 2026-08-24

### 🐛 Fixed

#### "Sync Dependencies" cleanup
- Removed `recalculateDatesUpstream()` (and its helpers `parseDate`/`calculateDuration`), the standalone implementation behind the "Sync Dependencies" button. It misread the `Depends` column as if it defined a parent/child rollup, which doesn't match either relationship in this app:
  - **Depends** = finish-to-start date constraint (a task's Start is pushed to equal its dependency's End). Calendar dates only -- % Done is never consulted.
  - **Parent** = rollup (a parent's Start/End/% Done are computed from its children).
- Both rules were already implemented correctly and run automatically on every edit inside `syncToGantt()` -- they did not need the button, and the button's old logic was actively wrong.
- `syncDependencies()` now simply forces a full recompute via the same live logic (`syncToGantt(true)`), useful mainly after pasting in a large block of rows.
- Previously, the README/CHANGELOG described this as automatically wired into CSV import, CSV export, and Dropbox backup. It never was for the old (buggy) implementation, and the docs also referenced `processImportedTasks()`/`processBeforeExport()` helper functions that never existed in the codebase. Corrected the README to describe the real, live behavior.

### 🧪 Testing
- Added `tests/dependency-scheduling.spec.js`: verifies finish-to-start scheduling happens live without the button, verifies scheduling ignores % Done entirely, verifies parent rollup happens live, verifies the button still works and is idempotent, and verifies the old buggy function is gone for good.

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
