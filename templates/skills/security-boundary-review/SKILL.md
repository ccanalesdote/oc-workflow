---
name: security-boundary-review
description: "Trigger: auth, authorization, roles, ownership, tokens, sessions, uploads, webhooks, payments, secrets, admin endpoints. Review access boundaries."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Security Boundary Review

## Activation Contract

Load this skill when a change touches authentication, authorization, roles, permissions, ownership, tokens, sessions, admin endpoints, uploads, webhooks, payments, secrets, environment variables, user/tenant data, or cross-user resource access.

## Hard Rules

- Always identify the actor, target resource, permission rule, ownership model, and trust boundary.
- Ownership checks must happen server-side using trusted identity; never trust client-provided user IDs, tenant IDs, roles, or ownership claims.
- Sensitive data must not leak in responses, logs, errors, analytics, traces, screenshots, or progress artifacts.
- Webhooks, payments, and retryable external operations must consider replay, idempotency, signature/secret handling, and rate limits.
- Developer must stop if the authorization rule, ownership model, secret handling, or exposed-data policy is not defined.
- Do not silently change the security model; escalate missing or contradictory rules.

## Decision Gates

| Risk signal | Required check |
|---|---|
| Resource has user/tenant owner | Verify ownership using trusted server-side identity. |
| Admin endpoint | Verify role/scope and auditability. |
| Token/session handling | Expiry, revocation, storage, logging, and error behavior. |
| Upload | File type/size, path traversal, processing boundary, storage visibility. |
| Webhook/payment | Signature verification, idempotency, replay handling, rate limit. |
| Secret/env var | No hardcoding, no logs, documented deployment requirement. |

## Execution Steps

1. Define who can execute the operation and why.
2. Define how identity and ownership are established from trusted data.
3. Check manipulated IDs, missing auth, cross-tenant access, replay, and logging paths.
4. Decide whether rate limit, idempotency, or audit logging is required.
5. For Developer: implement only the defined checks; escalate missing security rules or unclear exposure decisions.

## Output Contract

Return a security boundary note with: actor, resource, permission rule, ownership check, denied cases, sensitive data handling, replay/idempotency/rate-limit decision, audit need, and unresolved risks.

<!-- managed-by: opencode-path -->
