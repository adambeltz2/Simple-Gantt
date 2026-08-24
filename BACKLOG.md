# Backlog

Planned features and known follow-ups, evaluated one at a time before being built.

## Features
- Add a Notes fields that is in Markdown and can add a large block of text. It would only be visible in the UI if someone clicks into it (indicated by a flag) but when we export/import to CSV it would be available.

_(nothing queued yet -- add ideas here as they come up)_

## Tech debt / follow-ups from the repo review

- **Pin `jsuites.js`/`jexcel.js` to an explicit version.** Currently loaded unpinned from `https://jsuites.net/v4/jsuites.js` and `https://bossanova.uk/jspreadsheet/v4/jexcel.js` (no version in the URL, no SRI). Blocked on confirming which patch build is actually live right now before picking a version to pin -- see the `TODO(security)` comment in `index.html`.
- **CSV import only sanitizes the Start/End columns.** Task Name and Resource pass through raw from imported (or Dropbox-discovered) CSVs. Currently safe because every render site escapes those values, but a shared/malicious CSV is one missed escape away from stored XSS. Worth closing so it's not relying solely on render-site discipline.
- **`recalculateDatesUpstream` (the "Sync Dependencies" button) isn't wired into CSV import, CSV export, or Dropbox backup**, despite the CHANGELOG/README historically describing it as automatic on all three. Either wire it in (using the same parent-rollup logic `syncToGantt` already runs live) or make the docs match reality -- currently it's manual-only.
- **Expand automated test coverage beyond the new collapse/expand suite** (`tests/collapse-expand.spec.js`). No coverage yet for CSV import/export round-tripping, the dependency date-chaining logic, or the workload dashboard.
- **Add Feature for "In Progress"** If this box is ticked it turns the UI into a purple color so we can manually track visually but has no impact on the csv file itself
