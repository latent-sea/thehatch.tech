// The handover countdown: one for the station's DJs and admins, so whoever
// is on and whoever is next see the same seconds. It ends at a moment the
// platform's clock sets (backend.sql, the_hatch_start_countdown), never a
// device's: this page reads the platform's clock a few times, keeps the
// reading that came back quickest, and counts to the end by that, so two
// devices whose own clocks disagree still show the same. A start or a stop
// reaches every open page at once (live), and is found again every quarter
// minute and on coming back into sight besides.

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=43903e6e00f2";
import { momentOf } from "./studio.js?v=43903e6e00f2";
import { ukParts, ukTime, timeOf } from "./schedule.js?v=43903e6e00f2";

export const SETS_LENGTH = "sets_the_countdown_length";
export const CHOOSES_LENGTH = "chooses_a_countdown_length";
export const SETS_UNTIL = "sets_the_countdown_end";
export const SETS_LABEL = "sets_the_countdown_label";
export const STARTS = "starts_the_countdown";
export const STOPS = "stops_the_countdown";

export const WORDS = {
  [SETS_LENGTH]: ["How long"],
  [CHOOSES_LENGTH]: ["Choose how long"],
  [SETS_UNTIL]: ["Until"],
  [SETS_LABEL]: ["What for"],
  [STARTS]: ["Start countdown"],
  [STOPS]: ["Stop countdown"],
};

/** Minutes as typed - "5", "2:30", "1.5" - as seconds, or null. */
export function secondsIn(typed) {
  const words = (typed ?? "").trim();
  const clock = /^(\d{1,4}):([0-5]\d)$/.exec(words);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const minutes = Number(words);
  return words && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : null;
}

/** A UK clock time as typed ("21:58") as the next moment it reads that, from now, or null. */
export function nextUk(typed, now = new Date()) {
  const at = /^(\d{1,2}):(\d{2})/.exec((typed ?? "").trim());
  if (!at || Number(at[1]) > 23 || Number(at[2]) > 59) return null;
  const today = ukParts(now);
  let when = ukTime(today.year, today.month, today.day, Number(at[1]), Number(at[2]));
  if (when <= now) when = ukTime(today.year, today.month, today.day + 1, Number(at[1]), Number(at[2]));
  return when;
}

/** What is left, as it is shown: "4:59.3", "1:04:59" over an hour, "+0:12" once past. */
export function shown(left) {
  if (left === null) return "–:––";
  const past = left < 0;
  const tenths = Math.floor(Math.abs(left) / 100);
  const seconds = Math.floor(tenths / 10);
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  const two = (n) => String(n).padStart(2, "0");
  const clock = h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
  return past ? `+${clock}` : h ? clock : `${clock}.${tenths % 10}`;
}

export class Countdown extends Controller {
  /** Through the studio, or none: the page walked by its probe. */
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.endsAt = this.value(null); // ms by the platform's clock, or null
    this.label = this.value("");
    this.startedBy = this.value("");
    this.startedAt = this.value(null);
    this.offset = this.value(0); // the platform's clock less this device's, ms
    this.spread = this.value(null); // how far the offset may be out, ms
    this.left = this.value(null); // ms left, below zero once past; null with none running
    this.length = this.value("5");
    this.until = this.value("");
    this.reason = this.value("");
    this.busy = this.value(false);
    this.problem = this.value("");
    this._timers = [];
    this._live = null;
  }

  /** Begun once one of the crew is signed in: the clock set, the countdown found, live, and ticking. */
  start() {
    if (this._timers.length || !this.studio) return;
    this.sync();
    this.load();
    this._live = this.studio.liveCountdown(() => this.load());
    this._timers.push(setInterval(() => this.tick(), 100));
    this._timers.push(setInterval(() => this.load(), 15 * 1000));
    this._timers.push(setInterval(() => this.sync(), 5 * 60 * 1000));
    this._seen = () => { if (!document.hidden) { this.sync(); this.load(); } };
    document.addEventListener("visibilitychange", this._seen);
  }

  /** The platform's clock read five times; the quickest answer is the truest. */
  async sync() {
    let best = null;
    for (let i = 0; i < 5; i++) {
      const read = await this.studio.serverClock();
      if (this.disposed) return;
      if (read.ok && (!best || read.rtt < best.rtt)) best = read;
    }
    if (!best) return;
    this.offset.setValue(best.server - best.at);
    this.spread.setValue(Math.ceil(best.rtt / 2));
    this.tick();
  }

  async load() {
    const found = await this.studio.countdown();
    if (this.disposed) return;
    if (!found.ok) { this.problem.setValue(found.error); return; }
    this.received(found.data);
  }

  /** The countdown as the platform holds it. */
  received(row) {
    this.endsAt.setValue(momentOf(row?.ends_at));
    this.label.setValue(row?.label ?? "");
    this.startedBy.setValue(row?.started_by ?? "");
    this.startedAt.setValue(momentOf(row?.started_at));
    this.tick();
  }

  /** The platform's time now, by this device's clock set right. */
  now() { return Date.now() + this.offset.read(); }

  tick() {
    const ends = this.endsAt.read();
    const left = ends === null ? null : ends - this.now();
    // once ten minutes past, it has done its work
    const shownLeft = left !== null && left < -10 * 60 * 1000 ? null : left;
    if (shownLeft === null ? this.left.read() !== null : Math.floor(shownLeft / 100) !== Math.floor((this.left.read() ?? NaN) / 100)) this.left.setValue(shownLeft);
  }

  running() { return this.left.read() !== null; }

  /** Who started it, when, and what for, in words. */
  about() {
    if (!this.running()) return Phrase.of("No countdown running.");
    const by = this.startedBy.read() || "Someone";
    const at = this.startedAt.read() ? timeOf(new Date(this.startedAt.read())) : "";
    const ends = timeOf(new Date(this.endsAt.read()));
    return Phrase.with("Started by %s at %s UK · ends %s UK", [by, at, ends]);
  }

  answers() { return Object.keys(WORDS); }

  would(action) {
    if ((action === STARTS || action === STOPS) && this.busy.read()) return Phrase.of("Sending");
    if (action === STARTS) {
      if (this.until.read().trim()) { if (!nextUk(this.until.read(), new Date(this.now()))) return Phrase.of("A UK time, please, like 21:58"); }
      else if (!secondsIn(this.length.read())) return Phrase.of("How long: minutes, like 5 or 2:30");
      else if (secondsIn(this.length.read()) > 24 * 3600) return Phrase.of("24 hours at most");
    }
    if (action === STOPS && !this.running()) return Phrase.of("No countdown running");
    return null;
  }

  told(action, payload) {
    if (action === SETS_LENGTH) { this.length.setValue(payload.line); this.until.setValue(""); }
    if (action === CHOOSES_LENGTH) { this.length.setValue(String(payload.minutes)); this.until.setValue(""); }
    if (action === SETS_UNTIL) this.until.setValue(payload.line);
    if (action === SETS_LABEL) this.reason.setValue(payload.line);
    if (action === STARTS) {
      const until = this.until.read().trim() ? nextUk(this.until.read(), new Date(this.now())) : null;
      this.send(() => this.studio.startCountdown({ seconds: until ? null : secondsIn(this.length.read()), until, label: this.reason.read().trim() }));
    }
    if (action === STOPS) this.send(() => this.studio.stopCountdown());
    return null;
  }

  async send(work) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.busy.setValue(false);
    if (!done.ok) { this.problem.setValue(done.error); return; }
    await this.load();
  }

  dispose() {
    for (const timer of this._timers) clearInterval(timer);
    if (this._seen) document.removeEventListener("visibilitychange", this._seen);
    this._live?.leave();
    super.dispose();
  }
}
