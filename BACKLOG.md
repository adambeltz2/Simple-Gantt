# Backlog

Planned features and known follow-ups, evaluated one at a time before being built.

## Features
- Add a Notes fields that is in Markdown and can add a large block of text. It would only be visible in the UI if someone clicks into it (indicated by a flag) but when we export/import to CSV it would be available.

## Tech debt / follow-ups from the repo review

- **Pin `jsuites.js`/`jexcel.js` to an explicit version.** Currently loaded unpinned from `https://jsuites.net/v4/jsuites.js` and `https://bossanova.uk/jspreadsheet/v4/jexcel.js` (no version in the URL, no SRI). Blocked on confirming which patch build is actually live right now before picking a version to pin -- see the `TODO(security)` comment in `index.html`.
- **Expand automated test coverage beyond the collapse/expand, in-progress-flag, dependency-scheduling, csv-sanitization, inclusive-end-dates, late-flag, and timezone-safety suites**. No coverage yet for CSV import/export round-tripping or the workload dashboard.
