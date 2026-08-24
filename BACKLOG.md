# Backlog

Planned features and known follow-ups, evaluated one at a time before being built.

## Features

_(nothing queued yet -- add ideas here as they come up)_

## Tech debt / follow-ups from the repo review

- **Pin `jsuites.js`/`jexcel.js` to an explicit version.** Currently loaded unpinned from `https://jsuites.net/v4/jsuites.js` and `https://bossanova.uk/jspreadsheet/v4/jexcel.js` (no version in the URL, no SRI). Blocked on confirming which patch build is actually live right now before picking a version to pin -- see the `TODO(security)` comment in `index.html`.
- **CSV import only sanitizes the Start/End columns.** Task Name and Resource pass through raw from imported (or Dropbox-discovered) CSVs. Currently safe because every render site escapes those values, but a shared/malicious CSV is one missed escape away from stored XSS. Worth closing so it's not relying solely on render-site discipline.
- **Expand automated test coverage beyond the collapse/expand, in-progress-flag, and dependency-scheduling suites** (`tests/collapse-expand.spec.js`, `tests/flag-in-progress.spec.js`, `tests/dependency-scheduling.spec.js`). No coverage yet for CSV import/export round-tripping or the workload dashboard.
