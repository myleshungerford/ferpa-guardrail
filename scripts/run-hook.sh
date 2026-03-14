#!/usr/bin/env bash
# Cross-platform wrapper to run the FERPA PII check hook.
# Tries python3 first (macOS/Linux), then python (Windows).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if command -v python3 &>/dev/null; then
  python3 "$SCRIPT_DIR/check-ferpa-pii.py"
elif command -v python &>/dev/null; then
  python "$SCRIPT_DIR/check-ferpa-pii.py"
else
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"WARNING: FERPA hook could not find Python on PATH. Install Python 3 to enable automatic PII scanning of data files."}}'
  exit 0
fi
