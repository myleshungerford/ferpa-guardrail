# FERPA Guardrail for Claude Code

A drop-in skill that prevents FERPA-protected student data from entering AI conversations when using Claude Code for higher education data work.

## What It Does

When installed, this skill instructs Claude Code to:

- **Refuse** to accept or process actual student PII (names, IDs, emails, grades, SSNs)
- **Enforce** a describe-then-code workflow: you tell Claude what your data looks like, Claude writes code, you run it locally against your real data
- **Intercept file reads** by scanning column headers for PII before reading any data rows, and providing a drop-columns script if PII is detected
- **Stop and warn** if you accidentally paste something that looks like real student records
- **Never generate code** that sends student data to external services

## Who This Is For

Anyone in higher education who works with student-level data and wants to use AI coding assistants responsibly:

- Enrollment management and admissions analysts
- Institutional research offices
- Registrar and student affairs staff
- Financial aid analysts
- Academic advisors working with student data

## Installation

### Option A: Claude Code Skill (Recommended)

Copy the `SKILL.md` file into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/ferpa-guardrail
cp SKILL.md ~/.claude/skills/ferpa-guardrail/SKILL.md
```

Claude Code will automatically discover and apply the skill when relevant.

### Option B: Project-Level CLAUDE.md

Copy the content of `SKILL.md` (everything below the YAML frontmatter) into a `CLAUDE.md` file in the root of your project folder. Claude Code reads this file automatically at the start of every session in that directory.

### Option C: Session Paste

Copy the content and paste it as your first message in a new Claude Code session. It will apply for that session only.

## How It Works

### The Standard Workflow

1. You describe your data to Claude (column names, data types, row counts, what you want to analyze)
2. Claude writes Python/R code based on your description
3. You run the code locally on your machine
4. Your real data files never appear in the conversation

### The File Read Check

When you ask Claude to read a data file (for cleaning, inspection, etc.):

1. Claude reads **only the column headers** first
2. It scans for columns that look like PII (names, IDs, emails, SSNs, etc.)
3. If PII columns are found, Claude **stops** and gives you a script to strip them locally
4. Only after you confirm PII is removed does Claude read the actual data

## Known Limitations

This is a behavioral guardrail, not a technical enforcement mechanism. Be aware of these gaps:

- **Not bulletproof.** A user can override or ignore the guardrail.
- **Column-name heuristic only.** Columns with non-descriptive names (e.g., "field_7") containing PII will not be caught.
- **Free-text blind spot.** A "comments" or "notes" column could contain embedded PII that the column-name scan will not detect.
- **Small-n risk.** Aggregate statistics for small cohorts (fewer than 10 students) may allow re-identification.
- **Not a substitute for an institutional data processing agreement** with Anthropic or any AI provider.

## Quick Test

After installing, verify it works:

1. Start a new Claude Code session
2. Type: `Here are my students: John Smith 3.4 GPA, Jane Doe 3.8 GPA`
3. Claude should refuse to process this and remind you to describe the schema instead

## Contributing

This guardrail can be improved. If you work in higher ed and have ideas for better PII detection patterns, edge cases we missed, or workflows that need coverage, open an issue or submit a PR.

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
