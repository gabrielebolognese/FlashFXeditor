# Progress

last_completed_batch: 01
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

## Follow-ups
Small things discovered during a batch that belong to a later batch. Format: `- [from Batch NN -> Batch MM] description`.
- [from Batch 00 -> Batch 01] `npm run check` and `npm run lint` do not exist yet; Batch 01 creates them along with the Vite + React scaffold. (done in Batch 01)
- [from Batch 01 -> Batch 02] `KeyDispatcher.onAction` only logs (`app/services.ts`); route it to the command registry.
- [from Batch 01 -> Batch 03] Persist splitter positions per project (session.json); localStorage `layout.v1` stays the global fallback.
- [from Batch 01 -> Batch 05] Unsupported screen should also trigger when `navigator.gpu` exists but no adapter can be acquired.
- [from Batch 01 -> Batch 09] Pause/resume the `IdleQueue` from playback (and from gestures from Batch 11 on).
- [from Batch 01 -> Batch 42] Chrome reserves Ctrl+N, Ctrl+T and Ctrl+W in a normal tab; pages cannot preventDefault them, so `project.new` (Mod+N) opens a browser window instead. Decide on an alternative binding or document the installed-app (PWA window) route.

## Dependencies
Why each dependency exists (Batch rule 8).
- `react`, `react-dom` 18.3.1: UI chrome (spec §3.1). (Batch 01)
- `lucide-react`: icon set named by the design system. (Batch 01)
- `vite`, `@vitejs/plugin-react`, `typescript`: dev/build (spec §3.1). (Batch 01)
- `vitest`, `jsdom`: unit tests; jsdom for the DOM-dependent core tests (keyboard dispatcher, focus scopes, theme bridge). (Batch 01)
- `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`: `npm run lint`, including the color-literal rule of §3.7. (Batch 01)
- `@types/react`, `@types/react-dom`, `@types/node`: typings. (Batch 01)

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
