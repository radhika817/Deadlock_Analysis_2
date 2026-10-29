/* =============================================================================
   Core Algorithms: Banker's Avoidance, Deadlock Detection, Recovery, & Prevention
   =============================================================================
   Pure functions only (no DOM dependencies), allowing this exact engine to run
   both inside browser web dashboards and automated Node.js test suites.
   ============================================================================= */
(function (root) {
  'use strict';

  /* ===========================================================================
     1. HELPER UTILITIES
     =========================================================================== */
  // Format process index into standard notation, e.g., 0 -> "P0"
  const pName = (i) => 'P' + i;

  // Format resource index into alphabet character, e.g., 0 -> "A", 1 -> "B", 2 -> "C"
  const rName = (j) => String.fromCharCode(65 + j);

  // Pretty-print a numerical vector as a tuple string, e.g., [1, 0, 2] -> "(1, 0, 2)"
  const vec = (v) => '(' + v.join(', ') + ')';

  // Vector addition: a + b element-wise (used when resources are reclaimed/returned)
  const add = (a, b) => a.map((x, i) => x + b[i]);

  // Vector subtraction: a - b element-wise (used when resources are allocated)
  const sub = (a, b) => a.map((x, i) => x - b[i]);

  // Vector comparison: returns true if every element of vector 'a' <= vector 'b' (e.g., Need <= Work)
  const fits = (a, b) => a.every((x, i) => x <= b[i]);

  // Validate that a resource quantity is a non-negative integer
  const isCount = (v) => Number.isInteger(v) && v >= 0;

  // Deep clone a data structure to avoid mutating state unexpectedly
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ===========================================================================
     2. MATRIX CALCULATIONS: Need = Maximum − Allocation
     ===========================================================================
     Computes the remaining resources each process may still request.
     Need[i][j] = Max[i][j] - Allocation[i][j]
     =========================================================================== */
  function computeNeed(max, alloc) {
    return max.map((row, i) => row.map((v, j) => v - alloc[i][j]));
  }

  /* ===========================================================================
     3. INPUT VALIDATION
     ===========================================================================
     Checks that inputs adhere to OS constraints before running algorithms.
     =========================================================================== */
  // Helper to ensure all matrix cells are valid non-negative whole numbers
  function checkMatrix(errors, label, mat) {
    mat.forEach((row, i) => row.forEach((v, j) => {
      if (!isCount(v)) {
        errors.push(`${label}[${pName(i)}][${rName(j)}] must be a non-negative whole number.`);
      }
    }));
  }

  // Validates Banker's Algorithm state (Allocation, Maximum, and Available vectors)
  function validateState(s) {
    const errors = [];
    if (s.alloc.length < 1 || s.avail.length < 1) {
      return ['At least one process and one resource type are required.'];
    }
    checkMatrix(errors, 'Allocation', s.alloc);
    checkMatrix(errors, 'Maximum', s.max);
    checkMatrix(errors, 'Available', [s.avail]);
    if (!errors.length) {
      // Rule: Current Allocation cannot exceed the declared Maximum claim
      s.alloc.forEach((row, i) => row.forEach((v, j) => {
        if (v > s.max[i][j]) {
          errors.push(`${pName(i)} holds ${v} of ${rName(j)} but its declared Maximum is ${s.max[i][j]}.`);
        }
      }));
    }
    return errors;
  }

  // Validates Deadlock Detection state (Allocation, Request, and Available vectors)
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

  /* ===========================================================================
     4. BANKER'S SAFETY ALGORITHM
     ===========================================================================
     Determines if the system is in a "Safe State".
     A safe state guarantees there exists at least one order (safe sequence)
     in which all processes can finish without entering a deadlock.

     Data structures:
       - Work: vector of length m, initialized to Available
       - Finish: boolean array of length n, initialized to false
     Loop:
       Find process i such that Finish[i] == false and Need[i] <= Work.
       If found:
         Work = Work + Allocation[i] (process finishes and releases resources)
         Finish[i] = true
       Repeat until no such process exists.
     Safe condition:
       If all processes finished (Finish[i] == true for all i), state is safe.
     =========================================================================== */
  function safety(s) {
    // 1. Calculate remaining Need matrix
    const need = computeNeed(s.max, s.alloc);
    const n = s.alloc.length;

    // 2. Initialize Work = Available and Finish[i] = false
    let work = s.avail.slice();
    const finish = Array(n).fill(false);
    const sequence = [];
    const steps = [];
    let progress = true;

    // 3. Iteratively look for a process whose Need can be satisfied with current Work
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (!finish[i] && fits(need[i], work)) {
          const before = work.slice();
          // Process can complete: reclaim its allocated resources into Work
          work = add(work, s.alloc[i]);
          finish[i] = true;
          sequence.push(i);
          steps.push({ process: i, need: need[i], before, after: work.slice() });
          progress = true; // Made progress, continue scanning
        }
      }
    }

    // 4. Identify any processes that could not finish (deadlocked/stuck)
    const stuck = [];
    for (let i = 0; i < n; i++) if (!finish[i]) stuck.push({ process: i, need: need[i] });

    // Safe if and only if sequence contains every process
    return { safe: sequence.length === n, sequence, steps, need, finalWork: work, stuck };
  }

  /* ===========================================================================
     5. RESOURCE REQUEST PARSING
     =========================================================================== */
  // Extracts process ID from string, accepting formats like "0", "P0", or "p1"
  function parsePid(raw) {
    const m = /^p?(\d+)$/i.exec(String(raw).trim());
    return m ? Number(m[1]) : NaN;
  }

  // Parses vector input separated by spaces or commas into an array of integers
  function parseVector(raw) {
    if (Array.isArray(raw)) return raw;
    return String(raw).trim().split(/[\s,]+/).filter(Boolean)
      .map((t) => (/^[+-]?\d+$/.test(t) ? Number(t) : NaN));
  }

  /* ===========================================================================
     6. BANKER'S RESOURCE-REQUEST ALGORITHM (Deadlock Avoidance)
     ===========================================================================
     Evaluates an incoming request from process Pi:
       Step 1: Check if Request[i] <= Need[i] (Cannot request more than claimed Max)
       Step 2: Check if Request[i] <= Available (Cannot request more than physically free)
       Step 3: Pretend to allocate resources (Trial State):
                 Available' = Available - Request[i]
                 Allocation'[i] = Allocation[i] + Request[i]
                 Need'[i] = Need[i] - Request[i]
       Step 4: Run Safety Algorithm on trial state:
                 - If Safe: Grant request and commit new state.
                 - If Unsafe: Deny request, roll back trial allocation, Pi waits.
     Note: Original state is never mutated directly.
     =========================================================================== */
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

    // Validate process ID
    const pid = parsePid(pidRaw);
    if (!(pid >= 0 && pid < n)) {
      return done('invalid', `"${String(pidRaw).trim()}" is not a valid process. Use P0 to P${n - 1}.`);
    }

    // Validate request vector dimensions & format
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

    // Condition 1: Request <= Need
    const need = computeNeed(state.max, state.alloc)[pid];
    const over = req.findIndex((v, j) => v > need[j]);
    if (over >= 0) {
      checks[0].result = 'fail';
      return done('invalid',
        `${pName(pid)} asks for ${req[over]} of ${rName(over)} but its remaining Need is ${need[over]}. ` +
        'The request exceeds its declared maximum claim.', { pid, request: req });
    }
    checks[0].result = 'pass';

    // Condition 2: Request <= Available
    const short = req.findIndex((v, j) => v > state.avail[j]);
    if (short >= 0) {
      checks[1].result = 'fail';
      return done('waiting',
        `${pName(pid)} asks for ${req[short]} of ${rName(short)} but only ${state.avail[short]} is Available. ` +
        'The request cannot be granted immediately; the process must wait. The allocation state is unchanged.',
        { pid, request: req });
    }
    checks[1].result = 'pass';

    // Condition 3: Safety check on speculative trial state
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

  /* ===========================================================================
     7. RESOURCE ALLOCATION GRAPH (RAG) CYCLE DETECTION
     ===========================================================================
     Detects circular wait dependencies using Depth-First Search (DFS) graph coloring:
       Color 0: Unvisited
       Color 1: Currently visiting (active on recursion stack)
       Color 2: Completely visited
     In single-instance resource systems: A cycle == Deadlock.
     In multiple-instance systems: A cycle is a necessary condition, but not sufficient.
     =========================================================================== */
  function findCycle(d) {
    const n = d.alloc.length;
    const m = d.avail.length;
    const label = (k) => (k < n ? pName(k) : rName(k - n));

    // Construct adjacency list for bipartite graph: Process nodes [0..n-1], Resource nodes [n..n+m-1]
    const adj = Array.from({ length: n + m }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        // Request edge: Process i -> Resource j (wants resource)
        if (d.request[i][j] > 0) adj[i].push(n + j);
        // Assignment edge: Resource j -> Process i (holds resource)
        if (d.alloc[i][j] > 0) adj[n + j].push(i);
      }
    }

    const color = Array(n + m).fill(0);
    const stack = [];
    let found = null;

    // DFS traversal to find back-edges (cycles)
    const visit = (u) => {
      color[u] = 1;
      stack.push(u);
      for (const v of adj[u]) {
        if (found) return;
        if (color[v] === 1) {
          // Back-edge found: reconstruct cycle path from stack
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

  /* ===========================================================================
     8. DEADLOCK DETECTION ALGORITHM (Multiple-Instance Resource Reduction)
     ===========================================================================
     Applies reduction algorithm (Silberschatz / Galvin):
       1. Work = Available
       2. For i = 0..n-1:
            If Allocation[i] != 0, Finish[i] = false
            Else Finish[i] = true (processes holding no resources cannot cause deadlock)
       3. Find index i such that:
            Finish[i] == false AND Request[i] <= Work
          If found:
            Work = Work + Allocation[i]
            Finish[i] = true
            Repeat step 3.
       4. If Finish[i] == false for some i, then process Pi is DEADLOCKED.
     =========================================================================== */
  function detect(d) {
    const n = d.alloc.length;
    const m = d.avail.length;
    let work = d.avail.slice();

    // Processes holding 0 resources initially are marked as finished
    const finish = d.alloc.map((row) => row.every((v) => v === 0));
    const steps = [];
    const order = [];
    let progress = true;

    // Reduce graph: satisfy requests of processes that can be accommodated
    while (progress) {
      progress = false;
      for (let i = 0; i < n; i++) {
        if (!finish[i] && fits(d.request[i], work)) {
          const before = work.slice();
          // Process can complete and release held resources
          work = add(work, d.alloc[i]);
          finish[i] = true;
          order.push(i);
          steps.push({ process: i, request: d.request[i], before, after: work.slice() });
          progress = true;
        }
      }
    }

    // Processes with Finish[i] == false are deadlocked
    const deadlocked = [];
    for (let i = 0; i < n; i++) if (!finish[i]) deadlocked.push(i);

    // Compute total system resource instances (Available + sum of Allocation)
    const totals = d.avail.map((v, j) => v + d.alloc.reduce((acc, row) => acc + row[j], 0));

    return {
      deadlock: deadlocked.length > 0,
      deadlocked,
      steps,
      order,
      finalWork: work,
      totals,
      // If every resource has total 1 instance, it's single-instance model, else multiple-instance
      model: totals.every((t) => t === 1) ? 'single' : 'multiple',
      cycle: findCycle(d),
    };
  }

  /* ===========================================================================
     9. DEADLOCK RECOVERY: Process Termination
     ===========================================================================
     Aborts a specified process (pid), reclaiming all its allocated resources back
     to Available and clearing its pending requests.
     =========================================================================== */
  function terminate(d, pid) {
    const next = clone(d);
    const released = d.alloc[pid].slice();
    // Return released resources to Available pool
    next.avail = add(d.avail, released);
    // Reset process's allocations and requests to zero
    next.alloc[pid] = released.map(() => 0);
    next.request[pid] = released.map(() => 0);
    return { state: next, released };
  }

  /* ===========================================================================
     10. DEADLOCK PREVENTION POLICIES SIMULATION
     ===========================================================================
     Simulates discrete execution ticks to demonstrate how Coffman conditions are prevented:
       - 'none': Baseline (unrestricted hold-and-wait + arbitrary order -> prone to deadlock)
       - 'ordering': Eliminates Circular Wait by enforcing global resource hierarchy
                    (acquires resources in strictly increasing index order)
       - 'allornothing': Eliminates Hold-and-Wait condition
                        (must acquire all required resources simultaneously, or none)
     =========================================================================== */
  function simulate(policy, procs) {
    // Determine maximum resource ID used across all processes
    const m = Math.max(0, ...procs.flatMap((p) => p.order)) + 1;
    // holder[r] = index of process holding resource r (null if free)
    const holder = Array(m).fill(null);

    // If policy is 'ordering', enforce strictly ascending acquisition order (eliminates circular wait)
    const script = procs.map((p) => (policy === 'ordering' ? p.order.slice().sort((a, b) => a - b) : p.order.slice()));
    const adjusted = procs.filter((p, i) => p.order.join() !== script[i].join()).map((p) => p.name);

    const held = procs.map(() => []);      // Resources currently held by process i
    const done = procs.map(() => false);   // Completion flag for process i
    const timeline = [];                   // Tick-by-tick trace log for UI display
    const finishOrder = [];
    let waits = 0;
    let outcome = 'running';
    let t = 0;

    // Helper: releases all resources held by process i
    const release = (i) => { held[i].forEach((r) => { holder[r] = null; }); };

    // Discrete event simulation loop (capped at 100 ticks to guard against infinite loops)
    while (outcome === 'running' && t < 100) {
      t++;
      const row = [];
      let progress = false;

      procs.forEach((p, i) => {
        // If already completed, nothing to do
        if (done[i]) { row.push('done'); return; }

        // Process has acquired all resources it needed: run and release them
        if (held[i].length === script[i].length) {
          release(i);
          done[i] = true;
          finishOrder.push(p.name);
          progress = true;
          row.push('run and release');
          return;
        }

        // --- Policy: All-or-Nothing (Eliminates Hold-and-Wait) ---
        if (policy === 'allornothing') {
          // Check if ALL required resources are simultaneously free
          if (script[i].every((r) => holder[r] === null)) {
            script[i].forEach((r) => { holder[r] = i; held[i].push(r); });
            progress = true;
            row.push('acquire ' + script[i].map(rName).join(' + '));
          } else {
            // Cannot acquire everything at once: hold nothing and wait
            waits++;
            row.push('wait (needs all of ' + script[i].map(rName).join(', ') + ')');
          }
          return;
        }

        // --- Baseline or Hierarchical Ordering Policy ---
        // Request the next resource in its acquisition script
        const r = script[i][held[i].length];
        if (holder[r] === null) {
          // Resource is free: acquire it
          holder[r] = i;
          held[i].push(r);
          progress = true;
          row.push('acquire ' + rName(r));
        } else {
          // Resource is held by another process: wait
          waits++;
          row.push(`wait for ${rName(r)} (held by ${procs[holder[r]].name})`);
        }
      });

      timeline.push(row);

      // Check termination conditions
      if (done.every(Boolean)) outcome = 'completed';
      else if (!progress) outcome = 'deadlock'; // No process made progress -> system deadlocked
    }

    const blocked = procs.filter((p, i) => !done[i]).map((p) => p.name);
    return { policy, outcome, ticks: t, waits, timeline, finishOrder, blocked, adjusted };
  }

  /* ===========================================================================
     11. MODULE EXPORT
     =========================================================================== */
  const Engine = {
    pName, rName, vec, clone,
    computeNeed, validateState, validateDetection, safety,
    parsePid, parseVector, checkRequest,
    detect, findCycle, terminate, simulate,
  };

  // Support both Node.js CommonJS exports (for tests) and browser window/root export
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof self !== 'undefined' ? self : this);
