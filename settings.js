// The station's own words and artwork - the About page, the Join Us page,
// the station's picture - read by every visitor (StationWords), and kept by
// an admin in Station Settings (Settings), with the list of genre tags:
// added, renamed, removed - and the admins themselves: invited by the email
// they sign in with (admins at once if they've signed in before, else when
// they first do), removed, never the last. Until
// the platform answers, the words are content.js's.

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=fc8f4b8b1b3f";
import { STATION } from "./content.js?v=fc8f4b8b1b3f";
import { EMAIL } from "./admin_djs.js?v=fc8f4b8b1b3f";

/** What visitors read: found once as the page opens, and again when an admin saves. */
export class StationWords extends Controller {
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.about = this.value(STATION.about.join("\n\n"));
    this.joinUs = this.value(STATION.joinUs);
    this.picture = this.value("");
    if (studio) this.load();
  }

  async load() {
    const found = await this.studio.settings();
    if (this.disposed || !found.ok || !found.data) return;
    this.received(found.data);
  }

  received({ about, join_us: joinUs, picture_url: picture }) {
    if (about) this.about.setValue(about);
    if (joinUs) this.joinUs.setValue(joinUs);
    this.picture.setValue(picture ?? "");
  }

  /** The About words as paragraphs: split at blank lines. */
  paragraphs() { return this.about.read().split(/\n\s*\n/).map((words) => words.trim()).filter(Boolean); }
}

export const SETS_ABOUT = "sets_the_about_words";
export const SETS_JOIN = "sets_the_join_words";
export const CHOOSES_PICTURE = "chooses_the_station_picture";
export const REMOVES_PICTURE = "removes_the_station_picture";
export const SAVES = "saves_the_settings";
export const ADDS_GENRE = "adds_a_station_genre";
export const SETS_GENRE_NAME = "sets_a_genre_name";
export const RENAMES_GENRE = "renames_a_genre";
export const DELETES_GENRE = "deletes_a_genre";
export const SETS_ADMIN_EMAIL = "sets_an_admin_email";
export const ADDS_ADMIN = "adds_an_admin";
export const REMOVES_ADMIN = "removes_an_admin";

export const WORDS = {
  [SETS_ABOUT]: ["About page"],
  [SETS_JOIN]: ["Join Us page"],
  [CHOOSES_PICTURE]: ["Choose the station's picture"],
  [REMOVES_PICTURE]: ["Use the logo"],
  [SAVES]: ["Save the words"],
  [ADDS_GENRE]: ["Add a genre"],
  [SETS_GENRE_NAME]: ["Genre name"],
  [RENAMES_GENRE]: ["Rename"],
  [DELETES_GENRE]: ["Remove genre"],
  [SETS_ADMIN_EMAIL]: ["Their sign-in email"],
  [ADDS_ADMIN]: ["Make admin"],
  [REMOVES_ADMIN]: ["Remove admin"],
};

export class Settings extends Controller {
  /** Through the studio, or none: the page walked by its probe. Told when what visitors see changed. */
  constructor(chimes, studio, changed = () => {}) {
    super(chimes);
    this.studio = studio;
    this.changed = changed;
    this.saved = this.value({ about: "", join_us: "", picture_url: "" });
    this.about = this.value("");
    this.joinUs = this.value("");
    this.genres = this.value([]);
    this.names = this.value({}); // genre id -> its name as typed
    this.admins = this.value([]);
    this.adminEmail = this.value("");
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
  }

  async load() {
    const [settings, genres, admins] = await Promise.all([this.studio.settings(), this.studio.genres(), this.studio.admins()]);
    if (this.disposed) return;
    if (settings.ok && settings.data) {
      this.saved.setValue(settings.data);
      this.about.setValue(settings.data.about);
      this.joinUs.setValue(settings.data.join_us);
    }
    if (genres.ok) { this.genres.setValue(genres.data); this.names.setValue(Object.fromEntries(genres.data.map((genre) => [genre.id, genre.name]))); }
    if (admins.ok) this.admins.setValue(admins.data);
    if (!settings.ok || !genres.ok || !admins.ok) this.problem.setValue(settings.error || genres.error || admins.error);
  }

  /** The genres and the admins found again, as others may have changed them; the words being typed are left as they are. */
  async loadLists() {
    const [genres, admins] = await Promise.all([this.studio.genres(), this.studio.admins()]);
    if (this.disposed) return;
    if (genres.ok) {
      const typed = this.names.read();
      this.genres.setValue(genres.data);
      this.names.setValue(Object.fromEntries(genres.data.map((genre) => [genre.id, typed[genre.id] ?? genre.name])));
    }
    if (admins.ok) this.admins.setValue(admins.data);
  }

  answers() { return Object.keys(WORDS); }

  would(action, payload) {
    if (![SETS_ABOUT, SETS_JOIN, SETS_GENRE_NAME, SETS_ADMIN_EMAIL].includes(action) && this.busy.read()) return Phrase.of("Saving");
    if (action === ADDS_ADMIN) {
      const email = this.adminEmail.read().trim().toLowerCase();
      if (!EMAIL.test(email)) return Phrase.of("The email they sign in with, please");
      if (this.admins.read().some((admin) => admin.email.toLowerCase() === email)) return Phrase.of("Already on the list");
    }
    if (action === REMOVES_ADMIN && !this.admins.read().find((admin) => admin.email === payload?.email)?.invited && this.admins.read().filter((admin) => !admin.invited).length < 2) return Phrase.of("The station needs at least one admin");
    if (action === SAVES) {
      const saved = this.saved.read();
      if (this.about.read() === saved.about && this.joinUs.read() === saved.join_us) return Phrase.of("Nothing to save");
      if (!this.about.read().trim()) return Phrase.of("The About page needs some words");
    }
    if (action === REMOVES_PICTURE && !this.saved.read().picture_url) return Phrase.of("It has the logo");
    if (action === RENAMES_GENRE) {
      const genre = this.genres.read().find((held) => held.id === payload?.id);
      const name = (this.names.read()[payload?.id] ?? "").trim().toLowerCase();
      if (!genre || name === genre.name) return Phrase.of("Unchanged");
      if (!name) return Phrase.of("A genre needs a name");
    }
    return null;
  }

  told(action, payload) {
    this.notice.setValue("");
    if (action === SETS_ABOUT) this.about.setValue(payload.line);
    if (action === SETS_JOIN) this.joinUs.setValue(payload.line);
    if (action === SETS_ADMIN_EMAIL) this.adminEmail.setValue(payload.line);
    if (action === ADDS_ADMIN) {
      const email = this.adminEmail.read().trim().toLowerCase();
      this.change(async () => { const made = await this.studio.inviteAdmin(email); if (made.ok) this.adminEmail.setValue(""); return made; },
        (now) => (now ? `${email} is an admin: they see the admin screens next time they open the site` : `${email} invited: they become an admin when they first sign in with Google`));
    }
    if (action === REMOVES_ADMIN) {
      const admin = this.admins.read().find((held) => held.email === payload.email);
      if (admin?.invited) this.change(() => this.studio.uninviteAdmin(admin.email), "Invite taken back");
      else if (admin) this.change(() => this.studio.removeAdmin(admin.user_id), "Admin removed");
    }
    if (action === SETS_GENRE_NAME) this.names.update((names) => ({ ...names, [payload.id]: payload.line }));
    if (action === SAVES) this.change(() => this.studio.saveSettings({ about: this.about.read().trim(), join_us: this.joinUs.read().trim() }), "Saved: the pages show the new words");
    if (action === CHOOSES_PICTURE) {
      if (!payload.file.type.startsWith("image/")) return Phrase.of("Please choose a picture (JPEG, PNG or WebP)");
      this.change(async () => {
        const kept = await this.studio.uploadPicture("station.jpg", payload.file);
        return kept.ok ? this.studio.saveSettings({ picture_url: kept.data }) : kept;
      }, "The station's picture is saved");
    }
    if (action === REMOVES_PICTURE) this.change(() => this.studio.saveSettings({ picture_url: "" }), "The logo is back");
    if (action === ADDS_GENRE) {
      const name = (payload.line ?? "").trim();
      if (!name) return Phrase.of("A genre needs a name");
      this.change(() => this.studio.addGenre(name), `${name.toLowerCase()} added`);
    }
    if (action === RENAMES_GENRE) this.change(() => this.studio.renameGenre(payload.id, this.names.read()[payload.id]), "Genre renamed everywhere it's used");
    if (action === DELETES_GENRE) this.change(() => this.studio.deleteGenre(payload.id), "Genre removed, and its tags with it");
    return null;
  }

  /** A change sent, then everything found again and what was done said; while it goes nothing else is sent. */
  async change(work, said) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.busy.setValue(false);
    if (!done.ok) { this.problem.setValue(done.error); return; }
    this.notice.setValue(typeof said === "function" ? said(done.data) : said);
    await this.load();
    this.changed();
  }
}
