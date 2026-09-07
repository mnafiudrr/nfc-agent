# Task 006 — Packaging Prep (Milestone 5)

> Depends on: [005-robustness-testing.md](005-robustness-testing.md)
> References: [../plans/implementation-plan.md](../plans/implementation-plan.md) · [../plans/prd.md](../plans/prd.md)

## Goal
Prepare for distributing the agent as an executable so an end user can run it **without installing Node.js**. Do **not** implement the installer yet.

## Steps
1. Evaluate packaging tools per target:
   - **Windows** → executable (e.g. `pkg` / `nexe` / `bun compile` — decide in this task)
   - **macOS** → executable (same toolset or platform-native)
2. Confirm the chosen tool bundles native deps correctly (`nfc-pcsc` is a native/`node-gyp` module; verify it survives packaging, or switch to a pure-JS/alternative PC/SC binding if needed).
3. Add a build step that produces the target executable.
4. Document run/install expectations in the README (per target).
5. Leave the actual installer to a later phase.

## Checklist
- [ ] Target executable builds for Windows and/or macOS
- [ ] Executable can run without a local Node.js install
- [ ] Native PC/SC binding works when packaged (or fallback documented)
