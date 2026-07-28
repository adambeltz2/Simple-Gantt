# Simple Gantt

**Live Demo:** [https://adambeltz2.github.io/Simple-Gantt/](https://adambeltz2.github.io/Simple-Gantt/)

A lightweight, purely browser-based Gantt chart and project management tool built with HTML, JavaScript, and CSS. No database deployment or server infrastructure required—everything saves locally to your browser or syncs effortlessly with Dropbox.

## Features

* **Interactive Dual-Pane View**: Work with a dynamic spreadsheet grid on the left while rendering a drag-and-drop Frappe Gantt chart on the right.
* **Auto-Scheduling & Dependencies**: Link tasks together. The core engine calculates Working Days, skips weekends (if toggled), and cascades dates instantly down the chain.
* **WBS Auto-Outlining**: Assign parent/child tasks to automatically roll up durations and progress, calculating Work Breakdown Structure (WBS) numbers dynamically.
* **Resource Workload Dashboard**: 
  * Split capacity logic (e.g., `Alice 50%, Bob 25%`).
  * Check for overallocation with Daily, Weekly, and Monthly resolutions.
  * View total load by Percentage (%) or absolute Hours.
* **Custom Tracking Columns**: Right-click to dynamically add, rename, and delete your own columns (Notes, Statuses, Tags) right inside the table without breaking the math engine.
* **Data Portability**: Import, export, and sync to CSVs seamlessly, and export clean, high-resolution PNGs of your charts for reporting.

## Setup & Installation

You don't need `npm`, `node`, or a database to run Simple Gantt.

1. Clone or download this repository.
2. Double-click the `index.html` file to open it in any modern web browser.
3. Start managing your projects immediately!

## Support 

If you found this helpful, consider checking out the source code or buying me a coffee!

<a href="https://github.com/adambeltz2/Simple-Gantt" target="_blank">View on GitHub</a> | <a href="https://buymeacoffee.com/adambeltz" target="_blank">Buy me a coffee</a>
