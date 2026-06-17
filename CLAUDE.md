# Claude handoff

Read `AGENTS.md` first, top to bottom.

`AGENTS.md` is the single source of truth for this repo: current state, locked decisions, roadmap, open decisions, and progress log. Keep it updated at the end of every working session so Claude and Codex do not drift.

# Shell output compression (Squeez)

When running shell commands that produce verbose output, pipe through `squeez` and state exactly what to look for. Always set `PYTHONUTF8=1` on Windows to avoid encoding errors.

Examples (Git Bash):
- `npm run build 2>&1 | PYTHONUTF8=1 squeez "find build errors"`
- `npx tsc --noEmit 2>&1 | PYTHONUTF8=1 squeez "find type errors"`
- `git log --oneline -50 | PYTHONUTF8=1 squeez "find the relevant commit"`
- `npm run dev 2>&1 | PYTHONUTF8=1 squeez "find startup errors"`

Do NOT use squeez when:
- You need exact uncompressed output (reading files to write a patch)
- The command is interactive
- The output is already short (under ~20 lines)
