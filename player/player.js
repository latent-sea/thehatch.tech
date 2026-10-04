// A live audio stream for a site - a radio station's, above all - as a model:
// whether it is playing is a fact kept here, and a press to play or stop goes
// through the door like any other. Plain JavaScript, one ES module, on
// gd-chime for the web (../gd_chime/, beside it in a site as in web/).
//
//     import { Player } from "./player/player.js?v=386ff33fa206";
//
//     declare(register) { register.declareAll(Player.WORDS); }
//     describe() {
//       const player = this.model(new Player(this.chimes, "https://example.com/stream", { door: this.commands }));
//       ...ui.button(Player.PLAYS).absentWhenRefused(), ui.button(Player.STOPS).absentWhenRefused()...
//     }
//
// IT OWNS ONE AUDIO ELEMENT, never put on the page, so the stream plays on
// whichever screen the reader moves to.
//
// A LIVE STREAM IS NOT PAUSED, IT IS LET GO: stopping drops the connection,
// and playing again joins the broadcast where it is now, not where it was
// stopped. A stream that drops while the reader wants it is joined again,
// after waits growing to the last of RETRIES; past them it has failed, says
// so in problem, and waits for a press.
//
// THE PHONE'S OWN CONTROLS - the lock screen, a headset's button - are the
// reader's presses too: given the door, they go through it (the Media
// Session API, where the browser has it). Given media, a bound value reading
// { title, artist, artwork }, the phone shows what is playing.

import { Chimes, Controller, Phrase } from "../gd_chime/gd_chime.js?v=386ff33fa206";

export class Player extends Controller {
  static PLAYS = "plays_the_stream";
  static STOPS = "stops_the_stream";
  /** The actions' words, for the app's register: register.declareAll(Player.WORDS). */
  static WORDS = { [Player.PLAYS]: ["Play"], [Player.STOPS]: ["Stop"] };

  // what the stream is doing: state
  static STOPPED = "stopped";
  static STARTING = "starting"; // asked for, not heard yet: connecting, or waiting for more of it
  static PLAYING = "playing";
  static RETRYING = "retrying"; // dropped while wanted, and about to be joined again
  static FAILED = "failed"; // dropped too often in a row; problem says why

  /** The waits before joining a dropped stream again, in seconds: one try after each. */
  static RETRIES = [2, 4, 8, 16, 30];

  /**
   * The stream at this address. Its options: door, the app's commands, for
   * the phone's own controls; media, a bound value reading { title, artist,
   * artwork } for the phone to show; and, for a test, audio (the element),
   * session (navigator.mediaSession), retries and timers ({ set, clear }).
   */
  constructor(chimes, src, options = {}) {
    super(chimes);
    this.src = src;
    this.state = this.value(Player.STOPPED);
    /** Why it failed, as a phrase, or null. */
    this.problem = this.value(null);
    /** Whether the reader wants it playing: true from a press of play until stopped or failed. */
    this.listening = this.state.map((state) => state !== Player.STOPPED && state !== Player.FAILED);
    this._audio = options.audio ?? new Audio();
    this._audio.preload = "none";
    this._door = options.door ?? null;
    this._session = options.session !== undefined ? options.session : globalThis.navigator?.mediaSession ?? null;
    this._retries = options.retries ?? Player.RETRIES;
    this._timers = options.timers ?? { set: (work, ms) => setTimeout(work, ms), clear: (id) => clearTimeout(id) };
    this._wanted = false;
    this._tries = 0;
    this._timer = null;
    this._heard = {
      playing: () => this._playing(),
      waiting: () => { if (this._wanted && this.state._held === Player.PLAYING) this.state.setValue(Player.STARTING); },
      error: () => this._dropped(),
      ended: () => this._dropped(), // a live stream ends only when it drops
    };
    for (const [event, heard] of Object.entries(this._heard)) this._audio.addEventListener(event, heard);
    this._handOver();
    // said on the page, for what would reload it (an exported site's fresh.js): not while the stream is wanted
    const root = globalThis.document?.documentElement;
    if (root) this.follow("said", () => { if (this.listening.read()) root.dataset.playing = "yes"; else delete root.dataset.playing; });
    if (options.media) this.follow("media", () => this._show(options.media.read()));
  }

  answers() { return [Player.PLAYS, Player.STOPS]; }

  // read from state, a value, so a button refused or let through draws again as it moves
  would(action) {
    if (action === Player.PLAYS && this.listening.read()) return Phrase.of("Already playing");
    if (action === Player.STOPS && !this.listening.read()) return Phrase.of("Not playing");
    return null;
  }

  told(action) {
    if (action === Player.PLAYS) {
      this._wanted = true;
      this._tries = 0;
      this.problem.setValue(null);
      this._join();
    } else {
      this._wanted = false;
      this._letGo();
      this.state.setValue(Player.STOPPED);
    }
    return null;
  }

  dispose() {
    if (this.disposed) return;
    this._wanted = false;
    this._letGo();
    for (const [event, heard] of Object.entries(this._heard)) this._audio.removeEventListener(event, heard);
    if (this._session) for (const action of ["play", "pause", "stop"]) this._session.setActionHandler(action, null);
    super.dispose();
  }

  // --- the stream ---

  _join() {
    this._cancelRetry();
    this.state.setValue(Player.STARTING);
    this._audio.src = this.src;
    let asked;
    try { asked = this._audio.play(); } catch (error) { asked = Promise.reject(error); }
    Promise.resolve(asked).catch((error) => {
      if (!this._wanted || this._audio.getAttribute("src") !== this.src) return;
      // the browser refused to start without a press of the reader's own: not the stream's fault, and not retried
      if (error?.name === "NotAllowedError") this._fail(Phrase.of("Press play to listen"));
      else this._dropped();
    });
  }

  _playing() {
    if (!this._wanted) return;
    this._tries = 0;
    this.state.setValue(Player.PLAYING);
  }

  _dropped() {
    if (!this._wanted || this.state._held === Player.RETRYING) return;
    this._letGo();
    if (this._tries >= this._retries.length) {
      this._fail(Phrase.of("The stream isn't answering. Press play to try again."));
      return;
    }
    const wait = this._retries[this._tries++];
    this.state.setValue(Player.RETRYING);
    this._timer = this._timers.set(() => { this._timer = null; if (this._wanted) this._join(); }, wait * 1000);
  }

  _fail(problem) {
    this._wanted = false;
    this._letGo();
    this.problem.setValue(problem);
    this.state.setValue(Player.FAILED);
  }

  /** The connection dropped, so nothing more is downloaded and the next play is live. */
  _letGo() {
    this._cancelRetry();
    this._audio.pause();
    if (this._audio.getAttribute("src") !== null) {
      this._audio.removeAttribute("src");
      this._audio.load();
    }
  }

  _cancelRetry() {
    if (this._timer !== null) this._timers.clear(this._timer);
    this._timer = null;
  }

  // --- the phone's own controls ---

  _handOver() {
    const session = this._session;
    if (!session) return;
    const press = (action) => () => {
      if (!this._door || this.would(action) !== null) return;
      this._door.dispatch(Chimes.GLOBAL, action, {});
    };
    session.setActionHandler("play", press(Player.PLAYS));
    session.setActionHandler("pause", press(Player.STOPS));
    session.setActionHandler("stop", press(Player.STOPS));
    this.follow("playback", () => {
      const state = this.state.read();
      session.playbackState = state === Player.PLAYING || state === Player.STARTING ? "playing" : state === Player.RETRYING ? "paused" : "none";
    });
  }

  _show(media) {
    if (!this._session || typeof MediaMetadata === "undefined") return;
    if (!media) { this._session.metadata = null; return; }
    const artwork = media.artwork ? [{ src: media.artwork }] : [];
    this._session.metadata = new MediaMetadata({ title: media.title ?? "", artist: media.artist ?? "", album: media.album ?? "", artwork });
  }
}
