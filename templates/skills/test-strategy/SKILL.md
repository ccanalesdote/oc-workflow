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
- Use validation commands documented by the project; do not invent `npm test`, `pytest`, `go test`, or other placeholders.
- High-risk API, data, or security changes need stronger evidence than simple source inspection.
- If Developer cannot identify adequate validation from the contract or project docs, record missing validation and escalate.

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

1. Identify the behavior or risk that must be proven.
2. Pick the cheapest test level that catches the important failure.
3. Decide what not to test and why.
4. Identify exact project validation commands from README, package/build config, CI, or task runner files.
5. Define evidence Developer must record: command, result, sample input/output, or manual smoke steps.
6. Reviewer/Auditor verify evidence was actually run or explicitly deferred.

## Output Contract

Return a test strategy block with: risk level, required evidence, optional evidence, not-required tests with rationale, exact commands or discovery step, manual smoke steps, and evidence to record.

<!-- managed-by: opencode-path -->
