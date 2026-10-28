/* Test cases TC1–TC6. Every "actual" value is produced by running the engine,
   so the dashboard table and the written report come from the same outputs. */
(function (root) {
  'use strict';

  const E = typeof require !== 'undefined' ? require('./engine.js') : root.Engine;
  const P = typeof require !== 'undefined' ? require('./presets.js') : root.Presets;

  const seq = (list) => list.map(E.pName).join(' → ');
  const names = (list) => list.join(', ');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function run() {
    const base = P.avoidance.safe;
    const rows = [];

    /* TC1: safe state */
    const s1 = E.safety(base);
    rows.push({
      id: 'TC1',
      condition: 'Safe state',
      actual: s1.safe ? 'Safe. Safe sequence: ' + seq(s1.sequence) : 'Unsafe',
      expected: 'Safe sequence found',
      conclusion: 'Each process in the sequence has Need ≤ Work when its turn comes, and Work grows by its Allocation ' +
        'afterwards. All five processes can finish, so the state is safe.',
      pass: s1.safe,
      status: s1.safe ? 'safe' : 'unsafe',
    });

    /* TC2: request exceeds Available */
    const before2 = E.clone(base);
    const r2 = E.checkRequest(base, P.requests.waiting.pid, P.requests.waiting.req);
    const kept2 = same(before2, base);
    rows.push({
      id: 'TC2',
      condition: 'Request exceeds Available',
      actual: `${P.requests.waiting.pid} requests (${P.requests.waiting.req.split(' ').join(', ')}): ` +
        `${r2.status === 'waiting' ? 'Waiting (not granted immediately)' : r2.status}. ` +
        `Allocation state unchanged: ${kept2 ? 'yes' : 'no'}.`,
      expected: 'Request not granted immediately',
      conclusion: 'The request is within P0\'s Need (7, 4, 3) but A is requested as 4 while only 3 is Available. ' +
        'It is deferred, not invalid: it can be granted later when other processes release resources.',
      pass: r2.status === 'waiting' && kept2,
      status: 'waiting',
    });

    /* TC3: request makes state unsafe */
    const before3 = E.clone(base);
    const r3 = E.checkRequest(base, P.requests.unsafe.pid, P.requests.unsafe.req);
    const kept3 = same(before3, base);
    const stuck3 = r3.safety ? r3.safety.stuck.map((x) => E.pName(x.process)) : [];
    rows.push({
      id: 'TC3',
      condition: 'Request makes state unsafe',
      actual: `${P.requests.unsafe.pid} requests (${P.requests.unsafe.req.split(' ').join(', ')}): ` +
        `${r3.status === 'unsafe' ? 'Denied (unsafe)' : r3.status}. ` +
        `After the trial allocation no process can finish (${names(stuck3)} remain). ` +
        `Original state restored: ${kept3 ? 'yes' : 'no'}.`,
      expected: 'Request denied; state unchanged',
      conclusion: 'The request fits both Need and Available, so the safety algorithm ran on the trial state and found ' +
        'no complete safe sequence. Unsafe is not deadlock: nothing is blocked yet, but safety can no longer be guaranteed.',
      pass: r3.status === 'unsafe' && kept3,
      status: 'unsafe',
    });

    /* TC4: deadlock detection */
    const dSingle = E.detect(P.detection.single);
    const dCycle = E.detect(P.detection.cycleOnly);
    const dMulti = E.detect(P.detection.multi);
    const rec = E.terminate(P.detection.single, 0);
    const dRec = E.detect(rec.state);
    rows.push({
      id: 'TC4',
      condition: 'Deadlocked scenario',
      actual: [
        `Single-instance: deadlock among ${names(dSingle.deadlocked.map(E.pName))}; circular wait ${dSingle.cycle ? dSingle.cycle.join(' → ') : 'none'}.`,
        `Multiple-instance (cycle only): cycle ${dCycle.cycle ? dCycle.cycle.join(' → ') : 'none'} exists, ` +
          `deadlock: ${dCycle.deadlock ? 'yes' : 'no'}.`,
        `Multiple-instance (confirmed): deadlock among ${names(dMulti.deadlocked.map(E.pName))}.`,
        `Recovery: terminate P0, release ${E.vec(rec.released)}; deadlock afterwards: ${dRec.deadlock ? 'yes' : 'no'}.`,
      ],
      expected: 'Deadlock identified by the selected detection method',
      conclusion: 'With single-instance resources a cycle is conclusive. With multiple instances a cycle is only a ' +
        'potential circular wait; the matrix detection algorithm decides. Terminating P0 releases A, which lets P2 and then P1 finish.',
      pass: same(dSingle.deadlocked, [0, 1, 2]) && !dCycle.deadlock && !!dCycle.cycle &&
        same(dMulti.deadlocked, [0, 1, 2]) && !dRec.deadlock,
      status: 'deadlock',
    });

    /* TC5: prevention */
    const none = E.simulate('none', P.prevention.procs);
    const ord = E.simulate('ordering', P.prevention.procs);
    const aon = E.simulate('allornothing', P.prevention.procs);
    const line = (label, r) => r.outcome === 'deadlock'
      ? `${label}: deadlock after tick ${r.ticks} (${names(r.blocked)} blocked).`
      : `${label}: all processes complete in ${r.ticks} ticks with ${r.waits} waiting tick${r.waits === 1 ? '' : 's'}.`;
    rows.push({
      id: 'TC5',
      condition: 'Prevention policy applied',
      actual: [
        line('No policy', none),
        line('Resource ordering', ord) + (ord.adjusted.length ? ` ${names(ord.adjusted)} must acquire in order.` : ''),
        line('All-or-nothing', aon),
      ],
      expected: 'Selected deadlock condition eliminated',
      conclusion: 'Ordering removes circular wait: nobody can hold a higher resource while waiting for a lower one. ' +
        'All-or-nothing removes hold and wait: a process holds nothing while it waits. ' +
        'The cost is lower concurrency (P2 waits for P1) and, for all-or-nothing, resources held for the whole run.',
      pass: none.outcome === 'deadlock' && ord.outcome === 'completed' && aon.outcome === 'completed',
      status: 'safe',
    });

    /* TC6: boundary and invalid inputs */
    const zero = P.avoidance.zero;
    const zs = E.safety(zero);
    const bigAlloc = E.clone(base);
    bigAlloc.alloc[0][0] = 8;
    const e6 = E.validateState(bigAlloc);
    const cases = [];
    const pushReq = (name, input, state, pidRaw, reqRaw, expectStatus, klass) => {
      const r = E.checkRequest(state, pidRaw, reqRaw);
      cases.push({ name, input, result: r.status, message: r.message, klass, pass: r.status === expectStatus });
    };
    cases.push({
      name: 'Zero Available resources',
      input: 'Available = (0, 0); P0 already holds its full Maximum',
      result: zs.safe ? 'safe' : 'unsafe',
      message: zs.safe ? 'Safe sequence ' + seq(zs.sequence) + '. P0 needs nothing more, finishes first and releases its resources.' : 'No safe sequence.',
      klass: 'Valid boundary case',
      pass: zs.safe,
    });
    pushReq('Zero remaining Need, zero request', 'P0 requests (0, 0)', zero, 'P0', '0 0', 'granted', 'Valid boundary case');
    pushReq('Zero remaining Need, positive request', 'P0 requests (1, 0)', zero, 'P0', '1 0', 'invalid', 'Invalid input');
    pushReq('Invalid process identifier', 'P9 requests (1, 0, 0)', base, 'P9', '1 0 0', 'invalid', 'Invalid input');
    pushReq('Negative request', 'P1 requests (−1, 0, 0)', base, 'P1', '-1 0 0', 'invalid', 'Invalid input');
    pushReq('Wrong vector length', 'P1 requests (1, 0)', base, 'P1', '1 0', 'invalid', 'Invalid input');
    cases.push({
      name: 'Allocation exceeds Maximum',
      input: 'P0 allocated 8 of A, declared Maximum 7',
      result: e6.length ? 'invalid' : 'safe',
      message: e6[0] || 'Accepted',
      klass: 'Invalid input',
      pass: e6.length > 0,
    });
    rows.push({
      id: 'TC6',
      condition: 'Boundary and invalid inputs',
      actual: cases.map((c) => `${c.name}: ${c.result === 'granted' ? 'granted (no change)' : c.result}`),
      expected: 'Correct handling or validation message',
      conclusion: 'Zero Available and zero requests are legal states and are processed normally. Negative values, unknown ' +
        'processes, wrong sizes, requests beyond Need and allocations beyond Maximum are rejected as invalid input before the algorithm runs.',
      pass: cases.every((c) => c.pass),
      status: 'invalid',
    });

    return { rows, cases };
  }

  const Cases = { run };
  if (typeof module !== 'undefined' && module.exports) module.exports = Cases;
  else root.Cases = Cases;
})(typeof self !== 'undefined' ? self : this);
