// A DJ's workspace: their profile - photo, name, where they are, bio, links
// and genre tags - and their shows (theirs whoever else plays on them), each
// given a picture and a description and, once it has been on, a link to its
// recording (Mixcloud, SoundCloud, wherever). A DJ
// opens their own; an admin opens any DJ's from the admin's DJs. What may be
// saved is decided on the platform (backend.sql).

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=b7f4248a4345";

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
export const SAVES_DESCRIPTION = "saves_a_show_description";

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
  [SAVES_DESCRIPTION]: ["Save description"],
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
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
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
    if ([SAVES_PROFILE, CHOOSES_PHOTO, CHOOSES_SHOWS_PICTURE, REMOVES_SHOWS_PICTURE, CHOOSES_SHOW_PICTURE, SAVES_RECORDING, REMOVES_SHOW_PICTURE, SAVES_DESCRIPTION].includes(action) && this.busy.read()) return Phrase.of("Saving");
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
    if (action === SAVES_DESCRIPTION) {
      const words = (this.descriptions.read()[payload?.id] ?? "").trim();
      const show = this.shows.read().find((held) => held.id === payload?.id);
      if (show && words === show.description) return Phrase.of("Nothing to save");
      if (words.length > 2000) return Phrase.of("2000 characters at most");
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
    if (action === SAVES_DESCRIPTION) {
      const words = (this.descriptions.read()[payload.id] ?? "").trim();
      this.change(() => this.studio.describeShow(payload.id, words), () => this.showChanged(payload.id, { description: words }, words ? "Description saved" : "Description cleared"));
    }
    if (action === SETS_RECORDING) this.drafts.update((drafts) => ({ ...drafts, [payload.id]: payload.line }));
    if (action === CHOOSES_PHOTO) return this.photo(payload.file);
    if (action === CHOOSES_SHOWS_PICTURE) return this.defaultPicture(payload.file);
    if (action === REMOVES_SHOWS_PICTURE) this.setDefault(async () => { const saved = await this.studio.saveDj(this.dj.read().id, { show_picture_url: "" }); return saved.ok ? { ok: true, data: "" } : saved; }, "Default removed");
    if (action === CHOOSES_SHOW_PICTURE) return this.showPicture(payload.id, payload.file);
    if (action === SAVES_PROFILE) this.saveProfile();
    if (action === SAVES_RECORDING) this.saveRecording(payload.id);
    if (action === REMOVES_SHOW_PICTURE) this.change(() => this.studio.updateShow(payload.id, { picture: "" }), () => this.showChanged(payload.id, { picture: "" }, "Picture removed"));
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
      this.notice.setValue("Photo saved");
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
    }, "Default picture saved: your shows without their own use it");
    return null;
  }

  setDefault(work, said) {
    this.change(work, (address) => {
      this.showsPicture.setValue(address);
      this.dj.update((dj) => ({ ...dj, showsPicture: address }));
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
    }, (address) => this.showChanged(id, { picture: address }, "Show picture saved"));
    return null;
  }

  saveProfile() {
    const dj = this.dj.read();
    const profile = { name: this.name.read().trim(), location: this.location.read().trim(), bio: this.bio.read().trim(), links: linksFrom(this.links.read()) };
    this.change(() => this.studio.saveDj(dj.id, profile, this.genreIds.read()), () => {
      this.dj.setValue({ ...dj, ...profile, genreIds: this.genreIds.read() });
      this.notice.setValue("Profile saved");
      this.changed();
    });
  }

  saveRecording(id) {
    const link = (this.drafts.read()[id] ?? "").trim();
    this.change(() => this.studio.updateShow(id, { recording: link }), () => this.showChanged(id, { recording: link }, link ? "Recording saved" : "Recording removed"));
  }

  showChanged(id, changes, said) {
    this.shows.update((shows) => shows.map((show) => (show.id === id ? { ...show, ...changes } : show)));
    this.notice.setValue(said);
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
