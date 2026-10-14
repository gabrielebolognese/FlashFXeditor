# /next-batch: Setup Instructions for Claude Code

Give this file to Claude Code once, at the very start of the project (before Batch 01), with the instruction: "Read `docs/NEXT_BATCH_SETUP.md` and do everything in it." It creates the `/next-batch` slash command, the progress file and the project memory (`CLAUDE.md`). After that, the whole build runs as:

1. `/next-batch` loads the next batch into context and presents a plan.
2. You read the plan, adjust if needed, then type `Go`.
3. Claude Code builds it, verifies the acceptance list, updates `docs/PROGRESS.md`, commits.
4. Repeat.

Nothing is built until `Go` is typed. Each batch is one commit named `batch-NN: <title>`.

---

## 0. Preconditions and file locations

Expected repo layout (move files here if they are elsewhere, or record the real paths in `CLAUDE.md` in step 3):

```
DESIGN_SYSTEMS.md                design system (colors, fonts, sizes, theme): the only source for UI values
docs/EDITOR_SPEC.md              master specification (features, architecture, deep timeline spec)
docs/BATCHES.md                  the ordered batch plan with acceptance criteria
docs/PROGRESS.md                 created by this setup; the running state of the build
docs/NEXT_BATCH_SETUP.md         this file
.claude/commands/next-batch.md   created by this setup; the slash command
CLAUDE.md                        created or extended by this setup; project memory loaded every session
```

If `DESIGN_SYSTEMS.md` is not at the repo root, find it (`git ls-files | grep -i design`) and use its real path everywhere below. Never guess a token value; if the design system does not define something, follow the functional defaults in `docs/EDITOR_SPEC.md` and log the gap in `docs/PROGRESS.md`.

---

## 1. Create `docs/PROGRESS.md`

Create it with exactly this content (fill the date):

```markdown
# Progress

last_completed_batch: 0
in_progress_batch: none
skipped_batches: []

## Design system gaps
Items the design system did not define and the functional default that was used instead.
(none yet)

## Global deviations
Decisions that diverge from docs/EDITOR_SPEC.md, with the reason. Each one also appears under its batch.
(none yet)

## Follow-ups
Small things discovered during a batch that belong to a later batch. Format: `- [from Batch NN -> Batch MM] description`.
(none yet)

## Batch log

### Batch 00: Setup
- status: done
- date: YYYY-MM-DD
- notes: created /next-batch command, PROGRESS.md and CLAUDE.md
- deviations: none
- follow-ups: none
- design gaps: none
- pending manual checks: none
```

Rules for this file (also written into the command): the three header fields are the machine-readable state; every batch gets one `### Batch NN: Title` entry; entries are never deleted, only updated; manual-verification items that Claude Code could not verify itself are listed under `pending manual checks` inside the batch entry until the user confirms them.

---

## 2. Create `.claude/commands/next-batch.md`

Create the file with exactly this content. It is a Claude Code project slash command; the body is the prompt that runs when the user types `/next-batch` (with optional arguments available as `$ARGUMENTS`).

```markdown
---
description: Load the next implementation batch from docs/BATCHES.md into context, present a plan, and build it only after the user replies "Go".
argument-hint: [batch number | status | plan | redo | skip]
---

You are running the batch workflow for the Shorts Editor. Follow these steps exactly and in order.

## Step 1: Resolve which batch

Read `docs/PROGRESS.md`. Let `last` = `last_completed_batch`, `inprog` = `in_progress_batch`.

Interpret `$ARGUMENTS`:
- empty: if `inprog` is a number, resume that batch (it was started but not finished: find what remains from its entry in PROGRESS.md and from the code); otherwise target `last + 1`.
- a number `N`: target batch N. If N > last + 1, warn that the batches in between were not completed and ask for confirmation before continuing.
- `status`: print a compact table of all batches (number, title, status from PROGRESS.md), the design system gaps and the open follow-ups, then stop.
- `plan`: same as empty, but never build in this run, even if the user later says Go (plan-only mode).
- `redo`: target the batch currently in progress, or `last` if none; treat the batch as a fresh implementation of its remaining acceptance items (do not revert finished work).
- `skip`: ask the user for a one-line reason, record the target batch as skipped in PROGRESS.md (`skipped_batches` and a batch entry with status skipped), then stop.

## Step 2: Load exactly what is needed (do not read whole files)

1. From `docs/BATCHES.md`, extract the `## Batch rules` section and the section of the target batch only: from the heading matching `## Batch NN:` up to the next line that starts with `## Batch` or `---`. Use grep with line numbers and sed to extract the range; never read the whole file.
2. From the batch text, collect the `Spec refs` list. For each `§n` read the whole `## n.` section of `docs/EDITOR_SPEC.md`; for each `§n.n` read the `### n.n` subsection. Always also read `## 0` and `## 4` (they are short and binding). Extract by heading ranges with grep and sed.
3. Read `DESIGN_SYSTEMS.md` in full. It governs every UI value.
4. From `docs/PROGRESS.md`, read the Global deviations, the Follow-ups addressed to this batch, the Design system gaps, and the entries of the two previous batches.
5. Look at the code the batch will touch: `tree src -L 3` (or `find src -maxdepth 3 -type d`), and open the specific modules named in the batch's `Build` and `Implementation notes`. Do not open unrelated modules.

## Step 3: Present the plan and stop

Output, in this order and nothing else:

1. `## Batch NN: <title>` and the one-line Goal.
2. **Build plan**: a numbered list mapping each `Build` item to concrete files (create or modify), in the order you will implement them. Name the store subscriptions, worker messages, commands (with their ids) and tests you will add.
3. **Design system usage**: the token names you will use and any gap you already see.
4. **Risks and deviations**: anything in the batch that conflicts with the current code or the spec, with your proposed resolution.
5. **Questions**: at most 3, only if an answer changes what you build. Otherwise write `none`.
6. **Acceptance checklist**: restate the batch's acceptance items verbatim as checkboxes.
7. The line: `Reply "Go" to build this batch, or answer the questions / request changes to the plan.`

Then STOP. Write no code, create no files, run no build. Wait for the user. If the user replies with changes or answers, update the plan and stop again. Only the exact word `Go` (any casing) starts implementation. In `plan` mode, never implement.

## Step 4: On "Go", build

1. Set `in_progress_batch: NN` in `docs/PROGRESS.md` and add (or update) the batch entry with `status: in_progress` and the date.
2. Implement the plan. Respect `docs/EDITOR_SPEC.md` §3 and §4 as binding, the batch's `Do not build yet` list, and the Batch rules. When a future feature needs a hook, add an interface or a `// TODO(batch MM)` comment, never a partial implementation.
3. Write the unit tests the Batch rules require for engine code in the same batch.
4. Run `npm run check` (typecheck, lint, test, build). Fix everything until it is green. Never mark the batch done with a red check.
5. Verify the acceptance checklist: run the tests that cover each item; for manual items, do what can be done from the shell (build, scripted checks, dev commands) and list the remainder as `pending manual checks` for the user with exact steps to reproduce.
6. Update `docs/PROGRESS.md`: `last_completed_batch: NN`, `in_progress_batch: none`, and the batch entry with `status: done`, date, notes (what was built, numbers measured), deviations (with reasons), follow-ups (as `[from Batch NN -> Batch MM]` lines, also copied to the Follow-ups section), design gaps (also copied to the Design system gaps section), pending manual checks.
7. Commit everything: `git add -A && git commit -m "batch-NN: <title>"`.
8. Print a completion report: the checklist with ticks, the pending manual checks, the commit hash, and the line `Next: run /next-batch for Batch MM: <title>`.

Never start the next batch on your own. Never skip the plan step. Never read the whole of `docs/BATCHES.md` or `docs/EDITOR_SPEC.md` into context; extract sections.
```

Notes on the command mechanics:

- Claude Code loads `.claude/commands/*.md` as project slash commands. The body is injected as the prompt; `$ARGUMENTS` is replaced by whatever follows `/next-batch`.
- "Pulling the batch into memory" means loading only that batch's text, its spec sections and the design system into the context of the current session. The command does this with grep/sed ranges so the context stays small enough for an advanced model to keep full attention on the batch.
- The plan-then-Go handshake happens in the same conversation: the command's output ends the turn; the user's `Go` is the next message; Claude Code continues with the plan still in context.

---

## 3. Create or extend `CLAUDE.md` (project memory)

Append this block (create the file if missing). This is loaded at the start of every Claude Code session, so it must be short and only contain what every session needs:

```markdown
# Shorts Editor: project memory

## Documents (read these, never guess)
- `docs/EDITOR_SPEC.md`: the master specification. Sections are referenced as §n.n from the batches. §3 (architecture) and §4 (performance rules) are binding in every batch.
- `docs/BATCHES.md`: the ordered build plan with acceptance criteria. Work happens one batch at a time through `/next-batch`.
- `docs/PROGRESS.md`: current state, deviations, follow-ups, design system gaps. Update it at the end of every batch.
- `DESIGN_SYSTEMS.md`: the only source for colors, typography, spacing, radii, icon size, button size, control heights, shadows and theme. Read it before any UI work. No color or size literals in code: tokens only (CSS custom properties + the `Theme` bridge for canvases).

## Workflow
- `/next-batch` loads the next batch, presents a plan and waits for the word `Go`. Nothing is built before `Go`.
- One batch = one commit `batch-NN: <title>`. `npm run check` must be green before a batch is marked done.
- Do not build features from later batches. Leave `// TODO(batch NN)` hooks instead.
- Deviations from the spec are allowed only with a written reason in `docs/PROGRESS.md`.

## Architecture reminders (details in EDITOR_SPEC.md §3 and §4)
- React is for panel chrome only. Timeline, preview, gizmo and text rasterizer are framework-free classes drawing to canvases through the single `FrameScheduler`.
- Document = immutable `Project` updated only via commands (Immer `produceWithPatches`, patches = undo). Session state (selection, playhead, zoom) is separate and not undoable. Gestures write ephemeral state and commit one command on release.
- Time: integer frames at project fps in the document; integer microseconds for media. No floats persisted.
- All media work (demux, decode, encode, analysis) runs in workers; the main thread only uploads to the GPU and closes frames immediately.
- Zero React commits during playback, scrubbing, dragging and field scrubbing. Verify with the Profiler when touching anything interactive.

## Scripts
- `npm run dev`, `npm run check` (typecheck + lint + test + build), `npm test`, `npm run build`.
```

If `CLAUDE.md` already has content, keep it and add this block at the end.

---

## 4. First run

1. Verify the three files exist: `.claude/commands/next-batch.md`, `docs/PROGRESS.md`, `CLAUDE.md`.
2. Commit: `git add -A && git commit -m "batch-00: setup next-batch workflow"`.
3. Run `/next-batch`. It must load Batch 01 (scaffold and layout shell with placeholders) and present the plan. Reply `Go` when the plan is right.

---

## 5. Daily use

- `/next-batch` : next batch (or resume the one in progress).
- `/next-batch status` : where the build stands, open follow-ups, design gaps.
- `/next-batch plan` : plan only, no build even after Go (use it to read ahead).
- `/next-batch 12` : jump to a specific batch (warns if earlier ones are unfinished).
- `/next-batch redo` : re-run the current or last batch for its remaining acceptance items.
- `/next-batch skip` : skip the next batch with a recorded reason (meant for the optional batches 33, 48, 49).

When a batch's plan looks too big for one sitting, answer with "split: do items 1-4 now, 5-7 as a second Go" and the command will build in two passes under the same batch number (one commit per pass, `batch-NN-a`, `batch-NN-b`). When something in the spec is wrong or outdated, fix the spec file first (one commit), then run `/next-batch` again so the plan reflects the corrected text.
