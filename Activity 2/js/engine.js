/* Core algorithms: Banker's avoidance, deadlock detection, recovery, prevention simulation.
   Pure functions only (no DOM), so the same code runs in the dashboard and in tests. */
(function (root) {
  'use strict';

  const pName = (i) => 'P' + i;
  const rName = (j) => String.fromCharCode(65 + j);
  const vec = (v) => '(' + v.join(', ') + ')';
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const fits = (a, b) => a.every((x, i) => x <= b[i]);
  const isCount = (v) => Number.isInteger(v) && v >= 0;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- Need = Maximum − Allocation ---------- */
  function computeNeed(max, alloc) {
    return max.map((row, i) => row.map((v, j) => v - alloc[i][j]));
  }

  /* ---------- Input validation (returns a list of problems) ---------- */
  function checkMatrix(errors, label, mat) {
    mat.forEach((row, i) => row.forEach((v, j) => {
      if (!isCount(v)) {
        errors.push(`${label}[${pName(i)}][${rName(j)}] must be a non-negative whole number.`);
      }
    }));
  }

  function validateState(s) {
    const errors = [];
    if (s.alloc.length < 1 || s.avail.length < 1) {
      return ['At least one process and one resource type are required.'];
    }
    checkMatrix(errors, 'Allocation', s.alloc);
    checkMatrix(errors, 'Maximum', s.max);
    checkMatrix(errors, 'Available', [s.avail]);
    if (!errors.length) {
      s.alloc.forEach((row, i) => row.forEach((v, j) => {
        if (v > s.max[i][j]) {
          errors.push(`${pName(i)} holds ${v} of ${rName(j)} but its declared Maximum is ${s.max[i][j]}.`);
        }
      }));
    }
    return errors;
  }

  function validateDetection(d) {
    const errors = [];
    if (d.alloc.length < 1 || d.avail.length < 1) {
      return ['At least one process and one resource type are required.'];
    }
    checkMatrix(errors, 'Allocation', d.alloc);
    checkMatrix(errors, 'Request', d.request);
    checkMatrix(errors, 'Available', [d.avail]);
    return errors;
  }

  /* ---------- Banker's safety algorithm ---------- */
  function safety(s) {
    const need = computeNeed(s.max, s.alloc);
    const n = s.alloc.length;
    let work = s.avail.slice();
    const finish = Array(n).fill(false);
    const sequence = [];
    const steps = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (!finish[i] && fits(need[i], work)) {
          const before = work.slice();
          work = add(work, s.alloc[i]);
          finish[i] = true;
          sequence.push(i);
          steps.push({ process: i, need: need[i], before, after: work.slice() });
          progress = true;
        }
      }
    }
    const stuck = [];
    for (let i = 0; i < n; i++) if (!finish[i]) stuck.push({ process: i, need: need[i] });
    return { safe: sequence.length === n, sequence, steps, need, finalWork: work, stuck };
  }

  /* ---------- Request parsing ---------- */
  function parsePid(raw) {
    const m = /^p?(\d+)$/i.exec(String(raw).trim());
    return m ? Number(m[1]) : NaN;
  }

  function parseVector(raw) {
    if (Array.isArray(raw)) return raw;
    return String(raw).trim().split(/[\s,]+/).filter(Boolean)
      .map((t) => (/^[+-]?\d+$/.test(t) ? Number(t) : NaN));
  }

  /* ---------- Resource-request algorithm (avoidance) ----------
     status: invalid | waiting | unsafe | granted.  The input state is never modified;
     a granted request returns the updated state in newState. */
  function checkRequest(state, pidRaw, reqRaw) {
    const n = state.alloc.length;
    const m = state.avail.length;
    const checks = [
      { text: 'Request ≤ remaining Need', result: 'skipped' },
      { text: 'Request ≤ Available', result: 'skipped' },
      { text: 'State is safe after trial allocation', result: 'skipped' },
    ];
    const done = (status, message, extra) =>
      Object.assign({ status, message, checks, pid: null, request: null }, extra);

    const pid = parsePid(pidRaw);
    if (!(pid >= 0 && pid < n)) {
      return done('invalid', `"${String(pidRaw).trim()}" is not a valid process. Use P0 to P${n - 1}.`);
    }
    const req = parseVector(reqRaw);
    if (req.length !== m) {
      return done('invalid', `The request needs exactly ${m} values, one per resource type.`, { pid });
    }
    if (req.some((v) => !Number.isInteger(v))) {
      return done('invalid', 'Request values must be whole numbers.', { pid });
    }
    const neg = req.findIndex((v) => v < 0);
    if (neg >= 0) {
      return done('invalid', `Request for ${rName(neg)} is negative (${req[neg]}). Requests cannot be negative.`, { pid });
    }

    const need = computeNeed(state.max, state.alloc)[pid];
    const over = req.findIndex((v, j) => v > need[j]);
    if (over >= 0) {
      checks[0].result = 'fail';
      return done('invalid',
        `${pName(pid)} asks for ${req[over]} of ${rName(over)} but its remaining Need is ${need[over]}. ` +
        'The request exceeds its declared maximum claim.', { pid, request: req });
    }
    checks[0].result = 'pass';

    const short = req.findIndex((v, j) => v > state.avail[j]);
    if (short >= 0) {
      checks[1].result = 'fail';
      return done('waiting',
        `${pName(pid)} asks for ${req[short]} of ${rName(short)} but only ${state.avail[short]} is Available. ` +
        'The request cannot be granted immediately; the process must wait. The allocation state is unchanged.',
        { pid, request: req });
    }
    checks[1].result = 'pass';

    const trial = clone(state);
    trial.avail = sub(state.avail, req);
    trial.alloc[pid] = add(state.alloc[pid], req);
    const result = safety(trial);
    if (!result.safe) {
      checks[2].result = 'fail';
      return done('unsafe',
        `Granting this request would leave no complete safe sequence, so it is denied. ` +
        'The original allocation state is restored and retained.',
        { pid, request: req, trial, safety: result });
    }
    checks[2].result = 'pass';
    return done('granted',
      `Granting this request keeps the system safe. The allocation is updated.`,
      { pid, request: req, trial, safety: result, newState: trial });
  }

  /* ---------- Deadlock detection (multiple-instance matrix method) ---------- */
  function findCycle(d) {
    const n = d.alloc.length;
    const m = d.avail.length;
    const label = (k) => (k < n ? pName(k) : rName(k - n));
    const adj = Array.from({ length: n + m }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (d.request[i][j] > 0) adj[i].push(n + j);
        if (d.alloc[i][j] > 0) adj[n + j].push(i);
      }
    }
    const color = Array(n + m).fill(0);
    const stack = [];
    let found = null;
    const visit = (u) => {
      color[u] = 1;
      stack.push(u);
      for (const v of adj[u]) {
        if (found) return;
        if (color[v] === 1) {
          found = stack.slice(stack.indexOf(v)).concat(v).map(label);
          return;
        }
        if (color[v] === 0) visit(v);
      }
      stack.pop();
      color[u] = 2;
    };
    for (let u = 0; u < n && !found; u++) if (color[u] === 0) visit(u);
    return found;
  }

  function detect(d) {
    const n = d.alloc.length;
    const m = d.avail.length;
    let work = d.avail.slice();
    const finish = d.alloc.map((row) => row.every((v) => v === 0));
    const steps = [];
    const order = [];
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (!finish[i] && fits(d.request[i], work)) {
          const before = work.slice();
          work = add(work, d.alloc[i]);
          finish[i] = true;
          order.push(i);
          steps.push({ process: i, request: d.request[i], before, after: work.slice() });
          progress = true;
        }
      }
    }
    const deadlocked = [];
    for (let i = 0; i < n; i++) if (!finish[i]) deadlocked.push(i);
    const totals = d.avail.map((v, j) => v + d.alloc.reduce((acc, row) => acc + row[j], 0));
    return {
      deadlock: deadlocked.length > 0,
      deadlocked,
      steps,
      order,
      finalWork: work,
      totals,
      model: totals.every((t) => t === 1) ? 'single' : 'multiple',
      cycle: findCycle(d),
    };
  }

  /* ---------- Recovery: terminate one process and release its resources ---------- */
  function terminate(d, pid) {
    const next = clone(d);
    const released = d.alloc[pid].slice();
    next.avail = add(d.avail, released);
    next.alloc[pid] = released.map(() => 0);
    next.request[pid] = released.map(() => 0);
    return { state: next, released };
  }

  /* ---------- Prevention policies (single-instance resources, one tick per step) ----------
     policy: none | ordering | allornothing.  Each process has an ordered acquisition list. */
  function simulate(policy, procs) {
    const m = Math.max(0, ...procs.flatMap((p) => p.order)) + 1;
    const holder = Array(m).fill(null);
    const script = procs.map((p) => (policy === 'ordering' ? p.order.slice().sort((a, b) => a - b) : p.order.slice()));
    const adjusted = procs.filter((p, i) => p.order.join() !== script[i].join()).map((p) => p.name);
    const held = procs.map(() => []);
    const done = procs.map(() => false);
    const timeline = [];
    const finishOrder = [];
    let waits = 0;
    let outcome = 'running';
    let t = 0;

    const release = (i) => { held[i].forEach((r) => { holder[r] = null; }); };

    while (outcome === 'running' && t < 100) {
      t++;
      const row = [];
      let progress = false;
      procs.forEach((p, i) => {
        if (done[i]) { row.push('done'); return; }
        if (held[i].length === script[i].length) {
          release(i);
          done[i] = true;
          finishOrder.push(p.name);
          progress = true;
          row.push('run and release');
          return;
        }
        if (policy === 'allornothing') {
          if (script[i].every((r) => holder[r] === null)) {
            script[i].forEach((r) => { holder[r] = i; held[i].push(r); });
            progress = true;
            row.push('acquire ' + script[i].map(rName).join(' + '));
          } else {
            waits++;
            row.push('wait (needs all of ' + script[i].map(rName).join(', ') + ')');
          }
          return;
        }
        const r = script[i][held[i].length];
        if (holder[r] === null) {
          holder[r] = i;
          held[i].push(r);
          progress = true;
          row.push('acquire ' + rName(r));
        } else {
          waits++;
          row.push(`wait for ${rName(r)} (held by ${procs[holder[r]].name})`);
        }
      });
      timeline.push(row);
      if (done.every(Boolean)) outcome = 'completed';
      else if (!progress) outcome = 'deadlock';
    }
    const blocked = procs.filter((p, i) => !done[i]).map((p) => p.name);
    return { policy, outcome, ticks: t, waits, timeline, finishOrder, blocked, adjusted };
  }

  const Engine = {
    pName, rName, vec, clone,
    computeNeed, validateState, validateDetection, safety,
    parsePid, parseVector, checkRequest,
    detect, findCycle, terminate, simulate,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof self !== 'undefined' ? self : this);
