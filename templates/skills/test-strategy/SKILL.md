---
name: test-strategy
description: "Trigger: testing strategy, validation evidence, new behavior, bugfix, API/DB/security change, weak verification. Choose proportional tests."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Test Strategy

## Activation Contract

Load this skill when a change needs a validation decision: new behavior, bugfix regression risk, API/contract change, database change, security-sensitive flow, unclear task verification, Reviewer finding of weak evidence, or manual smoke being proposed for non-trivial risk.

## Hard Rules

- Choose evidence proportional to risk; do not require new tests for every trivial change.
- Runtime behavior needs runtime evidence. Source inspection alone does not prove behavior.
- Begin by discovering the repository's existing validation capabilities: test frameworks and commands, focused/integration tests, smoke checks, E2E facilities, build/typecheck commands, CI configuration, and documented manual checks.
- Use the repository's existing validation commands and facilities; do not invent `npm test`, `pytest`, `go test`, or other placeholders.
- When a relevant test framework exists, require focused tests for new behavior. When a relevant smoke or E2E facility exists, require its applicable checks; do not skip an available check merely because another check is easier.
- When no suitable test or E2E platform exists, select the best available local check, disclose the missing capability as non-blocking pre-existing debt or residual risk, and do not introduce incidental infrastructure.
- High-risk API, data, or security changes need stronger evidence than simple source inspection.
- A sensitive change whose adequate validation mechanism is unavailable requires an explicit user risk decision before closure. Recorded acceptance may close only that unavailable-capability validation gap; it does not require an attached evidence artifact and must never be presented as passing validation.
- Risk acceptance cannot waive a known defect, a failed or omitted relevant available check, or an undefined security, compatibility, rollback/compensation, or migration strategy. If any of those conditions exists, stop and escalate or fix the deficiency.
- If Developer cannot identify adequate validation from the contract or project docs, record the missing capability and escalate; do not silently invent a toolchain.

## Decision Gates

| Change type | Default evidence |
|---|---|
| Pure logic/helper | Unit test or existing focused test. |
| API DTO/validation/error | Integration or contract/API test plus sample payload if useful. |
| DB/schema/backfill | Migration test/dry-run, data assertion, and affected query check. |
| Auth/ownership/security | Negative tests for denied access and manipulated IDs. |
| UI-only copy/style | Manual smoke or no new test with justification. |
| Bugfix | Regression test at the smallest boundary that would have caught the bug. |
| Cross-repo/public contract | Contract test or producer/consumer fixture evidence. |

## Execution Steps

1. Inventory the existing test, smoke, E2E, build, CI, and documented manual-check capabilities from the repository before selecting validation.
2. Identify the behavior or risk that must be proven and which discovered capabilities are relevant to it.
3. Require the cheapest focused test level that catches the important failure, plus every applicable existing smoke/E2E check.
4. If no suitable platform exists, choose available static/build/manual checks, record the limitation honestly as residual risk, and do not add a framework solely for this feature.
5. For a sensitive change with an unavailable adequate mechanism, ask for and record an explicit user risk decision only after confirming there is no known defect, no omitted or failed available check, and no undefined required strategy.
6. Decide what is not required and why, without treating unavailable runtime proof as passing evidence.
7. Define evidence Developer must record: capability inventory, command/result, sample input/output, manual smoke result, or the explicit accepted validation gap.
8. Reviewer/Auditor verify evidence was actually run or explicitly deferred under a valid unavailable-capability decision.

## Output Contract

Return a test strategy block with: capability inventory, risk level, required focused tests and applicable smoke/E2E checks, optional evidence, unavailable capabilities and residual risk, not-required tests with rationale, exact existing commands or discovery steps, manual smoke steps, any explicit user risk decision, and evidence to record.

<!-- managed-by: opencode-path -->
