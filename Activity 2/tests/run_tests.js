/* Run with: node tests/run_tests.js
   Verifies the engine and writes the actual results to Test_Case_Analysis.md. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const P = require('../js/presets.js');
const Cases = require('../js/cases.js');

let count = 0;
const test = (name, fn) => { fn(); count++; console.log('ok  ' + name); };

test('Need = Maximum - Allocation', () => {
  const s = P.avoidance.safe;
  assert.deepStrictEqual(E.computeNeed(s.max, s.alloc),
    [[7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]]);
});

test('textbook safe sequence', () => {
  const r = E.safety(P.avoidance.safe);
  assert.strictEqual(r.safe, true);
  assert.deepStrictEqual(r.sequence, [1, 3, 4, 0, 2]);
  assert.deepStrictEqual(r.steps.map((s) => s.after),
    [[5, 3, 2], [7, 4, 3], [7, 4, 5], [7, 5, 5], [10, 5, 7]]);
});

test('request beyond Need is invalid', () => {
  assert.strictEqual(E.checkRequest(P.avoidance.safe, 'P1', '2 0 0').status, 'invalid');
});

test('request beyond Available waits and leaves state intact', () => {
  const s = E.clone(P.avoidance.safe);
  assert.strictEqual(E.checkRequest(s, 'P0', '4 0 0').status, 'waiting');
  assert.deepStrictEqual(s, P.avoidance.safe);
});

test('unsafe request is denied and state is intact', () => {
  const s = E.clone(P.avoidance.safe);
  const r = E.checkRequest(s, 'P0', '0 0 2');
  assert.strictEqual(r.status, 'unsafe');
  assert.strictEqual(r.safety.safe, false);
  assert.ok(!r.newState);
  assert.deepStrictEqual(s, P.avoidance.safe);
});

test('safe request is granted (textbook P1 requests 1 0 2)', () => {
  const r = E.checkRequest(P.avoidance.safe, 'P1', '1 0 2');
  assert.strictEqual(r.status, 'granted');
  assert.deepStrictEqual(r.newState.avail, [2, 3, 0]);
});

test('input validation', () => {
  const s = E.clone(P.avoidance.safe);
  s.alloc[0][0] = 8;
  assert.ok(E.validateState(s).length > 0);
  s.alloc[0][0] = NaN;
  assert.ok(E.validateState(s).length > 0);
  assert.strictEqual(E.checkRequest(P.avoidance.safe, 'P9', '0 0 0').status, 'invalid');
  assert.strictEqual(E.checkRequest(P.avoidance.safe, 'x', '0 0 0').status, 'invalid');
  assert.strictEqual(E.checkRequest(P.avoidance.safe, 'P1', '-1 0 0').status, 'invalid');
  assert.strictEqual(E.checkRequest(P.avoidance.safe, 'P1', '1 0').status, 'invalid');
  assert.strictEqual(E.checkRequest(P.avoidance.safe, 'P1', '1 a 0').status, 'invalid');
});

test('zero Available can still be safe', () => {
  assert.strictEqual(E.safety(P.avoidance.zero).safe, true);
});

test('detection: single-instance cycle is a deadlock', () => {
  const r = E.detect(P.detection.single);
  assert.strictEqual(r.model, 'single');
  assert.deepStrictEqual(r.deadlocked, [0, 1, 2]);
  assert.ok(r.cycle);
});

test('detection: multiple-instance cycle without deadlock', () => {
  const r = E.detect(P.detection.cycleOnly);
  assert.strictEqual(r.model, 'multiple');
  assert.ok(r.cycle);
  assert.strictEqual(r.deadlock, false);
});

test('detection: multiple-instance deadlock', () => {
  assert.deepStrictEqual(E.detect(P.detection.multi).deadlocked, [0, 1, 2]);
});

test('recovery releases resources and resolves deadlock', () => {
  const r = E.terminate(P.detection.single, 0);
  assert.deepStrictEqual(r.released, [1, 0, 0, 0]);
  assert.strictEqual(E.detect(r.state).deadlock, false);
});

test('prevention policies', () => {
  assert.strictEqual(E.simulate('none', P.prevention.procs).outcome, 'deadlock');
  assert.strictEqual(E.simulate('ordering', P.prevention.procs).outcome, 'completed');
  assert.strictEqual(E.simulate('allornothing', P.prevention.procs).outcome, 'completed');
});

test('all required cases pass', () => {
  const { rows, cases } = Cases.run();
  rows.forEach((r) => assert.ok(r.pass, r.id + ' failed'));
  cases.forEach((c) => assert.ok(c.pass, c.name + ' failed'));
});

/* Brute-force check: a granted request must always leave a safe state, and a state
   judged unsafe must really have no safe order (checked by trying all permutations). */
test('safety agrees with exhaustive permutation search', () => {
  const rnd = (n) => Math.floor(Math.random() * n);
  const perms = (a) => (a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  for (let k = 0; k < 300; k++) {
    const n = 2 + rnd(3), m = 1 + rnd(3);
    const max = Array.from({ length: n }, () => Array.from({ length: m }, () => rnd(5)));
    const alloc = max.map((row) => row.map((v) => rnd(v + 1)));
    const avail = Array.from({ length: m }, () => rnd(4));
    const s = { alloc, max, avail };
    const need = E.computeNeed(max, alloc);
    const ok = perms([...Array(n).keys()]).some((order) => {
      let w = avail.slice();
      return order.every((i) => {
        if (!need[i].every((v, j) => v <= w[j])) return false;
        w = w.map((v, j) => v + alloc[i][j]);
        return true;
      });
    });
    assert.strictEqual(E.safety(s).safe, ok);
  }
});

/* Write the analytical results table from the same outputs the dashboard shows. */
const { rows, cases } = Cases.run();
const cell = (v) => (Array.isArray(v) ? v.join('<br>') : v).replace(/\|/g, '\\|');
let md = '# Test Case Analysis\n\nActual results are produced by running the dashboard engine (`node tests/run_tests.js`).\n\n';
md += '| Test Case | System Condition | Actual Result | Expected Result | Analysis / Conclusion |\n|---|---|---|---|---|\n';
rows.forEach((r) => { md += `| ${r.id} | ${r.condition} | ${cell(r.actual)} | ${r.expected} | ${cell(r.conclusion)} |\n`; });
md += '\n## TC6 Breakdown\n\n| Case | Input | Dashboard Result | Class |\n|---|---|---|---|\n';
cases.forEach((c) => { md += `| ${c.name} | ${c.input} | ${cell(c.message)} | ${c.klass} |\n`; });
fs.writeFileSync(path.join(__dirname, '..', 'Test_Case_Analysis.md'), md);
console.log(`\n${count} test groups passed. Wrote Test_Case_Analysis.md`);
