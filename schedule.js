// The schedule as the page knows it: the shows from the start of today for
// the week ahead, asked again every five minutes, and the time now, moved on
// every minute, so what is on air and what is next follow the clock. Every
// time is UK time - the station's - whoever is reading.

import { Controller } from "./gd_chime/gd_chime.js";

/** How many days ahead the schedule shows, today included. */
export const DAYS = 7;
const MINUTE = 60 * 1000;

/** The station's clock: every time on the site is UK time, whatever the reader's device says. */
export const UK = "Europe/London";
const PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: UK, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });

/** A moment as it reads on a UK clock: { year, month, day, hour, minute, weekday ("Tue") }. */
export function ukParts(date) {
  const got = Object.fromEntries(PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return { year: Number(got.year), month: Number(got.month), day: Number(got.day), hour: Number(got.hour) % 24, minute: Number(got.minute), weekday: got.weekday };
}

/** The moment a UK clock reads this (month from 1; days past the month's end roll on), through the clocks changing. */
export function ukTime(year, month, day, hour = 0, minute = 0) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const read = ukParts(new Date(guess));
    guess += wanted - Date.UTC(read.year, read.month - 1, read.day, read.hour, read.minute);
  }
  return new Date(guess);
}

/** "20:00": the 24-hour clock, as radio schedules are written, in UK time. */
export const timeOf = (date) => { const at = ukParts(date); return `${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`; };
/** A show's times, always saying they are UK time: people listen from all over the world. "20:00–22:00 UK". */
export const slotOf = (show) => `${timeOf(show.starts)}–${timeOf(show.ends)} UK`;
/** The UK day a moment falls on: "2030-03-19". */
export const dayId = (date) => { const at = ukParts(date); return `${at.year}-${String(at.month).padStart(2, "0")}-${String(at.day).padStart(2, "0")}`; };
/** Noon on a UK day, by its id, or this many days after it: a moment standing for the day. */
export const dayAt = (id, later = 0, hour = 12) => { const [y, m, d] = id.split("-").map(Number); return ukTime(y, m, d + later, hour); };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "Tue 19", in UK days. */
export const weekdayOf = (date) => `${ukParts(date).weekday} ${ukParts(date).day}`;
/** "Tue 19 March", in UK days. */
export const dateOf = (date) => `${weekdayOf(date)} ${MONTHS[ukParts(date).month - 1]}`;
/** "Tue 19", "Today", "Tomorrow", in UK days. */
export function dayName(date, today) {
  const [a, b] = [dayId(date), dayId(today)].map((id) => { const [y, m, d] = id.split("-").map(Number); return Date.UTC(y, m - 1, d); });
  const ahead = Math.round((a - b) / (24 * 60 * MINUTE));
  if (ahead === 0) return "Today";
  if (ahead === 1) return "Tomorrow";
  return weekdayOf(date);
}
/** The DJs of a show, as words: "VELD", "VELD & Mara Voss", "VELD, Nyx & Mara Voss". */
export function djsOf(show) {
  const names = (show?.djs ?? []).map((dj) => dj.name);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
export const genresOf = (show) => (show?.genres ?? []).map((genre) => genre.name);

export class Schedule extends Controller {
  /** From the studio (studio.js), or from nobody at all: the page walked by its probe, told its shows instead. */
  constructor(chimes, studio, clock = () => new Date()) {
    super(chimes);
    this.studio = studio;
    this.clock = clock;
    this.shows = this.value([]);
    this.now = this.value(clock());
    this.loading = this.value("waiting"); // waiting, loading, ready or failed
    this.trouble = this.value("");
    this._asked = 0;
    this._timers = [];
    if (studio) {
      this.load();
      this._timers.push(setInterval(() => this.load(), 5 * MINUTE));
      this._timers.push(setInterval(() => this.tick(), MINUTE));
    }
  }

  /** The days the schedule shows: today and the days after it. */
  days() {
    const today = dayId(this.now.read());
    return Array.from({ length: DAYS }, (_, ahead) => dayAt(today, ahead));
  }

  load() {
    const asked = ++this._asked;
    const today = dayId(this.now.read());
    const [first, last] = [dayAt(today, 0, 0), dayAt(today, DAYS, 0)];
    this.loading.setValue("loading");
    return this.studio.schedule(first, last).then((found) => {
      if (asked !== this._asked || this.disposed) return;
      if (!found.ok) { this.loading.setValue("failed"); this.trouble.setValue(found.error); return; }
      this.received(found.shows);
    });
  }

  /** The shows, as found. */
  received(shows) {
    this.shows.setValue(shows);
    this.loading.setValue("ready");
    this.trouble.setValue("");
  }

  tick() { this.now.setValue(this.clock()); }

  /** The show on air now, or null. */
  onAir() {
    const now = this.now.read();
    return this.shows.read().find((show) => show.starts <= now && now < show.ends) ?? null;
  }

  /** The shows still to come, soonest first. */
  upcoming(count = 3) {
    const now = this.now.read();
    return this.shows.read().filter((show) => show.starts > now).slice(0, count);
  }

  /** A day's shows, by its id ("2030-03-19"), not those already over. */
  on(day) {
    const now = this.now.read();
    return this.shows.read().filter((show) => dayId(show.starts) === day && show.ends > now);
  }

  isOnAir(show) { const now = this.now.read(); return !!show && show.starts <= now && now < show.ends; }

  dispose() {
    for (const timer of this._timers) clearInterval(timer);
    super.dispose();
  }
}
