/* Dashboard UI. All algorithm decisions come from Engine; this file only reads inputs and renders results. */
(function () {
  'use strict';

  const E = window.Engine;
  const P = window.Presets;
  const { pName, rName, vec, clone } = E;
  const $ = (id) => document.getElementById(id);

  /* ---------- DOM helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === false || v == null) return;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    kids.forEach((c) => el.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return el;
  }

  const KINDS = {
    safe: { icon: '✓', cls: 'safe' },
    unsafe: { icon: '!', cls: 'unsafe' },
    waiting: { icon: '…', cls: 'waiting' },
    deadlock: { icon: '✕', cls: 'deadlock' },
    invalid: { icon: '?', cls: 'invalid' },
  };

  function statusPanel(kind, title, message) {
    const k = KINDS[kind];
    return h('div', { class: 'status status-' + k.cls },
      h('div', { class: 'icon', 'aria-hidden': 'true' }, h('span', {}, k.icon)),
      h('div', {}, h('h4', {}, title), message ? h('p', {}, message) : null));
  }

  const badge = (kind, text) => h('span', { class: 'badge badge-' + KINDS[kind].cls }, text);
  const vecCell = (v) => h('td', { class: 'vec' }, vec(v));
  const list = (names) => names.map(pName).join(', ');
  const arrow = (names) => names.map(pName).join(' → ');
  const card = (...kids) => h('div', { class: 'card' }, ...kids);
  const scroll = (table) => h('div', { class: 'table-scroll' }, table);

  function dataTable(caption, headers, rows) {
    return scroll(h('table', { class: 'data' },
      caption ? h('caption', {}, caption) : null,
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rows)));
  }

  function invalidPanel(errors) {
    return h('div', {},
      statusPanel('invalid', 'Invalid input', 'Fix the following before running the algorithm:'),
      h('ul', {}, errors.slice(0, 8).map((e) => h('li', {}, e)),
        errors.length > 8 ? h('li', {}, `and ${errors.length - 8} more.`) : null));
  }

  /* ---------- Editable matrices ---------- */
  function parseCell(text) {
    const t = String(text).trim();
    return /^[+-]?\d+$/.test(t) ? Number(t) : NaN;
  }

  function matrixTable({ title, rows, cols, values, rowLabel, readonly }) {
    const inputs = [];
    const body = h('tbody', {});
    for (let i = 0; i < rows; i++) {
      const tr = h('tr', {}, h('th', { scope: 'row' }, rowLabel(i)));
      inputs[i] = [];
      for (let j = 0; j < cols; j++) {
        const input = h('input', {
          type: 'text', inputmode: 'numeric', class: 'cell', autocomplete: 'off',
          value: values[i][j], readonly,
          'aria-label': `${title} ${rowLabel(i)} ${rName(j)}`.replace(/\s+/g, ' '),
        });
        inputs[i][j] = input;
        tr.append(h('td', {}, input));
      }
      body.append(tr);
    }
    const head = h('tr', {}, h('th', {}), Array.from({ length: cols }, (_, j) => h('th', { scope: 'col' }, rName(j))));
    const table = h('table', { class: 'matrix' }, h('caption', {}, title), h('thead', {}, head), body);
    table.inputs = inputs;
    return table;
  }

  const rawOf = (t) => t.inputs.map((r) => r.map((i) => i.value));
  const numsOf = (t) => t.inputs.map((r) => r.map((i) => parseCell(i.value)));

  function resize(raw, n, m) {
    return Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => (raw[i] && raw[i][j] != null ? raw[i][j] : '0')));
  }

  function readSize(nId, mId) {
    const n = parseCell($(nId).value);
    const m = parseCell($(mId).value);
    if (!(n >= 1 && n <= 10 && m >= 1 && m <= 6)) return null;
    return { n, m };
  }

  /* ---------- Safety / request views ---------- */
  function safetyReport(res, state) {
    const out = [];
    const total = state.avail.map((v, j) => v + state.alloc.reduce((a, r) => a + r[j], 0));
    if (res.safe) {
      out.push(statusPanel('safe', 'Safe state',
        'Every process can finish in the order below, so the system is not at risk of deadlock if processes request within their declared maximum.'));
      out.push(h('p', { class: 'sequence' }, 'Safe sequence: ', h('span', {}, arrow(res.sequence))));
    } else {
      out.push(statusPanel('unsafe', 'Unsafe state',
        'No complete safe sequence exists. This does not mean a deadlock has occurred; it means safety cannot be guaranteed.'));
      if (res.sequence.length) {
        out.push(h('p', { class: 'sequence' }, 'Processes that can still finish: ', h('span', {}, arrow(res.sequence))));
      }
    }
    if (res.steps.length) {
      out.push(dataTable('Work vector updates', ['Step', 'Process', 'Need', 'Work before', 'Allocation returned', 'Work after'],
        res.steps.map((st, k) => h('tr', {},
          h('td', { class: 'num' }, k + 1),
          h('td', {}, pName(st.process)),
          vecCell(st.need),
          vecCell(st.before),
          vecCell(state.alloc[st.process]),
          vecCell(st.after)))));
    }
    if (res.safe) {
      const first = res.steps[0];
      out.push(h('p', { class: 'note', style: 'margin-top:0.75rem' },
        `Work starts at Available ${vec(state.avail)}. ${pName(first.process)} goes first because its Need ${vec(first.need)} fits within Work. ` +
        `Each finished process returns its Allocation, and Work ends at ${vec(res.finalWork)}, the total of all resources ${vec(total)}.`));
    } else {
      out.push(h('div', { style: 'margin-top:1rem' },
        dataTable(`Processes that cannot finish (Work = ${vec(res.finalWork)})`, ['Process', 'Need', 'Blocked on'],
          res.stuck.map((x) => h('tr', {},
            h('td', {}, pName(x.process)),
            vecCell(x.need),
            h('td', {}, x.need.map((v, j) => (v > res.finalWork[j] ? `${rName(j)} (needs ${v}, Work ${res.finalWork[j]})` : null)).filter(Boolean).join('; ')))))));
    }
    return h('div', { class: 'card' }, out);
  }

  /* ---------- Avoidance tab ---------- */
  const av = {};

  function buildAvoid(state) {
    const n = state.alloc.length;
    const m = state.avail.length;
    $('avoid-n').value = n;
    $('avoid-m').value = m;
    const label = (i) => pName(i);
    av.alloc = matrixTable({ title: 'Allocation', rows: n, cols: m, values: state.alloc, rowLabel: label });
    av.max = matrixTable({ title: 'Maximum', rows: n, cols: m, values: state.max, rowLabel: label });
    av.need = matrixTable({ title: 'Need (Maximum − Allocation)', rows: n, cols: m, values: resize([], n, m), rowLabel: label, readonly: true });
    av.avail = matrixTable({ title: 'Available', rows: 1, cols: m, values: [state.avail], rowLabel: () => '' });
    $('avoid-matrices').replaceChildren(av.alloc, av.max, av.need, av.avail);
    updateNeed();
  }

  function updateNeed() {
    const a = numsOf(av.alloc);
    const mx = numsOf(av.max);
    av.need.inputs.forEach((row, i) => row.forEach((cell, j) => {
      const ok = Number.isFinite(a[i][j]) && Number.isFinite(mx[i][j]);
      cell.value = ok ? mx[i][j] - a[i][j] : '–';
      cell.classList.toggle('bad', ok && mx[i][j] - a[i][j] < 0);
    }));
  }

  const readAvoid = () => ({ alloc: numsOf(av.alloc), max: numsOf(av.max), avail: numsOf(av.avail)[0] });
  const snapshot = () => JSON.stringify([rawOf(av.alloc), rawOf(av.max), rawOf(av.avail)]);

  function runSafety() {
    const state = readAvoid();
    const errors = E.validateState(state);
    $('avoid-safety').replaceChildren(errors.length ? card(invalidPanel(errors)) : safetyReport(E.safety(state), state));
  }

  function loadAvoidPreset() {
    buildAvoid(P.avoidance[$('avoid-preset').value]);
    $('avoid-request').replaceChildren();
    runSafety();
  }

  function applyAvoidSize() {
    const size = readSize('avoid-n', 'avoid-m');
    if (!size) {
      $('avoid-safety').replaceChildren(card(invalidPanel(['Processes must be 1 to 10 and resource types 1 to 6.'])));
      return;
    }
    buildAvoid({
      alloc: resize(rawOf(av.alloc), size.n, size.m),
      max: resize(rawOf(av.max), size.n, size.m),
      avail: resize([rawOf(av.avail)[0]], 1, size.m)[0],
    });
    $('avoid-request').replaceChildren();
    runSafety();
  }

  function submitRequest(ev) {
    ev.preventDefault();
    const state = readAvoid();
    const errors = E.validateState(state);
    const target = $('avoid-request');
    if (errors.length) { target.replaceChildren(card(invalidPanel(errors))); return; }

    const pidRaw = $('req-pid').value;
    const reqRaw = $('req-vec').value;
    const before = snapshot();
    const res = E.checkRequest(state, pidRaw, reqRaw);
    const unchanged = before === snapshot();
    const out = [];

    const titles = {
      invalid: 'Invalid input',
      waiting: 'Waiting: cannot be granted immediately',
      unsafe: 'Unsafe: request denied',
      granted: 'Request granted: state remains safe',
    };
    out.push(statusPanel(res.status === 'granted' ? 'safe' : res.status, titles[res.status], res.message));

    if (res.pid != null && res.request) {
      const need = E.computeNeed(state.max, state.alloc)[res.pid];
      out.push(h('dl', { class: 'facts' },
        h('dt', {}, 'Process'), h('dd', {}, pName(res.pid)),
        h('dt', {}, 'Request'), h('dd', {}, vec(res.request)),
        h('dt', {}, 'Remaining Need'), h('dd', {}, vec(need)),
        h('dt', {}, 'Available'), h('dd', {}, vec(state.avail))));
      out.push(h('ul', { class: 'checks' }, res.checks.map((c) => h('li', { class: c.result },
        h('span', { class: 'mark', 'aria-hidden': 'true' }, c.result === 'pass' ? '✓' : c.result === 'fail' ? '✕' : '–'),
        h('span', {}, c.text, ' ', h('span', { class: 'note' }, c.result === 'pass' ? '(passed)' : c.result === 'fail' ? '(failed)' : '(not reached)'))))));
    }

    if (res.trial) {
      const t = res.trial;
      out.push(h('p', {}, h('strong', {}, 'Trial allocation: '),
        `Available becomes ${vec(t.avail)} and ${pName(res.pid)} would hold ${vec(t.alloc[res.pid])}. Safety algorithm on the trial state:`));
      out.push(safetyReport(res.safety, t));
    }

    if (res.status === 'granted') {
      out.push(h('p', { class: 'note' }, 'The matrices above now show the updated state.'));
    } else {
      out.push(h('p', {}, h('strong', {}, 'Allocation state: '),
        unchanged ? 'unchanged. Allocation, Maximum and Available are identical to their values before this request.'
          : 'changed unexpectedly.'));
    }

    target.replaceChildren(card(out));
    if (res.status === 'granted') { buildAvoid(res.newState); $('avoid-safety').replaceChildren(); }
  }

  /* ---------- Detection tab ---------- */
  const det = {};
  let lastRecovery = null;

  function buildDet(state) {
    const n = state.alloc.length;
    const m = state.avail.length;
    $('det-n').value = n;
    $('det-m').value = m;
    const label = (i) => pName(i);
    det.alloc = matrixTable({ title: 'Allocation (held)', rows: n, cols: m, values: state.alloc, rowLabel: label });
    det.request = matrixTable({ title: 'Request (waiting for)', rows: n, cols: m, values: state.request, rowLabel: label });
    det.avail = matrixTable({ title: 'Available', rows: 1, cols: m, values: [state.avail], rowLabel: () => '' });
    $('det-matrices').replaceChildren(det.alloc, det.request, det.avail);
  }

  const readDet = () => ({ alloc: numsOf(det.alloc), request: numsOf(det.request), avail: numsOf(det.avail)[0] });

  function holdsText(row) {
    const parts = row.map((v, j) => (v > 0 ? `${v} × ${rName(j)}` : null)).filter(Boolean);
    return parts.length ? parts.join(', ') : 'nothing';
  }

  let graphCount = 0;

  function graphSvg(state, deadlocked) {
    const mid = 'arrow' + (++graphCount);
    const n = state.alloc.length;
    const m = state.avail.length;
    const W = Math.max(560, Math.max(n, m) * 120);
    const H = 290;
    const px = (i) => ((i + 1) * W) / (n + 1);
    const rx = (j) => ((j + 1) * W) / (m + 1);
    const py = 60;
    const ry = 220;
    const totals = state.avail.map((v, j) => v + state.alloc.reduce((a, r) => a + r[j], 0));

    const svg = s('svg', { class: 'graph', viewBox: `0 0 ${W} ${H}`, role: 'img',
      'aria-label': 'Resource-allocation graph. Solid arrows run from a resource to the process holding it; dashed arrows run from a process to the resource it is waiting for.' });
    svg.append(s('defs', {}, s('marker', { id: mid, markerWidth: 10, markerHeight: 8, refX: 9, refY: 4, orient: 'auto' },
      s('path', { d: 'M0,0 L10,4 L0,8 z' }))));

    const edge = (x1, y1, x2, y2, req, count, offset) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const ox = -uy * offset;
      const oy = ux * offset;
      const a = [x1 + ux * 26 + ox, y1 + uy * 26 + oy];
      const b = [x2 - ux * 28 + ox, y2 - uy * 28 + oy];
      svg.append(s('line', { class: 'edge' + (req ? ' req' : ''), x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'marker-end': `url(#${mid})` }));
      if (count > 1) {
        svg.append(s('text', { class: 'count', x: (a[0] + b[0]) / 2 + ox * 1.6, y: (a[1] + b[1]) / 2 + oy * 1.6 + 4, 'text-anchor': 'middle' }, count));
      }
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (state.alloc[i][j] > 0) edge(rx(j), ry, px(i), py, false, state.alloc[i][j], 6);
        if (state.request[i][j] > 0) edge(px(i), py, rx(j), ry, true, state.request[i][j], 6);
      }
    }
    for (let i = 0; i < n; i++) {
      svg.append(s('circle', { class: 'node' + (deadlocked.includes(i) ? ' dead' : ''), cx: px(i), cy: py, r: 24 }));
      svg.append(s('text', { x: px(i), y: py + 5, 'text-anchor': 'middle' }, pName(i)));
    }
    for (let j = 0; j < m; j++) {
      svg.append(s('rect', { class: 'node res', x: rx(j) - 24, y: ry - 22, width: 48, height: 44, rx: 6 }));
      svg.append(s('text', { x: rx(j), y: ry + 5, 'text-anchor': 'middle' }, rName(j)));
      svg.append(s('text', { x: rx(j), y: ry + 42, 'text-anchor': 'middle', class: 'count' }, `${totals[j]} instance${totals[j] === 1 ? '' : 's'}`));
    }
    return svg;
  }

  function detectionReport(state, res, heading) {
    const out = [];
    if (res.deadlock) {
      out.push(statusPanel('deadlock', 'Deadlock detected',
        `${list(res.deadlocked)} cannot finish: each is waiting for resources that only other deadlocked processes can release.`));
    } else {
      out.push(statusPanel('safe', 'No deadlock detected',
        'Every process can obtain what it is waiting for and finish, so none is blocked permanently.'));
    }

    const totalsText = res.totals.map((t, j) => `${rName(j)}: ${t}`).join(', ');
    let reading;
    if (res.model === 'single') {
      reading = res.cycle
        ? 'With single-instance resources a cycle is conclusive, so this cycle is a confirmed deadlock.'
        : 'No cycle exists, so there is no deadlock.';
    } else if (res.cycle && !res.deadlock) {
      reading = 'This cycle is only a potential circular wait. A resource with several instances can be released by a process outside the cycle, so the cycle alone does not prove deadlock. The detection algorithm shows every process can still finish.';
    } else if (res.cycle) {
      reading = 'The cycle is confirmed as a deadlock because the detection algorithm cannot let these processes finish.';
    } else {
      reading = 'No cycle exists, so there is no circular wait.';
    }

    out.push(h('dl', { class: 'facts' },
      h('dt', {}, 'Resource model'),
      h('dd', {}, res.model === 'single' ? `Single-instance (every resource type has one instance; ${totalsText})` : `Multiple-instance (${totalsText})`),
      h('dt', {}, 'Cycle in graph'),
      h('dd', {}, res.cycle ? 'Yes: ' + res.cycle.join(' → ') : 'No'),
      h('dt', {}, 'Deadlock'),
      h('dd', {}, res.deadlock ? 'Yes: ' + list(res.deadlocked) : 'No'),
      h('dt', {}, 'Reading'),
      h('dd', {}, reading)));

    out.push(h('h3', {}, 'Resource-allocation graph'));
    out.push(graphSvg(state, res.deadlocked));
    out.push(h('p', { class: 'legend' },
      h('span', {}, 'Solid arrow: resource held by process'),
      h('span', {}, 'Dashed arrow: process waiting for resource'),
      h('span', {}, 'Red outline: deadlocked process')));

    if (res.steps.length) {
      out.push(h('div', { style: 'margin-top:1rem' }, dataTable('Detection steps (Work vector)', ['Step', 'Process', 'Request', 'Work before', 'Allocation released', 'Work after'],
        res.steps.map((st, k) => h('tr', {},
          h('td', { class: 'num' }, k + 1),
          h('td', {}, pName(st.process)),
          vecCell(st.request),
          vecCell(st.before),
          vecCell(state.alloc[st.process]),
          vecCell(st.after))))));
    }
    if (res.deadlock) {
      out.push(h('div', { style: 'margin-top:1rem' }, holdingTable(state, res.deadlocked)));
    }
    return card(heading ? h('h3', {}, heading) : null, out);
  }

  function holdingTable(state, procs) {
    return dataTable('Deadlocked processes', ['Process', 'Holds', 'Waiting for'],
      procs.map((i) => h('tr', {}, h('td', {}, pName(i)), h('td', {}, holdsText(state.alloc[i])), h('td', {}, holdsText(state.request[i])))));
  }

  function runDetection() {
    lastRecovery = null;
    const state = readDet();
    const errors = E.validateDetection(state);
    $('det-result').replaceChildren(errors.length ? card(invalidPanel(errors)) : detectionReport(state, E.detect(state)));
  }

  function loadDetPreset() {
    buildDet(P.detection[$('det-preset').value]);
    runDetection();
  }

  function applyDetSize() {
    const size = readSize('det-n', 'det-m');
    if (!size) {
      $('det-result').replaceChildren(card(invalidPanel(['Processes must be 1 to 10 and resource types 1 to 6.'])));
      return;
    }
    buildDet({
      alloc: resize(rawOf(det.alloc), size.n, size.m),
      request: resize(rawOf(det.request), size.n, size.m),
      avail: resize([rawOf(det.avail)[0]], 1, size.m)[0],
    });
    runDetection();
  }

  /* ---------- Recovery tab ---------- */
  function renderRecovery() {
    const target = $('recovery-content');
    const state = readDet();
    const errors = E.validateDetection(state);
    if (errors.length) { target.replaceChildren(card(invalidPanel(errors))); return; }
    const res = E.detect(state);
    const out = [];

    if (lastRecovery) out.push(recoverySummary(lastRecovery));

    if (!res.deadlock) {
      if (!lastRecovery) {
        out.push(card(statusPanel('safe', 'No deadlock present',
          'There is nothing to recover from. Load a deadlocked scenario on the Detection tab first.')));
      }
      target.replaceChildren(...out);
      return;
    }

    const holdTotal = (i) => state.alloc[i].reduce((a, v) => a + v, 0);
    const defaultVictim = res.deadlocked.reduce((best, i) => (holdTotal(i) > holdTotal(best) ? i : best), res.deadlocked[0]);
    const preview = h('p', { class: 'note' });
    const select = h('select', { id: 'victim' }, res.deadlocked.map((i) => h('option', { value: i, selected: i === defaultVictim }, pName(i))));
    const showPreview = () => {
      const v = Number(select.value);
      preview.textContent = `Terminating ${pName(v)} releases ${vec(state.alloc[v])}. Available would become ${vec(state.avail.map((x, j) => x + state.alloc[v][j]))}.`;
    };
    select.addEventListener('change', showPreview);
    showPreview();

    out.push(card(
      statusPanel('deadlock', 'Deadlock detected', `${list(res.deadlocked)} are deadlocked. Choose one process to terminate.`),
      holdingTable(state, res.deadlocked),
      h('div', { class: 'toolbar', style: 'margin-top:1rem' },
        h('div', { class: 'field' }, h('label', { for: 'victim' }, 'Process to terminate'), select),
        h('button', { class: 'btn', type: 'button', onclick: () => terminateVictim(Number(select.value)) }, 'Terminate and release resources')),
      preview));
    out.push(card(h('h3', {}, 'Resource-allocation graph'), graphSvg(state, res.deadlocked),
      h('p', { class: 'legend' }, h('span', {}, 'Solid: held'), h('span', {}, 'Dashed: waiting'), h('span', {}, 'Red outline: deadlocked'))));
    target.replaceChildren(...out);
  }

  function terminateVictim(victim) {
    const state = readDet();
    const before = E.detect(state);
    const rec = E.terminate(state, victim);
    const after = E.detect(rec.state);
    buildDet(rec.state);
    lastRecovery = { victim, released: rec.released, state: rec.state, before, after };
    $('det-result').replaceChildren(detectionReport(rec.state, after));
    renderRecovery();
  }

  function recoverySummary(r) {
    const out = [];
    if (r.after.deadlock) {
      out.push(statusPanel('deadlock', 'Deadlock remains',
        `Terminating ${pName(r.victim)} was not enough. ${list(r.after.deadlocked)} are still deadlocked; terminate another process.`));
    } else {
      out.push(statusPanel('safe', 'Deadlock resolved',
        `Terminating ${pName(r.victim)} released its resources, which lets the remaining processes finish.`));
    }
    const first = r.after.steps.find((st) => st.process !== r.victim);
    out.push(h('dl', { class: 'facts' },
      h('dt', {}, 'Terminated'), h('dd', {}, pName(r.victim)),
      h('dt', {}, 'Resources released'), h('dd', {}, vec(r.released)),
      h('dt', {}, 'Available now'), h('dd', {}, vec(r.state.avail)),
      h('dt', {}, 'Completion order'), h('dd', {}, r.after.order.length ? arrow(r.after.order) : 'none'),
      h('dt', {}, 'How progress resumes'),
      h('dd', {}, first && !r.after.deadlock
        ? `${pName(first.process)} requests ${vec(first.request)}, which now fits within Work ${vec(first.before)}. It finishes and returns ${vec(r.state.alloc[first.process])}, so the next waiting process can proceed, until all have finished.`
        : 'No process was able to proceed.')));
    out.push(detectionReport(r.state, r.after, 'Detection after recovery'));
    return card(h('h3', {}, 'Recovery result'), out);
  }

  /* ---------- Prevention tab ---------- */
  const POLICIES = {
    none: { name: 'No policy', condition: 'None (all four conditions can hold)' },
    ordering: { name: 'Resource ordering', condition: 'Circular wait' },
    allornothing: { name: 'All-or-nothing', condition: 'Hold and wait' },
  };

  function buildPrevention() {
    const rows = P.prevention.procs.map((p, i) => h('tr', {},
      h('th', { scope: 'row' }, p.name),
      h('td', {}, h('input', { type: 'text', class: 'wide', id: 'prev-order-' + i, value: p.order.map(rName).join(' '),
        'aria-label': `Acquisition order for ${p.name}`, autocomplete: 'off' }))));
    $('prev-procs').replaceChildren(
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Process'), h('th', { scope: 'col' }, 'Acquisition order (resources A to F, in the order requested)'))),
      h('tbody', {}, rows));
    $('panel-prevention').addEventListener('input', renderPrevention);
    $('panel-prevention').addEventListener('change', renderPrevention);
  }

  function renderPrevention() {
    const target = $('prev-result');
    const errors = [];
    const procs = P.prevention.procs.map((p, i) => {
      const tokens = $('prev-order-' + i).value.trim().split(/[\s,]+/).filter(Boolean);
      const order = tokens.map((t) => t.toUpperCase().charCodeAt(0) - 65);
      if (!tokens.length) errors.push(`${p.name} must request at least one resource.`);
      else if (tokens.some((t) => !/^[A-Fa-f]$/.test(t))) errors.push(`${p.name}: use resource letters A to F separated by spaces.`);
      else if (new Set(order).size !== order.length) errors.push(`${p.name}: each resource can appear only once.`);
      return { name: p.name, order };
    });
    if (errors.length) { target.replaceChildren(card(invalidPanel(errors))); return; }

    const sims = {};
    Object.keys(POLICIES).forEach((k) => { sims[k] = E.simulate(k, procs); });
    const chosen = document.querySelector('input[name="policy"]:checked').value;
    const sim = sims[chosen];
    const base = sims.none;

    const outcomeText = (r) => (r.outcome === 'deadlock' ? `Deadlock (${r.blocked.join(', ')} blocked)` : 'All processes complete');
    const compare = dataTable('Policy comparison', ['Policy', 'Condition prevented', 'Outcome', 'Ticks', 'Waiting ticks'],
      Object.keys(POLICIES).map((k) => h('tr', { class: k === chosen ? 'selected' : null },
        h('td', {}, POLICIES[k].name),
        h('td', {}, POLICIES[k].condition),
        h('td', {}, outcomeText(sims[k])),
        h('td', { class: 'num' }, sims[k].ticks),
        h('td', { class: 'num' }, sims[k].waits))));

    const timeline = dataTable(`Timeline: ${POLICIES[chosen].name}`, ['Tick', ...procs.map((p) => p.name)],
      sim.timeline.map((row, t) => h('tr', {}, h('td', { class: 'num' }, t + 1), row.map((c) => h('td', {}, c)))));

    const out = [];
    if (sim.outcome === 'deadlock') {
      out.push(statusPanel('deadlock', 'Deadlock occurs', `${sim.blocked.join(' and ')} each hold a resource the other needs. Hold and wait, circular wait, no preemption and mutual exclusion all apply.`));
    } else if (chosen === 'none') {
      out.push(statusPanel('safe', 'No deadlock with these orders', 'The acquisition orders happen not to form a circular wait.'));
    } else {
      const changed = sim.adjusted.length ? ` ${sim.adjusted.join(', ')} had to change acquisition order.` : '';
      out.push(statusPanel('safe', `Deadlock prevented: ${POLICIES[chosen].condition.toLowerCase()} eliminated`,
        (chosen === 'ordering'
          ? 'Resources must be requested in increasing order (A before B before C), so a process can never wait for a lower resource while holding a higher one.'
          : 'A process must obtain all its resources at once or none, so it never holds one resource while waiting for another.') + changed));
    }

    let tradeoff = '';
    if (chosen !== 'none') {
      tradeoff = chosen === 'ordering'
        ? 'Processes must follow a fixed order even when another order would suit them, and a process may hold a lower resource long before it needs the higher one. This lowers concurrency.'
        : 'Processes must declare everything in advance and hold all resources for their whole run, even while using only some. This lowers resource utilization and concurrency, and a process needing many resources may wait a long time.';
      tradeoff += ` Here: ${sim.outcome === 'completed' ? `${sim.ticks} ticks` : 'deadlock'} with ${sim.waits} waiting tick${sim.waits === 1 ? '' : 's'}, versus ${base.outcome === 'completed' ? `${base.ticks} ticks` : `deadlock at tick ${base.ticks}`} with no policy.`;
    }

    target.replaceChildren(card(out, compare), card(timeline, tradeoff ? h('p', { class: 'note', style: 'margin-top:0.75rem' }, h('strong', {}, 'Trade-off. '), tradeoff) : null));
  }

  /* ---------- Test cases tab ---------- */
  const TC_LABELS = {
    TC1: ['safe', 'Safe'],
    TC2: ['waiting', 'Waiting'],
    TC3: ['unsafe', 'Unsafe: denied'],
    TC4: ['deadlock', 'Deadlock'],
    TC5: ['safe', 'Deadlock prevented'],
    TC6: ['invalid', 'Invalid input handled'],
  };

  function renderTests() {
    const { rows, cases } = window.Cases.run();
    const lines = (v) => (Array.isArray(v) ? h('ul', {}, v.map((x) => h('li', {}, x))) : v);
    const main = dataTable('Analytical results', ['Test case', 'System condition', 'Actual result', 'Expected result', 'Analysis / conclusion'],
      rows.map((r) => h('tr', {},
        h('th', { scope: 'row' }, r.id),
        h('td', {}, r.condition),
        h('td', {}, h('p', {}, badge(TC_LABELS[r.id][0], TC_LABELS[r.id][1]), ' ', badge(r.pass ? 'safe' : 'deadlock', r.pass ? 'Matches expected' : 'Does not match')), lines(r.actual)),
        h('td', {}, r.expected),
        h('td', {}, r.conclusion))));
    const kindOf = (c) => (c.result === 'invalid' ? 'invalid' : c.result === 'granted' ? 'safe' : c.result);
    const labelOf = { safe: 'Safe', granted: 'Granted', invalid: 'Invalid input', unsafe: 'Unsafe', waiting: 'Waiting' };
    const breakdown = dataTable('TC6 breakdown: boundary versus invalid input', ['Case', 'Input', 'Dashboard result', 'Classification'],
      cases.map((c) => h('tr', {},
        h('td', {}, c.name),
        h('td', {}, c.input),
        h('td', {}, h('p', {}, badge(kindOf(c), labelOf[c.result] || c.result)), c.message),
        h('td', {}, c.klass))));
    $('tests-result').replaceChildren(card(main), card(breakdown));
  }

  /* ---------- Tabs ---------- */
  const TABS = ['avoidance', 'detection', 'recovery', 'prevention', 'tests'];

  function showTab(name, focus) {
    TABS.forEach((t) => {
      const on = t === name;
      const tab = $('tab-' + t);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
      if (on && focus) tab.focus();
    });
    if (name === 'recovery') renderRecovery();
    if (name === 'tests') renderTests();
  }

  function initTabs() {
    TABS.forEach((t, i) => {
      $('tab-' + t).addEventListener('click', () => showTab(t));
      $('tab-' + t).addEventListener('keydown', (ev) => {
        const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (ev.key === 'Home') { ev.preventDefault(); showTab(TABS[0], true); }
        else if (ev.key === 'End') { ev.preventDefault(); showTab(TABS[TABS.length - 1], true); }
        else if (step) { ev.preventDefault(); showTab(TABS[(i + step + TABS.length) % TABS.length], true); }
      });
    });
  }

  /* ---------- Init ---------- */
  function init() {
    Object.entries(P.avoidance).forEach(([k, v]) => $('avoid-preset').append(h('option', { value: k }, v.label)));
    Object.entries(P.detection).forEach(([k, v]) => $('det-preset').append(h('option', { value: k }, v.label)));
    Object.values(P.requests).forEach((r) => $('req-examples').append(
      h('button', { class: 'btn chip', type: 'button', onclick: () => { $('req-pid').value = r.pid; $('req-vec').value = r.req; } }, r.label)));

    $('avoid-preset').addEventListener('change', loadAvoidPreset);
    $('avoid-reset').addEventListener('click', loadAvoidPreset);
    $('avoid-apply').addEventListener('click', applyAvoidSize);
    $('avoid-run').addEventListener('click', runSafety);
    $('avoid-matrices').addEventListener('input', updateNeed);
    $('avoid-form').addEventListener('submit', submitRequest);

    $('det-preset').addEventListener('change', loadDetPreset);
    $('det-apply').addEventListener('click', applyDetSize);
    $('det-run').addEventListener('click', runDetection);
    $('tests-run').addEventListener('click', renderTests);

    initTabs();
    buildPrevention();
    loadAvoidPreset();
    loadDetPreset();
    renderPrevention();
    const start = location.hash.slice(1);
    if (TABS.includes(start)) showTab(start);
  }

  init();
})();
