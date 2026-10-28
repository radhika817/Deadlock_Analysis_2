/* Sample configurations used by the dashboard and the test cases. */
(function (root) {
  'use strict';

  const avoidance = {
    safe: {
      label: 'Safe state (5 processes, 3 resources)',
      alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]],
      max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]],
      avail: [3, 3, 2],
    },
    zero: {
      label: 'Zero Available resources (boundary case)',
      alloc: [[2, 1], [1, 0], [0, 1]],
      max: [[2, 1], [2, 1], [1, 2]],
      avail: [0, 0],
    },
  };

  const requests = {
    waiting: { pid: 'P0', req: '4 0 0', label: 'Exceeds Available' },
    unsafe: { pid: 'P0', req: '0 0 2', label: 'Makes state unsafe' },
    safe: { pid: 'P1', req: '1 0 2', label: 'Safe request' },
    invalid: { pid: 'P1', req: '2 0 0', label: 'Exceeds Need' },
  };

  const detection = {
    single: {
      label: 'Single-instance: circular wait among P0, P1, P2',
      alloc: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
      request: [[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
      avail: [0, 0, 0, 0],
    },
    cycleOnly: {
      label: 'Multiple-instance: cycle exists, no deadlock',
      alloc: [[1, 0], [0, 1], [1, 0]],
      request: [[0, 1], [1, 0], [0, 0]],
      avail: [0, 0],
    },
    multi: {
      label: 'Multiple-instance: confirmed deadlock',
      alloc: [[1, 0], [0, 1], [1, 0]],
      request: [[0, 1], [1, 0], [0, 1]],
      avail: [0, 0],
    },
  };

  const prevention = {
    procs: [
      { name: 'P1', order: [0, 1] },
      { name: 'P2', order: [1, 0] },
      { name: 'P3', order: [2] },
    ],
  };

  const Presets = { avoidance, requests, detection, prevention };
  if (typeof module !== 'undefined' && module.exports) module.exports = Presets;
  else root.Presets = Presets;
})(typeof self !== 'undefined' ? self : this);
