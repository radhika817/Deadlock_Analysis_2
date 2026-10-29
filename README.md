# Deadlock Analysis and Resource Allocation Dashboard

[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://deadlock-analysis-2.vercel.app/)

An interactive simulator and visualization suite for operating system deadlock handling algorithms, including **Deadlock Avoidance** (Banker's Algorithm), **Deadlock Detection** (Resource Allocation Graph & Multiple-Instance Vector Detection), **Deadlock Recovery** (Process Termination & Resource Preemption), and **Deadlock Prevention** (Hierarchical Resource Ordering & All-or-Nothing Allocation).

🌐 **Live Deployment**: [https://deadlock-analysis-2.vercel.app/](https://deadlock-analysis-2.vercel.app/)

---

## 🚀 Features

- **Deadlock Avoidance (Banker's Algorithm)**:
  - Safety algorithm calculation with dynamic Work & Need vector simulation.
  - Safe sequence generation (e.g., $P_1 \to P_3 \to P_4 \to P_0 \to P_2$).
  - Trial resource request validation and granting/denial simulation.
- **Deadlock Detection**:
  - **Single-Instance Resources**: Cycle detection on Wait-For Graph (WFG) using Tarjan's/DFS algorithm.
  - **Multiple-Instance Resources**: Vector/matrix reduction algorithm to pinpoint unfinishable deadlocked processes.
- **Deadlock Recovery**:
  - Resource reclamation via targeted process termination.
  - State re-evaluation post-termination to ensure system returns to a safe/deadlock-free state.
- **Deadlock Prevention**:
  - Comparison of Coffman condition elimination strategies (Hierarchical ordering vs. All-or-Nothing hold-and-wait elimination) against baseline execution.
- **Interactive UI & Test Cases**:
  - Live matrix editors, presets, step-by-step traces, and automated test runners.

---

## 📂 Project Structure

```
.
├── Activity 2/
│   ├── css/
│   │   └── styles.css          # Modern responsive styling & dashboard theme
│   ├── js/
│   │   ├── app.js              # UI controller, event handlers, and visualization
│   │   ├── engine.js           # Core Banker's algorithm & deadlock detection logic
│   │   ├── cases.js            # Standard test case definitions
│   │   └── presets.js          # Preconfigured scenarios (textbook safe, zero Available, etc.)
│   ├── tests/
│   │   └── run_tests.js        # Automated unit & integration test runner
│   ├── index.html              # Main dashboard user interface
│   ├── Test_Case_Analysis.md   # Detailed test suite analysis & empirical results
│   └── AI_Usage_Record.md      # AI prompt & usage record
└── README.md
```

---

## 🛠️ Getting Started

### 1. Access the Live Dashboard

Open the deployed web app directly in any browser:
👉 **[https://deadlock-analysis-2.vercel.app/](https://deadlock-analysis-2.vercel.app/)**

### 2. Run the Dashboard Locally

You can run the web dashboard directly by starting any local HTTP server:

```bash
# Python 3
python3 -m http.server 8000 --directory "Activity 2"

# Or using Node.js http-server / npx serve
npx serve "Activity 2"
```

Then open [http://localhost:8000](http://localhost:8000) in your web browser.

### 3. Run Automated Tests

To execute the 15 automated test cases verifying safety checks, requests, detection, and recovery:

```bash
node "Activity 2/tests/run_tests.js"
```

---

## 🧪 Test Case Summary

| Test Case | Scenario | Actual Result | Status |
|---|---|---|:---:|
| **TC1** | Safe state (5 processes, 3 resource types) | Safe sequence: $P_1 \to P_3 \to P_4 \to P_0 \to P_2$ | ✅ Passed |
| **TC2** | Request exceeds Available resources | Request deferred/waiting; state kept intact | ✅ Passed |
| **TC3** | Request leads to unsafe state | Request denied; trial allocation rolled back | ✅ Passed |
| **TC4** | Deadlock scenario (Single & Multiple instance) | Deadlock correctly identified; resolved via process recovery | ✅ Passed |
| **TC5** | Prevention policies | Elimination of circular wait and hold-and-wait conditions | ✅ Passed |
| **TC6** | Boundary & invalid inputs | Gracefully handles zero vectors, invalid PIDs, negative requests | ✅ Passed |

---

## 📖 Algorithms Implemented

1. **Banker's Safety Algorithm**: Computes `Need = Max - Allocation` and verifies existence of an execution order where all processes satisfy `Need ≤ Work`.
2. **Resource-Request Algorithm**: Conducts safety tests on hypothetical post-allocation states prior to committing changes.
3. **Wait-For Graph Cycle Detection**: Identifies circular wait dependencies in single-unit systems.
4. **Deadlock Matrix Detection**: Resolves resource allocations in multi-unit systems to identify permanently blocked processes.
