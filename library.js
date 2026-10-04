// What the station has, beyond this week: its DJs (each with their genres and
// next show), the month's shows ahead, the year's recorded shows (Listen
// Again), and the last month's shows, recorded or not (the admin's to-dos). Found once as the page opens, and again when an admin or DJ
// changes something. The screens filter them as the reader asks.

import { Controller } from "./gd_chime/gd_chime.js?v=6e80f466b292";

const DAY = 24 * 60 * 60 * 1000;

export class Library extends Controller {
  /** From the studio (studio.js), or from nobody: the page walked by its probe, told what there is instead. */
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.djs = this.value([]);
    this.ahead = this.value([]);
    this.archive = this.value([]);
    this.recent = this.value([]);
    this.loading = this.value("waiting"); // waiting, loading, ready or failed
    this.trouble = this.value("");
    this._asked = 0;
    if (studio) this.load();
  }

  async load() {
    const asked = ++this._asked;
    const now = new Date();
    this.loading.setValue("loading");
    const [djs, ahead, archive, recent] = await Promise.all([
      this.studio.djList(),
      this.studio.findShows({ from: now, to: new Date(now.getTime() + 31 * DAY) }),
      this.studio.findShows({ from: new Date(now.getTime() - 366 * DAY), to: now, recorded: true, newestFirst: true }),
      this.studio.findShows({ from: new Date(now.getTime() - 31 * DAY), to: now, newestFirst: true }),
    ]);
    if (asked !== this._asked || this.disposed) return;
    const failed = [djs, ahead, archive, recent].find((found) => !found.ok);
    if (failed) { this.loading.setValue("failed"); this.trouble.setValue(failed.error); return; }
    this.received({ djs: djs.data, ahead: ahead.shows, archive: archive.shows, recent: recent.shows });
  }

  /** What there is, as found. */
  received({ djs = [], ahead = [], archive = [], recent = [] }) {
    this.djs.setValue(djs);
    this.ahead.setValue(ahead);
    this.archive.setValue(archive);
    this.recent.setValue(recent);
    this.loading.setValue("ready");
    this.trouble.setValue("");
  }

  /** The coming week's shows with no picture of their own. */
  needingPictures() {
    const week = Date.now() + 7 * DAY;
    return this.ahead.read().filter((show) => !show.picture && show.starts.getTime() < week);
  }

  /** The last month's finished shows with no recording link yet. */
  needingRecordings() {
    const now = new Date();
    return this.recent.read().filter((show) => !show.recording && show.ends <= now);
  }

  dj(id) { return this.djs.read().find((dj) => dj.id === id) ?? null; }

  /** Every genre anyone is tagged with, by name. */
  genres() {
    const names = new Set();
    for (const item of [...this.djs.read(), ...this.ahead.read(), ...this.archive.read()]) for (const genre of item.genres) names.add(genre.name);
    return [...names].sort();
  }

  /** Whether a DJ or show is tagged with this genre; any, given none. */
  static tagged(item, genre) { return !genre || item.genres.some((tag) => tag.name === genre); }

  /** Whether a show has this DJ. */
  static hosts(show, dj) { return show.djs.some((host) => host.id === dj); }
}
