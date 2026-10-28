# Test Case Analysis

Actual results are produced by running the dashboard engine (`node tests/run_tests.js`).

| Test Case | System Condition | Actual Result | Expected Result | Analysis / Conclusion |
|---|---|---|---|---|
| TC1 | Safe state | Safe. Safe sequence: P1 → P3 → P4 → P0 → P2 | Safe sequence found | Each process in the sequence has Need ≤ Work when its turn comes, and Work grows by its Allocation afterwards. All five processes can finish, so the state is safe. |
| TC2 | Request exceeds Available | P0 requests (4, 0, 0): Waiting (not granted immediately). Allocation state unchanged: yes. | Request not granted immediately | The request is within P0's Need (7, 4, 3) but A is requested as 4 while only 3 is Available. It is deferred, not invalid: it can be granted later when other processes release resources. |
| TC3 | Request makes state unsafe | P0 requests (0, 0, 2): Denied (unsafe). After the trial allocation no process can finish (P0, P1, P2, P3, P4 remain). Original state restored: yes. | Request denied; state unchanged | The request fits both Need and Available, so the safety algorithm ran on the trial state and found no complete safe sequence. Unsafe is not deadlock: nothing is blocked yet, but safety can no longer be guaranteed. |
| TC4 | Deadlocked scenario | Single-instance: deadlock among P0, P1, P2; circular wait P0 → B → P1 → C → P2 → A → P0.<br>Multiple-instance (cycle only): cycle P0 → B → P1 → A → P0 exists, deadlock: no.<br>Multiple-instance (confirmed): deadlock among P0, P1, P2.<br>Recovery: terminate P0, release (1, 0, 0, 0); deadlock afterwards: no. | Deadlock identified by the selected detection method | With single-instance resources a cycle is conclusive. With multiple instances a cycle is only a potential circular wait; the matrix detection algorithm decides. Terminating P0 releases A, which lets P2 and then P1 finish. |
| TC5 | Prevention policy applied | No policy: deadlock after tick 3 (P1, P2 blocked).<br>Resource ordering: all processes complete in 5 ticks with 2 waiting ticks. P2 must acquire in order.<br>All-or-nothing: all processes complete in 3 ticks with 1 waiting tick. | Selected deadlock condition eliminated | Ordering removes circular wait: nobody can hold a higher resource while waiting for a lower one. All-or-nothing removes hold and wait: a process holds nothing while it waits. The cost is lower concurrency (P2 waits for P1) and, for all-or-nothing, resources held for the whole run. |
| TC6 | Boundary and invalid inputs | Zero Available resources: safe<br>Zero remaining Need, zero request: granted (no change)<br>Zero remaining Need, positive request: invalid<br>Invalid process identifier: invalid<br>Negative request: invalid<br>Wrong vector length: invalid<br>Allocation exceeds Maximum: invalid | Correct handling or validation message | Zero Available and zero requests are legal states and are processed normally. Negative values, unknown processes, wrong sizes, requests beyond Need and allocations beyond Maximum are rejected as invalid input before the algorithm runs. |

## TC6 Breakdown

| Case | Input | Dashboard Result | Class |
|---|---|---|---|
| Zero Available resources | Available = (0, 0); P0 already holds its full Maximum | Safe sequence P0 → P1 → P2. P0 needs nothing more, finishes first and releases its resources. | Valid boundary case |
| Zero remaining Need, zero request | P0 requests (0, 0) | Granting this request keeps the system safe. The allocation is updated. | Valid boundary case |
| Zero remaining Need, positive request | P0 requests (1, 0) | P0 asks for 1 of A but its remaining Need is 0. The request exceeds its declared maximum claim. | Invalid input |
| Invalid process identifier | P9 requests (1, 0, 0) | "P9" is not a valid process. Use P0 to P4. | Invalid input |
| Negative request | P1 requests (−1, 0, 0) | Request for A is negative (-1). Requests cannot be negative. | Invalid input |
| Wrong vector length | P1 requests (1, 0) | The request needs exactly 3 values, one per resource type. | Invalid input |
| Allocation exceeds Maximum | P0 allocated 8 of A, declared Maximum 7 | P0 holds 8 of A but its declared Maximum is 7. | Invalid input |
