---
name: graphify-explorer
description: Use ONLY when operating as the Explorer agent and doing medium or large repository reconnaissance in a repo where Graphify is installed; use the graph as navigation aid, then verify findings in source files.
---

# Graphify for Explorer

Use this skill only when you are operating as the Explorer agent and Graphify is installed for the current environment.

Graphify can improve repository exploration by generating and querying a local code graph. Treat it as a navigation aid for understanding structure, relationships, likely impact areas, and execution paths. Do not treat it as an absolute source of truth.

## When to use Graphify

Use Graphify for medium or large reconnaissance tasks, especially when the task involves:

- initial exploration of an unfamiliar repository;
- identifying major modules, packages, services, or subsystems;
- mapping dependencies, imports, call paths, ownership boundaries, or execution routes;
- finding likely affected areas before reading source files;
- understanding cross-file or cross-directory relationships;
- comparing multiple possible implementation areas before narrowing the search.

## When not to use Graphify

Do not use Graphify for small or localized work where direct exploration is enough, including:

- questions scoped to one to three known files;
- reading a specific file or function;
- simple text search, symbol lookup, or filename lookup;
- changes where the relevant files have already been identified;
- mechanical edits, formatting, or narrow bug checks.

For localized work, prefer the normal Explorer tools: file globbing, content search, and direct source reads.

## How to use Graphify safely

- Use Graphify results to choose where to look next, not as final evidence.
- Verify every relevant conclusion by reading the actual source files.
- Prefer scoped graph queries over broad report reading when you already know the question.
- Mention when a conclusion came from graph navigation and which source files verified it.
- If graph output conflicts with source code, trust the source code and report the mismatch.

## Graph freshness

- Do not rebuild or update the graph automatically for every task.
- Do not update the graph for small, localized exploration.
- If the task is medium or large and the graph may be stale, prefer asking the user to run `opencode-path graphify` or run it only when explicitly appropriate for the exploration task.
- Do not install Git hooks or automatic graph refresh mechanisms.

## Scope boundary

This skill is for Explorer only. It does not change Architect, Developer, Reviewer, Auditor, Spec, Research, or any other agent workflow.

<!-- managed-by: opencode-path -->
