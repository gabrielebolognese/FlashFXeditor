// An export's pause state on the main thread, kept in step with the worker's gate (spec §16). Pause
// can be pressed while the job's inputs are still gathered (the "Preparing…" phase): that is only
// recorded, and the job is posted in that state (`ExportJobParams.paused`). Changes after the post
// are sent; the worker handles its messages in order, so they always land after the job's state.
export class ExportPauseSync {
  private pausedValue = false;
  private posted = false;

  constructor(private readonly send: (paused: boolean) => void) {}

  get paused(): boolean {
    return this.pausedValue;
  }

  /** Pauses or resumes; returns the new state. */
  toggle(): boolean {
    this.pausedValue = !this.pausedValue;
    if (this.posted) this.send(this.pausedValue);
    return this.pausedValue;
  }

  /** The state the job is posted in; read right before posting it. Later changes are sent. */
  post(): boolean {
    this.posted = true;
    return this.pausedValue;
  }
}
