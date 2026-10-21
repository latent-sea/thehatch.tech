// A DJ's workspace: their profile - photo, name, where they are, bio, links
// and genre tags - and their shows (theirs whoever else plays on them), each
// given a picture and a description and, once it has been on, a link to its
// recording (Mixcloud, SoundCloud, wherever). A DJ
// opens their own; an admin opens any DJ's from the admin's DJs. What may be
// saved is decided on the platform (backend.sql).

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=43903e6e00f2";

export const SETS_NAME = "sets_the_dj_name";
export const SETS_LOCATION = "sets_the_dj_location";
export const SETS_BIO = "sets_the_dj_bio";
export const SETS_LINKS = "sets_the_dj_links";
export const TOGGLES_GENRE = "toggles_a_dj_genre";
export const CHOOSES_PHOTO = "chooses_a_dj_photo";
export const CHOOSES_SHOWS_PICTURE = "chooses_a_default_show_picture";
export const REMOVES_SHOWS_PICTURE = "removes_the_default_show_picture";
export const SAVES_PROFILE = "saves_the_dj_profile";
export const CHOOSES_SHOW_PICTURE = "chooses_a_show_picture";
export const SETS_RECORDING = "sets_a_recording";
export const SAVES_RECORDING = "saves_a_recording";
export const REMOVES_SHOW_PICTURE = "removes_a_show_picture";
export const SETS_DESCRIPTION = "sets_a_show_description";
export const SETS_SHOW_TITLE = "sets_a_show_name";
export const TOGGLES_SHOW_GENRE = "toggles_a_show_genre";
export const SAVES_SHOW = "saves_a_show";

export const WORDS = {
  [SETS_NAME]: ["Name"],
  [SETS_LOCATION]: ["Where you are"],
  [SETS_BIO]: ["Bio"],
  [SETS_LINKS]: ["Links"],
  [TOGGLES_GENRE]: ["Choose a genre"],
  [CHOOSES_PHOTO]: ["Choose a photo"],
  [CHOOSES_SHOWS_PICTURE]: ["Choose a default picture"],
  [REMOVES_SHOWS_PICTURE]: ["Remove the default"],
  [SAVES_PROFILE]: ["Save profile"],
  [CHOOSES_SHOW_PICTURE]: ["Choose a picture"],
  [SETS_RECORDING]: ["Recording link"],
  [SAVES_RECORDING]: ["Save link"],
  [REMOVES_SHOW_PICTURE]: ["Use the default instead"],
  [SETS_DESCRIPTION]: ["Description"],
  [SETS_SHOW_TITLE]: ["Show name"],
  [TOGGLES_SHOW_GENRE]: ["Choose a genre for the show"],
  [SAVES_SHOW]: ["Save show"],
};

const DAY = 24 * 60 * 60 * 1000;
const WEB_LINK = /^https?:\/\/\S+$/i;

/** Links as typed, one a line - "Bandcamp https://..." or just the address - as { label, url }. */
export function linksFrom(lines) {
  return lines.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s+/);
    const url = parts.pop();
    return { label: parts.join(" "), url };
  });
}
export const linesFrom = (links) => links.map((link) => (link.label ? `${link.label} ${link.url}` : link.url)).join("\n");

export class Workspace extends Controller {
  /** Through the studio, or none: the page walked by its probe, handed a stand-in. Told when anything public changed. */
  constructor(chimes, studio, changed = () => {}) {
    super(chimes);
    this.studio = studio;
    this.changed = changed;
    this.dj = this.value(null); // the profile open, as last saved
    this.name = this.value("");
    this.location = this.value("");
    this.bio = this.value("");
    this.links = this.value("");
    this.picture = this.value("");
    this.showsPicture = this.value(""); // the default picture for their shows
    this.genreIds = this.value([]);
    this.genres = this.value([]);
    this.shows = this.value([]);
    this.drafts = this.value({}); // show id -> the recording link as typed
    this.descriptions = this.value({}); // show id -> its description as typed
    this.titles = this.value({}); // show id -> its name as typed
    this.showGenres = this.value({}); // show id -> its genre ids as chosen
    this.said = this.value({}); // show id -> { words, bad }: what was last done to it, said beside it
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
    this.noticeAt = this.value("pictures"); // where the notice is said: beside the pictures, or the Save profile button
  }

  /** A DJ's profile opened, and their shows and the genres found. */
  async open(profile) {
    this.dj.setValue(profile);
    this.name.setValue(profile.name);
    this.location.setValue(profile.location);
    this.bio.setValue(profile.bio);
    this.links.setValue(linesFrom(profile.links));
    this.picture.setValue(profile.picture);
    this.showsPicture.setValue(profile.showsPicture ?? "");
    this.genreIds.setValue(profile.genreIds);
    this.problem.setValue("");
    this.notice.setValue("");
    const now = Date.now();
    const [genres, shows] = await Promise.all([
      this.studio.genres(),
      this.studio.findShows({ from: new Date(now - 366 * DAY), to: new Date(now + 92 * DAY), dj: profile.id, newestFirst: true }),
    ]);
    if (this.disposed || this.dj.read()?.id !== profile.id) return;
    if (genres.ok) this.genres.setValue(genres.data);
    if (shows.ok) this.shows.setValue(shows.shows);
    this.drafts.setValue(Object.fromEntries((shows.shows ?? []).map((show) => [show.id, show.recording])));
    this.descriptions.setValue(Object.fromEntries((shows.shows ?? []).map((show) => [show.id, show.description])));
    this.titles.setValue(Object.fromEntries((shows.shows ?? []).map((show) => [show.id, show.title])));
    this.showGenres.setValue(Object.fromEntries((shows.shows ?? []).map((show) => [show.id, show.genres.map((genre) => genre.id)])));
    this.said.setValue({});
    if (!genres.ok || !shows.ok) this.problem.setValue(genres.error || shows.error);
  }

  close() { this.dj.setValue(null); }

  upcoming() { const now = new Date(); return this.shows.read().filter((show) => show.ends > now).reverse(); }

  past() { const now = new Date(); return this.shows.read().filter((show) => show.ends <= now); }

  /** What to say under a past show's recording link: whether it is in Listen Again, or what is wrong with the link typed. */
  recordingNote(show) {
    if (!show) return null;
    const link = (this.drafts.read()[show.id] ?? "").trim();
    if (link && !WEB_LINK.test(link)) return Phrase.of("A web link, please (https://...)");
    if (link !== show.recording) return link ? Phrase.of("Not saved yet") : Phrase.of("Save to take it out of Listen Again");
    return show.recording ? Phrase.of("✓ In Listen Again") : null;
  }

  answers() { return Object.keys(WORDS); }

  would(action, payload) {
    if ([SAVES_PROFILE, CHOOSES_PHOTO, CHOOSES_SHOWS_PICTURE, REMOVES_SHOWS_PICTURE, CHOOSES_SHOW_PICTURE, SAVES_RECORDING, REMOVES_SHOW_PICTURE, SAVES_SHOW].includes(action) && this.busy.read()) return Phrase.of("Saving");
    if (action === REMOVES_SHOWS_PICTURE && !this.showsPicture.read()) return Phrase.of("No default set");
    if (action === SAVES_PROFILE) {
      if (!this.name.read().trim()) return Phrase.of("Your DJ name, please");
      const bad = linksFrom(this.links.read()).find((link) => !WEB_LINK.test(link.url));
      if (bad) return Phrase.with("%s isn't a web link (https://...)", [bad.url]);
      if (linksFrom(this.links.read()).length > 8) return Phrase.of("Eight links at most");
    }
    if (action === SAVES_RECORDING) {
      const link = (this.drafts.read()[payload?.id] ?? "").trim();
      const show = this.shows.read().find((held) => held.id === payload?.id);
      if (show && link === show.recording) return Phrase.of("Nothing to save");
      if (link && !WEB_LINK.test(link)) return Phrase.of("A web link, please (https://...)");
    }
    if (action === SAVES_SHOW) {
      const show = this.shows.read().find((held) => held.id === payload?.id);
      if (show && !this.unsaved(show)) return Phrase.of("Nothing to save");
      if (!(this.titles.read()[payload?.id] ?? "").trim()) return Phrase.of("The show needs a name");
      if ((this.descriptions.read()[payload?.id] ?? "").trim().length > 2000) return Phrase.of("2000 characters at most");
    }
    if (action === REMOVES_SHOW_PICTURE && !this.shows.read().find((held) => held.id === payload?.id)?.picture) return Phrase.of("It has no picture of its own");
    return null;
  }

  told(action, payload) {
    this.notice.setValue("");
    if (action === SETS_NAME) this.name.setValue(payload.line);
    if (action === SETS_LOCATION) this.location.setValue(payload.line);
    if (action === SETS_BIO) this.bio.setValue(payload.line);
    if (action === SETS_LINKS) this.links.setValue(payload.line);
    if (action === TOGGLES_GENRE) this.genreIds.update((ids) => (ids.includes(payload.id) ? ids.filter((id) => id !== payload.id) : [...ids, payload.id]));
    if (action === SETS_DESCRIPTION) this.descriptions.update((all) => ({ ...all, [payload.id]: payload.line }));
    if (action === SETS_SHOW_TITLE) this.titles.update((all) => ({ ...all, [payload.id]: payload.line }));
    if (action === TOGGLES_SHOW_GENRE) this.showGenres.update((all) => {
      const ids = all[payload.id] ?? [];
      return { ...all, [payload.id]: ids.includes(payload.genre) ? ids.filter((id) => id !== payload.genre) : [...ids, payload.genre] };
    });
    if (action === SAVES_SHOW) this.saveShow(payload.id);
    if (action === SETS_RECORDING) this.drafts.update((drafts) => ({ ...drafts, [payload.id]: payload.line }));
    if (action === CHOOSES_PHOTO) return this.photo(payload.file);
    if (action === CHOOSES_SHOWS_PICTURE) return this.defaultPicture(payload.file);
    if (action === REMOVES_SHOWS_PICTURE) this.setDefault(async () => { const saved = await this.studio.saveDj(this.dj.read().id, { show_picture_url: "" }); return saved.ok ? { ok: true, data: "" } : saved; }, "✓ Default removed");
    if (action === CHOOSES_SHOW_PICTURE) return this.showPicture(payload.id, payload.file);
    if (action === SAVES_PROFILE) this.saveProfile();
    if (action === SAVES_RECORDING) this.saveRecording(payload.id);
    if (action === REMOVES_SHOW_PICTURE) this.change(() => this.studio.updateShow(payload.id, { picture: "" }), () => this.showChanged(payload.id, { picture: "" }, "✓ Picture removed: using the default"), payload.id);
    return null;
  }

  /** A photo chosen: refused at once unless it is a picture; else uploaded and saved to the profile. */
  photo(file) {
    if (!file.type.startsWith("image/")) return Phrase.of("Please choose a picture (JPEG, PNG or WebP)");
    const dj = this.dj.read();
    this.change(async () => {
      const kept = await this.studio.uploadPicture(`dj-${dj.id}.jpg`, file);
      if (!kept.ok) return kept;
      const saved = await this.studio.saveDj(dj.id, { picture_url: kept.data });
      return saved.ok ? kept : saved;
    }, (address) => {
      this.picture.setValue(address);
      this.dj.setValue({ ...dj, picture: address });
      this.noticeAt.setValue("pictures");
      this.notice.setValue("✓ Photo saved");
      this.changed();
    });
    return null;
  }

  /** The default picture for their shows: uploaded, and saved to the profile. */
  defaultPicture(file) {
    if (!file.type.startsWith("image/")) return Phrase.of("Please choose a picture (JPEG, PNG or WebP)");
    const dj = this.dj.read();
    this.setDefault(async () => {
      const kept = await this.studio.uploadPicture(`dj-shows-${dj.id}.jpg`, file);
      if (!kept.ok) return kept;
      const saved = await this.studio.saveDj(dj.id, { show_picture_url: kept.data });
      return saved.ok ? kept : saved;
    }, "✓ Default picture saved: your shows without their own use it");
    return null;
  }

  setDefault(work, said) {
    this.change(work, (address) => {
      this.showsPicture.setValue(address);
      this.dj.update((dj) => ({ ...dj, showsPicture: address }));
      this.noticeAt.setValue("pictures");
      this.notice.setValue(said);
      this.changed();
    });
  }

  /** Where a show's picture comes from, said beneath it when it has none of its own. */
  pictureSource(show) {
    if (!show || show.picture) return null;
    if (this.showsPicture.read()) return Phrase.of("Using your default picture");
    if (this.picture.read()) return Phrase.of("Using your photo (no default picture set)");
    return Phrase.of("Using the station logo (no default picture or photo set)");
  }

  /** What a show of theirs shows: its own picture, else their default, else their photo, else "" (the logo). */
  pictureFor(show) { return show?.picture || this.showsPicture.read() || this.picture.read() || ""; }

  showPicture(id, file) {
    if (!file.type.startsWith("image/")) return Phrase.of("Please choose a picture (JPEG, PNG or WebP)");
    this.change(async () => {
      const kept = await this.studio.uploadPicture(`show-${id}.jpg`, file);
      if (!kept.ok) return kept;
      const saved = await this.studio.updateShow(id, { picture: kept.data });
      return saved.ok ? kept : saved;
    }, (address) => this.showChanged(id, { picture: address }, "✓ Picture saved"), id);
    return null;
  }

  saveProfile() {
    const dj = this.dj.read();
    const profile = { name: this.name.read().trim(), location: this.location.read().trim(), bio: this.bio.read().trim(), links: linksFrom(this.links.read()) };
    this.change(() => this.studio.saveDj(dj.id, profile, this.genreIds.read()), () => {
      this.dj.setValue({ ...dj, ...profile, genreIds: this.genreIds.read() });
      this.noticeAt.setValue("profile");
      this.notice.setValue("✓ Profile saved");
      this.changed();
    });
  }

  saveRecording(id) {
    const link = (this.drafts.read()[id] ?? "").trim();
    this.change(() => this.studio.updateShow(id, { recording: link }), () => this.showChanged(id, { recording: link }, link ? "✓ Recording saved" : "✓ Recording removed"), id);
  }

  /** Whether a show's name, genres or description have been changed here and not saved. */
  unsaved(show) {
    const title = (this.titles.read()[show.id] ?? show.title).trim();
    const words = (this.descriptions.read()[show.id] ?? show.description).trim();
    const genres = [...(this.showGenres.read()[show.id] ?? [])].sort().join();
    return title !== show.title || words !== show.description || genres !== show.genres.map((genre) => genre.id).sort().join();
  }

  /** What to say beside a show: that changes wait to be saved, else what was last done to it. */
  stateOf(show) {
    if (!show) return null;
    const said = this.said.read()[show.id] ?? null;
    // a save that failed says why, first: else the DJ only sees it still unsaved, and can't tell what is wrong
    if (said?.bad) return { words: this.unsaved(show) ? `Not saved: ${said.words}` : said.words, bad: true };
    if (this.unsaved(show)) return { words: "Not saved yet: press Save show", bad: true };
    return said;
  }

  /** A show's name, genres and description saved together. */
  saveShow(id) {
    const show = this.shows.read().find((held) => held.id === id);
    if (!show) return;
    const title = this.titles.read()[id].trim();
    const genreIds = this.showGenres.read()[id] ?? [];
    const words = (this.descriptions.read()[id] ?? "").trim();
    this.said.update((all) => ({ ...all, [id]: null }));
    this.change(async () => {
      const named = await this.studio.nameShow(id, title, genreIds);
      if (!named.ok || words === show.description) return named;
      return this.studio.describeShow(id, words);
    }, () => {
      const genres = genreIds.map((genre) => this.genres.read().find((held) => held.id === genre) ?? show.genres.find((held) => held.id === genre)).filter(Boolean);
      this.titles.update((all) => ({ ...all, [id]: title }));
      this.descriptions.update((all) => ({ ...all, [id]: words }));
      this.showChanged(id, { title, genres, description: words }, "✓ Saved");
    }, id);
  }

  showChanged(id, changes, said) {
    this.shows.update((shows) => shows.map((show) => (show.id === id ? { ...show, ...changes } : show)));
    this.said.update((all) => ({ ...all, [id]: { words: said, bad: false } }));
    this.changed();
  }

  /** A change sent; while it goes nothing else is sent, and what went wrong is said. */
  async change(work, then, show = null) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.busy.setValue(false);
    if (!done.ok) {
      // a show's trouble is said beside it, where the DJ is looking
      if (show) this.said.update((all) => ({ ...all, [show]: { words: done.error, bad: true } }));
      else this.problem.setValue(done.error);
      return;
    }
    then(done.data);
  }
}
