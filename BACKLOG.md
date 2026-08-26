# Backlog

Planned features and known follow-ups, evaluated one at a time before being built.

## Bug
- [ ] Upon login its to check for projects that aren't successfully imported which could occur if you were working in another browser or on another device. This is not currently working. 

## Features

Ordered lowest to highest risk/complexity -- roughly, how contained the change is to a single isolated piece vs. how much it touches the core scheduling engine (date math, parent rollup, dependency resolution) or needs new persisted state.

1. ~~Grid search/filter~~ -- **done in v2.11.0.** (Turned out jexcel's own built-in `search()` wasn't safe to build on -- it manages row visibility by detaching `<tr>` elements from the DOM, which would have fought with Collapse's `hideRow`/`showRow` mechanism. Built as an extension of the existing `applyRowVisibility()` instead.)
2. ~~Resource color-coding~~ -- **done in v2.12.0.** (Deterministic alphabetical name-to-color mapping; a 4px stripe on the bar's left edge, layered on top of the status fill so it stays visible at any progress %; first-listed resource wins on multi-resource tasks; matching section added to the chart legend.)
3. ~~Explicit dependency cycle detection~~ -- **done in v2.13.0.** (Three-color DFS over the Depends graph, run once per sync; a detected cycle gets a red outline + tooltip on every Task ID involved plus a one-time status warning, never a mutation of the Depends column. Also fixed a real pre-existing bug found along the way: `syncToGantt`'s status warnings, including the existing self-reference one, were being silently overwritten by "✓ Saved" before ever reaching the screen.)
4. ~~Task duplication/templates~~ -- **declined.** Not wanted; left here only as a record that it was considered.
5. ~~Critical path highlighting~~ -- **done in v2.14.0.** (Opt-in toolbar toggle, off by default; a real CPM forward/backward pass over the Depends graph, expressed with the same working-day-aware date arithmetic the live scheduler already uses. ⚡ icon in the grid, outlined bar in the chart, legend entry. Suppressed while a dependency cycle exists.)
6. Ability to Right Click and flag a task as "IN PROGRESS" which highlights the whole row for visual que. Does not change anything else. Right Click on the row will allow it to toggle off and on.
7. **PDF export** -- a proper paginated print/PDF view of the Gantt chart (currently only PNG export exists). Real design decision up front: a new CDN dependency (e.g. jsPDF) vs. a print-stylesheet-only approach with zero new dependencies. Either way, paginating a wide scrolling timeline cleanly is a genuinely gnarly layout problem.
8. **Baseline / plan-vs-actual tracking** -- snapshot dates when a plan is finalized, then show variance when things drift (ghost bars in the chart, variance indicators in the grid). Needs a new persisted data model (baseline snapshots, separate from live task data) and non-trivial additions to the Gantt rendering pipeline.
9. **Undo/redo** -- there's no in-app undo today (the README just points at the browser's Ctrl+Z, which isn't reliable for a JS grid). Highest risk: it's not just about reverting a raw cell edit -- every edit can cascade through dependency scheduling and parent rollup, so a naive undo could easily leave the sheet in an inconsistent state (a reverted Start/Dur with stale computed End/rollup values). Needs real design thought before any code, not just a wrapper around jexcel's own internal history.
10. Treat Resources as first class entity. I'd like them to be assigned (named) prior to being typed in the grid. This should allow a pre-selected value for me to use. Discuss how to handle this when its done via CSV Import/Export.
11. Add Label functionality to a line. This is similar to Msft Planner in which a label is defined and applied to a row. a row can have many labels or none. It should enable filtering so we can see where values exist. It should also show in the grid primiarily but could also apply to the visual as a secondary option (example, show things labeled as "System A") so we can track them on their own while retaining 1 greater plan.
12. 11. **Bulk edit / multi-row select** -- select multiple rows and apply a Resource/%Done/Parent change to all of them at once. Needs figuring out jexcel's selection-range API and a clear UX; may partially already be possible via existing copy/paste-down-a-column behavior, worth checking before building new UI.

## Tech debt / follow-ups from the repo review

- **Pin `jsuites.js`/`jexcel.js` to an explicit version.** Currently loaded unpinned from `https://jsuites.net/v4/jsuites.js` and `https://bossanova.uk/jspreadsheet/v4/jexcel.js` (no version in the URL, no SRI). Still blocked on confirming which patch build is actually live right now -- see the `TODO(security)` comment in `index.html`. This is the only item left in the backlog; needs your help to unblock (see below).
