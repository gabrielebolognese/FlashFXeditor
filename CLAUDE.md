# Project context

Shorts Editor: browser video editor. Vite + React 18 (chrome only) + TypeScript strict, ESM, Vitest (jsdom). Node >= 22.12.

## Conventions

- ESM only. Relative imports must end in `.js` (e.g. `import { x } from "./thing.js"`).
- Source lives in `src/`, build output in `dist/` (gitignored).
- Tests are colocated as `*.test.ts` next to the code they cover.
- Styling: CSS Modules (`*.module.css`) with design tokens from `src/styles/tokens.css`; color literals live only in that file (enforced by `npm run lint`).
- Run `npm run check` before considering a change done.

## Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Typecheck: `npm run typecheck`
- Lint (ESLint + CSS color and token checks): `npm run lint`
- Test: `npm test`
- Everything: `npm run check`

# Shorts Editor: project memory

## Documents (read these, never guess)
- `docs/EDITOR_SPEC.md`: the master specification. Sections are referenced as §n.n from the batches. §3 (architecture) and §4 (performance rules) are binding in every batch.
- `docs/BATCHES.md`: the ordered build plan with acceptance criteria. Work happens one batch at a time through `/next-batch`.
- `docs/PROGRESS.md`: current state, deviations, follow-ups, design system gaps. Update it at the end of every batch.
- `docs/user-guide/`: the user documentation, extended after every batch by `/document-batch` (rules, page template and video placeholders are in `.claude/commands/document-batch.md`).
- `DESIGN_SYSTEM.md` (the docs call it `DESIGN_SYSTEMS.md`; same file): the only source for colors, typography, spacing, radii, icon size, button size, control heights, shadows and theme. Read it before any UI work. No color or size literals in code: tokens only (CSS custom properties + the `Theme` bridge for canvases).

## Workflow
- `/next-batch` loads the next batch, presents a plan and waits for the word `Go`. Nothing is built before `Go`.
- One batch = one commit `batch-NN: <title>`. `npm run check` must be green before a batch is marked done.
- Do not build features from later batches. Leave `// TODO(batch NN)` hooks instead.
- Deviations from the spec are allowed only with a written reason in `docs/PROGRESS.md`.
- Port 5300 is the user's progress preview (`vite preview` of `dist/`, started by `scripts/run-batches.sh`). Never stop it or use it; run your own dev servers on other ports.

## Architecture reminders (details in EDITOR_SPEC.md §3 and §4)
- React is for panel chrome only. Timeline, preview, gizmo and text rasterizer are framework-free classes drawing to canvases through the single `FrameScheduler`.
- Document = immutable `Project` updated only via commands (Immer `produceWithPatches`, patches = undo). Session state (selection, playhead, zoom) is separate and not undoable. Gestures write ephemeral state and commit one command on release.
- Time: integer frames at project fps in the document; integer microseconds for media. No floats persisted.
- All media work (demux, decode, encode, analysis) runs in workers; the main thread only uploads to the GPU and closes frames immediately.
- Zero React commits during playback, scrubbing, dragging and field scrubbing. Verify with the Profiler when touching anything interactive.

## Scripts
- `npm run dev`, `npm run check` (typecheck + lint + test + build), `npm test`, `npm run build`.
