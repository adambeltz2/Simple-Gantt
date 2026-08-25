# Backlog

Planned features and known follow-ups, evaluated one at a time before being built.

## Bug
- [ ] Upon login its to check for projects that aren't successfully imported which could occur if you were working in another browser or on another device. This is not currently working.

## Features

Ordered lowest to highest risk/complexity -- roughly, how contained the change is to a single isolated piece vs. how much it touches the core scheduling engine (date math, parent rollup, dependency resolution) or needs new persisted state.

1. ~~Grid search/filter~~ -- **done in v2.11.0.** (Turned out jexcel's own built-in `search()` wasn't safe to build on -- it manages row visibility by detaching `<tr>` elements from the DOM, which would have fought with Collapse's `hideRow`/`showRow` mechanism. Built as an extension of the existing `applyRowVisibility()` instead.)
2. **Resource color-coding** in the Gantt bars, complementing the Workload dashboard. Isolated visual/CSS change; doesn't touch scheduling logic. Main design question is which color wins for a multi-resource task.
3. **Explicit dependency cycle detection** -- the app currently only guards against a task depending on/parenting itself directly. A longer cycle (A depends on B depends on A) isn't detected or warned about; it would just silently hit the existing 100-iteration convergence safety valve in `syncToGantt` with no explanation. A contained graph-traversal check, additive (a warning, not a new constraint).
4. **Task duplication/templates** -- clone a task (and optionally its child subtree) as a starting point, given how repetitive rows like large LOV/attribute lists already are. Needs careful ID/WBS renumbering and Parent/Depends reference remapping for the cloned subtree, but doesn't touch the core date-math engine.
5. **Critical path highlighting** -- visually mark the chain of dependent tasks that determines the project's overall end date, in both the grid and the Gantt chart. Needs a real graph algorithm (find the zero-slack path through the Depends graph) built on data `syncToGantt` already computes, plus new rendering in two places.
6. **Bulk edit / multi-row select** -- select multiple rows and apply a Resource/%Done/Parent change to all of them at once. Needs figuring out jexcel's selection-range API and a clear UX; may partially already be possible via existing copy/paste-down-a-column behavior, worth checking before building new UI.
7. **PDF export** -- a proper paginated print/PDF view of the Gantt chart (currently only PNG export exists). Real design decision up front: a new CDN dependency (e.g. jsPDF) vs. a print-stylesheet-only approach with zero new dependencies. Either way, paginating a wide scrolling timeline cleanly is a genuinely gnarly layout problem.
8. **Baseline / plan-vs-actual tracking** -- snapshot dates when a plan is finalized, then show variance when things drift (ghost bars in the chart, variance indicators in the grid). Needs a new persisted data model (baseline snapshots, separate from live task data) and non-trivial additions to the Gantt rendering pipeline.
9. **Undo/redo** -- there's no in-app undo today (the README just points at the browser's Ctrl+Z, which isn't reliable for a JS grid). Highest risk: it's not just about reverting a raw cell edit -- every edit can cascade through dependency scheduling and parent rollup, so a naive undo could easily leave the sheet in an inconsistent state (a reverted Start/Dur with stale computed End/rollup values). Needs real design thought before any code, not just a wrapper around jexcel's own internal history.

## Tech debt / follow-ups from the repo review

- **Pin `jsuites.js`/`jexcel.js` to an explicit version.** Currently loaded unpinned from `https://jsuites.net/v4/jsuites.js` and `https://bossanova.uk/jspreadsheet/v4/jexcel.js` (no version in the URL, no SRI). Still blocked on confirming which patch build is actually live right now -- see the `TODO(security)` comment in `index.html`. This is the only item left in the backlog; needs your help to unblock (see below).
