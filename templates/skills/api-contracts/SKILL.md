---
name: api-contracts
description: "Trigger: API endpoints, DTOs, request/response, webhooks, events, SDKs, public contracts, frontend/backend changes. Define safe contracts."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# API Contracts

## Activation Contract

Load this skill when a change affects an API or contract boundary: frontend/backend DTOs, public endpoints, SDKs, webhooks, events, serialized payloads, error formats, validation rules, producer/consumer compatibility, or cross-team interfaces.

## Hard Rules

- The contract must be explicit before implementation: request DTO, response DTO, validation, errors, auth assumptions, and compatibility.
- Backward compatibility is the default. Breaking changes require versioning, deprecation, or coordinated rollout.
- Developer may implement a defined contract but must not invent DTO fields, error codes, versioning, or compatibility behavior.
- Events and webhooks require idempotency/retry semantics when delivery can duplicate or fail.
- Contract tests, fixtures, sample payloads, or consumer-visible validation must be specified for non-trivial boundaries.

## Decision Gates

| Situation | Required contract decision |
|---|---|
| Add optional response field | Preserve old consumers; document field semantics. |
| Add required request field | Version, default, staged rollout, or compatibility adapter. |
| Change error behavior | Status, stable code, message shape, and retryability. |
| Webhook/event payload | Event name, schema, idempotency key, retry behavior, signature if applicable. |
| SDK/API public surface | Versioning and deprecation path. |
| Internal-only DTO | Local validation and focused tests may be enough. |

## Execution Steps

1. Identify producers, consumers, and whether the contract is public, cross-repo, cross-service, or internal.
2. Define request DTO, response DTO, validation rules, error contract, and compatibility rules.
3. Define versioning/deprecation if any field is removed, renamed, made required, or semantically changed.
4. Define rollout order when producer and consumer cannot deploy atomically.
5. Define contract verification: tests, sample payloads, snapshots, fixtures, or manual smoke.
6. For Developer: stop and escalate if the contract is ambiguous, contradictory, impossible, or missing required details.

## Output Contract

Return an API contract block with: endpoint/event name, producer, consumers, DTOs, validation, errors, auth assumptions, compatibility/versioning, rollout order, and contract test evidence.

<!-- managed-by: opencode-path -->
