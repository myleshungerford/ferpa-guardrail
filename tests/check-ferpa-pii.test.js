const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs_test = require('fs');
const path_test = require('path');
const os_test = require('os');
const { normalise, scanHeaders, buildBlockMessage, buildWelcomeMessage, writeCleanupScript } = require('../scripts/check-ferpa-pii.js');

describe('normalise', () => {
  it('lowercases and replaces spaces/hyphens with underscores', () => {
    assert.strictEqual(normalise('First Name'), 'first_name');
    assert.strictEqual(normalise('student-id'), 'student_id');
    assert.strictEqual(normalise('  GPA  '), 'gpa');
  });
});

describe('scanHeaders', () => {
  it('detects PII columns', () => {
    const headers = ['student_name', 'gpa', 'email', 'major'];
    const hits = scanHeaders(headers);
    assert.strictEqual(hits.length, 2);
    assert.strictEqual(hits[0].category, 'Student Name');
    assert.strictEqual(hits[1].category, 'Email');
  });

  it('returns empty array for clean headers', () => {
    const headers = ['gpa', 'major', 'term', 'credits'];
    const hits = scanHeaders(headers);
    assert.strictEqual(hits.length, 0);
  });
});

describe('multi-sheet scanning', () => {
  it('scanHeaders catches PII regardless of which sheet it came from', () => {
    // Simulates headers merged from two sheets:
    // Sheet1 has clean headers, Sheet2 has PII
    const mergedHeaders = ['gpa', 'major', 'term', 'student_name', 'email'];
    const hits = scanHeaders(mergedHeaders);
    assert.strictEqual(hits.length, 2);
    assert.ok(hits.some(h => h.category === 'Student Name'));
    assert.ok(hits.some(h => h.category === 'Email'));
  });

  it('deduplicated headers only produce one hit per column', () => {
    // If two sheets both have "email", it should appear once after dedup
    // This tests the contract that getHeadersFromXlsx returns unique headers
    const deduped = ['gpa', 'email']; // as if Set removed the duplicate
    const hits = scanHeaders(deduped);
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0].category, 'Email');
  });
});

describe('buildBlockMessage', () => {
  it('includes the cleanup script run command when path is provided', () => {
    const hits = [{ column: 'student_name', category: 'Student Name' }];
    const msg = buildBlockMessage('/tmp/test.csv', hits, '.csv', '/tmp/cleanup.js');
    assert.ok(msg.includes('node'), 'Should include node command');
    assert.ok(msg.includes('cleanup.js'), 'Should reference the cleanup script');
  });

  it('includes manual Excel instructions', () => {
    const hits = [{ column: 'student_name', category: 'Student Name' }];
    const msg = buildBlockMessage('/tmp/test.csv', hits, '.csv', null);
    assert.ok(msg.includes('Right-click'), 'Should include Excel instructions');
    assert.ok(msg.includes('row_id'), 'Should mention row_id in Excel instructions');
  });
});

describe('writeCleanupScript', () => {
  it('writes a runnable Node.js cleanup script for CSV', () => {
    const tmpDir = fs_test.mkdtempSync(path_test.join(os_test.tmpdir(), 'ferpa-test-'));
    const hits = [{ column: 'student_name', category: 'Student Name' }];
    const scriptPath = writeCleanupScript('/tmp/test.csv', hits, '.csv', tmpDir);
    assert.ok(scriptPath, 'Should return a script path');
    const content = fs_test.readFileSync(scriptPath, 'utf8');
    assert.ok(content.includes('student_name'), 'Script should reference the PII column');
    assert.ok(content.includes('row_id'), 'Script should add row_id');
    assert.ok(content.includes('#!/usr/bin/env node'), 'Script should have shebang');
    // Cleanup
    fs_test.rmSync(tmpDir, { recursive: true });
  });
});

describe('buildWelcomeMessage', () => {
  it('returns a welcome string mentioning FERPA', () => {
    const msg = buildWelcomeMessage();
    assert.ok(msg.includes('Welcome'), 'Should include Welcome');
    assert.ok(msg.includes('FERPA'), 'Should mention FERPA');
    assert.ok(msg.includes('first time'), 'Should mention first time');
  });
});
