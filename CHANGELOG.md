# Changelog

Notable changes to the FERPA Guardrail plugin. Versions refer to the `version` field in `.claude-plugin/plugin.json`.

## 1.2.1 (2026-06-10)

### Fixed
- The Student ID pattern matched `auid` but not `au_id`, so a column named "AU ID" (the display-style header MicroStrategy exports use) was not flagged. Validated against the headers of three real Coordinated Care exports: the scanner now catches all four PII columns in each (AU ID, preferred email, first name, last name) and none of the analytic columns. Found by checking the patterns against real export headers before working with the data, which is the recommended practice for any new report source.

## 1.2.0 (2026-06-10)

### Added
- Advisory coverage for shell commands. The file-read hook never sees files opened through Bash or PowerShell (pandas, Get-Content, and similar), which was the one unguarded path for student data to enter a conversation. When a shell command references a data file, the guardrail now reminds Claude, in context, not to print identifiable rows and to work with column names, counts, and aggregates instead. The reminder does not block the command, so local scripts that process student data without printing it keep working.
- Advisory events are recorded in the audit log alongside scan decisions.

## 1.1.2 (2026-06-10)

### Fixed
- The plugin failed to load on current Claude Code versions. Claude Code loads `hooks/hooks.json` automatically, and the manifest's explicit reference to the same file tripped a duplicate-hooks check that rejected the whole plugin. The redundant manifest field is removed. A plugin that fails to load provides no protection, so anyone on 1.1.1 should update.

## 1.1.1 (2026-06-10)

### Fixed
- Cleanup scripts for two files that shared a name but not an extension (data.csv and data.xlsx) were written to the same path, so the second overwrote the first. Generated script names now include the extension.

Note: 1.1.1 does not load on current Claude Code versions. Use 1.1.2.

## 1.1.0 (2026-06-08)

### Changed
- Scans now fail closed. If a recognized data file cannot be scanned (legacy .xls, macro-enabled .xlsm, binary .xlsb, corrupt or password-protected files), the read is held and the user is routed to CSV conversion instead of the file being silently allowed through.
- Excel scanning uses exceljs instead of xlsx (SheetJS). Committed 2026-04-14: xlsx 0.18.5 had two unpatched high-severity vulnerabilities (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9) and no npm release since 2022.

## 1.0.0 (2026-03-14)

First release as an installable Claude Code plugin. Protection changed from advisory to automatic.

### Added
- A hook that runs before every file read in Claude Code. For CSV, TSV, and Excel files, it scans column headers for student PII patterns (names, student IDs, SSNs, dates of birth, email, phone, address, parent and guardian names, and others) and blocks the read before any of the file's contents are sent to the Claude API.
- Hook implemented in Node.js, with no dependencies needed for CSV and TSV scanning.
- All sheets in an Excel workbook are scanned, not just the first.
- When a read is blocked, the plugin writes a ready-to-run cleanup script that strips the flagged columns and adds a row_id column for row-level uniqueness.
- A local audit log of every scan decision (file name, allowed or blocked, flagged columns) at ~/.ferpa-guardrail/audit.log.
- A one-time welcome message that explains FERPA and the guardrail the first time a read is blocked.
- A GitHub issue template for contributing new PII column patterns.

## Skill release (2026-03-12)

Initial release as a Claude Code skill: written guidance that instructs Claude to read only column headers first, flag PII columns, and keep student data out of the conversation. There was no enforcement mechanism at this stage; that arrived in 1.0.0.
