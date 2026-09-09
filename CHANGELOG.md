# Changelog

All notable changes to Simple Gantt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.33.4] - 2026-09-09

### 🐛 Fixed

#### The Resource quick-pick picker showed "No named resources yet" despite dozens of names already in the grid
- User-reported: on a real project, clicking the picker icon (▾) on a Resource cell appeared to do nothing useful -- it opened, but was empty, even though many other rows already had names like "Adam Beltz" or "Pooja Agarwal" typed into their own Resource cells.
- Root cause: the named-resources registry (backlog #12) is populated additively whenever names arrive through a path that already calls its merge helpers -- CSV import and the Dropbox cross-device discovery path both do -- but the plain page-load-from-`localStorage` path only ever defaulted a missing `resources` key to an empty array, with no equivalent backfill from the project's own existing Resource-column data. A project whose Resource cells were populated before the registry existed (or synced/restored some other way) loaded with an empty registry that only grew one cell (or one cell's worth of comma/semicolon-separated names) at a time, as each Resource cell happened to get individually re-edited.
- Fixed with `backfillResourcesRegistry()`, run once per project in the same startup loop as `normalizeData()`/`migrateLegacyNotesColumn()`: additive-only and idempotent, so it scans every row's Resource cell and merges in any name not already registered, without touching a project that's already fully backfilled.
- Investigated a related report of the picker "not responding" to clicks and the App becoming unresponsive on the same large project; could not reproduce either as a real regression against a fresh checkout -- most likely explained by the same empty-registry symptom (an empty popover looks unresponsive) rather than a separate bug.

### 🧪 Testing
- Added `tests/resource-registry-backfill.spec.js` (5 tests): an empty-registry project backfills correctly from existing Resource data; an already-fully-registered project is left untouched (idempotent, no duplicates/reordering); an allocation suffix like `(50%)` is stripped during backfill, matching every other resource-name path; the function is confirmed wired into the app; the picker popover reflects a freshly backfilled registry on the very first open, not just after a live edit.
- Re-ran `named-resources.spec.js`, `resource-colors.spec.js`, `bulk-edit.spec.js`, `workload-dashboard.spec.js`, `csv-roundtrip.spec.js`, and `task-notes.spec.js` (65 tests total) against real vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's egress blocks the live CDN hosts) -- all green, including `task-notes.spec.js`'s existing "clicking outside the modal while editing prompts before discarding unsaved changes" test, independently reconfirming that a separately-reported Notes dirty-check issue does not reproduce against current code.

## [2.33.3] - 2026-09-08

### 🐛 Fixed

#### A parent showed 100% Done even though most of its children were blank/unscheduled
- User-reported (screenshot): "CPQ Templates" showed 100% complete with ~30 children, but only one of them had an actual schedule and progress -- the rest had no Start, Duration, or % Done at all.
- Root cause in `syncToGantt()`'s parent rollup: the weighted-average % Done calculation ran over the exact same subset of children used for the date-span rollup (min Start / max End), which only includes children with a valid schedule. A child with no Start/Duration was therefore invisible to the % Done average -- not counted as 0%, just left out entirely -- so a parent with 1 scheduled child at 100% and 29 blank ones still averaged to 100% (the lone child was effectively the whole average).
- Fixed by decoupling the two rollups: the date-span rollup still only uses children with a real schedule (unchanged), but % Done now rolls up from *every* child. Weighted by Duration when known, same as before; an unscheduled child falls back to a weight of 1 so it counts as one unit of "0% done" work instead of vanishing from the average.

### 🧪 Testing
- Added `tests/parent-pct-rollup.spec.js` (5 tests): an unscheduled child correctly pulls the average down instead of being excluded; a parent whose children are all blank rolls up to 0%, not 100%; a scheduled child with a blank % Done cell is treated as 0% like any other blank value; the date-span rollup is confirmed unaffected (still schedule-only); a multi-level hierarchy rolls % Done up correctly through an unscheduled mid-level parent.
- Re-ran `done-checkmark.spec.js`, `dependency-scheduling.spec.js`, `leaf-end-date.spec.js`, `late-flag.spec.js`, `critical-path.spec.js`, `undo-redo.spec.js`, `timezone-safety.spec.js`, and `inclusive-end-dates.spec.js` (67 tests total) against real vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's egress blocks the live CDN hosts) -- all green.

## [2.33.2] - 2026-09-08

### 🐛 Fixed

#### A parent row nested under another parent wasn't rendered bold
- User-reported (screenshot): rows with children were expected to be bold, and the top-level ones were -- but a parent row that was itself nested under another parent (e.g. "Data Migration (R1)" under "Transform HJ (R1)") stayed regular weight, even though it clearly had its own collapse/expand toggle and children underneath it.
- Root cause in `formatCells()`: the Task Name cell's `if (depth > 0) { ...indent... } else { ...indent...; cell.style.fontWeight = isParent ? 'bold' : 'normal'; }` accidentally coupled two unrelated concerns -- indentation and bold weight -- into the same branch. The bold line only ever ran in the `depth === 0` (top-level) case; any parent nested one level deep or more never had `fontWeight` touched at all.
- Fixed by pulling `cell.style.fontWeight = isParent ? 'bold' : 'normal';` out of the `if`/`else` entirely so it runs on every row regardless of depth, while indentation (`paddingLeft`/`borderLeft`) keeps its own depth-based branching unchanged.

### 🧪 Testing
- Added `tests/parent-row-bold.spec.js` (5 tests): a top-level parent is bold; a parent nested under another parent is also bold (the exact bug); a leaf row at depth 0 is not bold; a leaf row nested at depth > 0 is not bold; a childless sibling of a nested parent, at the same depth, is not bold.
- Re-ran `sibling-indent-alignment.spec.js`, `csv-outline-indent.spec.js`, `collapse-expand.spec.js`, `critical-path.spec.js`, and `done-checkmark.spec.js` (32 tests total) against real vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's egress blocks the live CDN hosts) -- all green apart from the same pre-existing, harness-only `page.reload()` failure already documented in earlier changelog entries.

## [2.33.1] - 2026-09-08

### 🐛 Fixed

#### "Delete row" only deleted one row out of a multi-row selection
- User-reported: dragging to select several rows in the grid, then right-click -> "Delete row," only removed the single row under the cursor instead of the whole selection.
- The row context menu's "Delete row" handler always called `sheet.deleteRow(parseInt(y), 1)` -- hardcoded to the one row the right-click landed on -- and never consulted `lastSelectionRange`, the same top/bottom selection range Bulk Edit (backlog #14) already tracks via jexcel's `onselection` callback.
- Fixed by having "Delete row" check whether the right-clicked row falls inside a real (2+ row) `lastSelectionRange`: if so, it deletes the whole range in one `deleteRow` call; otherwise (no selection, or right-clicking outside a stale one) it falls back to just the single clicked row, unchanged from before.

### 🧪 Testing
- Added `tests/delete-row-multiselect.spec.js`: a single right-click with no selection still deletes only that row; right-clicking inside a dragged multi-row selection deletes the whole selection; right-clicking outside a stale selection still deletes only the clicked row; a multi-row delete updates the Gantt chart and triggers a save.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (fetched from npm, served via `page.route()`), since this sandbox's outbound network blocks the live CDN hosts -- all 4 new tests passed, plus `bulk-edit.spec.js`, `move-task-to-id.spec.js`, `grid-search.spec.js`, and `undo-redo.spec.js` re-run against the same vendored copies with no regressions (one pre-existing, unrelated failure in `row-id-backfill.spec.js` -- the same vendored-jexcel synchronous-onchange timing quirk already documented in earlier changelog entries -- reproduces identically and is unrelated to this change).

---

## [2.33.0] - 2026-09-08

### ✨ Added

#### Desktop toolbar visual review, completed (backlog #17)
- Finishes the toolbar decluttering started by the "Export ▾" menu (an earlier release): Zoom, Weekends off, Critical path, and Label in chart now live behind a new "View ▾" menu; Fit columns and Sync Dependencies now live behind a new "Tools ▾" menu. Same anchored-popover pattern Export ▾ already established.
- One deliberate behavioral difference between the two new menus: View ▾ stays open after you interact with something inside it (checking a box, changing Zoom) since adjusting display settings is often a multi-step action, not a single click-and-done like an export -- Tools ▾ auto-closes after either of its two actions fires, matching Export ▾'s one-shot behavior.
- All the moved controls kept their exact original `id`s and `onclick` handlers -- this is purely a "where do these live in the toolbar" change, nothing about weekends/critical-path/label-in-chart/zoom/fit-columns/sync-dependencies logic itself changed.
- Also gave "Add row" -- the single most-used toolbar action -- a filled, primary-colored style (`.tbtn-primary`) distinct from the plain ghost-button look every other always-visible button still shares, per this item's visual-hierarchy recommendation. Kept this lighter than the full segmented-control restyle originally floated for nav/view-mode buttons; the two new menus already did the bulk of the decluttering.
- Net effect: top-level always-visible toolbar controls drop from ~26 to 15 (several of those 15 are themselves menus hiding further controls), keeping the toolbar to one row on a typical laptop-width window instead of silently wrapping onto a second.
- Distinct from, and doesn't touch, the *mobile* toolbar collapse shipped in v2.32.0 -- separate mechanism, separate breakpoint; the two new menus still work correctly at mobile widths once the mobile "More" toggle reveals their group.

### 🧪 Testing
- Added `tests/toolbar-menus.spec.js`: both new menus are closed by default and open on click, revealing their controls; clicking outside either closes it; View ▾ stays open after an interior interaction while Tools ▾ closes itself after an action; Zoom and Sync Dependencies still work correctly from inside their new menus; Add row's background color is now visually distinct from a plain toolbar button.
- Updated `tests/labels.spec.js` (Label in chart checkbox) and `tests/dependency-scheduling.spec.js` (Sync Dependencies button) to open the relevant new menu before interacting with a control that moved inside it -- an intentional behavior change (these controls are no longer always visible), not a regression. Every other existing test that touches these controls does so via `page.evaluate()` DOM assignment rather than a real Playwright click, so it was already unaffected by the controls no longer being visible by default -- verified directly rather than assumed.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's egress blocks the live CDN hosts): the new/changed tests plus every mobile-toolbar and export-menu spec (54 tests), a second batch of every other spec file touching Zoom/Weekends off/Critical path (62 tests), and the full suite, all green apart from the same pre-existing, harness-only failures already documented in earlier changelog entries (pdf-export/pwa/reload-related/row-id-backfill).

## [2.32.0] - 2026-09-07

### ✨ Added

#### Collapsible mobile toolbar
- User-reported: on a phone, the full desktop toolbar (5 groups, ~25 buttons/controls) rendered every control at once, spilling across 5-6 rows above the workspace before you even reached the grid or chart.
- Below the existing 860px mobile breakpoint, the toolbar now shows only the handful of most-used controls by default -- Search, the Grid/Split/Chart pane switcher, Undo/Redo, and Add row -- plus a new "More ▾" toggle. Tapping it reveals everything else (Start/Today/Workload/Expand All/Collapse All, Label filter/Filters/Clear filters, Zoom/Weekends off/Critical path/Label in chart, Bulk Edit/Resources/Notes/Fit columns/Sync Dependencies/Export, and the Dropbox Back up/Versions/Disconnect group); tapping it again ("Less") collapses back down.
- No controls are duplicated or rebuilt to do this -- every collapsible button/control is the exact same DOM element in both states, wrapped in a `<span class="tb-mobile-collapsible">` toggled between `display: none` and `display: contents` by a `.more-open` class on `.toolbar`. `display: contents` is also the default at every screen size, so desktop layout (spacing, grouping, borders between toolbar groups) is completely unaffected by this change -- the wrapper has no box of its own there either.
- Each toolbar group also gains `flex-wrap: wrap` under the mobile breakpoint, so a group's own buttons wrap onto additional lines instead of overflowing once "More" is open and a group's full content is showing again.

### 🧪 Testing
- Added `tests/mobile-toolbar-collapse.spec.js`: secondary controls (Today, Bulk Edit, Back up, Zoom) are hidden by default on mobile while the essential controls (Search, Grid/Split/Chart, Undo/Redo, Add row, the More toggle itself) stay visible; tapping "More" reveals the secondary controls and flips the label/`aria-expanded` state; tapping again collapses back; a revealed secondary control still fires its handler with no console errors; at a desktop-width viewport the More toggle is hidden and nothing is collapsed.
- Updated two existing `tests/mobile-responsive.spec.js` tests (the touch-target-height check and the full-screen-modal check) to open "More" first, since the buttons they exercise (`jumpToToday()`, `openWorkloadModal()`) are now behind it on mobile -- an intentional behavior change, not a regression.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's outbound network blocks the live CDN hosts).

## [2.31.1] - 2026-09-07

### 🐛 Fixed

#### Landscape mobile was stuck in the same single-pane-only mode as portrait
- User-reported: rotating a phone to landscape kept the grid/chart workspace locked to one full-width pane at a time, same as portrait, even though a landscape phone is often 700-860px wide -- real room for the desktop-style side-by-side split, just not enough to also justify never letting the user adjust it.
- The single-pane-forcing CSS rules (hide the resizer, force each pane to 100% width, hide whichever pane isn't active) now apply only in portrait (`@media (max-width: 860px) and (orientation: portrait)`). Landscape at the same width keeps the normal resizable two-pane split -- both panes visible, the existing Grid/Split/Chart buttons resize the split instead of hiding a pane outright, and the divider is draggable exactly like desktop.
- The divider itself widens from the 8px desktop hairline to 16px in this landscape range, a wider touch target than a mouse cursor needs.
- **Found and fixed a real gap while making the divider draggable on a touchscreen:** it only ever listened for `mousedown`/`mousemove`/`mouseup`, which most mobile browsers don't reliably synthesize from an actual finger drag (continuous `mousemove` in particular is often not sent at all) -- so simply un-hiding the resizer in landscape would have shown a divider that looked draggable but usually wasn't. Added matching `touchstart`/`touchmove`/`touchend`/`touchcancel` handlers sharing the same resize logic as the mouse path (`touchmove` calls `e.preventDefault()` so dragging the divider doesn't also scroll the page).

### 🧪 Testing
- Added `tests/mobile-landscape.spec.js`: at a landscape phone viewport, both panes stay visible with the resizer shown; Grid/Split/Chart buttons resize the split rather than hiding a pane (still present in the DOM, just narrow); the divider's computed width is at least 16px; dispatching real `Touch`/`TouchEvent` objects at the divider (Playwright has no built-in touch-drag helper) resizes the panes and persists the new width to `localStorage`, the same way a finger drag would; no console errors across a touch-drag.
- Re-ran the existing `tests/mobile-responsive.spec.js` (portrait) unchanged and green, confirming portrait's single-pane behavior is untouched by this fix.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's outbound network blocks the live CDN hosts) -- all 10 tests across both mobile spec files passed for real.

## [2.31.0] - 2026-09-06

### ✨ Added

#### Mobile responsiveness + PWA support (backlog #15)
- **Responsive layout.** Below a new 860px breakpoint, the workspace stops splitting grid/chart side by side -- there's no useful width left for either at that point -- and shows a single full-width active pane instead, tracked via a `data-mobile-pane` attribute on `.workspace`. No new controls: the existing Grid/Split/Chart toolbar buttons (`snapPanes()`) already express "grid only / both / chart only" as a percentage split, so the same buttons now also decide which single pane is visible under the breakpoint (Split lands on whichever side of 50% it already was). Toolbar buttons, the label/filter dropdown triggers, and the search box grow to a 40px+ touch-sized minimum height under the same breakpoint, the drag divider hides (nothing to drag in single-pane mode), and modals go full-screen instead of floating as an undersized centered card.
- **PWA support.** A web app manifest (`manifest.json`) plus a generated icon set (`icons/`: 192px, 512px, a 512px maskable variant, an apple-touch-icon, and two favicon sizes) make the app installable to a home screen or desktop. A new service worker (`sw.js`) caches the static app shell (network-first, so a redeploy is picked up as soon as there's connectivity, falling back to cache when offline) and the CDN libraries the page loads (cache-first, since those are already pinned to an exact version -- re-fetching them every load only defeats offline use). Registration is guarded to `http(s):` so opening `index.html` directly off disk doesn't attempt it.

### 🧪 Testing
- Added `tests/mobile-responsive.spec.js`: at a phone-width viewport, the grid pane fills the screen with the chart hidden by default; tapping Chart/Grid switches the single visible pane and the resizer stays hidden throughout; toolbar buttons meet a 40px touch-target minimum; an open modal fills the viewport edge to edge.
- Added `tests/pwa.spec.js`: the manifest link and theme-color/apple-touch-icon meta tags are present; `manifest.json` is valid and every icon it references is actually fetchable as a PNG; `sw.js` is fetchable and a fresh navigation is controlled by it after registration; the app shell (`index.html` itself) is still served after going offline post-registration.
- Verified the service worker's actual caching logic (`cacheFirst()`/`networkFirst()` in `sw.js`) end-to-end against a real local server rather than trusting the code by inspection: first fetch populates the cache, a second online fetch is served from cache even after the underlying file changed on disk, and a fully offline fetch still returns the cached content. This sandbox can't reach the live CDN hosts the app normally loads libraries from, and unlike a page's own requests, a Service Worker's internal `fetch()` calls aren't visible to Playwright's request routing -- so a mocked-CDN version of this exact check isn't possible here -- but the underlying cache-then-serve mechanism being exercised is identical code regardless of which URL it's fronting.
- Ran the full existing suite (239 tests) against real vendored copies of every library (fetched from npm, routed in via `page.route()`/`context.route()` in a throwaway harness, per the established pattern from earlier PRs) to confirm nothing in the new CSS/JS regressed the desktop layout: all passed except the same already-documented `row-id-backfill.spec.js` timing quirk called out in v2.30.0's own changelog entry, unrelated to this change.

## [2.30.0] - 2026-09-06

### ✨ Added

#### Task-level Notes as a permanent core field (backlog #22)
- Notes is now a built-in column on every task in every project (`COL.NOTES`, right after Labels) -- no more needing to add a custom column literally named "Notes" to get the click-to-expand Markdown modal. Reuses the exact same modal/renderer (`renderNotesMarkdown()`, `openNotesModal()`) the old opt-in convention and the project-level Notes field already use, so this is purely about the column always being there, not new modal UI.
- readOnly at the cell level, same as its predecessor -- editing only happens through the modal.
- Like Labels/Depends/Parent, can't be renamed or deleted from the grid's column context menu; right-clicking it only offers "Insert Column Right" to add a custom column after it.

#### Migration for every pre-existing shape
- A saved project whose task rows predate this column gets a blank Notes slot spliced in at load time, the same splice-in technique already used when the Labels column itself was added.
- A project that already used the old opt-in convention (a custom column literally named "Notes") has that column's data folded into the new core field and the now-redundant custom column removed, via a new `migrateLegacyNotesColumn()` run once after `normalizeData()` on every project load.
- An old CSV exported before this column existed imports with the same blank-slot insertion in `applyImportedCSVData()` (mirroring its existing pre-Labels-CSV handling) -- unless the CSV's first custom column already happens to be named "Notes", in which case it folds into the core field on import too, for the same reason as the localStorage case above.
- A brand-new custom column can still be named "Notes" today (unchanged legacy behavior) and gets the same modal treatment side-by-side with the core field.

### 🧪 Testing
- Added `tests/task-notes.spec.js`: every project (existing and brand new) has the column; readOnly at the cell level; empty vs. filled flag icon; the modal opens, edits, and saves Markdown back to the row; HTML in a note is escaped; the column context menu offers only Insert Column Right, never rename/delete, and right-clicking Labels no longer offers Insert Column Right either (Notes must stay immediately after it); CSV export/import round-trips at the fixed core position; a legacy CSV with no Notes header imports without misaligning custom columns; a legacy custom "Notes" column folds into the core field on load.
- Updated `tests/notes-field.spec.js` (the older opt-in-custom-column convention) and seven other spec files whose fixtures assumed the previous 12-column base schema -- header arrays, row literals, and one hardcoded row-length assertion -- to account for the new 13-column base.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse/html2canvas/jspdf/dropbox, fetched from their real npm-published tarballs and routed in via `page.route()` in a throwaway test harness (this sandbox's outbound network blocks every CDN host the app normally loads them from) -- 249 of 250 tests passed. The one failure (`row-id-backfill.spec.js`) is the same already-documented, pre-existing vendored-build timing quirk called out in earlier PRs, unrelated to this change (doesn't touch Notes/Labels or row shape at all).

### 🛠 Fixed
- One genuine test bug found while verifying: `csv-roundtrip.spec.js`'s custom-"Notes"-column round-trip test located the column by `Array.prototype.findIndex` on title `"notes"`, which now also matches the new core Notes column (title collision, since both are legitimately named "Notes" in that fixture) -- switched to `findLastIndex` so it targets the custom column specifically, as intended.

## [2.29.0] - 2026-09-05

### ✨ Added

#### Move a task to a specific Task ID (backlog #21)
- New "🎯 Move to Task ID..." entry in the grid's row right-click menu, next to the existing Move row up/down. Opens a small modal: pick a target task (the same `{id, name}` dropdown source Depends/Parent already use, minus the row itself) and Before/After, then Move.
- Moving also reparents the moved task to match the target's own Parent -- one action, not two. WBS/Outline numbering (`syncToGantt()`) groups purely by each row's own Parent field, not by array position, so a repositioned row whose Parent still pointed elsewhere would show at the wrong outline depth for where it now visually sits. This mirrors what a manual drag-to-reposition followed by a manual Parent edit would already accomplish together.
- Guards against the one real way this could corrupt the hierarchy: moving a task next to one of its own descendants (which would make it a child of its own child). Rejected with a clear message before anything changes, via an ancestor-chain walk over the target's Parent lineage.
- Like a plain row drag, moves only the one row -- a moved parent's children stay where they were. Same limitation jexcel's own row drag already has, not a new one.
- **Found and fixed a real pre-existing bug while building this:** `moveRow()` (the existing Move row up/down) wrote the reordered data into `appDB.projects[...].data` *before* calling `syncToGantt()`, so by the time `saveToLocal()` ran its before/after diff to decide whether to push an Undo snapshot, "before" and "after" were already the same object -- silently dropping every row-swap from Undo history since Undo/Redo shipped in v2.23.0. Fixed by leaving that assignment to `saveToLocal()` itself, the same fix applied to this feature's own move function.

### 🧪 Testing
- Added `tests/move-task-to-id.spec.js`: the target dropdown excludes the source task; moving after/before a same-parent target reorders correctly with Parent unchanged; moving next to a target under a different parent reparents to match and recomputes Outline correctly; self-move, a nonexistent target, and moving onto a descendant are all rejected with clear errors and no data change; a move is a single Undo step reverting both the position and the reparent together (this is what caught the `moveRow()` Undo-history bug above); the context menu carries the new entry; Cancel changes nothing; no console errors.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's outbound network blocks the live CDN hosts) -- all 11 new tests passed for real, including the first run, which caught the Undo-history bug (fixed, then reverified green).

## [2.28.0] - 2026-09-04

### ✨ Added

#### Global "Clear filters" toolbar button
User-requested: a single button in the header, next to Search/Labels/Filters, that clears all three filtering mechanisms at once -- Grid Search, the Label filter, and the structured Filters dropdown (Resource/% Done/Start/End) -- instead of needing to open and clear each one individually. Composes the existing per-mechanism reset functions (`clearGridSearch()`, `resetLabelFilter()`, `resetStructuredFilters()`) rather than duplicating their state-clearing logic, and refreshes the Gantt chart afterward in case the Label filter's "Label in chart" option was narrowing it. The button itself stays disabled whenever none of the three has anything active, following the same disabled-state pattern already used for Undo/Redo.

### 🧪 Testing
- Added `tests/clear-all-filters.spec.js`: the button starts disabled; each of the three filter mechanisms enables it and is cleared by it individually; one click clears all three together; no console errors.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/papaparse/frappe-gantt/html2canvas/jspdf, fetched from their real npm-published tarballs and routed in via `page.route()` in a throwaway test harness (this sandbox's outbound network currently blocks every CDN host the app normally loads them from, `cdn.jsdelivr.net` included, not just the unpinned jsuites/jexcel hosts) -- including a full run of `structured-filters.spec.js`, `labels.spec.js`, and `grid-search.spec.js` (48 tests) to confirm no regressions from the new `applyRowVisibility()` call added to `resetLabelFilter()`.

---

## [2.27.0] - 2026-09-04

### ✨ Added

#### Markdown headers in Notes (both the per-task Notes column and Project Notes)
User-requested: a line starting with `#` through `######` now renders as a real `<h1>`-`<h6>`, one level per extra `#` (e.g. `# Title` → h1, `## Subtitle` → h2), same convention as CommonMark ATX headings -- a `#` needs a following space to count as a heading, so a stray `#` or a hashtag-style word doesn't get misread as one. Added to the same shared `renderNotesMarkdown()` renderer both Notes features already use, so both pick it up automatically with no separate change needed.

### 🧪 Testing
- Extended `tests/notes-field.spec.js` with a regression test for Markdown headers: `#` through `######` render as real `h1`-`h6` elements, and a line without one still renders as a plain paragraph.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/papaparse/frappe-gantt/html2canvas/jspdf/the Dropbox SDK, fetched from their real npm-published tarballs and routed in via `page.route()` in a throwaway test harness (this sandbox's outbound network currently blocks every CDN host the app normally loads them from, `cdn.jsdelivr.net` included, not just the unpinned jsuites/jexcel hosts) -- including a full run of the entire existing suite (269 tests) to confirm no regressions. One pre-existing, unrelated test/vendored-build interaction (`row-id-backfill.spec.js`, the same synchronous-onchange timing quirk already documented against this vendored jexcel build in the 2.24.0 entry below) reproduces identically and is unrelated to this change.

---

## [2.26.0] - 2026-09-04

### ✨ Added

#### Structured, per-column filters: Resource, % Done, Start, End (backlog #20)
Four dedicated filter widgets, distinct from the existing free-text Grid Search (which substring-matches every column) and the checkbox Label filter -- collapsed behind one new "Filters" toolbar button so they don't add four more always-visible controls to an already-dense toolbar (same overflow-menu instinct as the "Export ▾" menu from backlog #17).

- **Resource** -- a checkbox multi-select sourced from the named-resources registry (backlog #12), same OR-within-a-field semantics the Label filter already uses.
- **% Done** -- three preset buckets (Not started / In progress / Complete) rather than a numeric min/max, since the meaningful states are discrete, not a continuous range.
- **Start** and **End** -- each an optional From/To date range; either bound alone leaves that side open-ended.

All four compose with each other, with Grid Search, with the Label filter, and with Collapse via AND -- exactly how Search and Labels already composed with each other: a matched row's ancestors stay visible for outline context, and a manual collapse always wins regardless of what matches underneath it. A single "Clear filters" link resets all four at once. Entirely view-only, like every other filter in this app -- never touches task data, CSV export, or the Gantt chart.

### 🧪 Testing
- Added `tests/structured-filters.spec.js`: the Filters dropdown lists every registered resource; each of the four filter types narrows the grid correctly on its own (including OR-within-a-field for Resource and % Done, and open-ended date ranges); all four compose together via AND; composition with existing Grid Search, the Label filter, and Collapse; "Clear filters" resets everything at once; the dropdown closes on outside click; switching projects resets all four; no footprint in the Gantt chart or the underlying task data; no console errors.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/papaparse/frappe-gantt/html2canvas/jspdf/the Dropbox SDK, fetched from their real npm-published tarballs and routed in via `page.route()` in a throwaway test harness (this sandbox's outbound network currently blocks every CDN host the app normally loads them from, `cdn.jsdelivr.net` included, not just the unpinned jsuites/jexcel hosts) -- including a full run of the entire existing suite to confirm no regressions. One pre-existing, unrelated test/vendored-build interaction (`row-id-backfill.spec.js`, the same synchronous-onchange timing quirk already documented against this vendored jexcel build in the 2.24.0 entry below) reproduces identically and is unrelated to this change.

---

## [2.25.0] - 2026-09-04

### ✨ Added

#### Two small UI additions, bundled as one item (backlog #19)

**(a) 100%-done checkmark.** A task at 100% now gets a small ✓ next to its name in the spreadsheet grid, in the same slot the critical-path ⚡ icon already uses (the two can show together on the same row). Grid-only, like the In Progress flag and Late indicator -- no effect on the Gantt chart, CSV export, or Dropbox backups. Applies to parent rows too, since a parent's % Done is itself a live, duration-weighted rollup of its children rather than a value anyone types directly.

**(b) Project-level Notes.** A single Markdown note for the whole project -- distinct from the existing per-task "Notes" custom column, which gives each *row* its own note. Opened via a new "Notes" toolbar button next to Resources, reusing the exact same click-to-expand-and-edit modal UX and Markdown renderer (`renderNotesMarkdown()`) the per-task Notes column already uses, rather than building a second one. Stored as `projectNotes` on the project object, same tier as the named-resources registry, collapse state, and the in-progress flag: localStorage only. It deliberately does not round-trip through CSV export (there's no row for a project-wide field to belong to) or Dropbox backup -- Dropbox backup itself is a CSV export of the grid data plus a small `meta.json`, not a JSON dump of the project object, so the named-resources registry and collapse state don't survive it either; project notes are consistent with that existing tier, not a new exception.

### 🐛 Fixed

#### A stale icon could stick next to a task's name after the condition that added it stopped being true
Found while implementing the checkmark above, and it was a real pre-existing bug in the critical-path icon too, just never exercised by a test: `formatCells()`'s Task Name rendering only cleared and rebuilt the cell's icon content (`cell.innerHTML = ''`) on the render pass where at least one icon needed to show. Toggling the condition back off (% Done edited down from 100, or Critical Path turned off) never re-entered that branch, so the cell kept whatever icon HTML a previous render had left in the DOM -- jexcel does not reset a cell's markup on its own between edits. The Name cell now always rebuilds its icon/text content on every `formatCells` pass, regardless of whether any icon applies that time.

### 🧪 Testing
- Added `tests/done-checkmark.spec.js`: a leaf task shows the checkmark at 100% and not otherwise; editing % Done live-adds and live-removes it (the regression case for the bug above); a parent shows it once its rolled-up % Done reaches 100, not before; no effect on the Gantt chart, the underlying grid data, or CSV headers; coexists with the critical-path icon on the same row; no console errors.
- Added `tests/project-notes.spec.js`: the toolbar button opens a modal titled with the project name; an empty note shows a placeholder; edit/save persists to `appDB.projects[id].projectNotes` and re-renders the Markdown; Cancel discards edits; typed HTML is escaped, not executed; closing and reopening shows the saved state, not stale edit-mode UI; the note persists across a reload; notes are per-project, not shared globally; no footprint in CSV export headers; no console errors.
- Extended `tests/critical-path.spec.js` with a regression test for the stale-icon bug: toggling Critical Path off clears an already-rendered ⚡, not just skips adding a new one.
- Verified with a real Playwright run (224 tests total) against genuine vendored copies of jsuites/jexcel/papaparse/frappe-gantt/html2canvas/jspdf/the Dropbox SDK, fetched from their real npm-published tarballs and routed in via `page.route()` in a throwaway test harness (this sandbox's outbound network blocks the live CDN hosts the app normally loads them from) -- including a full run of the entire existing suite to confirm no regressions from the shared `formatCells()` Name-cell rewrite. One pre-existing, unrelated test/vendored-build interaction (`row-id-backfill.spec.js`, the same synchronous-onchange timing quirk already documented against this vendored jexcel build in the 2.24.0 entry below) reproduces identically and is unrelated to this change.

## [2.24.0] - 2026-09-04

### ✨ Added

#### Type an explicit End date directly on a leaf task (backlog #18)
- The End column was unconditionally read-only for every row, always derived forward from Start + Duration via `calculateEndDate()`. A leaf task (no children) now accepts a direct End edit; Duration is back-solved from Start + End via `calculateWorkingDays()` -- already used for parent rollup, and an exact inverse of `calculateEndDate()` -- so Start/Duration/End stay internally consistent. A parent task's End is completely unaffected: still read-only, still driven purely by the rollup of its children's dates.
- No new propagation logic was needed for the cascade: `syncToGantt()` already runs a dependency-successor pass (down, to whatever depends on this task) and a parent-rollup pass (up, to whatever this task is a child of) on every sync -- the same two passes "Sync Dependencies" triggers manually. A direct End edit just feeds into that same pipeline like any other cell edit already does.
- The one real wrinkle: `syncToGantt()` unconditionally recomputes every leaf task's End from Start+Duration on every single sync, which would otherwise clobber a just-typed End immediately. Back-solving Duration from the typed End at edit time (in `onGridCellChange`, guarded by `!isSyncing` so the sync loop's own programmatic End writes -- already consistent by construction -- don't re-enter this) makes that recompute a no-op, since `calculateEndDate()`/`calculateWorkingDays()` are exact inverses: the round-trip reproduces the same End.
- **CSV import got the same gap, found while implementing this:** `importCSV()` always calls `syncToGantt(true)` (forced recompute), which was silently discarding any explicit End value a CSV actually carried, overwriting it from Start+Duration on every import -- even though End is a real exported column. A new `reconcileImportedEndDates()` runs once before that sync: a leaf row with both Start and End present gets Duration back-solved from them, same "End is authoritative" rule a direct grid edit gets. A parent row's own End (if a CSV somehow carries one) is still always ignored -- rollup wins there regardless, exactly as before.
- Gaining/losing children is handled entirely by existing mechanisms, not special-cased: a task that gains a child is excluded from the leaf loop and picked up by rollup on the very next sync (a hand-typed End is superseded immediately); a task that loses its last child re-enters the ordinary leaf computation, driven by whatever Start/Duration it was last left with.

### 🧪 Testing
- Added `tests/leaf-end-date.spec.js`: a direct End edit back-solves Duration correctly; an ordinary Duration edit still forward-computes End unaffected; a parent's End cell is read-only and a programmatic write to it is overwritten by the next rollup; a leaf's End cell is not read-only; a direct End edit cascades down to a dependent's Start and up to a parent's rollup, matching what Sync Dependencies would produce; a task gaining a child loses direct End-editability and picks up the rollup value; a task losing its last child regains it; CSV import honors an explicit leaf End (back-solving Duration) and still ignores a parent row's own End; no console errors across the whole scenario set.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/papaparse/frappe-gantt (this sandbox's outbound network blocks the live CDN hosts the app normally loads them from) -- including re-running the full existing suite (178 tests across all spec files) against the same vendored copies to confirm no regressions; one pre-existing, unrelated test flake (`row-id-backfill.spec.js`, a synchronous-onchange timing quirk in the vendored jexcel build) was confirmed to reproduce identically against the unmodified `index.html`, ruling it out as caused by this change.

## [2.23.1] - 2026-09-04

### 🐛 Fixed

#### A resource assigned to a not-yet-scheduled task silently vanished from the Workload dashboard
- The named-resources registry itself was already correct -- a name typed straight into a grid Resource cell was reaching `appDB.projects[...].resources` and the Resource Manager modal fine (verified with a real Playwright run against vendored jsuites/jexcel, simulating an actual click-and-type in the grid). The confusion was one level up: the Resource Workload Dashboard (`renderWorkloadTable()`) plots utilization across a date range, so it silently drops any task missing a Start date or Duration -- same exclusion parent/summary rows already got -- with no indication of *why* a just-assigned resource wasn't showing up there.
- `renderWorkloadTable()` now tracks resource names that are assigned only to such not-yet-scheduled tasks and surfaces them: the empty-state message names them directly when nothing else has a valid schedule yet, and a small note is appended below the table itself when some tasks do render (e.g. "Also assigned but not shown above (no Start date/Duration yet): Adam Beltz").

### 🧪 Testing
- Extended `tests/workload-dashboard.spec.js` with coverage for a resource assigned to a task with no Start/Duration: it's named in the empty state, and still called out below the table once another, fully-scheduled task gives the table something to render.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel (this sandbox's outbound network blocks the live CDN hosts the app normally loads them from), reproducing the exact reported scenario (a resource typed into the grid for a task with blank Start/Dur./End).

## [2.23.0] - 2026-09-03

### ✨ Added

#### Undo / Redo (backlog #11)
- New Undo/Redo toolbar buttons (Ctrl+Z / Ctrl+Y also work, intercepted ahead of jexcel's own document-level keydown handler so its per-cell history is bypassed entirely -- that per-cell history is exactly what the README's old "just use the browser's Ctrl+Z" advice was calling out as unreliable for a JS grid). Both are disabled/greyed whenever there's nothing to undo/redo.
- Undo/redo is whole-snapshot, not a per-cell diff or command log. A single cell edit here can cascade through dependency scheduling and parent rollup -- a changed Start/Duration recomputes End, which recomputes a parent's rolled-up Start/End/% Done, all the way up through grandparents -- so reverting just the one cell a user touched would leave every computed field downstream of it stale and inconsistent, exactly the failure mode this backlog item called out as the reason it needed real design before any code. Instead, undo/redo restores a full prior snapshot of the task data and feeds it back through the existing render+sync pipeline (`renderGrid` + `syncToGantt(true)`), so Outline numbers, computed dates, and parent rollups all come back correct together rather than needing their own separate revert logic.
- Deliberately scoped to the task data grid only -- it does not cover custom column add/rename/delete, the Resources registry, or collapse/label-filter UI state. Logged as a known limitation in `BACKLOG.md` rather than silently under-scoped.
- History is per-project and in-memory only (not persisted to localStorage or Dropbox), capped at 50 steps; switching projects can't cross-contaminate undo stacks, and a page reload clears history like most apps' undo does.
- Along the way, found and fixed a real correctness gap in two existing multi-cell operations that would otherwise have produced multiple undo steps for what should be one atomic action: Bulk Edit's per-row `setValueFromCoords` calls, and renaming a registered resource (which rewrites every task cell already assigned that name) each independently fire the grid's own per-cell change hook, which would otherwise call `triggerSync()` -- and therefore save/snapshot -- once per row instead of once for the whole operation. Both are now wrapped so only one sync/save (and therefore one undo step) fires per user action, matching how "Add row" already needed the same guard.

### 🧪 Testing
- Added `tests/undo-redo.spec.js`: buttons start disabled with no history; a cell edit enables Undo and reverts correctly; Redo re-applies; a Duration change's cascade onto a dependent task's Start is correctly restored on undo (not just the raw Duration cell); a child's % Done edit and the resulting parent rollup are both correctly reverted together; a multi-row Bulk Edit undoes as a single step; a new edit after Undo clears the Redo stack; Ctrl+Z/Ctrl+Y work inside the grid; Ctrl+Z while typing in the Bulk Edit modal's text field does *not* trigger grid-level undo (native text-field undo is left alone); undo/redo history is kept separate per project; no console errors across a full cycle.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (this sandbox's outbound network blocks the live CDN hosts the app normally loads them from) -- all 11 new tests passed for real, including the first run that caught the Bulk Edit multi-step bug above (fixed, then reverified green).

## [2.22.1] - 2026-09-03

### 🐛 Fixed

#### Grid-typed or Bulk-Edited Resource names weren't reaching the named-resources registry
- The named-resources registry (backlog #12) only picked up a new name via CSV import's merge step -- typing a not-yet-registered name directly into a grid Resource cell, or setting one via Bulk Edit, assigned it to the task fine but never added it to the Resource Manager or the cell's own quick-pick popover, so it wasn't available as a quick-pick option until a CSV round-trip.
- Fixed with `mergeResourceNamesFromValue()`, run from the grid's own cell-change handler for the Resource column (both a direct edit and Bulk Edit's per-row writes go through the same `onchange` hook), doing the same additive merge CSV import already did for a whole file, but for one cell's value.
- Also swapped the Resource cell's quick-pick toggle from a low-contrast bare "▾" glyph to a small filled circular badge, so it reads as a clickable control at a glance.

### 🧪 Testing
- Extended `tests/named-resources.spec.js` and `tests/bulk-edit.spec.js` with coverage for a name reaching the registry via direct typing and via Bulk Edit, respectively, not just CSV import.

## [2.22.0] - 2026-09-02

### ✨ Added

#### Toolbar: Export/Import grouped behind one "Export ▾" menu (backlog #17, first cut)
- Self-flagged toolbar review recommended collapsing the 4 always-visible export-format buttons (Import CSV, Export CSV, Export PNG, Export PDF) behind one menu as the lowest-risk, safest-first change. Implemented: a single "Export ▾" toolbar button (`#exportMenuBtn`) opens an anchored dropdown (`#exportMenuDropdown`) listing all four actions, using the exact same open/close popover pattern the label filter dropdown already established (`toggleLabelFilterDropdown`/its outside-click listener) rather than inventing a second mechanism.
- The four action elements keep their original `onclick="exportCSV()"`, `onclick="exportImage()"`, `onclick="exportPDF()"`, and `onchange="importCSV(event)"` handlers completely unchanged -- zero behavior change to the export/import functions themselves, pure UI restructuring as the backlog item called for. The menu auto-closes after any action fires via a separate delegated click listener on the dropdown container, so none of the four handlers needed editing.
- The other three recommendations from the same backlog item (a "View options ▾" menu for the 3 inline checkboxes, folding Fit columns/Sync Dependencies into a "More ▾" menu, and a visual-hierarchy pass on the remaining buttons) are intentionally not done here -- left for a future pass, per the item's own lowest-risk-first ordering.

### 🧪 Testing
- Added `tests/export-menu.spec.js`: the four export/import elements are no longer top-level toolbar buttons (present but hidden inside the closed dropdown); clicking "Export ▾" opens the menu showing all four actions; clicking it again or clicking outside closes it; choosing Export CSV downloads a file and closes the menu; no uncaught JS errors across the flow.
- Updated the existing tests that clicked these buttons directly (`csv-outline-indent`, `csv-roundtrip`, `labels`, `named-resources`, `pdf-export`) to first open the Export menu (`#exportMenuBtn`) before clicking the now-nested Export CSV/PDF buttons, since Playwright's actionability checks require the button visible, not just present.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse/html2canvas/jspdf (fetched from npm, served via `page.route()`), since this sandbox's outbound network blocks the live CDN hosts -- the full 171-test existing suite plus the 6 new export-menu tests all ran for real; 176/177 passed, with the one failure (`row-id-backfill.spec.js`, unrelated to this change) a known pre-existing gap under the vendored jexcel build already called out in earlier changelog entries.

## [2.21.0] - 2026-09-02

### ✨ Added

#### CSV export: visually indent Task Name by outline depth (backlog #16)
- `exportCSV()` now prefixes each exported Task Name with 4 spaces per level of Parent-chain depth, mirroring the grid's own indentation (`formatCells`' `paddingLeft`/border-left treatment) so a task's place in the outline is visible at a glance in the CSV without cross-referencing the Parent column by hand. Top-level tasks (depth 0) are unaffected.
- Purely cosmetic and export-only: hierarchy on import/re-import stays driven entirely by the Parent column, exactly as before. The depth walk itself (`computeTaskDepth`) is the same one `formatCells` already used for the grid's visual indent -- pulled out into one shared helper both call, rather than a second copy of the walk drifting from the first.
- Decided the one open design question the backlog item flagged: the indent is stripped back off Task Name on import (`sanitizeImportedCell`), regardless of source (manual Import, Dropbox restore, Dropbox project discovery), so an export -> re-import -> re-export cycle can't compound into double indentation. Depth is always recomputed fresh from Parent, so the leading-space prefix in a raw CSV is never meaningful data to preserve.

### 🧪 Testing
- Added `tests/csv-outline-indent.spec.js`: exported Task Name is indented 4/8 spaces at depth 1/2 and left alone at depth 0; re-importing an indented export strips the prefix back off; an export -> re-import -> re-export cycle produces the same single-level indent both times rather than compounding.
- Re-ran the existing `tests/csv-roundtrip.spec.js` and `tests/csv-sanitization.spec.js` to confirm the shared `computeTaskDepth()` refactor and the new import-side stripping don't change any existing round-trip or sanitization behavior.
- `BACKLOG.md`'s priority-ordered item #16 is marked done.

---

## [2.20.0] - 2026-09-02

### ✨ Added

#### Named resources -- a per-project registry with a quick-pick grid picker
- Backlog #12. Resources can now be named ahead of time via a new "Resources" toolbar button/modal (add, rename, delete), and picked from the grid's Resource column instead of always typed from scratch: every Resource cell gets a small ▾ icon that opens a checkbox popover of registered names, toggled on/off for that task.
- The Resource cell itself is deliberately left as the exact same free-text, comma/semicolon-delimited field it always was -- inline allocation annotations like `Alice (50%)` included. A real jexcel `dropdown` column (the type Depends/Parent already use) was considered and rejected: it would force every stored value to be one of its own source items, which would either break `parseAssignments()`'s existing allocation-suffix parsing (tested behavior) or require registering `"Alice (50%)"` itself as a distinct resource. The registry is purely additive on top of the untouched text field instead.
- CSV import/export decision (the specific thing backlog #12 asked to have resolved): the Resource column's CSV shape doesn't change at all -- the registry is new per-project metadata alongside `columns`/`collapsed`, not part of the task CSV. Importing a CSV whose Resource column mentions a name that isn't registered yet merges it into the registry rather than dropping it, so the picker stays complete without retyping every name after an import.
- Renaming a registered name in the modal also updates every task cell already assigned it, preserving any allocation suffix (`(50%)`, `:30%`, `@ 50%`, or a trailing ` 50%`) verbatim -- a rename doesn't silently orphan existing assignments. Deleting a name from the registry only affects future quick-pick suggestions; it never touches task data already carrying that name as free text.

### 🧪 Testing
- Added `tests/named-resources.spec.js`: the sample project (and any new project) seeds/starts a `resources` registry; the Resource column stays a plain `text` column type; every Resource cell gets a picker icon; the popover lists registered names pre-checked to match the cell's current content; checking/unchecking a name adds/removes just that name while preserving allocation annotations on the rest; picking into an empty cell; the popover closes on an outside click; the Manage Resources modal's add/rename/delete flows, including rename propagation and delete leaving grid data untouched; the exported CSV's headers and Resource column are unchanged in shape; importing a CSV merges an unregistered name into the registry; no console errors across the whole flow.
- Verified with a real Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (fetched from npm, served via `page.route()`), since this sandbox's outbound network blocks the live CDN hosts -- 14/14 new tests passed, plus the full existing 153-test suite re-run against the same vendored copies with no regressions (one pre-existing, unrelated failure in `row-id-backfill.spec.js` was confirmed to reproduce identically on the pre-change code, so it isn't something this change introduced).
- `BACKLOG.md` gained a new item (#16: visually indenting Task Name in CSV export by outline depth, purely cosmetic, at the user's request) with a high-level complexity estimate, and the current priority order was re-evaluated to place it ahead of Undo/redo and Mobile/PWA.

---

## [2.19.0] - 2026-09-01

### ✨ Added

#### Bulk edit -- apply one value to multiple selected rows at once
- Backlog #14. A new "Bulk Edit" toolbar button: click-and-drag to select 2 or more rows in the grid, click the button, pick a field (Resource, % Done, or Parent), enter one value, and it's applied to every row in the selection.
- Selection tracking works around a real jexcel quirk: the library's own global `mousedown` listener clears its internal `selectedCell` the moment a click lands outside any grid cell (e.g. on the toolbar button itself), so reading it at click time never works. Instead, a new `onselection` callback on the grid captures the live selection range into an app-level variable as it changes, and the toolbar button reads that instead.
- Respects the grid's existing read-only business rules (a parent row's computed % Done/Resource rollup, a dependency-driven Start date) by asking jexcel's own `isReadOnly()` per cell rather than reimplementing them a second time -- a read-only row in the selection is skipped and called out separately in the confirmation ("3 rows updated, 1 skipped, read-only").
- The Parent value picker reuses the exact same task-list source `syncToGantt()` already builds for the grid's own Parent/Depends dropdown columns.

### 🧪 Testing
- Added `tests/bulk-edit.spec.js`: no-selection and single-row-selection both show a helpful alert instead of opening the modal; a 2+ row selection shows the correct row count; bulk-setting Resource/% Done/Parent each apply correctly across the selection; % Done rejects an out-of-range value without closing the modal; a parent row's read-only % Done is skipped and reflected in the status message; untouched columns/rows are left intact; Cancel discards the pending value; the Gantt chart re-renders afterward with no console errors.
- Selection is simulated by calling jexcel's own `updateSelectionFromCoords()` -- the same internal call a real mouse drag ends up making -- rather than approximating it, so the tests exercise the real selection→`onselection` dispatch path.
- Verified with a real (not just syntax-checked) Playwright run against genuine vendored copies of jsuites/jexcel/frappe-gantt/papaparse (fetched from npm, served via `page.route()`), since this sandbox's outbound network blocks the live CDN hosts the app normally loads them from -- all 11 tests passed for real.

---

## [2.18.1] - 2026-09-01

### 🐛 Fixed

#### Dropbox listing calls silently dropped entries past the first page
- Backlog re-review turned up a concrete gap while looking at the still-open, reopened cross-device discovery bug: all four `dbx.filesListFolder()` call sites (backup pruning, the Versions modal, project discovery, importing a discovered project) only ever read the first page of results. Dropbox's `files/list_folder` truncates to its own per-page limit and signals more via `has_more`/`cursor` -- none of the four followed up with `files/list_folder/continue`, so a project/folder with enough entries to cross that limit silently lost everything past it.
- Fixed with a shared `listAllDropboxEntries()` helper that walks every page via `filesListFolderContinue()` before resolving; all four call sites now go through it.
- This closes the one concrete lead identified for the reopened discovery bug, but may not be the user's actual cause -- it only bites once an account has enough project folders to cross the page limit. The bug stays open pending the user retesting; the other live possibility (a different Dropbox account/session per browser) is still unconfirmed either way.
- `BACKLOG.md`'s Features section also gained an explicit current-priority ordering by effort/complexity for the remaining open items (Bulk edit < Resources-as-entity < Undo/redo < Mobile/PWA), correcting the fact that Undo/redo -- self-flagged as highest risk -- had been sequenced ahead of lower-complexity items purely by creation order. Existing item numbers are left untouched (several entries cross-reference each other by number) -- this is a separate ordering note, not a renumbering.

### 🧪 Testing
- Added `tests/dropbox-pagination.spec.js`: `listAllDropboxEntries()` walking multiple pages, resolving correctly when there's only one page, a rejected continuation still propagating as a rejection (errors aren't swallowed), and `discoverDropboxProjects()` end-to-end finding a candidate project deliberately placed on the second page of a fake paginated client -- none of this needs a real Dropbox account, since `dbx` is a plain top-level variable in the page's own script that these tests substitute directly.
- Verified the pagination/accumulation logic (multi-page, single-page, and error-propagation cases) against a mock client in Node before wiring it into the app.

---

## [2.18.0] - 2026-09-01

### ✨ Added

#### Label filter is now a checkbox multi-select
- The toolbar's label filter was a single `<select>` (one label at a time). It's now a button that opens a checkbox dropdown -- check one or more labels to narrow the grid to tasks carrying **any** of them (OR, not AND: checking both "System A" and "System B" shows everything tagged either one, not just tasks tagged both).
- The button itself reflects the current selection: "All Labels" when nothing's checked, the label's name when exactly one is, "N labels" otherwise.
- Same underlying semantics as before otherwise: purely a display concern (never touches task data), composes with Collapse via AND, keeps a match's ancestor chain visible, resets on project switch, and "Label in chart" (still off by default) applies the same OR-across-checked-labels filter to the Gantt chart.
- Closing behavior matches a typical dropdown: click the button to toggle it, click anywhere else to close it -- this app's other overlays are full-screen modals closed via an explicit Close button or backdrop click, but that's too heavy for a filter meant to be poked at frequently alongside the search box, so this one is a lightweight anchored popover instead.

#### Resource and Labels now accept `,` or `;` interchangeably
- Filed as a UX gap after a user typed comma-separated values into a Labels cell (expecting Resource's convention) and got one combined label instead of two, since Labels previously only split on `;`. Rather than just documenting the difference, both columns now accept either delimiter -- even mixed in the same cell (`Alice, Bob; Charlie`) -- via a new shared `splitMultiValueCell()` helper.
- `Depends` deliberately keeps `;` only: its cycle detection and every existing test assume that single delimiter, and a Task ID can't contain a comma to begin with, so there's no real ambiguity to unify there.

### 🧪 Testing
- Rewrote `tests/labels.spec.js` for the checkbox multi-select: dropdown open/close (including click-outside-to-close), checking/unchecking one or many labels, OR-not-AND semantics, the button's text updating, comma as an alternate label separator, and everything the previous single-select version covered (ancestor visibility, Collapse composition, "Label in chart", CSV round-trip, project-switch reset, no console errors).
- Extended `tests/workload-dashboard.spec.js` with semicolon-separated and mixed comma/semicolon Resource cells, alongside the existing comma-only case.

---

## [2.17.0] - 2026-08-29

### ✨ Added

#### Label functionality on a row (backlog #13, Msft Planner style)
- New "Labels" grid column, right after Parent: free-text, semicolon-separated so a row can carry many labels, one, or none (e.g. `System A;Urgent`) -- same multi-value storage convention the Depends column already uses, rather than a separate managed/colored label entity (that level of formality is exactly what backlog #12 flags as still-unresolved complexity for Resources, so Labels deliberately follows Resource's simpler freeform pattern instead).
- New toolbar "Label" filter dropdown, auto-populated from every distinct label typed anywhere in the active project. Selecting one narrows the grid to matching rows (keeping a match's ancestor chain visible, same outline-context behavior as grid search), composes with Collapse and search via AND, and resets on project switch/create/delete.
- New "Label in chart" toggle (off by default) lets that same filter also narrow the Gantt chart to just the selected label -- opt-in, so the chart keeps showing the whole plan unless someone deliberately isolates one label there.
- The free-text grid search already matched every column, so it picks up Labels automatically with no changes needed there.
- CSV export/import round-trips the Labels column like any other. Importing a CSV exported before this version (no Labels header) inserts a blank Labels column on the way in so older custom columns (e.g. JIRA, Notes) still land in the right place instead of merging into Labels.

### 🧪 Testing
- Added `tests/labels.spec.js`: the Labels column's position and multi-value storage, the filter dropdown's population, grid filtering (including ancestor-visibility and composing with Collapse), the chart toggle's opt-in behavior, project-switch reset, and CSV round-trip.
- Updated `tests/csv-roundtrip.spec.js`, `tests/csv-sanitization.spec.js`, `tests/flag-in-progress.spec.js`, `tests/grid-search.spec.js`, `tests/late-flag.spec.js`, and `tests/notes-field.spec.js` for the new column position.
- Verified against the real jexcel/jsuites/frappe-gantt/papaparse sources (fetched from npm, routed in via `page.route()` in a throwaway harness) since the sandbox couldn't reach the live CDN hosts -- including the legacy-CSV migration path with a pre-existing custom column.

---

## [2.16.0] - 2026-08-26

### ✨ Added

#### Grid Search/Filter now matches any column, not just Task Name/Resource
- Requested by name in the backlog, with % Done as the motivating example (finding every fully-done task at a glance). The search box now checks every column's value on a row -- core columns (% Done, Start, End, Dur., Depends, Parent, Outline, Task ID) and any custom columns alike -- instead of only Task Name and Resource.
- Same matching semantics as before (case-insensitive substring, composes with Collapse via AND, keeps a match's ancestor chain visible for outline context) -- this only widens *what* gets checked per row, not how matching or visibility works.
- Toolbar placeholder updated from "Search name or resource..." to "Search any column..." to reflect the new scope.

### 🧪 Testing
- Extended `tests/grid-search.spec.js` with matching by % Done, by a Start date fragment, and by a value in a custom column.

---

## [2.15.4] - 2026-08-26

### 🐛 Fixed

#### PDF (and PNG) export only ever captured a small top-left box, rest blank (real bug report, screenshot)
- The v2.15.0 fix for chart export clipping (widening the html2canvas capture via `width`/`windowWidth`) didn't actually work -- verified directly: both `.chart-panel` and frappe-gantt's nested `.gantt-container` have `overflow: auto` in their live CSS, and that CSS survives into html2canvas's *cloned* document. No matter how large a `width`/`height`/`windowWidth`/`windowHeight` you ask html2canvas for, the cloned elements still visually clip to their own on-screen scrolled box -- so the capture only ever contained whatever already fit in the visible browser viewport, with everything past that rendering blank. That's exactly the reported symptom: content squeezed into a small box, the rest of the page empty.
- Confirmed against the real html2canvas 1.4.1 source (fetched from npm) and reproduced in an isolated headless-browser harness before touching production code: a synthetic DOM shaped like the real app (nested `overflow: auto` containers, content wider and taller than the visible viewport) showed the previously-shipped fix only capturing ~1/3 of the content in each dimension, blank everywhere else.
- Fixed by neutralizing the overflow on the cloned `.chart-panel` and `.gantt-container` via html2canvas's `onclone` callback, pinning them to their true full-content width/height instead of leaving their original CSS overflow rule intact. Re-verified the same harness against the fixed function: full content now captured in both dimensions.
- Affects `captureChartCanvas()`, shared by both `exportImage()` (PNG) and `exportPDF()`.

---

## [2.15.3] - 2026-08-26

### 🐛 Fixed

#### Cross-device Dropbox project discovery now actually runs on login
- Backlog bug: automatic discovery of Dropbox-backed projects from other browsers/devices ("Check Dropbox for other projects not in this browser") was only ever wired to fire once, immediately after the initial OAuth authorize redirect (`isFreshDropboxLogin`). On every later visit -- the case that actually matters, since the Dropbox token persists in `localStorage` across sessions -- the automatic check never ran, silently defeating the "Auto-import found projects" behavior described in the README's Dropbox comparison table. You had to remember to click "Check Dropbox for other projects" manually every time.
- `discoverDropboxProjects(false)` now runs on every page load where a Dropbox token is already present, not just the one-time OAuth callback. It stays silent when nothing new is found (unchanged), and only surfaces the import modal when a project exists in Dropbox that isn't yet local.

---

## [2.15.2] - 2026-08-26

### 🧪 Testing

#### Faster test runs, no functional changes
- `playwright.config.js`: explicit `workers: '100%'` -- every spec file navigates to its own fresh page and localStorage, so there's no shared state for parallel workers to contend over, and the previous default left cores idle.
- Every spec file's post-load "let the initial syncToGantt() pass settle" wait dropped from a flat 500ms to 150ms. Traced through the actual library internals to confirm this is safe: jexcel 4.6.1's row/cell construction (`updateTable()`, which calls this app's own `formatCells`) runs synchronously inside the same constructor call that creates the `.jexcel` element Playwright waits on, and frappe-gantt 0.6.1's bar/label creation is also synchronous -- the only deferred work found was a single `requestAnimationFrame` frappe-gantt uses to reposition (not create) a bar's label text, which no test asserts on. 150ms keeps a real cushion for that repaint without paying for 350ms of pure idle time on every single test.
- One `waitForTimeout(500)` was deliberately left alone (`csv-sanitization.spec.js`, after a file-input CSV import): that one is masking a real async operation (PapaParse's `FileReader`-based parse), not a page-load settle, so it wasn't touched.
- No test assertions changed -- this is exclusively about how long each test waits before asserting, verified by re-running the affected spec files.

---

## [2.15.1] - 2026-08-26

### 🐛 Fixed

#### A pasted-over row could permanently lose its Task ID and Outline (real bug report)
- Reported behavior: right-click "Insert row", then paste a block of data into the new row and edit it further -- the Task ID and Outline (WBS) columns never populate, even after leaving the record.
- Root cause: `oninsertrow` auto-assigns a Task ID exactly once, right after the row is created. If a paste then overwrites that cell with a blank value (paste, like the auto-assignment itself, writes through the ID column's `readOnly` flag), nothing ever re-assigned it afterward -- and the WBS/outline numbering pass in `syncToGantt()` skips any row with a blank Task ID entirely, by design (it can't place an unidentified row in the hierarchy). The row was permanently stuck with no ID and no Outline, no matter how many further edits triggered a sync.
- Fixed by having `syncToGantt()` backfill a blank Task ID on every sync, not just at insert time -- assigned the same way (next available integer), before the WBS pass runs, so the very next edit to an affected row (or an explicit "↻ Sync Dependencies") recovers it instead of requiring the row to be deleted and re-created.

### 🧪 Testing
- Added `tests/row-id-backfill.spec.js`: the existing insert-row auto-assignment still works, a blanked-out Task ID/Outline gets backfilled on the next sync, backfilled IDs stay unique when multiple rows are blanked at once, and no uncaught errors during backfill.

---

## [2.15.0] - 2026-08-26

### ✨ Added

#### Paginated PDF Export
- A new "Export PDF" toolbar button, next to Export PNG. Reuses the same html2canvas rasterization the PNG export already does (the PDF matches the PNG pixel-for-pixel), then tiles that canvas across as many landscape PDF pages as the timeline needs -- a Gantt chart is wide, not tall, so pagination goes left to right, each page a full-height vertical slice, rather than shrinking a long project onto one illegibly small page.
- Adds `jsPDF 2.5.2` as a new pinned CDN dependency (exact version, SRI hash computed from the real npm-published bytes, same discipline as every other library here except the one flagged tech-debt item). Checked first whether this could be done with zero new dependencies via browser print CSS; went with jsPDF because it builds directly on the html2canvas rendering this app already trusts and ships, giving precise one-click pagination instead of a manual "Save as PDF" step with less control over page breaks.

### 🐛 Fixed

#### PNG/PDF export only ever captured the visible viewport, not the full timeline (real pre-existing bug, found while building PDF pagination)
- `.chart-panel`'s own `scrollWidth` never exceeds its `clientWidth` -- the actual horizontal scrolling happens on frappe-gantt's own internal `.gantt-container` element nested inside it. `html2canvas` only rasterizes an element's own box by default, so exporting the chart only ever captured whatever horizontal slice happened to be scrolled into view at the moment of export, silently dropping the rest of a long project's timeline. This has been true of PNG export since it was added; it would have made PDF pagination pointless (a "paginated" export that only ever produces however many pages cover the current scroll position).
- Fixed with a shared `captureChartCanvas()` helper that explicitly sizes the `html2canvas` capture to the wider of `.chart-panel` and `.gantt-container`'s `scrollWidth` (via html2canvas's `width`/`windowWidth` options, which make it lay out and render the full off-screen content instead of clipping to the visible viewport). Both `exportImage()` (PNG) and `exportPDF()` now use it.

### 🧪 Testing
- Added `tests/pdf-export.spec.js`: a valid non-empty PDF is downloaded, the filename matches the project name, a normal-sized chart's page count matches the tiling formula (derived from the actual rendered canvas via a spy on `html2canvas`, not hand-computed independently), a wide timeline (a 400-day task at Day zoom) genuinely paginates across multiple pages -- which also exercises the capture-width fix above -- an empty project doesn't crash, and no uncaught errors.
- Full suite: 16 spec files, 110 tests, all pass.

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
