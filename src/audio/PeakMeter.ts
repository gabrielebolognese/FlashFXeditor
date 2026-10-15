// Stereo peak meter state (spec §14): per channel the peak level in dBFS (instant rise, FALL_DB_PER_SECOND
// fall), a peak hold kept HOLD_SECONDS, and a clip indicator that latches on any sample above full
// scale until it is reset (a click). Pure; MeterView feeds it the analysers' peaks every frame.

export const HOLD_SECONDS = 1.5;
/** How fast the bar and an expired hold fall (spec silent; a common peak-meter release). */
export const FALL_DB_PER_SECOND = 24;
/** The bottom of the scale; quieter is shown as nothing. */
export const FLOOR_DB = -60;
/** The top of the scale: overs show above 0 dBFS up to here. */
export const CEILING_DB = 6;

export interface MeterChannel {
  /** dBFS, FLOOR_DB when silent. */
  level: number;
  hold: number;
  /** Clock seconds the hold stays until. */
  holdUntil: number;
  clipped: boolean;
}

export const toDb = (peak: number) => (peak > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(peak)) : FLOOR_DB);

/** Position of a level on the scale, 0 (floor) to 1 (ceiling). */
export const meterFraction = (db: number) => Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)));

export class PeakMeter {
  readonly channels: [MeterChannel, MeterChannel] = [this.silent(), this.silent()];
  private last: number | null = null;

  /** Takes the linear peaks of the last window at clock `now` (s). Returns true while anything still moves. */
  update(peaks: readonly [number, number], now: number): boolean {
    const dt = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    let moving = false;
    this.channels.forEach((channel, i) => {
      const peak = peaks[i] ?? 0;
      const db = toDb(peak);
      if (peak > 1) channel.clipped = true;
      channel.level = Math.max(db, channel.level - FALL_DB_PER_SECOND * dt);
      if (db >= channel.hold) {
        channel.hold = db;
        channel.holdUntil = now + HOLD_SECONDS;
      } else if (now > channel.holdUntil) {
        channel.hold = Math.max(channel.level, channel.hold - FALL_DB_PER_SECOND * dt);
      }
      if (channel.level > FLOOR_DB || channel.hold > FLOOR_DB) moving = true;
    });
    return moving;
  }

  get clipped(): boolean {
    return this.channels[0].clipped || this.channels[1].clipped;
  }

  resetClip(): void {
    for (const channel of this.channels) channel.clipped = false;
  }

  private silent(): MeterChannel {
    return { level: FLOOR_DB, hold: FLOOR_DB, holdUntil: 0, clipped: false };
  }
}
