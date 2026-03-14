---
name: ferpa-guardrail
description: Use when working with student education records, enrollment data, admissions files, financial aid data, or any dataset that may contain FERPA-protected personally identifiable information (PII). Triggers on CSV reads, Excel reads, data cleaning, data analysis, predictive modeling with student data, or any file operation in higher education and institutional research contexts.
---

# FERPA Data Guardrail

## Overview

Intercepts file reads to check for FERPA-protected student PII before any data enters the conversation. When PII columns are detected, it stops, flags them, and provides a script to strip them locally.

FERPA (Family Educational Rights and Privacy Act, 20 U.S.C. Section 1232g) protects student education records. When this data enters a conversation, it is transmitted to the AI provider's API. Even if the provider does not train on API data, transmission itself may violate institutional policy and federal law.

This skill is a behavioral guardrail, not a technical enforcement mechanism. It reduces risk significantly but is not bulletproof.

## When to Use

- Any session involving student data (enrollment, admissions, registrar, financial aid, advising, institutional research)
- Data cleaning, transformation, or analysis of files that may contain student records
- Building predictive models (yield, melt, retention, graduation) from student-level data
- Any time you are asked to read, open, or inspect a CSV, Excel, or database export in a higher ed context

## When NOT to Use

- Working with purely synthetic or publicly available datasets
- Institutional-level aggregate data with no student-level records (e.g., IPEDS summary tables)
- Data that has already been fully de-identified per FERPA's de-identification standard

## File Read Interception

This is the core of the skill. Data cleaning, inspection, and analysis require reading files, which is where PII exposure actually happens. Every file read must go through this check.

When asked to read, open, or inspect any data file:

1. **Read ONLY column headers first.** Write and run a script that prints column names only. Do NOT read any data rows.

2. **Scan for PII indicators.** Check column names for anything suggesting direct identifiers:

| PII Pattern | Example Column Names |
|---|---|
| Names | name, first_name, last_name, student_name, parent_name |
| IDs | student_id, id, ssn, social, sid, banner_id, emplid |
| Contact info | email, phone, address, street, city, zip (when combined with other PII) |
| Unique identifiers | Any column that could uniquely identify a student when combined with other fields |

3. **If PII columns exist, STOP.** List the columns you flagged. Recommend the user drop them before proceeding. Provide a ready-to-run local script:

```python
import pandas as pd
df = pd.read_csv('original_file.csv')
pii_columns = ['student_name', 'student_id', 'email']  # flagged columns
df.drop(columns=pii_columns, inplace=True)
df.to_csv('file_clean.csv', index=False)
print(f"Dropped {len(pii_columns)} PII columns. Clean file saved.")
```

4. **Only read data rows after user confirms PII is removed.**

5. **If no PII columns detected**, note this in your response so the user can verify your assessment before you proceed.

## Additional Safeguards

- If the user accidentally pastes what looks like real student data (names, IDs, email addresses, grades tied to identifiers) directly into the conversation: STOP. Do not process it. Let them know and suggest they describe the data structure instead.
- Never generate code that sends student data to external APIs, web services, or any endpoint outside the local machine.
- When generating synthetic sample data, use clearly fake identifiers (Student_001, Student_002), never realistic names.
- Be cautious with small-cohort aggregates. Results where n < 10 may allow re-identification. Flag this when it occurs.

## Best Practice (Optional)

For maximum safety, users can describe their data (column names, types, row counts) and have Claude write code against that schema without reading the file at all. This keeps all data off the conversation entirely. However, this is a workflow preference, not a requirement of this skill.

## Known Limitations

- **Behavioral, not technical.** A user can override or ignore the guardrail.
- **Column-name heuristic only.** A column called "field_7" containing SSNs will not be caught. The check relies on recognizable column names.
- **Free-text fields are invisible.** A "comments" or "notes" column could contain embedded PII (advising notes, disciplinary descriptions) that the column-name scan will not detect.
- **Not a substitute for an institutional data agreement** with the AI provider.
- **Aggregation attacks.** Small cohorts (e.g., 3 students in a specific program) can be re-identified from aggregate statistics. Be cautious with small-n breakdowns.

## Data Classification Quick Reference

**FERPA-protected (never in conversation):**
- Student names, IDs, SSNs, email addresses
- Grades, GPA, transcripts, class schedules
- Financial aid, billing, payment information
- Disciplinary records, disability accommodations
- Enrollment status, degree information
- Any combination that could identify a specific student

**Safe to share in conversation:**
- Column names and data types
- Row counts and aggregate statistics (means, medians, totals for large cohorts)
- Data dictionaries and schema definitions
- Error messages and tracebacks (with PII redacted)
- Institutional-level summary data (total enrollment by program, admit rates)

## Common Mistakes

| Mistake | Fix |
|---|---|
| "Read this CSV and show me the first 10 rows" | Read headers only first. Strip PII columns. Then inspect. |
| Pasting a traceback that includes a student name from a print statement | Redact PII from tracebacks before sharing. |
| Asking Claude to "find duplicates" by reading the full file | Write a dedup script that runs locally. Share only the count of duplicates found. |
| Sharing small-cohort aggregates ("3 students in X program had Y GPA") | Suppress or generalize results where n < 10 to prevent re-identification. |
| Using real names in synthetic data ("like John Smith in row 5") | Use Student_001, Student_002 or fully random generated names. |
