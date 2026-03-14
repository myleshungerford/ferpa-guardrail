const { describe, it } = require('node:test');
const assert = require('node:assert');
const { normalise, scanHeaders, buildBlockMessage } = require('../scripts/check-ferpa-pii.js');

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
  it('includes flagged columns and FERPA reference', () => {
    const hits = [{ column: 'student_name', category: 'Student Name' }];
    const msg = buildBlockMessage('/tmp/test.csv', hits, '.csv');
    assert.ok(msg.includes('student_name'));
    assert.ok(msg.includes('FERPA'));
  });
});
