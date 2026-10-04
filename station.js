// The station on air: its stream, and what is playing on it now, from the
// stream host (Citrus3), asked again every 30 seconds. What is playing is a
// fact kept here; when the host can't be reached the last answer stands, and
// with none it says nothing.
//
// HOW MANY ARE LISTENING: the host's player information says, as
// "connections" - the same answer that says what is playing, so nothing
// more is asked of the host.

import { Controller } from "./gd_chime/gd_chime.js?v=fc8f4b8b1b3f";

/** The live stream: the one the station broadcasts on. */
export const STREAM = "https://s1.citrus3.com:8236/stream";
/** What the stream host says is playing, and how many are listening: {"connections": 3, "nowplaying": "Artist - Title"}. */
export const NOW_PLAYING = "https://s1.citrus3.com:2000/AudioPlayer/TheHatch/playerInfo";
/** How often what is playing is asked again, in seconds. */
export const EVERY = 30;

export class Station extends Controller {
  /** Asking with ask (url -> a promise of the JSON), or not at all given none: the page walked by its probe. */
  constructor(chimes, ask = null) {
    super(chimes);
    /** What is playing: "Artist - Title", or "" before the host has said. */
    this.nowPlaying = this.value("");
    /** How many are listening, when the host says; else null. */
    this.listeners = this.value(null);
    this._ask = ask;
    this._timer = null;
    if (ask) { this.refresh(); this._timer = setInterval(() => this.refresh(), EVERY * 1000); }
  }

  async refresh() {
    const said = await this._ask(NOW_PLAYING).catch(() => null); // the last answer stands
    if (this.disposed) return;
    if (said) this.heardFrom(said);
  }

  /** What the host said, taken in. */
  heardFrom(said) {
    const playing = typeof said.nowplaying === "string" ? said.nowplaying.trim() : "";
    if (playing) this.nowPlaying.setValue(playing);
    const count = listenersIn(said);
    if (count !== null) this.listeners.setValue(count);
  }

  dispose() {
    if (this._timer) clearInterval(this._timer);
    super.dispose();
  }
}

/**
 * How many are listening, from the host's player information
 * ("connections"), or a stream server's statistics should it ever be one
 * (Shoutcast's currentlisteners, Icecast's icestats.source listeners). Null
 * when it doesn't say.
 */
export function listenersIn(said) {
  if (!said || typeof said !== "object") return null;
  const counted = (value) => { const n = Number(value); return value !== null && value !== undefined && value !== "" && Number.isFinite(n) && n >= 0 ? n : null; };
  const direct = counted(said.connections) ?? counted(said.listeners) ?? counted(said.currentlisteners);
  if (direct !== null) return direct;
  const source = said.icestats?.source;
  if (source) {
    const all = (Array.isArray(source) ? source : [source]).map((one) => counted(one?.listeners)).filter((n) => n !== null);
    if (all.length) return all.reduce((sum, n) => sum + n, 0);
  }
  return null;
}

/**
 * The host asked, as the browser does: JSON, or Shoutcast's 7.html - one
 * line, "listeners,status,peak,max,unique,bitrate,title" - read as
 * { currentlisteners }.
 */
export const askHost = (url) => fetch(url, { cache: "no-store" }).then(async (answer) => {
  if (!answer.ok) return null;
  const text = await answer.text();
  try { return JSON.parse(text); } catch { /* not JSON */ }
  const line = text.replace(/<[^>]*>/g, "").trim().match(/^(\d+),\d+,/);
  return line ? { currentlisteners: Number(line[1]) } : null;
});

/** An audio element that makes no sound and asks the network for nothing: what the probe's player plays. */
export function quietAudio() {
  const heard = new Map();
  const attrs = new Map();
  return {
    paused: true,
    preload: "",
    set src(to) { attrs.set("src", to); },
    getAttribute: (name) => attrs.get(name) ?? null,
    removeAttribute: (name) => attrs.delete(name),
    load() {},
    pause() { this.paused = true; },
    play() { this.paused = false; setTimeout(() => heard.get("playing")?.(), 0); return Promise.resolve(); },
    addEventListener: (event, then) => heard.set(event, then),
    removeEventListener: (event) => heard.delete(event),
  };
}
