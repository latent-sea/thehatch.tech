// Where the station's data lives: its tables on the platform (backend.sql),
// through the platform's client (backend/, installed by
// tooling/install_site.py). Every answer is { ok, ..., error } and nothing
// throws; what a visitor may see or change is decided on the platform.
//
// Signing in is with Google (backend/google.js): the platform sends no
// email yet, so a code by email can't be offered.

import { Backend } from "./backend/backend.js?v=07f24e0a957b";
import { drawGoogleButton } from "./backend/google.js?v=07f24e0a957b";
import { shrinkPicture } from "./backend/pictures.js?v=07f24e0a957b";

// public: the platform's address and its publishable key belong in the page
const PLATFORM = "https://api.latent-sea.com";
const KEY = "sb_publishable_BqVtSYE4ysOb2sHMuFSwMk_HrTAUgLx";
// public: the Google client the platform accepts (platform/supabase/platform.yml)
const GOOGLE_CLIENT = "400837578052-jqnhh565es3a92k58u5r2oggdcf7mrkr.apps.googleusercontent.com";

/** A show as the page holds it: its times as Dates. */
export function showFrom(row) {
  return {
    id: row.id, title: row.title, description: row.description ?? "",
    starts: new Date(row.starts), ends: new Date(row.ends),
    picture: row.picture_url ?? "", recording: row.recording_url ?? "", series: row.series ?? null,
    djs: row.djs ?? [], genres: row.genres ?? [],
  };
}

/** A DJ as the page holds them: their next show's times as Dates. */
export function djFrom(row) {
  const next = row.next_show ? { ...row.next_show, starts: new Date(row.next_show.starts), ends: new Date(row.next_show.ends) } : null;
  return { id: row.id, name: row.name, bio: row.bio ?? "", location: row.location ?? "", picture: row.picture_url ?? "",
    links: Array.isArray(row.links) ? row.links : [], resident: !!row.resident, hasAccount: !!row.has_account, genres: row.genres ?? [], next };
}

/** A DJ's profile as their workspace edits it, or null. */
export function profileFrom(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, bio: row.bio ?? "", location: row.location ?? "", picture: row.picture_url ?? "",
    links: Array.isArray(row.links) ? row.links : [], resident: !!row.resident, userId: row.user_id ?? null,
    genreIds: (row.the_hatch_dj_genres ?? []).map((tag) => tag.genre_id) };
}

export function unreachable(reply) {
  return reply.status === 0 ? "The Hatch can't be reached. Please check your connection and try again." : "Something went wrong on our side. Please try again in a moment.";
}

/** A failure's words for a person: the platform's own for one it raised (an overlap, say), else plain ones. */
const said = (reply) => (reply.ok ? "" : reply.status === 0 || reply.status >= 500 || !reply.data?.message ? unreachable(reply) : reply.data.message);
const answer = (reply, data = reply.data) => ({ ok: reply.ok, data: reply.ok ? data : null, error: said(reply) });

export class Studio {
  constructor(backend = new Backend(PLATFORM, KEY, { keptIn: "the_hatch_session" })) {
    this.backend = backend;
  }

  /** The shows between two times, soonest first: { ok, shows, error }. */
  async schedule(from, to) {
    const reply = await this.backend.callRpc("the_hatch_schedule", { from_time: from.toISOString(), to_time: to.toISOString() });
    if (!reply.ok) return { ok: false, shows: [], error: unreachable(reply) };
    return { ok: true, shows: reply.data.map(showFrom), error: "" };
  }

  /**
   * Shows found: between two times, of one DJ or one genre if asked, only
   * recorded ones (Listen Again) if asked, newest first if asked:
   * { ok, shows, error }.
   */
  async findShows({ from, to, dj = null, genre = null, recorded = false, newestFirst = false, max = 200 }) {
    const reply = await this.backend.callRpc("the_hatch_find_shows", {
      from_time: from.toISOString(), to_time: to.toISOString(), dj, genre, recorded, newest_first: newestFirst, max_rows: max,
    });
    if (!reply.ok) return { ok: false, shows: [], error: unreachable(reply) };
    return { ok: true, shows: reply.data.map(showFrom), error: "" };
  }

  /** The DJs, residents first, each with their genres and next show: { ok, data, error }. */
  async djList() {
    const reply = await this.backend.callRpc("the_hatch_dj_list");
    return answer(reply, reply.ok ? reply.data.map(djFrom) : null);
  }

  // --- who is signed in ---

  /** Whoever signed in last time, if anyone: true when someone is signed in. */
  restore() { return this.backend.restore(); }

  /** Whether whoever is signed in is a guest: a visitor who sent a message, not someone who signed in. */
  isGuest() { return !!this.backend.session?.user?.is_anonymous; }

  /** A guest's session for sending, unless someone is signed in already: { ok, error }. */
  async asGuest() {
    if (await this.backend.restore()) return { ok: true, error: "" };
    const signed = await this.backend.signInAnonymously();
    return { ok: signed.ok, error: signed.ok ? "" : unreachable(signed) };
  }

  /** A message from the Contact form, for the admins' inbox. */
  async sendMessage({ name, email, body }) {
    const guest = await this.asGuest();
    if (!guest.ok) return { ok: false, data: null, error: guest.error };
    return answer(await this.backend.insert("the_hatch_messages", { name, email, body }));
  }

  /** An application to DJ, from Join Us, for the admins' inbox. */
  async apply({ artist, email, genres, mix, about }) {
    const guest = await this.asGuest();
    if (!guest.ok) return { ok: false, data: null, error: guest.error };
    return answer(await this.backend.insert("the_hatch_applications", { artist_name: artist, email, genres, mix_url: mix, about }));
  }

  // --- listeners over time (the_hatch_listens, logged every five minutes) ---

  /** Every logged count between two times, for an admin: { ok, data: [{ at, connections, show_title, dj_names }], error }. */
  async listenerHistory(from, to) {
    const reply = await this.backend.callRpc("the_hatch_listener_history", { from_time: from.toISOString(), to_time: to.toISOString() });
    return answer(reply, reply.ok ? reply.data.map((row) => ({ ...row, at: new Date(row.at) })) : null);
  }

  /** Each show's peak and average listeners since a time, of one DJ or (for an admin) all: { ok, data, error }. */
  async showStats(dj = null, from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) {
    const reply = await this.backend.callRpc("the_hatch_show_stats", { dj, from_time: from.toISOString() });
    return answer(reply, reply.ok ? reply.data.map((row) => ({ ...row, starts: new Date(row.starts), ends: new Date(row.ends), average: Number(row.average) })) : null);
  }

  // --- the station's words, and its genres ---

  /** The About and Join Us words and the station's picture: { ok, data: { about, join_us, picture_url }, error }. */
  async settings() {
    const reply = await this.backend.select("the_hatch_settings");
    return answer(reply, reply.ok ? reply.data[0] ?? null : null);
  }

  async saveSettings(changes) {
    return answer(await this.backend.update("the_hatch_settings", "id=eq.true", { ...changes, updated_at: new Date().toISOString() }));
  }

  async renameGenre(id, name) {
    const reply = await this.backend.update("the_hatch_genres", `id=eq.${encodeURIComponent(id)}`, { name: name.trim().toLowerCase() });
    if (reply.status === 409) return { ok: false, data: null, error: "There's a genre called that already" };
    return answer(reply);
  }

  async deleteGenre(id) { return answer(await this.backend.delete("the_hatch_genres", `id=eq.${encodeURIComponent(id)}`)); }

  // --- the admins ---

  /** The admins and those invited to be: { user_id (null while invited), name, email, invited }. */
  async admins() { return answer(await this.backend.callRpc("the_hatch_admins_and_invites")); }

  /** Someone made an admin by email: at once if they've signed in, else when they first do. */
  async inviteAdmin(email) { return answer(await this.backend.callRpc("the_hatch_invite_admin", { email })); }

  async uninviteAdmin(email) { return answer(await this.backend.callRpc("the_hatch_uninvite_admin", { email })); }

  async removeAdmin(id) { return answer(await this.backend.callRpc("the_hatch_remove_admin", { account: id })); }

  // --- the admin's inbox ---

  async messages() {
    const reply = await this.backend.select("the_hatch_messages", "order=created_at.desc&limit=200");
    return answer(reply, reply.ok ? reply.data.map((row) => ({ ...row, created_at: new Date(row.created_at) })) : null);
  }

  async markRead(id, read) { return answer(await this.backend.update("the_hatch_messages", `id=eq.${encodeURIComponent(id)}`, { read })); }

  async deleteMessage(id) { return answer(await this.backend.delete("the_hatch_messages", `id=eq.${encodeURIComponent(id)}`)); }

  async applications() {
    const reply = await this.backend.select("the_hatch_applications", "order=created_at.desc&limit=200");
    return answer(reply, reply.ok ? reply.data.map((row) => ({ ...row, created_at: new Date(row.created_at) })) : null);
  }

  async approve(id) { return answer(await this.backend.callRpc("the_hatch_approve_application", { application_id: id })); }

  async decline(id) { return answer(await this.backend.update("the_hatch_applications", `id=eq.${encodeURIComponent(id)}`, { status: "declined" })); }

  /** The name Google gave, or the email, for saying who is signed in. */
  userName() {
    const user = this.backend.session?.user ?? {};
    return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "";
  }

  drawGoogleButton(element, signedIn) { return drawGoogleButton(element, GOOGLE_CLIENT, signedIn, { theme: "filled_black" }); }

  async signInWithGoogle(credential, nonce) { return answer(await this.backend.signInWithGoogleToken(credential, nonce)); }

  async signOut() { await this.backend.signOut(); }

  /** What waits for the signed-in account's email taken up - a DJ profile, admin - after each sign-in. */
  async claim() { return answer(await this.backend.callRpc("the_hatch_claim")); }

  /** The signed-in account's email, for saying who is signed in. */
  userEmail() { return this.backend.session?.user?.email ?? ""; }

  async isAdmin() {
    const reply = await this.backend.callRpc("the_hatch_is_admin");
    return answer(reply, reply.data === true);
  }

  // --- the admin's side: the schedule, the DJs, the genres ---

  async djs() { return answer(await this.backend.select("the_hatch_djs", "select=id,name,picture_url&order=name")); }

  async genres() { return answer(await this.backend.select("the_hatch_genres", "order=name")); }

  async addDj(name) {
    const reply = await this.backend.insert("the_hatch_djs", { name: name.trim() });
    return answer(reply, reply.ok ? reply.data[0] : null);
  }

  async addGenre(name) {
    const reply = await this.backend.insert("the_hatch_genres", { name: name.trim().toLowerCase() });
    if (reply.status === 409) return { ok: false, data: null, error: "That genre is already on the list" };
    return answer(reply, reply.ok ? reply.data[0] : null);
  }

  /** A show saved: { title, description, starts, ends (Dates), dj_ids, genre_ids, and id when changing one }, then repeat more weekly copies. */
  async saveShow(show, repeat = 0) {
    const given = { ...show, starts: show.starts.toISOString(), ends: show.ends.toISOString() };
    return answer(await this.backend.callRpc("the_hatch_save_show", { show: given, repeat_weeks: repeat }));
  }

  // --- a DJ's own: their profile, their shows' pictures and recordings ---

  /** The DJ profile this account has, with its genre ids, or null: { ok, data, error }. */
  async myDj() {
    const me = this.backend.playerId();
    if (!me) return { ok: true, data: null, error: "" };
    const reply = await this.backend.select("the_hatch_djs", `select=*,the_hatch_dj_genres(genre_id)&user_id=eq.${encodeURIComponent(me)}`);
    return answer(reply, reply.ok ? profileFrom(reply.data[0]) : null);
  }

  /** Any DJ's profile, for an admin: { ok, data, error }. */
  async djProfile(id) {
    const reply = await this.backend.select("the_hatch_djs", `select=*,the_hatch_dj_genres(genre_id)&id=eq.${encodeURIComponent(id)}`);
    return answer(reply, reply.ok ? profileFrom(reply.data[0]) : null);
  }

  /** A DJ's profile saved: { name, bio, location, links, picture_url } as far as given, and their genres if given. */
  async saveDj(id, profile, genreIds = null) {
    return answer(await this.backend.callRpc("the_hatch_save_dj", { dj_id: id, profile, genre_ids: genreIds }));
  }

  /** A picture shrunk and kept in the platform's pictures, by name: { ok, data: its address, error }. */
  async uploadPicture(name, file) {
    const reply = await this.backend.uploadPicture(name, await shrinkPicture(file));
    if (reply.status === 413) return { ok: false, data: null, error: "That picture is too big. Please choose one under 5 MB." };
    return answer(reply, reply.ok ? reply.data.address : null);
  }

  /** A show's picture or recording link set, by one of its DJs or an admin: each given, or left as it is. */
  async updateShow(id, { picture = null, recording = null }) {
    return answer(await this.backend.callRpc("the_hatch_update_my_show", { show_id: id, picture_url: picture, recording_url: recording }));
  }

  /** A show's description, written by one of its DJs or an admin ('' leaves it blank). */
  async describeShow(id, description) {
    return answer(await this.backend.callRpc("the_hatch_describe_my_show", { show_id: id, description }));
  }

  // --- pictures for what is playing between shows ---

  /** Each { id, words, picture_url }: shown while "now playing" contains its words. */
  async trackPictures() { return answer(await this.backend.select("the_hatch_track_pictures", "select=id,words,picture_url&order=words")); }

  /** A picture uploaded and kept for the words given. */
  async addTrackPicture(words, file) {
    const kept = await this.uploadPicture(`track-${crypto.randomUUID()}.jpg`, file);
    if (!kept.ok) return kept;
    const reply = await this.backend.insert("the_hatch_track_pictures", { words: words.trim().toLowerCase(), picture_url: kept.data });
    if (reply.status === 409) return { ok: false, data: null, error: "There's a picture for those words already" };
    return answer(reply);
  }

  async deleteTrackPicture(id) { return answer(await this.backend.delete("the_hatch_track_pictures", `id=eq.${encodeURIComponent(id)}`)); }

  // --- the admin's DJs ---

  async setResident(id, resident) { return answer(await this.backend.update("the_hatch_djs", `id=eq.${encodeURIComponent(id)}`, { resident })); }

  /** Each DJ's sign-in, for an admin: { dj_id, invite_email, account_email }. */
  async djAccounts() { return answer(await this.backend.callRpc("the_hatch_dj_accounts")); }

  /** A DJ invited by the email they sign in with ('' takes it back): { ok, data: whether linked at once, error }. */
  async inviteDj(id, email) { return answer(await this.backend.callRpc("the_hatch_invite_dj", { dj: id, email })); }

  async unlinkDj(id) { return answer(await this.backend.callRpc("the_hatch_unlink_dj", { dj: id })); }

  async deleteDj(id) { return answer(await this.backend.delete("the_hatch_djs", `id=eq.${encodeURIComponent(id)}`)); }

  async deleteShow(id, withLaterCopies = false) {
    return answer(await this.backend.callRpc("the_hatch_delete_show", { show_id: id, with_later_copies: withLaterCopies }));
  }
}
