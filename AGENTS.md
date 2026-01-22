# AGENTS.md

## Coding Style & Naming Conventions

- Prefer Bun for TypeScript execution (scripts, dev, tests): bun <file.ts> / bunx <tool>.
- Avoid fallbacks for unrealistic cases.
- Never assume backwards compatibility is required.
- Aim to keep files under ~700 LOC; guideline only (not a hard guardrail). Split/refactor when it improves clarity or testability.

## Commits

- Commits: use scripts/committer "type: message" <files...> (Conventional Commits).
- Group related changes; avoid bundling unrelated refactors.

## Guardrails

- Multi-agent safety: do not create/apply/drop git stash entries unless explicitly requested (this includes git pull --rebase --autostash). Assume other agents may be working; keep unrelated WIP untouched and avoid cross-cutting state changes.
- Multi-agent safety: when the user says "push", you may git pull --rebase to integrate latest changes (never discard other agents' work). When the user says "commit", scope to your changes only. When the user says "commit all", commit everything in grouped chunks.
- Multi-agent safety: do not create/remove/modify git worktree checkouts (or edit .worktrees/*) unless explicitly requested.
- Multi-agent safety: do not switch branches / check out a different branch unless explicitly requested.
- Multi-agent safety: when you see unrecognized files, keep going; focus on your changes and commit only those.
