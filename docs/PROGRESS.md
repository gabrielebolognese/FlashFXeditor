# Progress

last_completed_batch: 02
in_progress_batch: none
skipped_batches: []
needs_human: none

## Design system gaps
Items the design system did not define and the functional default that was used instead.
- Spacing scale: DS uses Tailwind steps without tokens. Added `--space-0..6` = 2/4/6/8/12/16/24px. (Batch 01)
- Type tracking unit: DS gives unitless values (+0.4, −0.1); used px. (Batch 01)
- Shell metrics: DS says headers ~36–44px. App bar 40px (`--appbar-height`), panel header 32px (`--panel-header-height`). (Batch 01)
- Splitters: 1px `--hairline` line (`--splitter-line`), 6px invisible hit area (`--splitter-hit`), `--accent-dim` on hover/drag. (Batch 01)
- Tooltips: `--surface-4` background, hairline border, overlay shadow, caption type, shortcut in mono tertiary, 400ms delay (`--tooltip-delay`). (Batch 01)
- Theme attribute: DS is dark-only and names no switch; `data-theme="dark"` on `<html>` is what the theme bridge watches. (Batch 01)
- Toggle switch: 28×16 track (`--control-default` × `--space-5`), 12px thumb; on = `--accent` track, `--on-accent` thumb. (Batch 01)
- Icon sizes: `--icon-size` 14px, `--icon-size-sm` 12px (DS range 11–16, 13–14 typical in toolbars). (Batch 01)
- Tokenized DS prose values: `--hover-wash` (menus "bg-white/[0.04]"), `--disabled-opacity` 0.6, brand gold stops `--brand-gold-from/-to/-hover`, `--on-brand-gold`. (Batch 01)
- Panel surfaces: DS has no NLE panel mapping. App bar and panel headers `--surface-1`, panel bodies `--bg`, timeline and preview wells `--bg-sunken`. (Batch 01)
- Brand mark: DS says "bold letter" but caps weights at 600; used 600. (Batch 01)

## Global deviations
Decisions that diverge from docs/EDITOR_SPEC.md, with the reason. Each one also appears under its batch.
- The design system file is `DESIGN_SYSTEM.md` (repo root), not `DESIGN_SYSTEMS.md` as the docs say. Every reference to `DESIGN_SYSTEMS.md` means this file. Reason: the real filename, kept as-is per NEXT_BATCH_SETUP §0.
- Styling uses plain CSS Modules + CSS custom properties, not the Tailwind named in `DESIGN_SYSTEM.md`. Reason: spec §3.1 (binding) forbids Tailwind; DS values are kept verbatim as tokens. Approved with the Batch 01 plan. (Batch 01)
- Node engine is `>=22.12` (spec says nothing; scaffold said 20). Reason: Vitest 5 requires it. (Batch 01)
- Track heights live only in the document (`Track.height`, §5.2), not in session state as §5.3 also lists. Reason: one source of truth, and §5.2 types are required verbatim. (Batch 02)
- Undo restores the selection from before the undone command, redo the one after it (§6.19's wording is ambiguous). (Batch 02)

## Follow-ups
Small things discovered during a batch that belong to a later batch. Format: `- [from Batch NN -> Batch MM] description`.
- [from Batch 00 -> Batch 01] `npm run check` and `npm run lint` do not exist yet; Batch 01 creates them along with the Vite + React scaffold. (done in Batch 01)
- [from Batch 01 -> Batch 02] `KeyDispatcher.onAction` only logs (`app/services.ts`); route it to the command registry. (done in Batch 02: `ActionRegistry`)
- [from Batch 01 -> Batch 03] Persist splitter positions per project (session.json); localStorage `layout.v1` stays the global fallback.
- [from Batch 01 -> Batch 05] Unsupported screen should also trigger when `navigator.gpu` exists but no adapter can be acquired.
- [from Batch 01 -> Batch 09] Pause/resume the `IdleQueue` from playback (and from gestures from Batch 11 on).
- [from Batch 01 -> Batch 42] Chrome reserves Ctrl+N, Ctrl+T and Ctrl+W in a normal tab; pages cannot preventDefault them, so `project.new` (Mod+N) opens a browser window instead. Decide on an alternative binding or document the installed-app (PWA window) route.
- [from Batch 02 -> Batch 03] `DocumentStore.load(project)` (replace the document, clear the history); persist `SessionState` + the selection snapshot (arrays) in session.json; default tracks for a new project (`createProject` makes none); keep `meta.modifiedAt` current on save.
- [from Batch 02 -> Batch 07] Default `timeline.pxPerFrame` in `DEFAULT_SESSION` is a placeholder (4).
- [from Batch 02 -> Batch 16] Selection kind `track` has no track id field (§3.3 shape kept as written); add one with track selection. Link-group offsets are not validated (allowed by §5.2); the sync badge needs an offset query.
- [from Batch 02 -> Batch 34] `validate.ts` applies the media in/out rules to image clips too; decide the rule for stills.
- [from Batch 02 -> Batch 41] `validate.ts` requires a media clip's `mediaId` to exist in `project.media`; "Remove, keep offline clips" must keep the media record (marked missing) or relax this check.

## Dependencies
Why each dependency exists (Batch rule 8).
- `react`, `react-dom` 18.3.1: UI chrome (spec §3.1). (Batch 01)
- `lucide-react`: icon set named by the design system. (Batch 01)
- `vite`, `@vitejs/plugin-react`, `typescript`: dev/build (spec §3.1). (Batch 01)
- `vitest`, `jsdom`: unit tests; jsdom for the DOM-dependent core tests (keyboard dispatcher, focus scopes, theme bridge). (Batch 01)
- `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`: `npm run lint`, including the color-literal rule of §3.7. (Batch 01)
- `@types/react`, `@types/react-dom`, `@types/node`: typings. (Batch 01)
- `immer` 11: `produceWithPatches`/`applyPatches` for commands and undo (spec §3.3 names it). (Batch 02)

## Batch log

### Batch 00: Setup
- status: done
- date: 2026-10-14
- notes: created /next-batch command, PROGRESS.md and CLAUDE.md; moved EDITOR_SPEC.md, BATCHES.md, NEXT_BATCH_SETUP.md into docs/; initialized git. Later (after Batch 01): applied docs/AUTO_BATCH_SETUP.md: `auto` mode and step 7b in /next-batch, /review-batch command, `scripts/run-batches.sh`, `needs_human` field.
- deviations:
  - design system path is `DESIGN_SYSTEM.md` (see Global deviations)
  - `scripts/run-batches.sh` differs from AUTO_BATCH_SETUP §3 in three places. (1) Batch numbers are read in base 10, because PROGRESS.md stores "01", which bash would treat as octal (so "08" and "09" would fail). (2) Completion is compared as a number, because "02" != "2" as strings, which would stop the run after the first batch. (3) A run that only applied review fixes is detected by a `batch-NN: fixes` HEAD commit, not by grepping the whole file for `fix-attempt: done`, because that grep matches any earlier batch and would skip the retry and could loop forever.
  - /next-batch Step 3 says outright that `auto` mode does not stop after the plan, so it does not contradict the "Then STOP" line.
  - Added `.gitattributes` (`*.sh text eol=lf`): `core.autocrlf` is true on this machine, and a CRLF checkout would break the script in bash.
- follow-ups: [from Batch 00 -> Batch 01] add `lint` and `check` scripts
- design gaps: none
- pending manual checks: none

### Batch 01: Scaffold, layout shell with placeholders, foundations
- status: done
- date: 2026-10-14
- notes:
  - Vite 8 + React 18 + TS strict; scripts dev/build/preview/typecheck/lint/test/check. ESLint color-literal rule on `src/**/*.{ts,tsx}` plus `scripts/check-css-colors.mjs` for stylesheets; only `src/styles/tokens.css` may hold colors. Verified: a hex, a template-literal hex and an `rgba(` in a `.ts` file fail lint; a hex in a `.module.css` fails the CSS check.
  - §3.2 folder structure with one-line `index.ts` placeholders.
  - Tokens transcribed from the DS into `tokens.css`; `core/theme/theme.ts` (`ThemeBridge`, `readTheme`) with a MutationObserver on `data-theme`/`style`.
  - `core/store/createStore.ts` (selector subscriptions) and `core/store/layoutStore.ts` (ratios, clamping to §2.1 minimums, persistence in localStorage `layout.v1`, panel sizes from ResizeObserver).
  - Layout shell: app bar, four panels with header strips, three splitters (CSS variables written by a store subscription, no React render), `canvas-host` divs in timeline and preview sized from the layout store.
  - `FrameScheduler` + `IdleQueue`; keymap with the full §18 table as data (101 command bindings), `KeyDispatcher` (scope first, then global; inputs own their keys; textEditing/dialog isolated; hold keys suppress repeats and dispatch key-up; layout-aware key match with physical-code fallback), `FocusScopeTracker` (`data-scope` on panels).
  - UI primitives: IconButton (24px, tooltip with keymap shortcut), Tooltip (single DOM-driven bubble, no React state), Toggle, Select, static NumberField, ContextMenu shell, `useDismiss`.
  - Timeline toolbar: all §6.1 groups and dividers, buttons disabled; overflow hides lowest-priority groups (zoom, then toggles, add, edit, tools) behind a working "..." menu.
  - Unsupported-browser screen checking WebGPU, WebCodecs (6 classes), FSA (2 pickers).
  - Measured: 60 unit tests (9 files). Build 182.8 kB JS (59.7 kB gzip), 13.4 kB CSS. Headless-Chrome run over CDP: layout exact at 1920×1080 (left 1306/1920, preview 614×1040, rows 520/520, media 640) and 1600×900 (1088/1600, 512×860, 430/430, 533); no page overflow; splitter minimums hold at exactly 280/320/300/220/220; positions survive reload; 0 React commits during splitter drags and toolbar hover; toolbar fits with nothing hidden at 1600 (1074px), hides toggles + zoom at 1280; every scope resolution logged correctly; typing in an input fires nothing; Theme values correct and re-read on `data-theme` change; no console errors.
- deviations:
  - Styling: CSS Modules instead of the DS's Tailwind (see Global deviations).
  - No `commandRegistry.ts` placeholder: `KeyDispatcher` takes an `onAction` callback and the logging stub lives in `app/services.ts`; Batch 02 adds the registry. Reason: one less placeholder module.
  - Command ids: undo/redo are `history.undo`/`history.redo`; Link/Unlink is one toggle `edit.toggleLink` (one key in §18).
  - Frame-step arrows are hold keys (repeat suppressed, key-up dispatched) per §3.6; canvas nudge arrows repeat normally.
  - Additions not in the Build list: splitter double-click restores the default split; the toolbar overflow "..." menu (§6.1), needed so the toolbar never overflows at narrow widths.
  - Node engine raised to `>=22.12` (Vitest 5).
- follow-ups: [from Batch 01 -> Batch 02] route key actions to the command registry; [from Batch 01 -> Batch 03] per-project splitter positions; [from Batch 01 -> Batch 05] no-adapter WebGPU check; [from Batch 01 -> Batch 09] IdleQueue pause from playback; [from Batch 01 -> Batch 42] Ctrl+N/T/W are browser-reserved
- design gaps: spacing scale, tracking unit, shell metrics, splitters, tooltips, theme attribute, toggle switch, icon sizes, tokenized prose values, panel surfaces, brand mark weight (details in Design system gaps)
- pending manual checks:
  1. `npm run dev`, open the URL in your own Chrome at a 1920×1080 and a 1600×900 window: the shell shows no scrollbars or clipped content.
  2. React DevTools Profiler: record while dragging each splitter and while hovering the toolbar; expect zero commits. (Automated with a commit-counting hook, not the real Profiler.)
  3. DevTools console with the "Verbose" level enabled: on load `[theme]` is logged; click the timeline and press Ctrl+K → `[cmd] edit.split {scope: 'timeline', ...}`; click the preview and press Left → `canvas.nudgeLeft`; in `document.documentElement.setAttribute('data-theme','x')` → `[theme] changed`.
  4. Temporarily add `const x = "#ff0000";` to any `.ts` file under `src/`, run `npm run lint` (fails), remove it.

### Batch 02: Document model, time math, commands and undo
- status: done
- date: 2026-10-14
- notes:
  - `core/document`: `types.ts` (§5.2 verbatim + `SCHEMA_VERSION = 1`, `JsonValue`), `time.ts` (exact integer `frameToUs`/`usToFrame`, `formatTimecode` `mm:ss:ff` / `mm:ss.mmm` with hours only when needed, `parseTimecode` with `+30`, `-15`, `+2.`), `validate.ts` (every §5.2 invariant; `DocumentInvariantError` names track and clip), `project.ts` (`createProject` defaults 1080×1920, 30/1, 48 kHz), `fixtures.ts` (test builders only).
  - `core/commands`: `Command` (`id`, `label`, `coalesceKey?`, `affects`, `run(draft, ctx)`), `CommandContext` (`playhead`, `selection` snapshot, `newId`), `UndoStack` (patches, inverse patches, selection before/after, 300 ms coalescing by key, sealed after undo/redo, limit 1000, labels), `basicCommands.ts` (`track.add`, `track.remove`, `clip.add`, `clip.remove`, `clip.update`), `ActionRegistry` (action id -> handler; keys and buttons both call `run`).
  - `core/store`: `DocumentStore` (`getState`, `dispatch(cmd, {selection?})`, `subscribe(listener, {affects?})`, `transaction(label, fn)` with nested rollback, `undo`/`redo`, `history` store; dev validation after every commit, undo and redo; invalid results throw and leave the document untouched), `SessionStore` (§5.3 shape; `state` and `selection` on separate channels; `setPlayhead`, `setSelection`), `selection.ts` (Set in memory, array snapshots), `useStoreSelector` (`useSyncExternalStore` + memoized `Object.is` bail-out).
  - `timeline/model/queries.ts`: per-track index (start-sorted clips, `maxDuration`, `end`) cached per (clips record, track) so it is rebuilt only for new document versions; `clipAtFrame`, `clipsAtFrame`, `clipsInRange` (binary search bounded by max duration), `neighbors`, `trackGaps`, `gapAt`, `trackEnd`, `contentEnd`, `editPoints`, `next/prevEditPoint`.
  - App: `services.ts` creates `sessionStore`, `documentStore` (empty project) and `actions`; `history.undo`/`history.redo` registered; `KeyDispatcher.onAction` routes registered ids to `actions`, unregistered ids are still logged and consume the key. App bar Undo/Redo are enabled from `documentStore.history`, with "Undo <label>" tooltips.
  - Measured: 149 unit tests in 19 files (+89 tests). 10,000 trivial dispatches with dev validation on: ~62 ms warm when run alone (raw Immer alone is ~39 ms); the test warms up and takes the best of 3 runs because the other test workers compete for the CPU: 83–113 ms best, while single runs during the full parallel suite reached 206–305 ms (limit 300; a single cold run once failed at 305 ms). Fuzz: 3 seeds × 1,000 random raw ops (994–998 real changes each, 38–55 clips on 5–7 tracks), validated after every op, undone to a deep-equal original and redone to a deep-equal final; plus 1,000 interleaved ops/undos/redos. 29.97 round-trips every frame of 1 hour; every frame of 10 minutes round-trips format→parse at 24/29.97/30/60 in both modes; 10:00:00 at 29.97 is frame 17983 (600.033 s, zero drift). Build 205.2 kB JS (67.9 kB gzip; immer adds ~8 kB gzip), 13.4 kB CSS.
  - Headless Chrome (CDP) on the dev server: Undo/Redo start disabled; after a dispatch Undo enables with "Undo Rename project"; Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, button clicks do the same; Ctrl+Z in a text input does not reach the document; no console warnings or errors. Batch 01 regression at 1600×900: no overflow, panels 1088 / 512×860 / 430+430 / media 533, same as Batch 01.
- deviations:
  - Track heights: §5.3 lists them as session state, but §5.2 has `Track.height` in the document and this batch requires §5.2 exactly. Kept only in the document; `SessionState` has no track heights. Splitter positions stay in `layoutStore` (per-project persistence is a Batch 03 follow-up).
  - Undo selection: §6.19 says "restored to what it was after the undone command", which is ambiguous. Undo restores the selection from before the command and redo the one after it (callers pass `{ selection }` to `dispatch` when a command changes it, e.g. delete). A selection made after the command is replaced on undo. Ids that no longer exist are dropped.
  - "Set playhead" and "set selection" are session functions (`setPlayhead`, `setSelection`), not document commands: session state is never undoable (§3.3).
  - Later-batch types (`LabelColor`, `EaseId`, `Gradient`, `Transition`, `TextContent`, `TextStyle`, `TextAnim`, `TextPreset`, `CaptionTrackData`) are opaque JSON placeholders with `TODO(batch NN)`.
  - Functional defaults where the spec is silent: `RGBA` channels 0..1; timecode seconds are wall-clock seconds, so 29.97 shows no drift; plain digits are frames; in frames mode `.` and `:` both separate right-aligned fields, in ms mode `.` starts decimal seconds; undo history limit 1000 steps; new video tracks go above the other video tracks, caption tracks above all video, audio tracks at the end.
  - Validation adds checks implied by the spec: integer frames and microseconds, `start >= 0`, `speed > 0`, media existence, unique track ids, a clip on exactly one track, clip record keys equal ids, video tracks before audio tracks, `captionTracks` keys are caption tracks. Link-group offsets are allowed by §5.2, so they are not errors.
  - `Store.get()` renamed to `getState()` so all stores share the `{ getState, subscribe }` shape `useStoreSelector` reads.
  - The follow-up's "command registry" is `ActionRegistry` (action ids), to keep it apart from document `Command`s.
  - Removed the one-line placeholders `core/commands/index.ts`, `core/document/index.ts`, `timeline/model/index.ts` now that the folders have real modules.
- follow-ups: [from Batch 02 -> Batch 03] `load(project)`, session.json, default tracks, `modifiedAt`; [from Batch 02 -> Batch 07] default `pxPerFrame`; [from Batch 02 -> Batch 16] track selection id, link offset query; [from Batch 02 -> Batch 34] image in/out rule; [from Batch 02 -> Batch 41] offline clips vs media-existence check
- design gaps: none
- pending manual checks:
  1. Optional (already automated over CDP): `npm run dev`, open the app in Chrome, DevTools console: `const s = await import('/src/app/services.ts'); s.documentStore.dispatch({ id: 'test.rename', label: 'Rename project', affects: ['settings'], run: d => { d.name = 'Renamed' } })`. Expect Undo enabled with tooltip "Undo Rename project"; Ctrl+Z → `s.documentStore.getState().name` is "Untitled project" and Redo is enabled; Ctrl+Shift+Z and Ctrl+Y redo; the buttons do the same.
  2. React DevTools Profiler, recording: run the dispatch above (expect one commit, AppBar only), then `(await import('/src/core/store/sessionStore.ts')).setPlayhead(s.sessionStore, 100)` (expect zero commits).
- review request: docs/PROGRESS.md package-lock.json package.json src/app/AppBar.tsx src/app/services.ts src/core/commands/ActionRegistry.test.ts src/core/commands/ActionRegistry.ts src/core/commands/UndoStack.test.ts src/core/commands/UndoStack.ts src/core/commands/basicCommands.test.ts src/core/commands/basicCommands.ts src/core/commands/command.ts src/core/commands/index.ts src/core/commands/undoFuzz.test.ts src/core/document/fixtures.ts src/core/document/index.ts src/core/document/project.ts src/core/document/time.test.ts src/core/document/time.ts src/core/document/types.ts src/core/document/validate.test.ts src/core/document/validate.ts src/core/store/DocumentStore.test.ts src/core/store/DocumentStore.ts src/core/store/createStore.ts src/core/store/layoutStore.test.ts src/core/store/layoutStore.ts src/core/store/selection.ts src/core/store/sessionStore.test.ts src/core/store/sessionStore.ts src/core/store/useStoreSelector.test.ts src/core/store/useStoreSelector.ts src/timeline/model/index.ts src/timeline/model/queries.test.ts src/timeline/model/queries.ts
- review: accepted
  - Evidence: `npm run check` green (typecheck, lint, 149/149 tests in 19 files, build 205.2 kB JS); full suite re-run green. Acceptance 1: `undoFuzz.test.ts` (3 seeds × 1,000 ops undone to `toStrictEqual(original)`, redone to final, plus 1,000 interleaved ops/undos/redos). Acceptance 2: `time.test.ts` round-trips every frame of 1 h at 30000/1001 (and 24/25/50/60). Acceptance 3: `DocumentStore.test.ts` perf test, measured alone 3 times at 58.7–90.8 ms per 10,000 dispatches with dev validation on (limit 300). Acceptance 4: `DocumentStore.test.ts` "does not notify a subscriber with affects ['markers'] for a clip update".
  - Scope: commands are raw (no overlap resolution, ripple or trim semantics); no disk serialization; nothing renders the document. No color, font or size literals in the changed files. Every TODO is tagged `(batch NN)` and points at the matching batch. §3.3/§3.4/§4: Immer `produceWithPatches`, commands get playhead/selection through `ctx` only, selection on its own channel, integer frames/µs enforced by `validate.ts`, only `AppBar` re-renders (on history availability/label changes).
