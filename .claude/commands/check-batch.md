---
description: Diagnose a batch whose session ended early or used up a time window, put the repo back in a working state, and leave directions for the next session. Used by scripts/run-batches.sh.
argument-hint: error | window
---

You are checking on a batch another session was working on. Do not build features in this run.

Read `docs/PROGRESS.md`. The batch is `in_progress_batch` if it is a number, otherwise `last_completed_batch` (a fix after a rejected review). Extract that batch from `docs/BATCHES.md` with a grep/sed line range (never the whole file) and read its entry in PROGRESS.md, including earlier `- check (...)` notes and review lists.

`$ARGUMENTS` says why you were called:
- `error`: the previous session ended before finishing. Its output is in `docs/last-session.log`. Find out why: API or network error, crash, a command that hung, a broken `node_modules`, a dev server or headless browser left holding a port, a red `npm run check`, a half-written file.
- `window`: the batch used a whole time window without finishing. Find out what is taking so long: which acceptance items are done, which remain, and whether the work is stuck (repeating the same measurement, chasing a number this machine cannot reach, rewriting the same module).

Then:
1. Put the repo in a state the next session can continue from: stop dev servers and headless browsers that earlier sessions left running, repair `node_modules` if it is broken (`npm install`), fix a file left half-written. Never stop the server on port 5300 (the user's progress preview). Do not revert batch work and do not commit.
2. Run `npm run check` and note the result.
3. Append to the batch entry a block starting with `- check (error, <date> <time>):` or `- check (window, <date> <time>):` with the cause, what is done, what remains (by acceptance item), and concrete directions for the next session: what to do first and what to stop doing. When the work is stuck on something that cannot be reached here, direct the next session to record the measured result as a deviation or a `pending manual checks` item and move on.
4. Set `needs_human: <one-line reason>` only if the batch cannot continue without something only the user can provide (a missing required file, an account, a credential, hardware). Otherwise never.

The last line of your output must be `CHECK: DONE`.
