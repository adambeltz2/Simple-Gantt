# Backlog

Planned features and known follow-ups, evaluated one at a time before being built.

## Features

- Add critical path highlighting: visually mark the chain of dependent tasks that determines the project's overall end date (in both the grid and the Gantt chart).
- Add grid search/filter: quickly jump to or filter rows by task name/resource, useful once a project gets past ~50 rows.

## Tech debt / follow-ups from the repo review

- **Pin `jsuites.js`/`jexcel.js` to an explicit version.** Currently loaded unpinned from `https://jsuites.net/v4/jsuites.js` and `https://bossanova.uk/jspreadsheet/v4/jexcel.js` (no version in the URL, no SRI). Still blocked on confirming which patch build is actually live right now -- see the `TODO(security)` comment in `index.html`. This is the only item left in the backlog; needs your help to unblock (see below).
