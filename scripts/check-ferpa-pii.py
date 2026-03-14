#!/usr/bin/env python3
"""
check-ferpa-pii.py - Claude Code PreToolUse hook for the Read tool.

Intercepts file reads and blocks them when the target file is a data file
(.csv, .tsv, .xlsx) whose column headers contain FERPA-protected
student PII. When PII columns are detected the hook exits with code 2 and
prints a remediation script to stderr. Otherwise it exits 0 and allows the
read to proceed.

Hook protocol
-------------
stdin:  JSON  {"tool_name": "Read", "tool_input": {"file_path": "..."}}
stdout: JSON  {"hookSpecificOutput": {...}}   (on allow)
stderr: human-readable warning               (on block)
exit 0: allow
exit 2: block
"""

import csv
import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# PII patterns
# ---------------------------------------------------------------------------
# Each entry is (category_label, compiled_regex). The regex is tested against
# the *normalised* column name (lowercased, with spaces/hyphens replaced by
# underscores, stripped of leading/trailing whitespace).
#
# To add new patterns, append to this list.

PII_PATTERNS = [
    # --- Names -----------------------------------------------------------
    (
        "Student Name",
        re.compile(
            r"(^|_)(first|last|middle|sur|given|preferred)([_]?name)"
            r"|student[_]?name|full[_]?name|person[_]?name|stu[_]?name"
        ),
    ),
    # --- Student / Person IDs --------------------------------------------
    (
        "Student ID",
        re.compile(
            r"(^|_)(student[_]?id|stu[_]?id|sid|banner[_]?id|emplid|empl[_]?id"
            r"|people[_]?id|person[_]?id|spriden[_]?id|pidm|auid"
            r"|uni[_]?id|university[_]?id|campus[_]?id|eagle[_]?id)"
        ),
    ),
    # --- SSN / Social Security -------------------------------------------
    (
        "SSN",
        re.compile(
            r"(^|_)(ssn|social[_]?sec(urity)?([_]?(num(ber)?|no|nbr))?|soc[_]?sec(urity)?([_]?(num(ber)?|no|nbr))?|ss[_]?num)($|_)"
        ),
    ),
    # --- Date of birth ---------------------------------------------------
    (
        "Date of Birth",
        re.compile(
            r"(^|_)(dob|date[_]?of[_]?birth|birth[_]?date|birthdate|birth[_]?day|birthday)"
        ),
    ),
    # --- Contact information ---------------------------------------------
    (
        "Email",
        re.compile(
            r"(^|_)(e[_]?mail|email[_]?addr(ess)?|student[_]?email"
            r"|personal[_]?email|inst[_]?email|school[_]?email)($|_)"
        ),
    ),
    (
        "Phone",
        re.compile(
            r"(^|_)(phone|mobile|cell|telephone|tel[_]?no|tel[_]?num|phone[_]?num)($|_)"
        ),
    ),
    (
        "Address",
        re.compile(
            r"(^|_)(address|street|addr[_]?line|mailing[_]?addr(ess)?"
            r"|home[_]?addr(ess)?|street[_]?addr(ess)?"
            r"|city[_]?state[_]?zip|zip[_]?code|postal[_]?code)($|_)"
        ),
    ),
    # --- Other FERPA identifiers -----------------------------------------
    (
        "Parent/Guardian Name",
        re.compile(
            r"(^|_)(parent[_]?name|guardian[_]?name|emergency[_]?contact[_]?name)"
        ),
    ),
    ("Mother Maiden Name", re.compile(r"(^|_)(mother[_]?maiden|maiden[_]?name)")),
    ("Biometric", re.compile(r"(^|_)(biometric|fingerprint|face[_]?id|retina)")),
]

# File extensions we scan (lowercased, with dot).
DATA_EXTENSIONS = {".csv", ".tsv", ".xlsx"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def normalise(col):
    """Lowercase, strip, and convert spaces/hyphens to underscores."""
    return re.sub(r"[\s\-]+", "_", col.strip().lower())


def scan_columns(raw_headers):
    """Return [(original_header, category), ...] for every flagged column."""
    flagged = []
    for raw in raw_headers:
        norm = normalise(raw)
        if not norm:
            continue
        for category, pattern in PII_PATTERNS:
            if pattern.search(norm):
                flagged.append((raw.strip(), category))
                break
    return flagged


def read_csv_headers(file_path, delimiter=","):
    """Read only the first line of a CSV/TSV and return column names."""
    with open(file_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f, delimiter=delimiter)
        return next(reader)


def read_xlsx_headers(file_path):
    """Read the first row of an .xlsx file using openpyxl (read-only mode)."""
    import openpyxl

    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active
    headers = []
    for row in ws.iter_rows(min_row=1, max_row=1, values_only=True):
        headers = [str(c) if c is not None else "" for c in row]
        break
    wb.close()
    return headers


def allow(context=""):
    """Print allow JSON to stdout and exit 0."""
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
        }
    }
    if context:
        payload["hookSpecificOutput"]["additionalContext"] = context
    print(json.dumps(payload))
    sys.exit(0)


def block(message):
    """Print message to stderr and exit 2."""
    print(message, file=sys.stderr)
    sys.exit(2)


def build_remediation_script(file_path, flagged):
    """Return a ready-to-run Python snippet that strips the flagged columns."""
    ext = os.path.splitext(file_path)[1].lower()
    col_names = [col for col, _ in flagged]
    cols_repr = repr(col_names)

    safe_path = file_path.replace("\\", "/")
    base, dot_ext = os.path.splitext(safe_path)
    cleaned_path = f"{base}_cleaned{dot_ext}"

    if ext in (".csv", ".tsv"):
        return (
            f"import pandas as pd\n"
            f"\n"
            f'df = pd.read_csv(r"{safe_path}")\n'
            f"drop_cols = {cols_repr}\n"
            f"df.drop(columns=[c for c in drop_cols if c in df.columns], inplace=True)\n"
            f'df.to_csv(r"{cleaned_path}", index=False)\n'
            f'print("Cleaned file written to: {cleaned_path}")\n'
        )
    else:
        return (
            f"import pandas as pd\n"
            f"\n"
            f'df = pd.read_excel(r"{safe_path}")\n'
            f"drop_cols = {cols_repr}\n"
            f"df.drop(columns=[c for c in drop_cols if c in df.columns], inplace=True)\n"
            f'df.to_excel(r"{cleaned_path}", index=False)\n'
            f'print("Cleaned file written to: {cleaned_path}")\n'
        )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    # Parse hook payload from stdin.
    try:
        payload = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError):
        allow(
            "WARNING: FERPA hook could not parse the hook payload. "
            "PII scanning was NOT performed on this file read. "
            "Check that the plugin is compatible with your Claude Code version."
        )
        return

    tool_name = payload.get("tool_name", "")
    if tool_name != "Read":
        allow()
        return

    file_path = payload.get("tool_input", {}).get("file_path", "")
    if not file_path:
        allow()
        return

    # Check extension.
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in DATA_EXTENSIONS:
        allow()
        return

    # Read headers.
    headers = []
    try:
        if ext == ".csv":
            headers = read_csv_headers(file_path, delimiter=",")
        elif ext == ".tsv":
            headers = read_csv_headers(file_path, delimiter="\t")
        elif ext == ".xlsx":
            try:
                headers = read_xlsx_headers(file_path)
            except ImportError:
                allow(
                    "FERPA hook: openpyxl is not installed, so .xlsx file "
                    "headers could not be scanned for PII. Install openpyxl "
                    "(pip install openpyxl) to enable automatic FERPA scanning."
                )
                return
    except Exception as exc:
        allow(
            f"FERPA hook: could not read headers from "
            f"{os.path.basename(file_path)} ({exc}); allowing by default."
        )
        return

    if not headers:
        allow(
            f"FERPA hook: no headers found in {os.path.basename(file_path)}; allowing."
        )
        return

    # Scan for PII.
    flagged = scan_columns(headers)

    if not flagged:
        allow(
            f"FERPA hook: scanned {len(headers)} columns in "
            f"{os.path.basename(file_path)}, no PII detected."
        )
        return

    # Build block message with remediation script.
    col_list = "\n".join(f"  - {col}  ({category})" for col, category in flagged)
    remediation = build_remediation_script(file_path, flagged)

    message = (
        "\n"
        "============================================================\n"
        "  FERPA GUARDRAIL: Blocked read of data file with student PII\n"
        "============================================================\n"
        "\n"
        f"File: {file_path}\n"
        "\n"
        "The following columns appear to contain FERPA-protected\n"
        "personally identifiable information (PII):\n"
        "\n"
        f"{col_list}\n"
        "\n"
        "Why this matters: Reading this file transmits its contents to\n"
        "the Claude API. Sending student PII to an external API may\n"
        "violate FERPA (20 U.S.C. 1232g) and your institution's data\n"
        "governance policies.\n"
        "\n"
        "To proceed safely, run the following Python script to create\n"
        "a copy of the file with the PII columns removed:\n"
        "\n"
        "----------- cut here -----------\n"
        f"{remediation}"
        "----------- cut here -----------\n"
        "\n"
        "Then ask Claude to read the cleaned file instead.\n"
    )

    block(message)


if __name__ == "__main__":
    main()
