---
name: migration-and-data-change
description: "Trigger: Prisma migrations, SQL, schema.prisma, enums, indexes, constraints, backfills, persistent data changes. Plan safe data evolution."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Migration and Data Change

## Activation Contract

Load this skill when a change touches persistent data shape or semantics: Prisma migrations, SQL DDL/DML, `schema.prisma`, database enums, constraints, indexes, keys, backfills, required fields, data cleanup, serialized persisted formats, or compatibility with already-stored records.

## Hard Rules

- Architect owns migration strategy. Developer implements only an existing migration contract.
- Developer must stop if expand/contract, backfill, invalid-existing-data handling, rollback/compensation, compatibility, or development/deployment ordering is missing for a risky change.
- Do not drop, rename, make non-null, tighten constraints, or remove enum values without an explicit compatibility and rollback/compensation plan.
- Existing invalid data must be handled explicitly; do not assume production data already matches the new schema.
- Large-table indexes, constraints, and backfills must consider locks, batching, resumability, and runtime impact.
- Applied production migrations must not be edited or deleted without explicit user authorization.
- Migration design and artifacts are local responsibilities: review the migration content, compatibility and ordering, invalid-data handling, rollback/compensation, lock risk, and available local validation before closure.
- Execution in a real environment, deployment, activation, monitoring, and execution receipts are post-commit responsibilities. They must not be represented as completed local evidence or block local commit closure.
- A manual migration project may close locally without a QA or production execution receipt when the artifact and safety strategy are defined and available local checks are complete.
- An explicit user risk decision may cover unavailable execution or validation evidence only. It cannot waive a known unsafe defect, undefined migration/rollback/compensation/compatibility strategy, or an omitted or failed available check.

## Decision Gates

| Change type | Required strategy |
|---|---|
| Add nullable field with no required consumer | Simple additive migration plus validation. |
| Add required field | Expand/contract: nullable/default → backfill → enforce. |
| Rename/drop field | Add new field, dual-read/write if needed, backfill, contract cleanup later. |
| Enum change | Backward-compatible handling and old-version compatibility. |
| Large index/constraint | Non-blocking/concurrent/batched strategy or explicit downtime note. |
| Data cleanup/backfill | Idempotent script/query, batching, verification, rollback/compensation. |

## Execution Steps

1. Identify data stores, tables/models, fields, indexes, constraints, and consumers.
2. Classify the change: additive, contractive, destructive, backfill, cleanup, or performance-only.
3. Define compatibility and development/deployment ordering relative to code changes without assigning ownership for later environment execution.
4. Define rollback or compensation, including partial-migration handling and invalid-existing-data behavior.
5. Discover and use available local validation: schema diff, static inspection, migration dry-run/test DB, affected queries, and before/after counts where supported.
6. Record unavailable runtime execution or receipt capabilities as a residual risk; obtain explicit user acceptance only for that unavailable capability gap when no known defect, omitted/failed available check, or undefined safety strategy remains.
7. For Developer: verify the contract exists before editing; if not, record the gap and escalate.

## Output Contract

Return a migration note with: change type, expand/contract strategy, compatibility and development/deployment order, backfill plan, invalid existing data handling, lock/index risk, rollback/compensation, available local validation, unavailable execution evidence and residual risk, and blockers. Do not claim real-environment execution or receipts in this local note.

<!-- managed-by: opencode-path -->
