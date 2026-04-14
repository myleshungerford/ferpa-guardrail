# FERPA Guardrail for Claude Code

A plugin that automatically scans data files for FERPA-protected student PII before Claude Code can read them. When PII columns are detected, it blocks the read, flags the columns, and provides a script to strip them locally.

## What It Does

When Claude Code tries to read a data file (.csv, .xlsx, .tsv), this plugin intercepts the read automatically:

1. **Scans column headers** before any data enters the conversation
2. **Blocks the read** if PII columns are detected (names, IDs, SSNs, emails, phone numbers, addresses)
3. **Shows you exactly which columns** were flagged and why
4. **Saves a ready-to-run cleanup script** that creates a clean copy with PII columns removed and a `row_id` column added

No configuration needed. Install the plugin and the protection is active immediately.

The plugin also includes a behavioral skill that warns if you accidentally paste student data directly into the conversation, and provides guidance on small-cohort re-identification risks, data classification, and FERPA-safe workflows.

## Who This Is For

Anyone in higher education who works with student-level data and uses Claude Code:

- Enrollment management and admissions analysts
- Institutional research offices
- Registrar and student affairs staff
- Financial aid analysts
- Academic advisors working with student data

## Installation

### Option 1: Plugin install (recommended)

This installs both the automatic file-read hook and the FERPA guidance skill.

**Step 1:** Add the marketplace in Claude Code:

```
/plugin marketplace add myleshungerford/ferpa-guardrail
```

**Step 2:** Install the plugin:

```
/plugin install ferpa-guardrail@ferpa-guardrail
```

That's it. The hook starts protecting you immediately.

### Option 2: Manual skill install (no automatic hook)

If you prefer to install only the behavioral skill without the automatic hook:

1. Copy `skills/ferpa-guardrail/SKILL.md` into `~/.claude/skills/ferpa-guardrail/SKILL.md`
2. Add this line to `~/.claude/CLAUDE.md`:

```
When working with university, college, or higher education data, always use the ferpa-guardrail skill.
```

Note: Without the plugin install, the skill must be invoked by Claude (or by you manually). The automatic file-read blocking only works with the full plugin install.

## Requirements

- Claude Code (Node.js is included, so the hook and cleanup scripts work with zero additional dependencies for CSV/TSV files)
- For .xlsx scanning and cleanup: `npm install exceljs` (optional, only needed if you work with Excel files)

## How It Works

The plugin has two layers of protection:

**Layer 1: Automatic hook (PreToolUse on Read)**
A Node.js script runs before every file read. It checks the file extension, reads only the column headers (never the data rows), and pattern-matches against known PII column names. If PII is found, the read is blocked before any data reaches the Claude API. Since Claude Code already includes Node.js, this works with zero additional dependencies for CSV and TSV files. For Excel files with multiple sheets, headers from all sheets are scanned. When PII is detected, a Node.js cleanup script is saved to `~/.ferpa-guardrail/cleanup/` that Claude can run for you. The script removes PII columns and adds a sequential `row_id` column to preserve row-level uniqueness.

**Layer 2: Behavioral skill**
When invoked, the skill provides additional guidance: catching PII pasted directly into the conversation, flagging small-cohort aggregates (n < 10) that could allow re-identification, preventing code that sends data to external APIs, and ensuring synthetic data uses fake identifiers.

## Audit Log

Every scan result is recorded in a local log file at `~/.ferpa-guardrail/audit.log`. Each entry is a JSON line with the timestamp, file name, action taken (allowed or blocked), number of columns scanned, and any flagged columns. The log never contains actual data values.

This log provides auditable evidence for compliance reviews. It is local to your machine and is never transmitted.

## PII Patterns Detected

| Category | Example Column Names |
|---|---|
| Student names | first_name, last_name, student_name, full_name |
| Student IDs | student_id, sid, banner_id, emplid, pidm, auid |
| SSN | ssn, social_security, ss_num |
| Date of birth | dob, date_of_birth, birth_date |
| Email | email, student_email, personal_email |
| Phone | phone, mobile, cell, telephone |
| Address | address, street, mailing_address, zip_code |
| Parent/guardian | parent_name, guardian_name, emergency_contact_name |
| Other | mother_maiden, biometric |

Column matching is case-insensitive and handles variations in spacing, hyphens, and underscores.

## Known Limitations

- **Read tool only.** The hook intercepts Claude's Read tool. If data files are accessed through the Bash tool (e.g., `cat file.csv`, `python script.py`), the hook will not trigger. The behavioral skill (Layer 2) helps mitigate this, but cannot technically block it.
- **Fails open on errors.** If the hook encounters an error (file not readable, malformed input, missing dependencies), it allows the read to proceed rather than blocking. This prevents the hook from disrupting normal work, but means a corrupted or unreadable file will not be scanned.
- **Column-name heuristic only.** Columns with non-descriptive names (e.g., "field_7") containing PII will not be caught.
- **Free-text blind spot.** A "comments" or "notes" column could contain embedded PII that the column-name scan will not detect.
- **Small-n risk.** Aggregate statistics for small cohorts (fewer than 10 students) may allow re-identification.
- **Not a substitute for an institutional data processing agreement** with Anthropic or any AI provider.
- **Excel scanning requires the exceljs npm package.** Without it, .xlsx files are allowed through with a warning. Install with `npm install exceljs`.
- **Legacy .xls not supported.** The hook scans .xlsx files only. If you have .xls files (Excel 97-2003 format), convert them to .xlsx first.

## Quick Test

After installing, verify it works:

1. Create a test CSV with PII column headers:
   ```
   student_name,student_id,email,gpa,major
   ```
2. Ask Claude Code to read the file
3. The hook should block the read, list the flagged columns, and provide a cleanup script

## Contributing

If you work in higher ed and have ideas for better PII detection patterns, use the **[Pattern Contribution](../../issues/new?template=pattern-contribution.yml)** issue template to submit a new pattern or report a false positive.

Areas that could use community input:

- Additional PII column name patterns (Banner, PeopleSoft, Slate, and other SIS field names)
- HIPAA crossover patterns for student health data
- International student data considerations (GDPR overlap)
- State-level student privacy laws beyond FERPA

## License

MIT. Use it, fork it, adapt it for your institution.

## Author

Myles Hungerford, American University

Built for the higher ed data community. If this helps you use AI tools more responsibly with student data, that is the whole point.
