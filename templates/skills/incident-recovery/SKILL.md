---
name: incident-recovery
description: "Trigger: wrong cwd, worktree accident, git conflicts, broken environment, confusing tests, failed recovery. Stop, collect evidence, escalate safely."
license: MIT
metadata:
  author: opencode-path
  version: "1.0"
---

# Incident Recovery

## Activation Contract

Load this skill when execution state becomes unsafe: wrong cwd, wrong worktree, accidental repo mutation, merge/rebase conflict, confusing test result, environment workaround, permission surprise, unexpected lockfile or migration change, repeated failed fix attempts, or any situation where continuing may make the repo worse.

## Hard Rules

- Stop modifying files immediately.
- Do not run destructive recovery commands without explicit user authorization.
- Do not use `git reset`, `git clean`, destructive checkout/restore, delete migrations, edit lockfiles "to fix it", or force dependency reinstalls as a guess.
- Record evidence in `progress.md` when a work folder exists.
- Resume only after the user, Architect, or Auditor gives a clear next action.

## Allowed Diagnostics

Use read-only or low-risk diagnostics only: current directory and repo root, branch, git status/diff/log/worktree list, task/work-folder status, exact failing command output, and relevant config presence without exposing secrets.

## Decision Gates

| Incident | Action |
|---|---|
| Wrong cwd/worktree | Stop; report expected vs actual root. |
| Git conflict or unexpected diff | Capture status/diff; ask before recovery. |
| Confusing tests | Record command, output, environment assumptions, and changed files. |
| Migration/data incident | Stop; do not edit applied migrations or production-like data. |
| Repeated failed attempts | Escalate to Auditor or Architect with evidence. |

## Execution Steps

1. Freeze writes.
2. Identify scope: cwd, repo root, branch, work folder, active task.
3. Collect minimal evidence.
4. Record incident entry in `progress.md` if available.
5. State the safest next options and wait for direction.

## Output Contract

Return an incident report with: current task, symptom, evidence, files changed, commands run, unsafe actions avoided, suspected impact, recommended authority, and blocked status.

<!-- managed-by: opencode-path -->
