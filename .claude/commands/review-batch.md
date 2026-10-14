---
description: Independent review of the last completed batch against its acceptance list. Used by scripts/run-batches.sh.
---

You are reviewing code you did not write. Read `docs/PROGRESS.md`; let NN = `last_completed_batch`. Extract Batch NN from `docs/BATCHES.md` with a grep/sed line range (never the whole file) and read its `Spec refs` sections from `docs/EDITOR_SPEC.md` plus `## 0` and `## 4`. Read `DESIGN_SYSTEM.md` (repo root; the docs call it `DESIGN_SYSTEMS.md`).

Inspect the files named in the batch entry's `review request:` line (`git diff HEAD~2 -- <files>` or `git show` on the batch commit). Run `npm run check`.

Verify, in order:
1. Every `Acceptance` item is covered by a test, verified by a command you ran, or listed under `pending manual checks` with exact reproduction steps.
2. Nothing from `Do not build yet` was built.
3. No color, font or size literal outside the tokens file.
4. The new code respects EDITOR_SPEC §3 and §4: React only for chrome, one command per gesture, integer time, media work in workers, canvases drawn through the scheduler.
5. Every TODO has a `(batch NN)` tag.

Write the verdict into the batch entry in `docs/PROGRESS.md`: `review: accepted` or `review: rejected` followed by a numbered list of concrete problems with file paths and line numbers. Commit `batch-NN: review`. The very last line of your output must be exactly `REVIEW: ACCEPTED` or `REVIEW: REJECTED`.
