# FERPA Guardrail for Claude Code

A drop-in skill that checks for FERPA-protected student data before Claude Code reads any file. When PII columns are detected, it stops, flags them, and provides a script to strip them locally.

## What It Does

When you ask Claude Code to read a data file, this skill intercepts the read and:

1. **Reads only the column headers first** (no data rows)
2. **Scans for PII columns** (names, IDs, SSNs, emails, phone numbers, addresses)
3. **Stops and warns you** if PII columns are found, with a ready-to-run script to strip them
4. **Proceeds only after you confirm** the PII has been removed

It also warns you if you accidentally paste student data directly into the conversation, and prevents code generation that would send data to external services.

## Who This Is For

Anyone in higher education who works with student-level data and wants to use AI coding assistants responsibly:

- Enrollment management and admissions analysts
- Institutional research offices
- Registrar and student affairs staff
- Financial aid analysts
- Academic advisors working with student data

## Installation (Recommended)

Two steps: install the skill, then add a one-line trigger to your global config.

### Step 1: Install the skill

Copy `SKILL.md` into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/ferpa-guardrail
cp SKILL.md ~/.claude/skills/ferpa-guardrail/SKILL.md
```

### Step 2: Add the trigger to your global CLAUDE.md

Open (or create) `~/.claude/CLAUDE.md` and add this line:

```
When working with university, college, or higher education data, always use the ferpa-guardrail skill.
```

This ensures the guardrail activates in every session where you work with higher ed data, regardless of which project folder you are in. The trigger line is always in context (global CLAUDE.md loads every session), while the full interception logic only loads when relevant.

## Alternative Installation

### Project-level CLAUDE.md

If you prefer the guardrail only in specific projects, copy the full content of `SKILL.md` (everything below the YAML frontmatter) into a `CLAUDE.md` file in that project's root folder. Claude Code reads it automatically at the start of every session in that directory. This is the most reliable method for a single project, since the instructions are always in context.

### Session paste

Copy the content and paste it as your first message in a new Claude Code session. It will apply for that session only.

## How It Works

The skill does not restrict how you use Claude Code. You can still ask it to read files, clean data, build models, and do everything you normally would. The only difference is that before reading any data file, Claude checks the column headers for PII and asks you to strip identifier columns if it finds any.

For users who want maximum safety, the skill also documents an optional workflow where you describe your data structure to Claude without it reading the file at all. But this is a preference, not a requirement.

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
2. Ask Claude to read a CSV that has columns like `student_name`, `student_id`, `email`
3. Claude should read only the headers, flag the PII columns, and provide a script to strip them before reading any data rows

## Contributing

This guardrail can be improved. If you work in higher ed and have ideas for better PII detection patterns, open an issue or submit a PR.

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
