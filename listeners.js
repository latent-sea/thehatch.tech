// Who has been listening: the stream host's count, logged every five minutes
// on the platform with whoever was on air (backend.sql, the_hatch_listens).
// For the admin, the last 24 hours an hour at a time and the shows heard
// most; for a DJ, their own shows' figures. Hours are UK hours.

import { renew } from "./renew.js?v=25cdbcae67c3";
import { Controller } from "./gd_chime/gd_chime.js?v=25cdbcae67c3";
import { timeOf } from "./schedule.js?v=25cdbcae67c3";

const HOUR = 60 * 60 * 1000;

/** The last 24 hours, an hour each, from logged counts: the most heard in each, and on what. */
export function byHour(counts, now = new Date()) {
  const end = Math.floor(now.getTime() / HOUR) * HOUR + HOUR;
  return Array.from({ length: 24 }, (_, n) => {
    const from = end - (24 - n) * HOUR;
    const inHour = counts.filter((count) => count.at.getTime() >= from && count.at.getTime() < from + HOUR);
    const best = inHour.reduce((top, count) => (!top || count.connections > top.connections ? count : top), null);
    const value = best?.connections ?? 0;
    const label = timeOf(new Date(from));
    const on = best?.show_title ? ` (${best.show_title})` : "";
    return { label, value, says: inHour.length ? `${label} UK: ${value} at the most${on}` : `${label} UK: nothing logged` };
  });
}

/** A DJ's or the station's figures over their shows: the most at once, the average show's average, and the shows heard most. */
export function figures(stats) {
  const peak = stats.reduce((top, show) => Math.max(top, show.peak), 0);
  const average = stats.length ? Math.round((stats.reduce((sum, show) => sum + show.average, 0) / stats.length) * 10) / 10 : 0;
  const top = [...stats].sort((a, b) => b.peak - a.peak || b.average - a.average).slice(0, 5);
  return { peak, average, shows: stats.length, top };
}

export class Listeners extends Controller {
  /** Through the studio, or none: the page walked by its probe. dj, for a DJ's own figures; none, the admin's. */
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.counts = this.value([]);
    this.stats = this.value([]);
    this.loaded = this.value(false);
    this.problem = this.value("");
  }

  /** The admin's: the last day's counts, and every show's figures over 90 days. */
  async loadStation() {
    const now = new Date();
    const [counts, stats] = await Promise.all([this.studio.listenerHistory(new Date(now.getTime() - 25 * HOUR), now), this.studio.showStats(null)]);
    if (this.disposed) return;
    this.received({ counts: counts.ok ? counts.data : [], stats: stats.ok ? stats.data : [] });
    if (!counts.ok || !stats.ok) this.problem.setValue(counts.error || stats.error);
  }

  /** A DJ's own shows' figures over 90 days. */
  async loadDj(dj) {
    const stats = await this.studio.showStats(dj);
    if (this.disposed) return;
    this.received({ stats: stats.ok ? stats.data : [] });
    if (!stats.ok) this.problem.setValue(stats.error);
  }

  received({ counts = [], stats = [] }) {
    renew(this.counts, counts);
    renew(this.stats, stats);
    this.loaded.setValue(true);
  }

  hours() { return byHour(this.counts.read()); }

  figures() { return figures(this.stats.read()); }
}
