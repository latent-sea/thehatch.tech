// The admin's Schedule Manager: a week of shows a day at a time, and the
// form a show is added or changed in - its title, day, times, DJs, genre
// tags and words, and, for a new one, how many more weeks it repeats. DJs
// and genres missing from the lists are added from the form. Times are typed
// in UK time, wherever the admin is; a show ending at or before it starts
// ends the next day. What may be saved is decided on the platform (backend.sql).

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=07f24e0a957b";
import { dayAt, dayId, timeOf, ukParts, ukTime } from "./schedule.js?v=07f24e0a957b";

export const PREVIOUS_WEEK = "shows_the_previous_week";
export const NEXT_WEEK = "shows_the_next_week";
export const CHOOSES_DAY = "chooses_a_day";
export const NEW_SHOW = "adds_a_show";
export const EDITS_SHOW = "edits_a_show";
export const CANCELS = "cancels_the_show";
export const SETS_TITLE = "sets_the_title";
export const SETS_DATE = "sets_the_date";
export const SETS_FROM = "sets_the_start";
export const SETS_TO = "sets_the_end";
export const SETS_WORDS = "sets_the_description";
export const SETS_REPEAT = "sets_the_repeat";
export const TOGGLES_DJ = "toggles_a_dj";
export const TOGGLES_GENRE = "toggles_a_genre";
export const ADDS_DJ = "adds_a_dj";
export const ADDS_GENRE = "adds_a_genre";
export const SAVES = "saves_the_show";
export const DELETES = "deletes_a_show";
export const DELETES_LATER = "deletes_a_show_and_later_copies";

export const WORDS = {
  [PREVIOUS_WEEK]: ["← Previous week"],
  [NEXT_WEEK]: ["Next week →"],
  [CHOOSES_DAY]: ["Choose a day"],
  [NEW_SHOW]: ["＋ New show"],
  [EDITS_SHOW]: ["Edit"],
  [CANCELS]: ["Cancel"],
  [SETS_TITLE]: ["Title"],
  [SETS_DATE]: ["Day"],
  [SETS_FROM]: ["Starts"],
  [SETS_TO]: ["Ends"],
  [SETS_WORDS]: ["Description"],
  [SETS_REPEAT]: ["Repeats"],
  [TOGGLES_DJ]: ["Choose a DJ"],
  [TOGGLES_GENRE]: ["Choose a genre"],
  [ADDS_DJ]: ["Add a DJ"],
  [ADDS_GENRE]: ["Add a genre"],
  [SAVES]: ["Save show"],
  [DELETES]: ["Delete this show"],
  [DELETES_LATER]: ["Delete this and the later weeks"],
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** The UK Monday of the week a moment is in, by its id. */
const mondayOf = (date) => dayId(dayAt(dayId(date), -WEEKDAYS.indexOf(ukParts(date).weekday)));

export class ScheduleDesk extends Controller {
  /** Through the studio, or none: the page walked by its probe, handed a stand-in. Told when the schedule changed. */
  constructor(chimes, studio, changed = () => {}, today = new Date()) {
    super(chimes);
    this.studio = studio;
    this.changed = changed;
    this.week = this.value(mondayOf(today));
    this.day = this.value(dayId(today));
    this.shows = this.value([]);
    this.djs = this.value([]);
    this.genres = this.value([]);
    this.loading = this.value("waiting");
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
    // the form: null while closed, "new" or the id of the show being changed
    this.editing = this.value(null);
    this.title = this.value("");
    this.date = this.value("");
    this.from = this.value("");
    this.to = this.value("");
    this.words = this.value("");
    this.repeat = this.value("0");
    this.chosenDjs = this.value([]);
    this.chosenGenres = this.value([]);
    this._asked = 0;
  }

  /** Everything the desk shows, asked for: once an admin is signed in. */
  start() {
    this.loadShows();
    this.loadLists();
  }

  /** The week's days, each as noon on its UK day. */
  days() { return Array.from({ length: 7 }, (_, n) => dayAt(this.week.read(), n)); }

  async loadShows() {
    const asked = ++this._asked;
    const monday = this.week.read();
    this.loading.setValue("loading");
    const found = await this.studio.schedule(dayAt(monday, 0, 0), dayAt(monday, 7, 0));
    if (asked !== this._asked || this.disposed) return;
    if (!found.ok) { this.loading.setValue("failed"); this.problem.setValue(found.error); return; }
    this.shows.setValue(found.shows);
    this.loading.setValue("ready");
  }

  async loadLists() {
    const [djs, genres] = await Promise.all([this.studio.djs(), this.studio.genres()]);
    if (this.disposed) return;
    if (djs.ok) this.djs.setValue(djs.data);
    if (genres.ok) this.genres.setValue(genres.data);
    if (!djs.ok || !genres.ok) this.problem.setValue(djs.error || genres.error);
  }

  /** The chosen day's shows. */
  onDay() { return this.shows.read().filter((show) => dayId(show.starts) === this.day.read()); }

  showNamed(id) { return this.shows.read().find((show) => show.id === id) ?? null; }

  /** The form's times, typed in UK time, as Dates, or null while incomplete: an end at or before the start is the next day. */
  times() {
    const [date, from, to] = [this.date.read(), this.from.read(), this.to.read()];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(from) || !/^\d{2}:\d{2}/.test(to)) return null;
    const [y, m, d] = date.split("-").map(Number);
    const at = (clock, later = 0) => { const [h, min] = clock.split(":").map(Number); return ukTime(y, m, d + later, h, min); };
    const starts = at(from);
    let ends = at(to);
    if (ends <= starts) ends = at(to, 1);
    return { starts, ends };
  }

  answers() { return Object.keys(WORDS); }

  would(action) {
    const changes = [SAVES, DELETES, DELETES_LATER, ADDS_DJ, ADDS_GENRE];
    if (changes.includes(action) && this.busy.read()) return Phrase.of("Saving");
    if (action === SAVES) {
      if (!this.title.read().trim()) return Phrase.of("Give the show a title");
      if (!this.times()) return Phrase.of("Choose its day and times");
      const repeat = Number(this.repeat.read() || 0);
      if (this.editing.read() === "new" && !(Number.isInteger(repeat) && repeat >= 0 && repeat <= 52)) return Phrase.of("Repeat for 0 to 52 more weeks");
    }
    if ([NEW_SHOW, EDITS_SHOW].includes(action) && this.editing.read() !== null) return Phrase.of("Finish or cancel the show you're editing");
    return null;
  }

  told(action, payload) {
    this.notice.setValue("");
    if (action === PREVIOUS_WEEK || action === NEXT_WEEK) {
      const moved = dayId(dayAt(this.week.read(), action === NEXT_WEEK ? 7 : -7));
      this.week.setValue(moved);
      this.day.setValue(moved);
      this.loadShows();
    }
    if (action === CHOOSES_DAY) this.day.setValue(payload.day);
    if (action === NEW_SHOW) this.open("new", { date: this.day.read(), from: "20:00", to: "22:00" });
    if (action === EDITS_SHOW) {
      const show = this.showNamed(payload.id);
      if (show) this.open(show.id, { title: show.title, words: show.description, date: dayId(show.starts), from: timeOf(show.starts), to: timeOf(show.ends), djs: show.djs.map((dj) => dj.id), genres: show.genres.map((genre) => genre.id) });
    }
    if (action === CANCELS) { this.editing.setValue(null); this.problem.setValue(""); }
    if (action === SETS_TITLE) this.title.setValue(payload.line);
    if (action === SETS_DATE) this.date.setValue(payload.line);
    if (action === SETS_FROM) this.from.setValue(payload.line);
    if (action === SETS_TO) this.to.setValue(payload.line);
    if (action === SETS_WORDS) this.words.setValue(payload.line);
    if (action === SETS_REPEAT) this.repeat.setValue(payload.line);
    if (action === TOGGLES_DJ) this.chosenDjs.update((ids) => (ids.includes(payload.id) ? ids.filter((id) => id !== payload.id) : [...ids, payload.id]));
    if (action === TOGGLES_GENRE) this.chosenGenres.update((ids) => (ids.includes(payload.id) ? ids.filter((id) => id !== payload.id) : [...ids, payload.id]));
    if (action === ADDS_DJ) return this.addTo(payload.line, (name) => this.studio.addDj(name), this.djs, this.chosenDjs, "A DJ needs a name");
    if (action === ADDS_GENRE) return this.addTo(payload.line, (name) => this.studio.addGenre(name), this.genres, this.chosenGenres, "A genre needs a name");
    if (action === SAVES) this.save();
    if (action === DELETES || action === DELETES_LATER) this.remove(payload.id, action === DELETES_LATER);
    return null;
  }

  open(editing, { title = "", words = "", date = "", from = "", to = "", djs = [], genres = [] }) {
    this.title.setValue(title);
    this.words.setValue(words);
    this.date.setValue(date);
    this.from.setValue(from);
    this.to.setValue(to);
    this.repeat.setValue("0");
    this.chosenDjs.setValue(djs);
    this.chosenGenres.setValue(genres);
    this.problem.setValue("");
    this.editing.setValue(editing);
  }

  /** A DJ or genre added to its list, and chosen for the show: refused at once with no name. */
  addTo(line, add, list, chosen, needs) {
    const name = (line ?? "").trim();
    if (!name) return Phrase.of(needs);
    this.change(() => add(name), (made) => {
      list.update((all) => [...all, made].sort((a, b) => a.name.localeCompare(b.name)));
      chosen.update((ids) => [...ids, made.id]);
    });
    return null;
  }

  save() {
    const editing = this.editing.read();
    const { starts, ends } = this.times();
    const show = { title: this.title.read().trim(), description: this.words.read().trim(), starts, ends, dj_ids: this.chosenDjs.read(), genre_ids: this.chosenGenres.read() };
    if (editing !== "new") show.id = editing;
    const repeat = editing === "new" ? Number(this.repeat.read() || 0) : 0;
    this.change(() => this.studio.saveShow(show, repeat), () => {
      this.editing.setValue(null);
      this.day.setValue(dayId(starts));
      this.notice.setValue(repeat ? `Saved, with ${repeat} more weekly ${repeat === 1 ? "copy" : "copies"}` : "Saved");
      this.afterChange();
    });
  }

  remove(id, withLater) {
    this.change(() => this.studio.deleteShow(id, withLater), () => {
      this.notice.setValue(withLater ? "Deleted, with the later weeks" : "Deleted");
      this.afterChange();
    });
  }

  afterChange() {
    this.loadShows();
    this.changed();
  }

  /** A change sent; while it goes nothing else is sent, and what went wrong is said. */
  async change(work, then) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.busy.setValue(false);
    if (!done.ok) { this.problem.setValue(done.error); return; }
    then(done.data);
  }
}
