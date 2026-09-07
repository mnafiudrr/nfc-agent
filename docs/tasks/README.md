# Tasks Index

Execution order matters — it follows a **human order workflow**: implement one task, commit, test the feature, fix and re-commit until fine, then move to the next task. Do not start a task until its dependencies are complete.

| #   | Task                                  | Depends on | Status  |
| --- | ------------------------------------- | ---------- | ------- |
| 001 | Project Setup & Tooling               | —          | Pending |
| 002 | PC/SC Reader Layer (Milestone 1)      | 001        | Pending |
| 003 | Hot-Plug & Reconnection (Milestone 2) | 002        | Pending |
| 004 | WebSocket Server (Milestone 3)        | 003        | Pending |
| 005 | Robustness & Unit Tests (Milestone 4) | 004        | Pending |
| 006 | Packaging Prep (Milestone 5)          | 005        | Pending |
| 007 | Manual Hardware Testing               | all        | Pending |

Implementation starts only after manual review of all docs is approved.
