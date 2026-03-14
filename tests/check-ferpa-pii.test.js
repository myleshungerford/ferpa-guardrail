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

describe('buildBlockMessage', () => {
  it('includes flagged columns and FERPA reference', () => {
    const hits = [{ column: 'student_name', category: 'Student Name' }];
    const msg = buildBlockMessage('/tmp/test.csv', hits, '.csv');
    assert.ok(msg.includes('student_name'));
    assert.ok(msg.includes('FERPA'));
  });
});
