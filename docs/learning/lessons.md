# Lessons — sculpture

The one-line form of every lesson this repo has paid for and has NOT yet gated. Read this file at session start; it is short by construction, because every entry leaves as soon as its gate lands.

Each rule links into [lessons-evidence.md](lessons-evidence.md), which holds the war story and the anchor. Open that only when a rule is in doubt, or the work is in that area.

A new lesson is an entry there plus one line here, and that line NAMES THE GATE it is waiting for. If you cannot name one, this is not the file: stage it in `../../../fleet/canon-candidates.md` if it is fleet-wide, put it in [local-rules.md](../policies/local-rules.md) if it is true only here, or drop it.

When the gate lands, prove it red by reintroducing the defect, record that in [gate-proofs.md](gate-proofs.md), and delete both halves in the same commit.

## Rules

- A test that asserts a contract constant's literal value compares the constant with itself and goes red on the next decision, never on a defect. — **gate:** `src/repo-conventions.test.ts` fails on `expect(<NAME>).toBe(<number>)` where `<NAME>` is imported from `src/contracts/`, naming the file and line ([evidence](lessons-evidence.md#pinned-constant-2026-10-11))
- A wall-clock bound in a unit test measures the machine's load as much as the code: under the suite's parallel test files the same code passes and fails, so a time budget reads the test file's own CPU time. — **gate:** `src/repo-conventions.test.ts` fails on an `expect(performance.now() - …)` or `expect(Date.now() - …)` bound in any `*.test.ts` (the slow suite's logged timings are not assertions and stay), naming the file and line ([evidence](lessons-evidence.md#wall-clock-bound-2026-10-14))
