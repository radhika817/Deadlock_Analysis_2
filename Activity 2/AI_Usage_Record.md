# AI Usage Record

Development tools: HTML, CSS and JavaScript (no external libraries), Node.js for tests, Google Chrome for checking the interface.

| AI Tool Used | Purpose | Output Generated | Student Verification |
|---|---|---|---|
| Claude (Claude Code) | Dashboard design | Layout, views (Avoidance, Detection, Recovery, Prevention, Test Cases), styling | Opened every view in a browser; checked that each status (safe, unsafe, waiting, deadlock, invalid) has its own label and appearance |
| Claude (Claude Code) | Algorithm/code assistance | Need calculation, safety algorithm, request algorithm, matrix deadlock detection, recovery, prevention simulator (`js/engine.js`) | Traced the textbook example by hand (safe sequence P1, P3, P4, P0, P2); compared safety results against an exhaustive permutation search on 300 random states |
| Claude (Claude Code) | Test-case generation or debugging | Scenarios A to F and the results table (`js/cases.js`, `tests/run_tests.js`) | Ran `node tests/run_tests.js` (15 test groups passed); results table in `Test_Case_Analysis.md` is generated from the same engine as the dashboard |
