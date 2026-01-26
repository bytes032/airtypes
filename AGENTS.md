# AGENTS.md

## Global Rules

## Scope

- Follow the closest `AGENTS.md`; nested files override or extend these rules.
- Keep instructions concise and avoid duplicating subproject rules.

## Coding Style & Naming Conventions

- Language: TypeScript (ESM). Prefer strict typing; avoid any.
- Formatting/linting via biome and oxlint; run pnpm format and pnpm write before commits.
- Add brief code comments for tricky or non-obvious logic.
- Prefer Bun for TypeScript execution (scripts, dev, tests): bun <file.ts> / bunx <tool>.
- Avoid fallbacks for unrealistic cases.
- Never assume backwards compatibility is required.
- Aim to keep files under ~700 LOC; guideline only (not a hard guardrail). Split/refactor when it improves clarity or testability.

## Commits

- Commits: use scripts/committer "type: message" <files...> (Conventional Commits).
- Group related changes; avoid bundling unrelated refactors.

## Guardrails

- Multi-agent safety: do not create/apply/drop git stash entries unless explicitly requested (this includes git pull --rebase --autostash). Assume other agents may be working; keep unrelated WIP untouched and avoid cross-cutting state changes.
- Multi-agent safety: do not create/remove/modify git worktree checkouts (or edit .worktrees/*) unless explicitly requested.
- Multi-agent safety: do not switch branches / check out a different branch unless explicitly requested.
- Multi-agent safety: when you see unrecognized files, keep going; focus on your changes and commit only those.
- Do not ask whether to commit or for a commit message. After making changes, choose a conventional commit message and commit via `scripts/committer`.
- When the user says "push", you may git pull --rebase to integrate latest changes (never discard other agents' work), then push.
