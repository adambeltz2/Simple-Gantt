# Backlog

Planned features and known follow-ups, evaluated one at a time before being built.

## Features

_(nothing queued yet -- add ideas here as they come up)_

## Tech debt / follow-ups from the repo review

- **Pin `jsuites.js`/`jexcel.js` to an explicit version.** Currently loaded unpinned from `https://jsuites.net/v4/jsuites.js` and `https://bossanova.uk/jspreadsheet/v4/jexcel.js` (no version in the URL, no SRI). Blocked on confirming which patch build is actually live right now before picking a version to pin -- see the `TODO(security)` comment in `index.html`.
- **Expand automated test coverage beyond the collapse/expand, in-progress-flag, dependency-scheduling, csv-sanitization, inclusive-end-dates, late-flag, timezone-safety, and notes-field suites**. No coverage yet for CSV import/export round-tripping or the workload dashboard.
