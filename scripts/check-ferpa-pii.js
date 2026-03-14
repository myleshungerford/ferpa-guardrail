#!/usr/bin/env node
/**
 * FERPA PII Detection Hook for Claude Code (PreToolUse)
 *
 * Intercepts file read operations and blocks them if column headers
 * contain FERPA-protected student PII. Zero-dependency for CSV/TSV
 * files; requires the 'xlsx' npm package for Excel.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// PII pattern definitions
// Patterns are matched against normalised column names (lowercased, spaces
// and hyphens replaced with underscores). Extend by adding entries here.
// ---------------------------------------------------------------------------
const PII_PATTERNS = [
  ['Student Name',         '(^|_)(first|last|middle|sur|given|preferred)(_?name)|student_?name|full_?name|person_?name|stu_?name'],
  ['Student ID',           '(^|_)(student_?id|stu_?id|sid|banner_?id|emplid|empl_?id|people_?id|person_?id|spriden_?id|pidm|auid|uni_?id|university_?id|campus_?id|eagle_?id)'],
  ['SSN',                  '(^|_)(ssn|social_?sec(urity)?(_?(num(ber)?|no|nbr))?|soc_?sec(urity)?(_?(num(ber)?|no|nbr))?|ss_?num)($|_)'],
  ['Date of Birth',        '(^|_)(dob|date_?of_?birth|birth_?date|birthdate|birth_?day|birthday)'],
  ['Email',                '(^|_)(e_?mail|email_?addr(ess)?|student_?email|personal_?email|inst_?email|school_?email)($|_)'],
  ['Phone',                '(^|_)(phone|mobile|cell|telephone|tel_?no|tel_?num|phone_?num)($|_)'],
  ['Address',              '(^|_)(address|street|addr_?line|mailing_?addr(ess)?|home_?addr(ess)?|street_?addr(ess)?|city_?state_?zip|zip_?code|postal_?code)($|_)'],
  ['Parent/Guardian Name', '(^|_)(parent_?name|guardian_?name|emergency_?contact_?name)'],
  ['Mother Maiden Name',   '(^|_)(mother_?maiden|maiden_?name)'],
  ['Biometric',            '(^|_)(biometric|fingerprint|face_?id|retina)'],
];

const COMPILED_PATTERNS = PII_PATTERNS.map(([category, src]) => [
  category,
  new RegExp(src, 'i'),
]);

const DATA_EXTENSIONS = new Set(['.csv', '.tsv', '.xlsx']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(col) {
  return col.trim().toLowerCase().replace(/[\s\-]+/g, '_');
}

function allow(additionalContext) {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
  if (additionalContext) {
    payload.hookSpecificOutput.additionalContext = additionalContext;
  }
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function block(message) {
  process.stderr.write(message);
  process.exit(2);
}

function getFerpaDir() {
  const dir = path.join(os.homedir(), '.ferpa-guardrail');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function isFirstBlock() {
  try {
    const marker = path.join(getFerpaDir(), '.welcomed');
    return !fs.existsSync(marker);
  } catch (_e) {
    return true; // If we can't check, show the welcome (harmless if repeated)
  }
}

function markFirstBlock() {
  try {
    const marker = path.join(getFerpaDir(), '.welcomed');
    fs.writeFileSync(marker, new Date().toISOString());
  } catch (_e) {
    // Best effort
  }
}

function buildWelcomeMessage() {
  return [
    '',
    '------------------------------------------------------------',
    '  Welcome! The FERPA Guardrail plugin is protecting your data.',
    '------------------------------------------------------------',
    '',
    'FERPA (Family Educational Rights and Privacy Act) protects student',
    'education records. When Claude Code reads a file, its contents are',
    'sent to the Claude API. This plugin scans column headers first and',
    'blocks the read if student PII is detected.',
    '',
    'This is the first time the guardrail has caught something.',
    'Here is what happened:',
  ].join('\n');
}

function writeCleanupScript(filePath, hits, ext, overrideDir) {
  try {
    const baseDir = overrideDir || getFerpaDir();
    const cleanupDir = path.join(baseDir, 'cleanup');
    if (!fs.existsSync(cleanupDir)) {
      fs.mkdirSync(cleanupDir, { recursive: true });
    }

    const baseName = path.basename(filePath, ext);
    const scriptPath = path.join(cleanupDir, `clean_${baseName}.js`);
    const fwdInput = filePath.replace(/\\/g, '/');
    const fwdOutput = fwdInput.replace(/(\.[^.]+)$/, '_cleaned$1');
    const dropCols = hits.map(h => h.column);
    const dropJSON = JSON.stringify(dropCols);

    let script;
    if (ext === '.xlsx') {
      script = generateXlsxCleanup(fwdInput, fwdOutput, dropJSON);
    } else {
      const delim = ext === '.tsv' ? '\\t' : ',';
      script = generateCsvCleanup(fwdInput, fwdOutput, dropJSON, delim);
    }

    fs.writeFileSync(scriptPath, script);
    return scriptPath;
  } catch (_e) {
    return null;
  }
}

function generateCsvCleanup(inputPath, outputPath, dropJSON, delim) {
  return `#!/usr/bin/env node
const fs = require('fs');

const INPUT = ${JSON.stringify(inputPath)};
const OUTPUT = ${JSON.stringify(outputPath)};
const DROP = new Set(${dropJSON});
const DELIM = '${delim}';

function parseLine(line, d) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === d) { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

let text = fs.readFileSync(INPUT, 'utf8');
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
const lines = text.split(/\\r?\\n/).filter(l => l.trim() !== '');
if (lines.length === 0) { console.log('File is empty.'); process.exit(0); }

const headers = parseLine(lines[0], DELIM);
const keepIdx = [];
for (let i = 0; i < headers.length; i++) {
  if (!DROP.has(headers[i].trim())) keepIdx.push(i);
}

const out = [];
out.push(['row_id', ...keepIdx.map(i => headers[i])].join(DELIM));
for (let r = 1; r < lines.length; r++) {
  const fields = parseLine(lines[r], DELIM);
  out.push([r, ...keepIdx.map(i => fields[i] || '')].join(DELIM));
}

fs.writeFileSync(OUTPUT, out.join('\\n') + '\\n');
console.log('Cleaned file written to: ' + OUTPUT);
console.log('Dropped ' + DROP.size + ' PII column(s), added row_id. ' + (lines.length - 1) + ' data rows.');
`;
}

function generateXlsxCleanup(inputPath, outputPath, dropJSON) {
  return `#!/usr/bin/env node
const XLSX = require('xlsx');

const INPUT = ${JSON.stringify(inputPath)};
const OUTPUT = ${JSON.stringify(outputPath)};
const DROP = new Set(${dropJSON});

const wb = XLSX.readFile(INPUT);
for (const name of wb.SheetNames) {
  const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
  if (data.length === 0) continue;
  const headers = data[0].map(String);
  const keepIdx = [];
  for (let i = 0; i < headers.length; i++) {
    if (!DROP.has(headers[i].trim())) keepIdx.push(i);
  }
  const newData = [['row_id', ...keepIdx.map(i => headers[i])]];
  for (let r = 1; r < data.length; r++) {
    newData.push([r, ...keepIdx.map(i => data[r][i] !== undefined ? data[r][i] : '')]);
  }
  wb.Sheets[name] = XLSX.utils.aoa_to_sheet(newData);
}
XLSX.writeFile(wb, OUTPUT);
console.log('Cleaned file written to: ' + OUTPUT);
console.log('Dropped ' + DROP.size + ' PII column(s) from ' + wb.SheetNames.length + ' sheet(s), added row_id.');
`;
}

function parseHeaderLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function readFirstLine(filePath) {
  const buf = Buffer.alloc(65536);
  const fd = fs.openSync(filePath, 'r');
  let bytesRead;
  try {
    bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  let text = buf.toString('utf8', 0, bytesRead);

  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const idxLF = text.indexOf('\n');
  const idxCR = text.indexOf('\r');
  let endIdx;
  if (idxLF === -1 && idxCR === -1) {
    endIdx = text.length;
  } else if (idxCR !== -1 && (idxLF === -1 || idxCR < idxLF)) {
    endIdx = idxCR;
  } else {
    endIdx = idxLF;
  }

  return text.slice(0, endIdx);
}

function getHeadersFromDelimited(filePath, ext) {
  const line = readFirstLine(filePath);
  const delimiter = ext === '.tsv' ? '\t' : ',';
  return parseHeaderLine(line, delimiter);
}

function getHeadersFromXlsx(filePath) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (_e) {
    return null;
  }

  const workbook = XLSX.readFile(filePath, { sheetRows: 1 });
  if (workbook.SheetNames.length === 0) return [];

  const allHeaders = new Set();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length > 0) {
      for (const col of rows[0]) {
        allHeaders.add(String(col));
      }
    }
  }
  return [...allHeaders];
}

function scanHeaders(headers) {
  const hits = [];
  for (const rawCol of headers) {
    const norm = normalise(rawCol);
    if (!norm) continue;
    for (const [category, regex] of COMPILED_PATTERNS) {
      if (regex.test(norm)) {
        hits.push({ column: rawCol.trim(), category });
        break;
      }
    }
  }
  return hits;
}

function buildBlockMessage(filePath, hits, ext, cleanupScriptPath) {
  const fwdPath = filePath.replace(/\\/g, '/');

  const flaggedLines = hits
    .map((h) => `  - ${h.column}  (${h.category})`)
    .join('\n');

  const lines = [
    '',
    '============================================================',
    '  FERPA GUARDRAIL: Blocked read of data file with student PII',
    '============================================================',
    '',
    `File: ${fwdPath}`,
    '',
    'The following columns appear to contain FERPA-protected',
    'personally identifiable information (PII):',
    '',
    flaggedLines,
    '',
    'Why this matters: Reading this file transmits its contents to',
    'the Claude API. Sending student PII to an external API may',
    'violate FERPA (20 U.S.C. 1232g) and your institution\'s data',
    'governance policies.',
    '',
    'To proceed safely, create a cleaned copy with PII columns',
    'removed and a row_id column added for row-level uniqueness.',
    '',
  ];

  if (cleanupScriptPath) {
    const fwdScript = cleanupScriptPath.replace(/\\/g, '/');
    lines.push(
      'A cleanup script has been saved. To run it:',
      '',
      `  node "${fwdScript}"`,
      '',
    );
  }

  lines.push(
    'Or clean the file manually in Excel:',
    '',
    '  1. Open the file in Excel',
    '  2. Right-click the column header for each flagged column above',
    '  3. Select "Delete"',
    '  4. Insert a new column A, name it "row_id", and number rows 1, 2, 3...',
    '  5. File > Save As with "_cleaned" added to the filename',
    '  6. Ask Claude to read the cleaned file',
    '',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  let inputData;
  try {
    inputData = fs.readFileSync(0, 'utf8');
  } catch (_e) {
    allow('WARNING: FERPA hook could not read stdin. PII scanning was NOT performed.');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(inputData);
  } catch (_e) {
    allow(
      'WARNING: FERPA hook could not parse the hook payload. ' +
      'PII scanning was NOT performed on this file read. ' +
      'Check that the plugin is compatible with your Claude Code version.'
    );
    return;
  }

  if (parsed.tool_name !== 'Read') {
    allow();
    return;
  }

  const filePath = (parsed.tool_input || {}).file_path;
  if (!filePath) {
    allow();
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!DATA_EXTENSIONS.has(ext)) {
    allow();
    return;
  }

  if (!fs.existsSync(filePath)) {
    allow('FERPA hook: file does not exist yet, skipping PII scan.');
    return;
  }

  let headers;
  try {
    if (ext === '.csv' || ext === '.tsv') {
      headers = getHeadersFromDelimited(filePath, ext);
    } else if (ext === '.xlsx') {
      headers = getHeadersFromXlsx(filePath);
      if (headers === null) {
        allow(
          'FERPA hook: xlsx npm package is not installed. Excel files cannot be scanned for PII. ' +
          'Run "npm install xlsx" to enable FERPA scanning for .xlsx files.'
        );
        return;
      }
    }
  } catch (err) {
    allow(
      `FERPA hook: could not read headers from ${path.basename(filePath)} ` +
      `(${err.message}). PII scanning was not performed.`
    );
    return;
  }

  if (!headers || headers.length === 0) {
    allow(`FERPA hook: no headers found in ${path.basename(filePath)}; allowing.`);
    return;
  }

  const hits = scanHeaders(headers);

  if (hits.length === 0) {
    allow(
      `FERPA hook: scanned ${headers.length} columns in ` +
      `${path.basename(filePath)}, no PII detected.`
    );
    return;
  }

  const cleanupScriptPath = writeCleanupScript(filePath, hits, ext);
  const blockMsg = buildBlockMessage(filePath, hits, ext, cleanupScriptPath);

  if (isFirstBlock()) {
    markFirstBlock();
    block(buildWelcomeMessage() + blockMsg);
  } else {
    block(blockMsg);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  normalise,
  scanHeaders,
  buildBlockMessage,
  buildWelcomeMessage,
  writeCleanupScript,
  PII_PATTERNS,
  COMPILED_PATTERNS,
};
