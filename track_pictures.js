// Pictures for what the stream is playing between shows: an admin gives
// each some words - an artist's name for all their tracks, "Artist - Title"
// for one - and a picture, shown while "now playing" contains the words,
// ignoring case; when more than one match, the longest words win. A show's
// own picture, while it is on air, comes first (site.js, showPicture).

import { renew } from "./renew.js?v=25cdbcae67c3";
import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=25cdbcae67c3";

export const SETS_WORDS = "sets_the_track_words";
export const CHOOSES_PICTURE = "chooses_a_track_picture";
export const REMOVES_PICTURE = "removes_a_track_picture";
export const SEARCHES = "searches_track_pictures";

export const WORDS = {
  [SETS_WORDS]: ["Words to match"],
  [CHOOSES_PICTURE]: ["Choose a picture"],
  [REMOVES_PICTURE]: ["Remove"],
  [SEARCHES]: ["Search pictures"],
};

/** The picture for what is playing, from the pictures given ({ words, picture_url }), or "". */
export function pictureFor(pictures, playing) {
  const heard = (playing ?? "").toLowerCase();
  if (!heard) return "";
  const matching = pictures.filter((held) => held.words && heard.includes(held.words.toLowerCase()));
  matching.sort((a, b) => b.words.length - a.words.length);
  return matching[0]?.picture_url ?? "";
}

export class TrackPictures extends Controller {
  /** Through the studio, or none: the page walked by its probe. */
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.pictures = this.value([]);
    this.words = this.value("");
    this.search = this.value("");
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
    if (studio) this.load();
  }

  async load() {
    const found = await this.studio.trackPictures();
    if (this.disposed) return;
    if (found.ok) renew(this.pictures, found.data);
  }

  /** The pictures whose words hold what is searched for, all when nothing is. */
  shown() {
    const looked = this.search.read().trim().toLowerCase();
    return this.pictures.read().filter((held) => !looked || held.words.includes(looked));
  }

  /** The picture for what is playing now, or "". */
  pictureFor(playing) { return pictureFor(this.pictures.read(), playing); }

  answers() { return Object.keys(WORDS); }

  would(action) {
    if (action !== SETS_WORDS && action !== SEARCHES && this.busy.read()) return Phrase.of("Saving");
    if (action === CHOOSES_PICTURE) {
      const words = this.words.read().trim().toLowerCase();
      if (words.length < 2) return Phrase.of("First type the artist, or Artist - Title");
      if (this.pictures.read().some((held) => held.words === words)) return Phrase.of("Those words have a picture already");
    }
    return null;
  }

  told(action, payload) {
    this.notice.setValue("");
    if (action === SETS_WORDS) this.words.setValue(payload.line);
    if (action === SEARCHES) this.search.setValue(payload.line ?? "");
    if (action === CHOOSES_PICTURE) {
      if (!payload.file.type.startsWith("image/")) return Phrase.of("Please choose a picture (JPEG, PNG or WebP)");
      const words = this.words.read().trim().toLowerCase();
      this.change(() => this.studio.addTrackPicture(words, payload.file), () => { this.words.setValue(""); return `Saved: shown while "${words}" is playing`; });
    }
    if (action === REMOVES_PICTURE) this.change(() => this.studio.deleteTrackPicture(payload.id), () => "Picture removed");
    return null;
  }

  async change(work, said) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.busy.setValue(false);
    if (!done.ok) { this.problem.setValue(done.error); return; }
    this.notice.setValue(said());
    await this.load();
  }
}
