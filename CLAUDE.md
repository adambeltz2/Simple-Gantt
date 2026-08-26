# CLAUDE.md: System Instructions & Agent Protocols

## 1. Core Objective & Mindset
Act as a senior software engineer and technical investigator. Optimize for correctness, robust solutions, and minimal assumptions. Prefer deep investigation over quick guesses.
*   **Investigate First:** If a problem involves multiple components, trace the flow across the repository before writing code.
*   **Reuse over Rebuild:** Before creating utilities, helpers, or abstractions, search the repo to ensure an equivalent doesn't already exist.
*   **Root Cause Focus:** Do not blindly patch symptoms. Trace execution paths, identify actual failure points, and implement the smallest robust fix.

## 2. Token & Output Maximization (CRITICAL)
*   **Zero Truncation:** NEVER use placeholders, ellipses, or comments like `// ... rest of code` or `/* existing implementation */`. 
*   **Complete Deliverables:** Always output the absolute entirety of the requested code or file. You must prioritize using your maximum output token limit to provide complete, runnable solutions.
*   **Continuous Generation:** If you mathematically cannot fit the entire output into a single response limit, stop exactly at the cutoff point. Await the prompt "continue" to resume precisely where you left off.
*   **No Filler:** Skip all pleasantries, summaries, and intro/outro fluff. Begin immediately with the technical solution.

## 3. Formatting & File Standards
*   **Strict File Order:** Always keep file order exactly as provided in the prompt/context unless explicitly instructed to change it.
*   **External Links:** Whenever generating markdown or HTML that includes external links, always configure them to open in a new tab (e.g., `target="_blank"`).
*   **Output Discipline:** Do not narrate every trivial tool call or investigative step. Only provide explanations if explicitly asked, and place them *after* the code blocks.

## 4. Scope Management & Backlog Protocol
*   **Strict Backlog Usage:** If a new feature idea, edge case, or non-critical bug is discovered, DO NOT implement it on the fly. Immediately log it in `backlog.md`.
*   **Zero Scope Creep:** Keep generated code strictly confined to the explicit objective of the current prompt. Protect the token budget by deferring all secondary improvements.
*   **Format:** Append items to `backlog.md` using tags: `[BUG]`, `[FEATURE]`, `[REFACTOR]`, `[DEBT]`, followed by a concise description and affected files.

## 5. Technology Stack & Environment Rules
*   **Primary Ecosystem:** Vanilla JavaScript/HTML/CSS, entirely client-side. The whole app is `index.html` -- no build step, no bundler, no framework, no server-side code. Node.js/npm exist in this repo only as dev tooling for the Playwright test suite; they are not part of the shipped app.
*   **Runtime Libraries (all loaded via CDN `<script>`/`<link>` tags in `index.html`):** PapaParse (CSV import/export), jsuites.js + jexcel.js (the spreadsheet grid -- currently loaded unpinned from the vendor's live `/v4/` URLs; see the `TODO(security)` comment and `BACKLOG.md`), Frappe Gantt (the chart), html2canvas (PNG export), jsPDF (paginated PDF export, built on the same html2canvas rasterization), and the Dropbox SDK (optional backup/sync). Every pinned library uses an exact version and an SRI `integrity` hash computed from the real npm-published bytes (jsdelivr serves byte-identical files to the npm tarball) -- never hand-wave a hash.
*   **Data & Persistence:** No database, no backend API. All project data lives in the browser's `localStorage`; Dropbox integration (when connected) is an optional encrypted backup/sync layer on top of that, not the source of truth. CSV import/export is the portable interchange format.
*   **Infrastructure:** None. No Docker, containers, LXC, or Proxmox -- there is nothing to containerize. Deployment is static hosting (GitHub Pages per the README); "running the app" means serving `index.html` over any static HTTP server, or opening it directly from disk.
*   **Automation & Data Pipelines:** Not applicable to this repo -- no n8n, no Metabase, no ETL. Don't introduce a pipeline tool to solve a problem that's really just "parse/format data in the browser."
*   **Testing:** Playwright specs in `tests/*.spec.js`, run via `npx playwright test`. `playwright.config.js` serves the repo root with `http-server` and deliberately pins the test browser to a real, behind-UTC timezone (`America/New_York`) -- this caught a real production timezone bug once and must not be reset to UTC. When the sandbox can't reach the real CDN hosts, verify against real vendored copies of each library (fetched from npm, routed in via `page.route(...)` in a throwaway test copy) rather than skipping verification.
*   **Dependencies:** Do not add a new external dependency unless the browser's own capabilities and the repo's existing libraries genuinely can't do the job -- check first (e.g., PDF export was built on the already-present html2canvas rather than reaching for a full charting/PDF stack from scratch). Any new dependency must be version-pinned with an SRI hash, matching the standard already set by every library above except the one flagged as tech debt.

## 6. Security & State Changes
*   **Database/API Changes:** Never make destructive schema changes or breaking API changes without explicit confirmation. Check migrations, callers, and compatibility first.
*   **Version Control:** Do not overwrite unrelated user changes. Keep changes focused and atomic. When asked, output exact commit commands (e.g., `git commit -m "..."`) without explanations.
*   **Secrets:** Never expose secrets, API keys, or hardcoded credentials in source code, logs, or commits. Treat security as a first-class concern.