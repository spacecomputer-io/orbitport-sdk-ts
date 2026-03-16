# CLAUDE.md — orbitport-sdk-ts

## Before You Code

Before writing ANY implementation code, answer these questions:

1. **What problem are we solving?** — State the user pain point in one sentence.
2. **Who is this for?** — SDK consumers (developers integrating orbitport)?
3. **What does "done" look like?** — Define acceptance criteria before starting.
4. **Is this the right solution?** — Are we over-engineering? Is there a simpler approach?
5. **What's the simplest version that works?** — Ship that first, iterate later.

If you can't answer all 5, stop and clarify with Dai Lou before writing code.

## Project Context

- **TypeScript SDK** for the orbitport protocol
- **Reference implementation:** `spacecomputer-io/orbitport` (Rust)
- **Build:** TypeScript, npm/pnpm
- **CI:** GitHub Actions — npm vulnerability scanning (`pnpm audit --audit-level=high`)

## Code Standards

- TypeScript strict mode
- Interfaces over types, no enums
- Export all public API types
- Comprehensive JSDoc on public methods
- No `any`, no `@ts-ignore`

## Git

- Branch protection on `main` — must use PRs
- Never merge without explicit @echai approval
- Commit frequently, atomic commits, clear messages
- Always use Eason's GitHub profile
