# Progress

last_completed_batch: 0
in_progress_batch: none
skipped_batches: []

## Design system gaps
Items the design system did not define and the functional default that was used instead.
(none yet)

## Global deviations
Decisions that diverge from docs/EDITOR_SPEC.md, with the reason. Each one also appears under its batch.
- The design system file is `DESIGN_SYSTEM.md` (repo root), not `DESIGN_SYSTEMS.md` as the docs say. Every reference to `DESIGN_SYSTEMS.md` means this file. Reason: the real filename, kept as-is per NEXT_BATCH_SETUP §0.

## Follow-ups
Small things discovered during a batch that belong to a later batch. Format: `- [from Batch NN -> Batch MM] description`.
- [from Batch 00 -> Batch 01] `npm run check` and `npm run lint` do not exist yet; Batch 01 creates them along with the Vite + React scaffold.

## Batch log

### Batch 00: Setup
- status: done
- date: 2026-10-14
- notes: created /next-batch command, PROGRESS.md and CLAUDE.md; moved EDITOR_SPEC.md, BATCHES.md, NEXT_BATCH_SETUP.md into docs/; initialized git
- deviations: design system path is `DESIGN_SYSTEM.md` (see Global deviations)
- follow-ups: [from Batch 00 -> Batch 01] add `lint` and `check` scripts
- design gaps: none
- pending manual checks: none
