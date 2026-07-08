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
- Developer must stop if expand/contract, backfill, invalid-existing-data handling, rollback, or deploy ordering is missing for a risky change.
- Do not drop, rename, make non-null, tighten constraints, or remove enum values without an explicit compatibility and rollback/compensation plan.
- Existing invalid data must be handled explicitly; do not assume production data already matches the new schema.
- Large-table indexes, constraints, and backfills must consider locks, batching, resumability, and runtime impact.
- Applied production migrations must not be edited or deleted without explicit user authorization.

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
3. Define migration order relative to code deploys.
4. Define rollback or compensation, including partial-migration handling.
5. Define validation evidence: schema diff, data checks, migration dry-run/test DB, affected queries, and before/after counts.
6. For Developer: verify the contract exists before editing; if not, record the gap and escalate.

## Output Contract

Return a migration note with: change type, expand/contract strategy, deploy order, backfill plan, invalid existing data handling, lock/index risk, rollback/compensation, validation evidence, and blockers.

<!-- managed-by: opencode-path -->
