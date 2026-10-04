// The Hatch: 24/7 underground electronic radio, on gd-chime for the web. The
// look is the approved preview's (the-hatch-preview): black, acid yellow,
// Anton; its colours are in palette.js and the rest in hatch.css.
//
// The shell: the station's mark and the top navigation (a tab bar at the
// bottom on a phone), the screens, and the player bar docked under them, on
// every screen, so the stream plays on whatever the reader looks at. The
// stream and what is on air are station.js's; the player is the factory's
// (player/, web/player/). Each screen has an address (#schedule, #about...),
// so a link to one opens it and the phone's back button goes back.
//
// The schedule is the station's, on the platform (backend.sql, through
// studio.js): what is on air, what is next and the week ahead follow the
// clock (schedule.js). Every time is UK time, the station's.

import { ChimeApp, Chimes, Controller, Driver, Frames, Look, Phrase, Ui } from "./gd_chime/gd_chime.js?v=fc8f4b8b1b3f";
import { Player } from "./player/player.js?v=fc8f4b8b1b3f";
import { STATION } from "./content.js?v=fc8f4b8b1b3f";
import { HATCH } from "./palette.js?v=fc8f4b8b1b3f";
import { STREAM, Station, askHost, quietAudio } from "./station.js?v=fc8f4b8b1b3f";
import { Schedule, dateOf, dayAt, dayId, dayName, djsOf, genresOf, slotOf, timeOf, weekdayOf } from "./schedule.js?v=fc8f4b8b1b3f";
import { Studio } from "./studio.js?v=fc8f4b8b1b3f";
import { Account, SIGNS_OUT } from "./account.js?v=fc8f4b8b1b3f";
import * as Desk from "./desk.js?v=fc8f4b8b1b3f";
import { Library } from "./library.js?v=fc8f4b8b1b3f";
import * as Work from "./workspace.js?v=fc8f4b8b1b3f";
import * as Djs from "./admin_djs.js?v=fc8f4b8b1b3f";
import * as Mail from "./letters.js?v=fc8f4b8b1b3f";
import * as Box from "./inbox.js?v=fc8f4b8b1b3f";
import * as Keep from "./settings.js?v=fc8f4b8b1b3f";
import { Listeners } from "./listeners.js?v=fc8f4b8b1b3f";
import * as Tracks from "./track_pictures.js?v=fc8f4b8b1b3f";

// the screens, by the address each is opened at
const HOME = "home";
const SCHEDULE = "schedule";
const DJS = "djs";
const DJ = "dj"; // a DJ's page, at #dj/<their id>
const BROWSE = "browse";
const LISTEN = "listen";
const ABOUT = "about";
const CONTACT = "contact";
const JOIN = "join";
const ACCOUNT = "account";
const SCREENS = [HOME, SCHEDULE, DJS, DJ, BROWSE, LISTEN, ABOUT, CONTACT, JOIN, ACCOUNT];

const GOES_HOME = "goes_home";
const GOES_SCHEDULE = "goes_to_schedule";
const GOES_ABOUT = "goes_to_about";
const GOES_DJS = "goes_to_djs";
const OPENS_DJ = "opens_a_dj";
const GOES_BROWSE = "goes_to_browse";
const GOES_LISTEN = "goes_to_listen_again";
const SEARCHES_DJS = "searches_djs";
const SEARCHES_RECORDINGS = "searches_recordings";
const CHOOSES_GENRE = "chooses_a_genre";
const CHOOSES_SCHEDULE_DAY = "chooses_a_schedule_day";
const SHOWS_PART = "shows_an_admin_part";
const ASKS_TO_REMOVE_DJ = "asks_to_remove_a_dj";
const GOES_CONTACT = "goes_to_contact";
const GOES_JOIN = "goes_to_join_us";
const ASKS_TO_DELETE_GENRE = "asks_to_delete_a_genre";
const ASKS_TO_REMOVE_ADMIN = "asks_to_remove_an_admin";
const GOES_ACCOUNT = "goes_to_account";
const RELOADS = "reloads_the_schedule";
const ASKS_TO_DELETE = "asks_to_delete_a_show";

const LOGO = "images/logo.svg";

export class TheHatch extends ChimeApp {
  look() { return Look.make(HATCH); }

  declare(register) {
    register.declareAll({
      ...Player.WORDS,
      [GOES_HOME]: ["Live"],
      [GOES_SCHEDULE]: ["Schedule"],
      [GOES_ABOUT]: ["About"],
      [GOES_DJS]: ["DJs"],
      [OPENS_DJ]: ["Open the DJ's page"],
      [GOES_BROWSE]: ["Browse"],
      [GOES_LISTEN]: ["Listen again"],
      [SEARCHES_DJS]: ["Search DJs"],
      [SEARCHES_RECORDINGS]: ["Search recordings"],
      [CHOOSES_GENRE]: ["Choose a genre"],
      [CHOOSES_SCHEDULE_DAY]: ["Choose a day"],
      [SHOWS_PART]: ["Show"],
      [ASKS_TO_REMOVE_DJ]: ["Remove"],
      [GOES_CONTACT]: ["Contact us"],
      [GOES_JOIN]: ["Want a slot? Join us"],
      ...Mail.WORDS,
      ...Box.WORDS,
      ...Keep.WORDS,
      [ASKS_TO_DELETE_GENRE]: ["Remove"],
      [ASKS_TO_REMOVE_ADMIN]: ["Remove"],
      ...Work.WORDS,
      ...Djs.WORDS,
      [RELOADS]: ["Try again"],
      [GOES_ACCOUNT]: ["Sign in"],
      [SIGNS_OUT]: ["Sign out"],
      [ASKS_TO_DELETE]: ["Delete"],
      ...Desk.WORDS,
      ...Tracks.WORDS,
    });
  }

  describe() {
    const ui = this.ui;
    // walked by its probe (?probe), the page asks the stream host nothing and plays nothing aloud
    const probing = new URLSearchParams(location.search).has("probe");
    this.station = this.model(new Station(this.chimes, probing ? null : askHost));
    const studio = probing ? null : new Studio();
    this.schedule = this.model(new Schedule(this.chimes, studio));
    this.account = this.model(new Account(this.chimes, studio));
    this.library = this.model(new Library(this.chimes, studio));
    const changed = () => { if (this.schedule.studio) { this.schedule.load(); this.library.load(); } };
    this.desk = this.model(new Desk.ScheduleDesk(this.chimes, studio, changed));
    this.workspace = this.model(new Work.Workspace(this.chimes, studio, changed));
    this.letters = this.model(new Mail.Letters(this.chimes, studio));
    // a DJ added, linked or removed: every list of DJs found again, and the signed-in account's own DJ page
    const djsChanged = (reloadsAdminDjs = true) => {
      changed();
      if (this.desk.studio) this.desk.loadLists();
      if (reloadsAdminDjs && this.adminDjs.studio) this.adminDjs.load();
      this.refreshMyDj();
    };
    this.inbox = this.model(new Box.Inbox(this.chimes, studio, djsChanged));
    this.words = this.model(new Keep.StationWords(this.chimes, studio));
    this.tracks = this.model(new Tracks.TrackPictures(this.chimes, studio)); // pictures for what is playing between shows
    this.heard = this.model(new Listeners(this.chimes, studio)); // the station's, for the admin
    this.myHeard = this.model(new Listeners(this.chimes, studio)); // the DJ open in the workspace's
    this.settings = this.model(new Keep.Settings(this.chimes, studio, () => { changed(); if (this.words.studio) this.words.load(); }));
    this.part = this.model(new Choice(this.chimes, SHOWS_PART, "dashboard")); // the admin's: dashboard, schedule, djs, settings, inbox or workspace
    this.adminDjs = this.model(new Djs.AdminDjs(this.chimes, studio, () => djsChanged(false), (profile) => {
      this.workspace.open(profile);
      this.part.chosen.setValue("workspace");
    }));
    this.model(new Reloads(this.chimes, this.schedule));
    this.player = this.model(new Player(this.chimes, STREAM, {
      door: this.commands,
      media: ui.bound(() => ({ title: this.nowPlaying(), artist: this.showLine() || `${STATION.name} · Live`, artwork: this.showPicture() || LOGO })),
      ...(probing ? { audio: quietAudio(), session: null } : {}),
    }));
    return ui.app("the_hatch", [this.header(), ui.stack([this.home(), this.scheduleScreen(), this.djsScreen(), this.djScreen(), this.browseScreen(), this.listenScreen(), this.about(), this.contactScreen(), this.joinScreen(), this.accountScreen()]), this.tabBar(), this.playerBar()]);
  }

  // --- what is on air, read where it is shown ---

  /** The track on the stream, else the show on air, else the station. */
  nowPlaying() { return this.station.nowPlaying.read() || this.schedule.onAir()?.title || STATION.name; }

  /** The show on air and its DJs: "Concrete Frequencies · VELD", or "". */
  showLine() {
    const show = this.schedule.onAir();
    return show ? [show.title, djsOf(show)].filter(Boolean).join(" · ") : "";
  }

  /** The picture for what is on air: the show's own, else one an admin gave what is playing, else "" (the logo). */
  showPicture() { return this.schedule.onAir()?.picture || this.tracks.pictureFor(this.station.nowPlaying.read()); }

  // loaded only when the page is walked (?probe), so an export leaves it out
  probe() { return import("./probe.js?v=fc8f4b8b1b3f").then((made) => new made.Probe(this)); }

  /** The app mounted, then its address kept: #about opens About, and the address follows the reader. */
  mount(element) {
    super.mount(element);
    this.started.then((stood) => { if (stood) { this.keepAddress(); this.keepAccount(); this.keepFresh(); } });
    return this;
  }

  /**
   * What others change, found again: the schedule and the pictures for what
   * is playing every minute while the page is in sight and whenever it comes
   * back into sight; and, for an admin, the part they are on - again when they
   * open it. Nothing being typed is found again (a profile, the words in
   * Settings, an email not saved), so no one's work is written over.
   */
  keepFresh() {
    const admin = () => this.account.admin.read() && this.desk.studio;
    const part = (name) => {
      if (!admin()) return;
      if (name === "dashboard") { this.heard.loadStation(); this.inbox.load(); }
      if (name === "schedule") { this.desk.loadShows(); this.desk.loadLists(); }
      if (name === "djs") this.adminDjs.load();
      if (name === "inbox") this.inbox.load();
      if (name === "pictures") this.tracks.load();
      if (name === "settings") this.settings.loadLists();
    };
    const everything = () => {
      if (document.hidden) return;
      if (this.schedule.studio) { this.schedule.load(); this.library.load(); }
      if (this.tracks.studio) this.tracks.load();
      part(this.part.chosen.read());
      if (admin() && this.part.chosen.read() !== "inbox") this.inbox.load(); // its count is on its tab
    };
    let opened = this.part.chosen.read();
    this.chimes.follow({ region: Chimes.GLOBAL }, "fresh", () => {
      const now = this.part.chosen.read();
      if (now !== opened) { opened = now; Frames.defer(() => part(now)); }
    });
    document.addEventListener("visibilitychange", everything);
    setInterval(everything, 60 * 1000);
  }

  /** Google's button drawn whenever the sign-in shows; the admin's desk filled once an admin is signed in. */
  keepAccount() {
    let drawn = false;
    let deskStarted = false;
    this.chimes.follow({ region: Chimes.GLOBAL }, "account", () => {
      const out = this.account.state.read() === "out" && this.driver.getTop().includes(ACCOUNT);
      const admin = this.account.admin.read();
      Frames.defer(() => {
        if (out && !drawn && this.account.studio) {
          const place = document.getElementById("google-button");
          if (place) { drawn = true; this.account.studio.drawGoogleButton(place, (credential, nonce) => this.account.signInWithGoogle(credential, nonce)).catch(() => { drawn = false; }); }
        }
        if (!out) drawn = false;
        if (admin && !deskStarted && this.desk.studio) { deskStarted = true; this.desk.start(); this.adminDjs.load(); this.inbox.load(); this.settings.load(); this.heard.loadStation(); }
        if (!admin) deskStarted = false;
      });
    });
    // the figures of the DJ open in the workspace, whoever opened it
    let figured = null;
    this.chimes.follow({ region: Chimes.GLOBAL }, "figures", () => {
      const dj = this.workspace.dj.read();
      Frames.defer(() => {
        // listener figures are an admin's alone
        if (dj && figured !== dj.id && this.myHeard.studio && this.account.admin.read()) { figured = dj.id; this.myHeard.loadDj(dj.id); }
        if (!dj) figured = null;
      });
    });
    // a DJ's own workspace opened with their profile, once they are signed in
    let opened = null;
    this.chimes.follow({ region: Chimes.GLOBAL }, "workspace", () => {
      const dj = this.account.dj.read();
      const admin = this.account.admin.read();
      Frames.defer(() => {
        if (dj && opened !== dj.id && this.workspace.studio) { opened = dj.id; if (!admin) this.workspace.open(dj); }
        if (!dj) opened = null;
      });
    });
  }

  /** The signed-in DJ's profile found again: an admin may have linked or unlinked it. */
  async refreshMyDj() {
    if (!this.account.studio) return;
    const found = await this.account.studio.myDj();
    if (found.ok) this.account.dj.setValue(found.data);
  }

  keepAddress() {
    const open = () => {
      const [wanted, parameter = null] = (location.hash.slice(1) || HOME).split("/");
      const screen = SCREENS.includes(wanted) && (wanted !== DJ || parameter) ? wanted : HOME;
      if (!this.driver.isActive(screen) || (this.driver.getParameter(screen) ?? null) !== parameter) {
        this.commands.dispatch(Chimes.GLOBAL, Driver.GO, { place: screen, parameter: screen === DJ ? parameter : null });
      }
    };
    open();
    addEventListener("hashchange", open);
    this.chimes.follow({ region: Chimes.GLOBAL }, "address", () => {
      const at = SCREENS.find((screen) => this.driver.getTop().includes(screen)) ?? HOME;
      const address = at === HOME ? "" : at === DJ ? `#${DJ}/${this.driver.getParameter(DJ)}` : `#${at}`;
      if (location.hash !== address) history.pushState(null, "", address || `${location.pathname}${location.search}`);
    });
  }

  // --- the shell ---

  header() {
    const ui = this.ui;
    const links = [[GOES_HOME, HOME], [GOES_SCHEDULE, SCHEDULE], [GOES_DJS, DJS], [GOES_BROWSE, BROWSE], [GOES_LISTEN, LISTEN], [GOES_ABOUT, ABOUT]];
    const who = ui.bound(() => (this.account.state.read() !== "in" ? Phrase.of("Sign in") : this.account.admin.read() ? Phrase.of("Admin") : Phrase.of("Account")));
    return ui.row([
      ui.pressable(GOES_HOME, {}, [ui.image(LOGO, "MarkImage", ""), ui.text(STATION.name, "Wordmark")], "Mark").goesTo(HOME),
      ui.row(links.map(([action, screen]) => ui.pressable(action, {}, [ui.text(ui.words(action), "NavWords")], "NavLink").goesTo(screen)), "Nav").grow(),
      ui.pressable(GOES_ACCOUNT, {}, [ui.text(who, "NavWords")], "SignIn").goesTo(ACCOUNT),
    ], "TopNav");
  }

  /** On a phone, the navigation as a tab bar over the player (hatch.css shows one or the other). */
  tabBar() {
    const ui = this.ui;
    const tabs = [[GOES_HOME, HOME, Phrase.of("Live")], [GOES_SCHEDULE, SCHEDULE, Phrase.of("Schedule")], [GOES_DJS, DJS, Phrase.of("DJs")],
      [GOES_BROWSE, BROWSE, Phrase.of("Browse")], [GOES_LISTEN, LISTEN, Phrase.of("Listen")], [GOES_ABOUT, ABOUT, Phrase.of("About")]];
    return ui.row(tabs.map(([action, screen, words]) => ui.pressable(action, {}, [ui.text(words, "TabWords")], "Tab").goesTo(screen)), "TabBar");
  }

  /** The player, docked under every screen: what is on air, and play or stop. */
  playerBar() {
    const ui = this.ui;
    const player = this.player;
    const state = player.state.map((now) => ({
      [Player.STARTING]: Phrase.of("Connecting…"),
      [Player.RETRYING]: Phrase.of("Reconnecting…"),
      [Player.PLAYING]: Phrase.of("Live"),
    })[now] ?? Phrase.of("Live · press play"));
    return ui.row([
      this.artwork("Cover"),
      ui.column([
        ui.text(ui.bound(() => this.nowPlaying()), "PlayerNow"),
        ui.row([
          ui.text(ui.bound(() => this.showLine()), "PlayerShow").hidesEmpty(),
          ui.text(state, "PlayerState"),
          ui.text(player.problem, "PlayerProblem").hidesEmpty(),
        ], "PlayerLine"),
      ], "PlayerWords").grow(),
      this.playButtons("PlayButton"),
    ], "PlayerBar");
  }

  /** Play and stop, in one place: each is there while the other isn't. */
  playButtons(style) {
    const ui = this.ui;
    return ui.row([
      ui.button(Player.PLAYS, { style: `${style} Plays` }).absentWhenRefused(),
      ui.button(Player.STOPS, { style: `${style} Stops` }).absentWhenRefused(),
    ], "PlayButtons");
  }

  /** Where artwork goes: the picture given (a bound value, when there is one), else the station logo on black. */
  artwork(style, picture = null) {
    const ui = this.ui;
    const has = picture ?? ui.bound(() => "");
    return ui.surface(`${style} Artwork`, [ui.when(has, ui.image(has, "ArtworkPicture", ""), ui.image(LOGO, "ArtworkLogo", ""))]);
  }

  /** A show's genre tags, as tags. */
  tags(show) {
    return this.ui.eachAcross(show.map((held) => (held ? genresOf(held) : [])), (genre) => this.ui.text(genre, "Tag"), (name) => name, "Tags");
  }

  // --- the screens ---

  home() {
    const ui = this.ui;
    const show = ui.bound(() => this.schedule.onAir());
    const title = show.map((held) => held?.title ?? STATION.name);
    const hosted = show.map((held) => (held && djsOf(held) ? Phrase.with("Hosted by %s", [djsOf(held)]) : null));
    const slot = show.map((held) => (held ? slotOf(held) : STATION.tagline));
    const track = this.station.nowPlaying.map((playing) => (playing ? Phrase.with("Now playing: %s", [playing]) : null));
    return ui.screen(HOME, [
      ui.surface("OnAir", [
        this.artwork("OnAirArt", ui.bound(() => this.showPicture())),
        ui.column([
          ui.row([ui.text(Phrase.of("On air"), "Live"), this.tags(show)], "OnAirTags"),
          ui.text(title, "OnAirTitle").wraps(),
          ui.text(hosted, "OnAirHost").hidesEmpty(),
          ui.text(show.map((held) => held?.description ?? ""), "OnAirAbout").wraps().hidesEmpty(),
          ui.text(track, "OnAirTrack").wraps().hidesEmpty(),
          ui.text(slot, "OnAirLine"),
          ui.row([this.playButtons("BigPlay")], "OnAirControls"),
        ], "OnAirWords").grow(),
      ]),
      ui.column([
        ui.row([ui.text(Phrase.of("What's next"), "SectionTitle").grow(), ui.pressable(GOES_SCHEDULE, {}, [ui.text(Phrase.of("Full schedule →"), "MoreWords")], "More").goesTo(SCHEDULE)], "SectionHead"),
        ui.each(ui.bound(() => this.schedule.upcoming(3)), (next) => this.showRow(next, true), (held) => held.id, "ShowList"),
        ui.when(ui.bound(() => this.schedule.loading.read() === "ready" && !this.schedule.upcoming(1).length),
          ui.text(Phrase.of("Nothing else is scheduled yet. The stream plays on, 24/7."), "Quiet").wraps()),
      ], "Section"),
    ]);
  }

  /** A show's picture: its own, else its first DJ's photo, else "" (the logo). */
  pictureOf(show) { return show?.picture || show?.djs?.find((dj) => dj.picture_url)?.picture_url || ""; }

  /** One show in a list: its picture, time, title, description, DJs and genres, and whether it is on air. */
  showRow(show, withDay = false) {
    const ui = this.ui;
    const time = show.map((held) => (held ? `${withDay ? `${dayName(held.starts, this.schedule.now.read())} ` : ""}${slotOf(held)}` : ""));
    const who = show.map((held) => (held ? djsOf(held) : ""));
    const live = ui.bound(() => this.schedule.isOnAir(show.read()));
    return ui.row([
      this.artwork("ShowThumb", show.map((held) => this.pictureOf(held))),
      ui.column([
        ui.text(time, "ShowTime"),
        ui.text(show.map((held) => held?.title ?? ""), "ShowTitle").wraps(),
        ui.text(show.map((held) => held?.description ?? ""), "ShowAbout").wraps().hidesEmpty(),
        ui.text(who, "ShowWho").hidesEmpty(),
        this.tags(show),
      ], "ShowWords").grow(),
      ui.when(live, ui.text(Phrase.of("On air"), "Live")),
    ], "ShowRow");
  }

  /** One show in the schedule's grid: its picture square above its time, title, description, DJs and genres. */
  showCard(show) {
    const ui = this.ui;
    const live = ui.bound(() => this.schedule.isOnAir(show.read()));
    return ui.column([
      this.artwork("CardArt", show.map((held) => this.pictureOf(held))),
      ui.column([
        ui.row([ui.text(show.map((held) => (held ? `${dayName(held.starts, this.schedule.now.read())} ${slotOf(held)}` : "")), "ShowTime").grow(), ui.when(live, ui.text(Phrase.of("On air"), "Live"))], "CardTop"),
        ui.text(show.map((held) => held?.title ?? ""), "ShowTitle").wraps(),
        ui.text(show.map((held) => held?.description ?? ""), "ShowAbout").wraps().hidesEmpty(),
        ui.text(show.map((held) => (held ? djsOf(held) : "")), "ShowWho").hidesEmpty(),
        this.tags(show),
      ], "CardWords"),
    ], "ShowCard");
  }

  scheduleScreen() {
    const ui = this.ui;
    const schedule = this.schedule;
    const choosing = new Choice(this.chimes, CHOOSES_SCHEDULE_DAY, "all"); // all, week, or a day's id
    const day = choosing.chosen;
    const days = ui.bound(() => [{ id: "all", words: Phrase.of("All") }, { id: "week", words: Phrase.of("All week") }, ...schedule.days().map((date) => ({ id: dayId(date), date }))]);
    const loading = (state) => schedule.loading.map((now) => now === state);
    const shows = ui.bound(() => (day.read() === "all" ? schedule.all() : day.read() === "week" ? schedule.week() : schedule.on(day.read())));
    return ui.screen(SCHEDULE, [
      ui.column([
        ui.text(Phrase.of("Schedule"), "PageTitle"),
        ui.text(Phrase.of("All times are UK time (London)."), "Quiet").wraps(),
      ], "PageHead"),
      ui.eachAcross(days, (held) => ui.pressable(CHOOSES_SCHEDULE_DAY, held.map((d) => ({ choice: d?.id })), [ui.text(held.map((d) => (d?.date ? dayName(d.date, schedule.now.read()) : d?.words ?? "")), "DayWords")], "DayChoice")
        .currentWhile(ui.bound(() => day.read() === held.read()?.id)), (d) => d.id, "Days"),
      ui.when(loading("loading"), ui.text(Phrase.of("Finding the schedule…"), "Quiet")),
      ui.when(loading("failed"), ui.column([ui.text(schedule.trouble, "Problem").wraps(), ui.button(RELOADS, { style: "SecondaryButton" })], "Trouble")),
      ui.each(shows, (held) => this.showCard(held), (held) => held.id, "ShowGrid"),
      ui.when(ui.bound(() => schedule.loading.read() === "ready" && !shows.read().length),
        ui.text(ui.bound(() => ({ all: Phrase.of("Nothing scheduled yet. The stream plays on, 24/7."), week: Phrase.of("Nothing scheduled this week. The stream plays on, 24/7.") })[day.read()] ?? Phrase.of("Nothing scheduled this day. The stream plays on, 24/7.")), "Quiet").wraps()),
    ], choosing);
  }

  // --- the DJs, Browse, Listen Again ---

  /** Words saying a list is being found, couldn't be, or is empty. */
  libraryState(empty, list) {
    const ui = this.ui;
    const library = this.library;
    return ui.column([
      ui.when(library.loading.map((now) => now === "loading"), ui.text(Phrase.of("Finding them…"), "Quiet")),
      ui.when(library.loading.map((now) => now === "failed"), ui.text(library.trouble, "Problem").wraps()),
      ui.when(ui.bound(() => library.loading.read() === "ready" && !list.read().length), ui.text(empty, "Quiet").wraps()),
    ], "ListState");
  }

  /** Genre choices for a filter: every genre there is, and All. */
  genreFilter(chosen) {
    const ui = this.ui;
    return ui.row([
      ui.pressable(CHOOSES_GENRE, { choice: "" }, [ui.text(Phrase.of("All"), "DayWords")], "DayChoice").currentWhile(chosen.map((now) => now === "")),
      ui.eachAcross(ui.bound(() => this.library.genres()), (genre) => ui.pressable(CHOOSES_GENRE, genre.map((name) => ({ choice: name })), [ui.text(genre, "DayWords")], "DayChoice")
        .currentWhile(ui.bound(() => chosen.read() === genre.read())), (name) => name, "Days"),
    ], "Days Filters");
  }

  /** A DJ's card: their picture, name, genres and next show; pressed, their page. */
  djCard(dj) {
    const ui = this.ui;
    const next = dj.map((held) => (held?.next ? Phrase.with("Next: %s", [`${dayName(held.next.starts, this.schedule.now.read())} ${slotOf(held.next)}`]) : null));
    return ui.pressable(OPENS_DJ, dj.map((held) => ({ parameter: held?.id })), [
      this.artwork("DjCardArt", dj.map((held) => held?.picture ?? "")),
      ui.column([
        ui.row([ui.text(dj.map((held) => held?.name ?? ""), "DjName"), ui.when(dj.map((held) => !!held?.resident), ui.text(Phrase.of("Resident"), "Tag Solid"))], "DjNameRow"),
        ui.text(dj.map((held) => (held ? held.genres.map((genre) => genre.name).join(" · ") : "")), "DjGenres").hidesEmpty(),
        ui.text(next, "DjNext").hidesEmpty(),
      ], "DjCardWords"),
    ], "DjCard").goesTo(DJ);
  }

  djsScreen() {
    const ui = this.ui;
    const library = this.library;
    const searching = new Searches(this.chimes, SEARCHES_DJS);
    const choosing = new Choice(this.chimes, CHOOSES_GENRE, "");
    const genre = choosing.chosen;
    const shown = ui.bound(() => {
      const words = searching.words.read().trim().toLowerCase();
      return library.djs.read().filter((dj) => Library.tagged(dj, genre.read()) && (!words || dj.name.toLowerCase().includes(words)));
    });
    return ui.screen(DJS, [
      ui.row([
        ui.column([ui.text(Phrase.of("DJs"), "PageTitle"), ui.text(Phrase.of("The residents and regulars behind the station."), "Quiet")], "PageHead").grow(),
        ui.button(GOES_JOIN, { goes_to: JOIN, style: "SecondaryButton" }),
      ], "AdminHead"),
      ui.field(SEARCHES_DJS, "", { label: Phrase.of("Search DJs"), changes: SEARCHES_DJS, shows: searching.words, placeholder: Phrase.of("A name"), kind: "search" }),
      this.genreFilter(genre),
      this.libraryState(Phrase.of("No DJs match."), shown),
      ui.each(shown, (dj) => this.djCard(dj), (dj) => dj.id, "DjGrid"),
    ], [searching, choosing]);
  }

  djScreen() {
    const ui = this.ui;
    const library = this.library;
    const id = ui.parameter(DJ);
    const dj = ui.bound(() => library.dj(id.read()));
    const ahead = ui.bound(() => library.ahead.read().filter((show) => Library.hosts(show, id.read())));
    const recorded = ui.bound(() => library.archive.read().filter((show) => Library.hosts(show, id.read())));
    const links = dj.map((held) => (held?.links ?? []).filter((link) => /^https?:\/\//.test(link?.url ?? "")));
    return ui.screen(DJ, [
      ui.when(ui.bound(() => library.loading.read() === "ready" && !dj.read()), ui.text(Phrase.of("That DJ isn't on the station's list."), "Quiet")),
      ui.surface("Hero", [
        this.artwork("HeroArt", dj.map((held) => held?.picture ?? "")),
        ui.column([
          ui.row([ui.text(dj.map((held) => held?.name ?? ""), "PageTitle"), ui.when(dj.map((held) => !!held?.resident), ui.text(Phrase.of("Resident"), "Tag Solid"))], "DjNameRow"),
          ui.text(dj.map((held) => held?.location ?? ""), "OnAirLine").hidesEmpty(),
          this.tags(dj),
          ui.text(dj.map((held) => held?.bio ?? ""), "Lead").wraps().hidesEmpty(),
          ui.eachAcross(links, (link) => ui.hyperlink(link.map((held) => held?.url ?? ""), [ui.text(link.map((held) => `${held?.label || held?.url || ""} ↗`))], "DjLink"), (link) => link.url, "DjLinks"),
        ], "HeroWords"),
      ]),
      ui.column([
        ui.text(Phrase.of("Upcoming"), "SectionTitle"),
        ui.each(ahead, (show) => this.showRow(show, true), (show) => show.id, "ShowList"),
        ui.when(ui.bound(() => library.loading.read() === "ready" && !ahead.read().length), ui.text(Phrase.of("No shows scheduled in the next month."), "Quiet")),
      ], "Section"),
      ui.column([
        ui.text(Phrase.of("Listen again"), "SectionTitle"),
        ui.each(recorded, (show) => this.recordingRow(show), (show) => show.id, "ShowList"),
        ui.when(ui.bound(() => library.loading.read() === "ready" && !recorded.read().length), ui.text(Phrase.of("No recordings yet."), "Quiet")),
      ], "Section"),
    ]);
  }

  /** A past show with its recording: when it was, what, who, and where to listen. */
  recordingRow(show) {
    const ui = this.ui;
    const when = show.map((held) => (held ? dateOf(held.starts) : ""));
    return ui.row([
      this.artwork("ShowThumb", show.map((held) => this.pictureOf(held))),
      ui.column([
        ui.text(when, "ShowTime"),
        ui.text(show.map((held) => held?.title ?? ""), "ShowTitle").wraps(),
        ui.text(show.map((held) => held?.description ?? ""), "ShowAbout").wraps().hidesEmpty(),
        ui.text(show.map((held) => (held ? djsOf(held) : "")), "ShowWho").hidesEmpty(),
        this.tags(show),
      ], "ShowWords").grow(),
      ui.hyperlink(show.map((held) => held?.recording ?? ""), [ui.text(Phrase.of("Listen ↗"))], "ListenLink"),
    ], "ShowRow");
  }

  listenScreen() {
    const ui = this.ui;
    const library = this.library;
    const searching = new Searches(this.chimes, SEARCHES_RECORDINGS);
    const choosing = new Choice(this.chimes, CHOOSES_GENRE, "");
    const genre = choosing.chosen;
    const shown = ui.bound(() => {
      const words = searching.words.read().trim().toLowerCase();
      return library.archive.read().filter((show) => Library.tagged(show, genre.read())
        && (!words || show.title.toLowerCase().includes(words) || djsOf(show).toLowerCase().includes(words)));
    });
    return ui.screen(LISTEN, [
      ui.column([ui.text(Phrase.of("Listen again"), "PageTitle"), ui.text(Phrase.of("Past shows, wherever their DJs put them."), "Quiet")], "PageHead"),
      ui.field(SEARCHES_RECORDINGS, "", { label: Phrase.of("Search"), changes: SEARCHES_RECORDINGS, shows: searching.words, placeholder: Phrase.of("A show or a DJ"), kind: "search" }),
      this.genreFilter(genre),
      this.libraryState(Phrase.of("No recordings match."), shown),
      ui.each(shown, (show) => this.recordingRow(show), (show) => show.id, "ShowList"),
    ], [searching, choosing]);
  }

  browseScreen() {
    const ui = this.ui;
    const library = this.library;
    const choosing = new Choice(this.chimes, CHOOSES_GENRE, "");
    const genre = choosing.chosen;
    const ahead = ui.bound(() => library.ahead.read().filter((show) => Library.tagged(show, genre.read())));
    const djs = ui.bound(() => library.djs.read().filter((dj) => Library.tagged(dj, genre.read())));
    const recorded = ui.bound(() => library.archive.read().filter((show) => Library.tagged(show, genre.read())).slice(0, 10));
    const showing = genre.map((name) => (name ? Phrase.with("Showing: %s", [name]) : Phrase.of("Showing: everything")));
    return ui.screen(BROWSE, [
      ui.column([ui.text(Phrase.of("Browse the sound"), "PageTitle"), ui.text(showing, "Quiet")], "PageHead"),
      this.genreFilter(genre),
      ui.column([
        ui.text(Phrase.of("Coming up"), "SectionTitle"),
        ui.each(ahead, (show) => this.showRow(show, true), (show) => show.id, "ShowList"),
        ui.when(ui.bound(() => library.loading.read() === "ready" && !ahead.read().length), ui.text(Phrase.of("Nothing coming up in the next month."), "Quiet")),
      ], "Section"),
      ui.column([
        ui.text(Phrase.of("DJs"), "SectionTitle"),
        ui.each(djs, (dj) => this.djCard(dj), (dj) => dj.id, "DjGrid"),
        ui.when(ui.bound(() => library.loading.read() === "ready" && !djs.read().length), ui.text(Phrase.of("No DJs yet."), "Quiet")),
      ], "Section"),
      ui.column([
        ui.text(Phrase.of("Listen again"), "SectionTitle"),
        ui.each(recorded, (show) => this.recordingRow(show), (show) => show.id, "ShowList"),
        ui.when(ui.bound(() => library.loading.read() === "ready" && !recorded.read().length), ui.text(Phrase.of("No recordings yet."), "Quiet")),
      ], "Section"),
    ], choosing);
  }

  about() {
    const ui = this.ui;
    return ui.screen(ABOUT, [
      ui.surface("Hero", [
        this.artwork("HeroArt", this.words.picture),
        ui.column([
          ui.text(STATION.name, "PageTitle"),
          ui.each(ui.bound(() => this.words.paragraphs()), (words) => ui.text(words, "Lead").wraps(), null, "Paragraphs"),
          ui.row([ui.button(GOES_CONTACT, { goes_to: CONTACT, style: "SecondaryButton" }), ui.button(GOES_JOIN, { goes_to: JOIN, style: "PrimaryButton" })], "Actions"),
        ], "HeroWords"),
      ]),
    ]);
  }

  // --- the account, and the admin's Schedule Manager ---

  accountScreen() {
    const ui = this.ui;
    const account = this.account;
    const state = (now) => account.state.map((held) => held === now);
    return ui.screen(ACCOUNT, [
      ui.when(state("checking"), ui.text(Phrase.of("Checking who's signed in…"), "Quiet")),
      ui.when(state("out"), ui.surface("SignInCard", [
        ui.text(Phrase.of("Sign in"), "PageTitle"),
        ui.text(Phrase.of("For the station's admins and DJs. Listening is free and needs no account."), "Lead").wraps(),
        ui.surface("GoogleButton", []).named("google-button"),
        ui.text(account.problem, "Problem").wraps().hidesEmpty(),
      ])),
      ui.when(ui.bound(() => account.state.read() === "in" && !account.admin.read() && account.dj.read()), ui.column([
        ui.row([
          ui.column([ui.text(Phrase.of("DJ workspace"), "Kicker"), ui.text(Phrase.of("My DJ page"), "PageTitle")], "PageHead").grow(),
          ui.column([ui.text(account.name, "Quiet"), ui.button(SIGNS_OUT, { style: "SecondaryButton" })], "Who"),
        ], "AdminHead"),
        this.workspaceView(),
      ], "Manager")),
      ui.when(ui.bound(() => account.state.read() === "in" && !account.admin.read() && !account.dj.read()), ui.surface("SignInCard", [
        ui.text(Phrase.of("Account"), "PageTitle"),
        ui.text(account.name.map((name) => Phrase.with("Signed in as %s.", [name])), "Lead").wraps(),
        ui.text(account.email.map((email) => Phrase.with("This account isn't set up for the station yet. If you're a DJ or an admin, ask an admin to add your email: %s", [email])), "Quiet").wraps(),
        ui.text(account.problem, "Problem").wraps().hidesEmpty(),
        ui.button(SIGNS_OUT, { style: "SecondaryButton" }),
      ])),
      ui.when(ui.bound(() => account.state.read() === "in" && account.admin.read()), this.adminView()),
    ]);
  }

  /** The admin's parts - the schedule, the DJs, a profile being edited - one at a time. */
  adminView() {
    const ui = this.ui;
    const part = this.part.chosen;
    const is = (name) => part.map((now) => now === name);
    const tab = (name, words) => ui.pressable(SHOWS_PART, { choice: name }, [ui.text(words, "DayWords")], "DayChoice").currentWhile(is(name));
    const mine = ui.bound(() => this.account.dj.read());
    return ui.column([
      ui.row([
        ui.column([ui.text(Phrase.of("Admin"), "Kicker"), ui.text(part.map((now) => ({ djs: Phrase.of("DJs"), inbox: Phrase.of("Inbox"), settings: Phrase.of("Station Settings"), workspace: Phrase.of("DJ profile"), pictures: Phrase.of("Now playing pictures"), dashboard: Phrase.of("Dashboard") })[now] ?? Phrase.of("Schedule Manager")), "PageTitle")], "PageHead").grow(),
        ui.column([ui.text(this.account.name, "Quiet"), ui.button(SIGNS_OUT, { style: "SecondaryButton" })], "Who"),
      ], "AdminHead"),
      ui.row([
        tab("dashboard", Phrase.of("Dashboard")),
        tab("schedule", Phrase.of("Schedule")),
        tab("djs", Phrase.of("DJs")),
        tab("pictures", Phrase.of("Pictures")),
        tab("settings", Phrase.of("Settings")),
        tab("inbox", ui.bound(() => { const waiting = this.inbox.unread() + this.inbox.pending().length; return waiting ? Phrase.with("Inbox (%d)", [waiting]) : Phrase.of("Inbox"); })),
        ui.when(mine, ui.pressable(Djs.EDITS_DJ, mine.map((dj) => ({ id: dj?.id })), [ui.text(Phrase.of("My DJ page"), "DayWords")], "DayChoice")),
      ], "Days Filters"),
      ui.when(is("dashboard"), this.dashboard()),
      ui.when(is("schedule"), this.scheduleManager()),
      ui.when(is("djs"), this.djsManager()),
      ui.when(is("inbox"), this.inboxView()),
      ui.when(is("settings"), this.settingsView()),
      ui.when(is("pictures"), this.picturesView()),
      ui.when(is("workspace"), ui.column([
        ui.text(ui.bound(() => (this.workspace.dj.read() ? Phrase.with("Editing %s", [this.workspace.dj.read().name]) : Phrase.of("Opening…"))), "SectionTitle"),
        this.workspaceView(),
      ], "Manager")),
    ], "Manager");
  }

  /** Pictures for what the stream plays between shows: words to match, and a picture for each. */
  picturesView() {
    const ui = this.ui;
    const tracks = this.tracks;
    return ui.column([
      ui.text(Phrase.of("When no DJ is on, the stream plays on its own. Give a picture to an artist (for all their tracks) or to one track (Artist - Title): it shows on the Live screen while what is playing contains those words. A show's own picture always comes first."), "Quiet").wraps(),
      ui.text(tracks.notice, "Notice").hidesEmpty(),
      ui.text(tracks.problem, "Problem").wraps().hidesEmpty(),
      ui.surface("Form", [
        ui.text(Phrase.of("Add a picture"), "SectionTitle"),
        ui.text(ui.bound(() => (this.station.nowPlaying.read() ? Phrase.with("Playing now: %s", [this.station.nowPlaying.read()]) : null)), "Quiet").wraps().hidesEmpty(),
        ui.row([
          ui.field(Tracks.SETS_WORDS, "", { label: Phrase.of("Artist, or Artist - Title"), placeholder: Phrase.of("Mara Voss"), changes: Tracks.SETS_WORDS, shows: tracks.words }),
          ui.file(Tracks.CHOOSES_PICTURE, Phrase.of("Choose a picture"), { accept: "image/*", style: "SecondaryButton" }),
        ], "DjAdminRow LinkRow"),
      ]),
      ui.when(tracks.pictures.map((all) => all.length > 0), ui.field(Tracks.SEARCHES, "", { label: Phrase.of("Search pictures"), changes: Tracks.SEARCHES, shows: tracks.search, placeholder: Phrase.of("An artist or a track"), kind: "search" })),
      ui.each(ui.bound(() => tracks.shown()), (held) => ui.row([
        this.artwork("ShowThumb", held.map((picture) => picture?.picture_url ?? "")),
        ui.column([
          ui.text(held.map((picture) => picture?.words ?? ""), "ShowTitle").wraps(),
          ui.text(ui.bound(() => (held.read() && this.station.nowPlaying.read().toLowerCase().includes(held.read().words) ? Phrase.of("Matches what is playing now") : null)), "ShowWho").hidesEmpty(),
        ], "ShowWords").grow(),
        ui.button(Tracks.REMOVES_PICTURE, { payload: held.map((picture) => ({ id: picture?.id })), style: "SecondaryButton" }),
      ], "ShowRow"), (picture) => picture.id, "ShowList"),
      ui.when(tracks.pictures.map((all) => !all.length), ui.text(Phrase.of("No pictures yet."), "Quiet")),
      ui.when(ui.bound(() => tracks.pictures.read().length > 0 && !tracks.shown().length), ui.text(Phrase.of("No pictures match."), "Quiet")),
    ], "Manager");
  }

  /** The admin's DJs: add one, make them resident, invite them by their sign-in email, edit or remove them. */
  djsManager() {
    const ui = this.ui;
    const djs = this.adminDjs;
    const confirm = ui.popUp("confirm_remove_dj", (id) => {
      const dj = ui.bound(() => djs.djs.read().find((held) => held.id === id.read()) ?? null);
      return ui.column([
        ui.text(dj.map((held) => Phrase.with("Remove %s from the list?", [held?.name ?? ""])), "SectionTitle"),
        ui.text(Phrase.of("Their page goes, and they come off any shows. Shows themselves stay."), "Quiet").wraps(),
        ui.row([
          ui.button(Djs.DELETES_DJ, { payload: id.map((held) => ({ id: held })), goes_to: ACCOUNT, style: "DangerButton" }),
          ui.button(Ui.CLOSES, { style: "SecondaryButton" }),
        ], "Actions"),
      ], "Confirm");
    });
    return ui.column([
      ui.field(Djs.ADDS_NEW_DJ, "", { label: Phrase.of("Add a DJ"), placeholder: Phrase.of("Their DJ name, then Enter") }),
      ui.text(djs.notice, "Notice").hidesEmpty(),
      ui.text(djs.problem, "Problem").wraps().hidesEmpty(),
      ui.each(djs.djs, (dj) => ui.column([
        ui.row([
          ui.text(dj.map((held) => held?.name ?? ""), "ShowTitle").grow(),
          ui.pressable(Djs.TOGGLES_RESIDENT, dj.map((held) => ({ id: held?.id })), [ui.text(Phrase.of("Resident"), "ChipWords")], "Chip").currentWhile(dj.map((held) => !!held?.resident)),
          ui.button(Djs.EDITS_DJ, { payload: dj.map((held) => ({ id: held?.id })), style: "SecondaryButton" }),
          ui.button(ASKS_TO_REMOVE_DJ, { opens: confirm, with: dj.map((held) => held?.id), style: "SecondaryButton" }),
        ], "DjAdminRow"),
        ui.text(ui.bound(() => {
          const sign = djs.signIn(dj.read()?.id);
          if (sign.state === "in") return Phrase.with("Signed in as %s: they can edit their own page.", [sign.email]);
          if (sign.state === "invited") return Phrase.with("Invited as %s: they get their page when they first sign in with Google.", [sign.email]);
          return Phrase.of("No sign-in email yet: add the one they use with Google so they can edit their own page.");
        }), "Quiet").wraps(),
        ui.when(ui.bound(() => djs.signIn(dj.read()?.id).state === "in"),
          ui.row([ui.button(Djs.UNLINKS_ACCOUNT, { payload: dj.map((held) => ({ id: held?.id })), style: "SecondaryButton" })], "DjAdminRow"),
          ui.row([
            ui.field(Djs.SETS_DJ_EMAIL, "", { label: Phrase.of("Their sign-in email"), placeholder: Phrase.of("name@gmail.com"), changes: Djs.SETS_DJ_EMAIL, carries: (line) => ({ id: dj.read()?.id, line }), shows: ui.bound(() => djs.emails.read()[dj.read()?.id] ?? "") }),
            ui.button(Djs.SAVES_DJ_EMAIL, { payload: dj.map((held) => ({ id: held?.id })), style: "SecondaryButton" }),
          ], "DjAdminRow LinkRow")),
      ], "ShowRow DjAdmin"), (dj) => dj.id, "ShowList"),
    ], "Manager");
  }

  /** The admin's first sight: what is on air, how many are listening (shown to admins only, never to the public), what is waiting, and what needs doing. */
  dashboard() {
    const ui = this.ui;
    const library = this.library;
    const box = this.inbox;
    const onAir = ui.bound(() => this.schedule.onAir());
    const next = ui.bound(() => this.schedule.upcoming(1)[0] ?? null);
    const goes = (part, words) => ui.pressable(SHOWS_PART, { choice: part }, [ui.text(words, "MoreWords")], "More");
    const stat = (figure, label, more = null) => ui.surface("Stat", [ui.text(figure, "StatFigure"), ui.text(label, "StatLabel"), more].filter(Boolean));
    const todo = (shows, empty, says) => ui.column([
      ui.each(shows, (show) => ui.row([
        ui.text(show.map((held) => (held ? `${dateOf(held.starts)} · ${slotOf(held)}` : "")), "ShowTime"),
        ui.text(show.map((held) => [held?.title, held ? djsOf(held) : ""].filter(Boolean).join(" · ")), "ShowTitle").grow(),
      ], "TodoRow"), (show) => show.id, "ShowList"),
      ui.when(shows.map((all) => !all.length), ui.text(empty, "Quiet")),
      ui.when(shows.map((all) => all.length > 0), ui.text(says, "Quiet").wraps()),
    ], "Section");
    return ui.column([
      ui.row([
        stat(this.station.listeners.map((count) => (count == null ? "—" : String(count))), this.station.listeners.map((count) => (count == null ? Phrase.of("live listeners: the stream host hasn't said") : Phrase.of("live listeners")))),
        ui.surface("Stat Wide", [
          ui.row([ui.text(Phrase.of("On air"), "Live")], "OnAirTags"),
          ui.text(onAir.map((show) => show?.title ?? Phrase.of("Nothing scheduled: the stream plays on")), "StatTitle").wraps(),
          ui.text(onAir.map((show) => (show ? `${djsOf(show)} · ${slotOf(show)}` : "")), "StatLabel").hidesEmpty(),
          ui.text(next.map((show) => (show ? Phrase.with("Next: %s, %s %s", [show.title, dayName(show.starts, this.schedule.now.read()), slotOf(show)]) : null)), "StatLabel").hidesEmpty(),
        ]),
        stat(ui.bound(() => String(box.unread())), Phrase.of("unread messages"), goes("inbox", Phrase.of("Inbox →"))),
        stat(ui.bound(() => String(box.pending().length)), Phrase.of("DJ applications waiting"), goes("inbox", Phrase.of("Inbox →"))),
      ], "Stats"),
      ui.row([
        stat(ui.bound(() => String(this.schedule.shows.read().filter((show) => show.ends > this.schedule.now.read()).length)), Phrase.of("shows in the next 7 days"), goes("schedule", Phrase.of("Schedule →"))),
        stat(ui.bound(() => String(library.djs.read().length)), Phrase.of("DJs on the list"), goes("djs", Phrase.of("DJs →"))),
        stat(ui.bound(() => String(library.djs.read().filter((dj) => dj.hasAccount).length)), Phrase.of("DJs signed up to edit their page")),
        stat(ui.bound(() => String(library.archive.read().length)), Phrase.of("recordings in Listen Again")),
      ], "Stats"),
      ui.text(Phrase.of("Listeners, the last 24 hours (UK time)"), "SectionTitle"),
      ui.bars(ui.bound(() => this.heard.hours()), { labelEvery: 3, said: ui.bound(() => Phrase.with("Listeners each hour over the last 24 hours, %d at the most", [Math.max(0, ...this.heard.hours().map((hour) => hour.value))])) }),
      ui.text(Phrase.of("The most listening at once in each hour, counted every five minutes. Point at an hour for its figure."), "Quiet").wraps(),
      ui.text(Phrase.of("Heard most: the last 90 days"), "SectionTitle"),
      this.topShows(this.heard, Phrase.of("No figures yet: they start once the site is live, counted every five minutes.")),
      ui.text(Phrase.of("Needs a picture: the coming week's shows"), "SectionTitle"),
      todo(ui.bound(() => library.needingPictures()), Phrase.of("Every show this week has its picture."), Phrase.of("These use the station logo until their DJ, or you, gives them a picture.")),
      ui.text(Phrase.of("Needs a recording link: the last month's shows"), "SectionTitle"),
      todo(ui.bound(() => library.needingRecordings()), Phrase.of("Every recent show has its recording linked."), Phrase.of("Their DJs add the links in their workspace, or you can from the DJs tab.")),
    ], "Manager");
  }

  /** The shows heard most, with their most at once and their average. */
  topShows(heard, empty) {
    const ui = this.ui;
    const top = ui.bound(() => heard.figures().top);
    return ui.column([
      ui.each(top, (show) => ui.row([
        ui.text(show.map((held) => (held ? dateOf(held.starts) : "")), "ShowTime"),
        ui.text(show.map((held) => [held?.title, held?.dj_names].filter(Boolean).join(" · ")), "ShowTitle").grow(),
        ui.text(show.map((held) => (held ? Phrase.with("%d at most · %s on average", [held.peak, String(held.average)]) : "")), "ShowWho"),
      ], "TodoRow"), (show) => show.show_id, "ShowList"),
      ui.when(ui.bound(() => heard.loaded.read() && !top.read().length), ui.text(empty, "Quiet").wraps()),
    ], "Section");
  }

  /** The admins' Inbox: messages from Contact, then applications from Join Us. */
  inboxView() {
    const ui = this.ui;
    const box = this.inbox;
    const when = (held) => held.map((item) => (item ? `${dateOf(item.created_at)} · ${timeOf(item.created_at)} UK` : ""));
    return ui.column([
      ui.text(box.notice, "Notice").hidesEmpty(),
      ui.text(box.problem, "Problem").wraps().hidesEmpty(),
      ui.text(Phrase.of("Messages"), "SectionTitle"),
      ui.each(box.messages, (message) => ui.column([
        ui.row([
          ui.text(message.map((held) => held?.name ?? ""), "ShowTitle"),
          ui.when(message.map((held) => held && !held.read), ui.text(Phrase.of("New"), "Tag Solid")),
          ui.text(when(message), "ShowTime").grow(),
        ], "DjAdminRow"),
        ui.text(message.map((held) => held?.email ?? ""), "ShowWho"),
        ui.text(message.map((held) => held?.body ?? ""), "MessageBody").wraps(),
        ui.row([
          ui.hyperlink(message.map((held) => (held ? `mailto:${held.email}?subject=${encodeURIComponent("Re: your message to The Hatch")}` : "")), [ui.text(Phrase.of("Reply by email"))], "ReplyLink", { stays: true }),
          ui.button(Box.MARKS_READ, { payload: message.map((held) => ({ id: held?.id })), style: "SecondaryButton" }).absentWhenRefused(),
          ui.button(Box.MARKS_UNREAD, { payload: message.map((held) => ({ id: held?.id })), style: "SecondaryButton" }).absentWhenRefused(),
          ui.button(Box.DELETES_MESSAGE, { payload: message.map((held) => ({ id: held?.id })), style: "SecondaryButton" }),
        ], "Actions"),
      ], "ShowRow DjAdmin"), (message) => message.id, "ShowList"),
      ui.when(box.messages.map((all) => !all.length), ui.text(Phrase.of("No messages."), "Quiet")),
      ui.text(Phrase.of("DJ applications"), "SectionTitle"),
      ui.each(box.applications, (application) => ui.column([
        ui.row([
          ui.text(application.map((held) => held?.artist_name ?? ""), "ShowTitle"),
          ui.text(application.map((held) => ({ pending: Phrase.of("Waiting"), approved: Phrase.of("Approved"), declined: Phrase.of("Declined") })[held?.status] ?? ""), "Tag"),
          ui.text(when(application), "ShowTime").grow(),
        ], "DjAdminRow"),
        ui.text(application.map((held) => [held?.email, held?.genres].filter(Boolean).join(" · ")), "ShowWho"),
        ui.text(application.map((held) => held?.about ?? ""), "MessageBody").wraps().hidesEmpty(),
        ui.row([
          ui.hyperlink(application.map((held) => held?.mix_url ?? ""), [ui.text(Phrase.of("▶ Listen to their mix ↗"))], "ListenLink"),
          ui.hyperlink(application.map((held) => (held ? `mailto:${held.email}?subject=${encodeURIComponent("Your application to The Hatch")}` : "")), [ui.text(Phrase.of("Reply by email"))], "ReplyLink", { stays: true }),
          ui.when(application.map((held) => held?.status === "pending"), ui.row([
            ui.button(Box.APPROVES, { payload: application.map((held) => ({ id: held?.id })), style: "PrimaryButton" }),
            ui.button(Box.DECLINES, { payload: application.map((held) => ({ id: held?.id })), style: "SecondaryButton" }),
          ], "Actions")),
        ], "Actions"),
      ], "ShowRow DjAdmin"), (application) => application.id, "ShowList"),
      ui.when(box.applications.map((all) => !all.length), ui.text(Phrase.of("No applications."), "Quiet")),
    ], "Manager");
  }

  /** Station Settings: the pages' words, the station's picture, the genre list. */
  settingsView() {
    const ui = this.ui;
    const settings = this.settings;
    const confirm = ui.popUp("confirm_delete_genre", (id) => {
      const genre = ui.bound(() => settings.genres.read().find((held) => held.id === id.read()) ?? null);
      return ui.column([
        ui.text(genre.map((held) => Phrase.with("Remove the genre %s?", [held?.name ?? ""])), "SectionTitle"),
        ui.text(Phrase.of("It comes off every DJ and show tagged with it."), "Quiet").wraps(),
        ui.row([
          ui.button(Keep.DELETES_GENRE, { payload: id.map((held) => ({ id: held })), goes_to: ACCOUNT, style: "DangerButton" }),
          ui.button(Ui.CLOSES, { style: "SecondaryButton" }),
        ], "Actions"),
      ], "Confirm");
    });
    const confirmAdmin = ui.popUp("confirm_remove_admin", (email) => {
      const admin = ui.bound(() => settings.admins.read().find((held) => held.email === email.read()) ?? null);
      const isMe = ui.bound(() => !!admin.read()?.user_id && admin.read().user_id === this.account.id.read());
      return ui.column([
        ui.text(admin.map((held) => (held?.invited ? Phrase.with("Take back the invite for %s?", [held.email]) : Phrase.with("Remove %s as an admin?", [held?.name || held?.email || ""]))), "SectionTitle"),
        ui.text(ui.bound(() => (isMe.read() ? Phrase.of("That's you: you'll lose the admin screens straight away.") : Phrase.of("They keep their account, and their DJ page if they have one."))), "Quiet").wraps(),
        ui.row([
          ui.button(Keep.REMOVES_ADMIN, { payload: email.map((held) => ({ email: held })), goes_to: ACCOUNT, style: "DangerButton" }),
          ui.button(Ui.CLOSES, { style: "SecondaryButton" }),
        ], "Actions"),
      ], "Confirm");
    });
    return ui.column([
      ui.text(settings.notice, "Notice").hidesEmpty(),
      ui.text(settings.problem, "Problem").wraps().hidesEmpty(),
      ui.surface("Form", [
        ui.text(Phrase.of("Admins"), "SectionTitle"),
        ui.text(Phrase.of("They run the station: the schedule, the DJs, the inbox and these settings. Add someone by the email they sign in with Google; they see the admin screens when they sign in."), "Quiet").wraps(),
        ui.each(settings.admins, (admin) => ui.row([
          ui.column([
            ui.text(admin.map((held) => held?.name || held?.email || ""), "ShowTitle"),
            ui.text(admin.map((held) => (held?.invited ? Phrase.of("Invited, not signed in yet") : held?.name ? held.email : "")), "ShowWho").hidesEmpty(),
          ], "ShowWords").grow(),
          ui.when(ui.bound(() => !!admin.read()?.user_id && admin.read().user_id === this.account.id.read()), ui.text(Phrase.of("You"), "Tag")),
          ui.button(ASKS_TO_REMOVE_ADMIN, { opens: confirmAdmin, with: admin.map((held) => held?.email), style: "SecondaryButton" }),
        ], "TodoRow"), (admin) => admin.email, "ShowList"),
        ui.row([
          ui.field(Keep.SETS_ADMIN_EMAIL, "", { label: Phrase.of("Their sign-in email"), placeholder: Phrase.of("name@gmail.com"), changes: Keep.SETS_ADMIN_EMAIL, shows: settings.adminEmail }),
          ui.button(Keep.ADDS_ADMIN, { style: "SecondaryButton" }),
        ], "DjAdminRow LinkRow"),
      ]),
      ui.surface("Form", [
        ui.text(Phrase.of("The station's picture"), "SectionTitle"),
        ui.row([
          this.artwork("ProfileThumb", settings.saved.map((held) => held.picture_url)),
          ui.column([
            ui.text(Phrase.of("Shown on the About page. Without one, the station logo."), "Quiet").wraps(),
            ui.row([
              ui.file(Keep.CHOOSES_PICTURE, Phrase.of("Choose a picture"), { accept: "image/*", style: "SecondaryButton" }),
              ui.button(Keep.REMOVES_PICTURE, { style: "SecondaryButton" }).absentWhenRefused(),
            ], "Actions"),
          ], "ShowWords").grow(),
        ], "PhotoRow"),
      ]),
      ui.surface("Form", [
        ui.text(Phrase.of("The pages' words"), "SectionTitle"),
        ui.text(Phrase.of("About page: a blank line starts a new paragraph"), "Label"),
        ui.area(Keep.SETS_ABOUT, settings.about),
        ui.text(Phrase.of("Join Us page: the words above the application form"), "Label"),
        ui.area(Keep.SETS_JOIN, settings.joinUs),
        ui.button(Keep.SAVES, { style: "PrimaryButton" }),
      ]),
      ui.surface("Form", [
        ui.text(Phrase.of("Genres"), "SectionTitle"),
        ui.text(Phrase.of("The tags DJs and shows are given. Renaming one renames it everywhere."), "Quiet").wraps(),
        ui.each(settings.genres, (genre) => ui.row([
          ui.field(Keep.SETS_GENRE_NAME, "", { label: Phrase.of("Genre"), changes: Keep.SETS_GENRE_NAME, carries: (line) => ({ id: genre.read()?.id, line }),
            shows: ui.bound(() => settings.names.read()[genre.read()?.id] ?? "") }),
          ui.button(Keep.RENAMES_GENRE, { payload: genre.map((held) => ({ id: held?.id })), style: "SecondaryButton" }).absentWhenRefused(),
          ui.button(ASKS_TO_DELETE_GENRE, { opens: confirm, with: genre.map((held) => held?.id), style: "SecondaryButton" }),
        ], "DjAdminRow LinkRow GenreRow"), (genre) => genre.id, "ShowList"),
        ui.field(Keep.ADDS_GENRE, "", { label: Phrase.of("Add a genre"), placeholder: Phrase.of("The genre, then Enter") }),
      ]),
    ], "Manager");
  }

  // --- Contact and Join Us ---

  /** A form's line: its label, kept in the letters as it is typed. */
  letterField(action, field, label, held, options = {}) {
    return this.ui.field(action, "", { label, changes: action, carries: (line) => ({ field, line }), shows: held.map((now) => now[field]), ...options });
  }

  contactScreen() {
    const ui = this.ui;
    const letters = this.letters;
    const contact = letters.contact;
    return ui.screen(CONTACT, [
      ui.column([ui.text(Phrase.of("Contact"), "PageTitle"), ui.text(Phrase.of("Questions, gigs, anything: it comes straight to the station team."), "Quiet").wraps()], "PageHead"),
      ui.when(letters.sent.map((kind) => kind === "message"), ui.surface("Thanks", [
        ui.text(Phrase.of("Thanks, your message is with the team."), "SectionTitle"),
        ui.text(Phrase.of("We'll reply to the email address you gave."), "Quiet"),
      ])),
      ui.surface("Form Letter", [
        this.letterField(Mail.SETS_CONTACT, "name", Phrase.of("Name"), contact, { autocomplete: "name" }),
        this.letterField(Mail.SETS_CONTACT, "email", Phrase.of("Email"), contact, { kind: "email", autocomplete: "email" }),
        ui.text(Phrase.of("Message"), "Label"),
        ui.area(Mail.SETS_MESSAGE_BODY, contact.map((now) => now.body)),
        ui.text(ui.bound(() => (letters.sending.read() === "" ? letters.problem.read() : "")), "Problem").wraps().hidesEmpty(),
        ui.button(Mail.SENDS_MESSAGE, { style: "PrimaryButton" }),
      ]),
    ]);
  }

  joinScreen() {
    const ui = this.ui;
    const letters = this.letters;
    const application = letters.application;
    return ui.screen(JOIN, [
      ui.column([ui.text(Phrase.of("Want a slot?"), "PageTitle"),
        ui.text(this.words.joinUs, "Lead").wraps()], "PageHead"),
      ui.when(letters.sent.map((kind) => kind === "application"), ui.surface("Thanks", [
        ui.text(Phrase.of("Thanks, your application is in."), "SectionTitle"),
        ui.text(Phrase.of("The team listens to every mix, and will reply by email."), "Quiet"),
      ])),
      ui.surface("Form Letter", [
        this.letterField(Mail.SETS_APPLICATION, "artist", Phrase.of("Artist name"), application),
        this.letterField(Mail.SETS_APPLICATION, "email", Phrase.of("Email"), application, { kind: "email", autocomplete: "email" }),
        this.letterField(Mail.SETS_APPLICATION, "genres", Phrase.of("Genres"), application, { placeholder: Phrase.of("Techno, dub, jungle…") }),
        this.letterField(Mail.SETS_APPLICATION, "mix", Phrase.of("Link a mix (Mixcloud / SoundCloud)"), application, { kind: "url", placeholder: Phrase.of("https://") }),
        ui.text(Phrase.of("Anything else (optional)"), "Label"),
        ui.area(Mail.SETS_APPLICATION_ABOUT, application.map((now) => now.about)),
        ui.text(ui.bound(() => (letters.sending.read() === "" ? letters.problem.read() : "")), "Problem").wraps().hidesEmpty(),
        ui.button(Mail.SENDS_APPLICATION, { style: "PrimaryButton" }),
      ]),
    ]);
  }

  /** A DJ's workspace: their profile, then their shows' pictures and recordings. */
  workspaceView() {
    const ui = this.ui;
    const work = this.workspace;
    const genreChips = ui.eachAcross(work.genres, (held) => ui.pressable(Work.TOGGLES_GENRE, held.map((genre) => ({ id: genre?.id })), [ui.text(held.map((genre) => genre?.name ?? ""), "ChipWords")], "Chip")
      .currentWhile(ui.bound(() => work.genreIds.read().includes(held.read()?.id))), (genre) => genre.id, "Chips");
    const showRow = (show, past) => ui.row([
      this.artwork("ShowThumb", show.map((held) => held?.picture ?? "")),
      ui.column([
        ui.text(show.map((held) => (held ? `${dateOf(held.starts)} · ${slotOf(held)}` : "")), "ShowTime"),
        ui.text(show.map((held) => held?.title ?? ""), "ShowTitle").wraps(),
        ui.row([
          ui.file(Work.CHOOSES_SHOW_PICTURE, Phrase.of("Choose a picture"), { accept: "image/*", payload: show.map((held) => ({ id: held?.id })), style: "SecondaryButton" }),
          ui.button(Work.REMOVES_SHOW_PICTURE, { payload: show.map((held) => ({ id: held?.id })), style: "SecondaryButton" }).absentWhenRefused(),
        ], "Actions"),
        ui.text(Phrase.of("Description"), "Label"),
        ui.area(Work.SETS_DESCRIPTION, ui.bound(() => work.descriptions.read()[show.read()?.id] ?? ""), "TextArea", { carries: (line) => ({ id: show.read()?.id, line }) }),
        ui.row([ui.button(Work.SAVES_DESCRIPTION, { payload: show.map((held) => ({ id: held?.id })), style: "SecondaryButton" }).absentWhenRefused()], "Actions"),
        past ? ui.row([
          ui.field(Work.SETS_RECORDING, "", { label: Phrase.of("Recording link (Mixcloud, SoundCloud…)"), kind: "url", placeholder: Phrase.of("https://"),
            changes: Work.SETS_RECORDING, carries: (line) => ({ id: show.read()?.id, line }), shows: ui.bound(() => work.drafts.read()[show.read()?.id] ?? "") }),
          ui.button(Work.SAVES_RECORDING, { payload: show.map((held) => ({ id: held?.id })), style: "SecondaryButton" }).absentWhenRefused(),
        ], "FormRow LinkRow") : null,
        past ? ui.text(ui.bound(() => work.recordingNote(show.read())), "RecordingNote").hidesEmpty() : null,
      ].filter(Boolean), "ShowWords").grow(),
    ], "ShowRow MyShow");
    return ui.column([
      ui.text(work.notice, "Notice").hidesEmpty(),
      ui.text(work.problem, "Problem").wraps().hidesEmpty(),
      ui.surface("Form", [
        ui.text(Phrase.of("Profile"), "SectionTitle"),
        ui.row([
          this.artwork("ProfileThumb", work.picture),
          ui.column([
            ui.text(Phrase.of("Your photo is shown on your page and the DJ list. A square one works best."), "Quiet").wraps(),
            ui.file(Work.CHOOSES_PHOTO, Phrase.of("Choose a photo"), { accept: "image/*", style: "SecondaryButton" }),
          ], "ShowWords").grow(),
        ], "PhotoRow"),
        ui.field(Work.SETS_NAME, "", { label: Phrase.of("DJ name"), changes: Work.SETS_NAME, shows: work.name }),
        ui.field(Work.SETS_LOCATION, "", { label: Phrase.of("Where you are"), changes: Work.SETS_LOCATION, shows: work.location, placeholder: Phrase.of("Glasgow") }),
        ui.text(Phrase.of("Bio"), "Label"),
        ui.area(Work.SETS_BIO, work.bio),
        ui.text(Phrase.of("Links, one a line: a name then the address (Bandcamp https://…)"), "Label"),
        ui.area(Work.SETS_LINKS, work.links),
        ui.text(Phrase.of("Genres"), "Label"),
        genreChips,
        ui.row([
          ui.button(Work.SAVES_PROFILE, { style: "PrimaryButton" }),
          ui.pressable(OPENS_DJ, ui.bound(() => ({ parameter: work.dj.read()?.id })), [ui.text(Phrase.of("See the public page →"), "MoreWords")], "More").goesTo(DJ),
        ], "Actions"),
      ]),
      ui.when(this.account.admin, ui.column([
        ui.text(Phrase.of("Listeners: the last 90 days (seen by admins only)"), "SectionTitle"),
        ui.row([
          ui.surface("Stat", [ui.text(ui.bound(() => String(this.myHeard.figures().peak)), "StatFigure"), ui.text(Phrase.of("the most listening at once"), "StatLabel")]),
          ui.surface("Stat", [ui.text(ui.bound(() => String(this.myHeard.figures().average)), "StatFigure"), ui.text(Phrase.of("listening on average, per show"), "StatLabel")]),
          ui.surface("Stat", [ui.text(ui.bound(() => String(this.myHeard.figures().shows)), "StatFigure"), ui.text(Phrase.of("shows counted"), "StatLabel")]),
        ], "Stats"),
        ui.text(Phrase.of("Their shows heard most"), "Label"),
        this.topShows(this.myHeard, Phrase.of("No figures yet: listeners are counted every five minutes while their shows are on.")),
      ], "Section")),
      ui.column([
        ui.text(Phrase.of("Upcoming shows"), "SectionTitle"),
        ui.text(Phrase.of("Give each a picture. Shows without one use the station logo."), "Quiet").wraps(),
        ui.each(ui.bound(() => work.upcoming()), (show) => showRow(show, false), (show) => show.id, "ShowList"),
        ui.when(ui.bound(() => !work.upcoming().length), ui.text(Phrase.of("No shows coming up. An admin adds them to the schedule."), "Quiet")),
      ], "Section"),
      ui.column([
        ui.text(Phrase.of("Past shows"), "SectionTitle"),
        ui.text(Phrase.of("Add the link to where each recording is, and it appears under Listen Again."), "Quiet").wraps(),
        ui.each(ui.bound(() => work.past()), (show) => showRow(show, true), (show) => show.id, "ShowList"),
        ui.when(ui.bound(() => !work.past().length), ui.text(Phrase.of("No past shows yet."), "Quiet")),
      ], "Section"),
    ], "Manager");
  }

  scheduleManager() {
    const ui = this.ui;
    const desk = this.desk;
    const days = ui.bound(() => desk.days().map((date) => ({ id: dayId(date), date })));
    const weekWords = ui.bound(() => { const [monday] = desk.days(); return Phrase.with("Week of %s", [dateOf(monday)]); });
    const dayWords = ui.bound(() => dateOf(dayAt(desk.day.read())));
    const shows = ui.bound(() => desk.onDay());
    const confirm = ui.popUp("confirm_delete", (id) => {
      const show = ui.bound(() => desk.showNamed(id.read()));
      return ui.column([
        ui.text(Phrase.of("Delete this show?"), "SectionTitle"),
        ui.text(show.map((held) => (held ? `${held.title} · ${dayName(held.starts, this.schedule.now.read())} ${slotOf(held)}` : "")), "Quiet").wraps(),
        ui.row([
          ui.button(Desk.DELETES, { payload: id.map((held) => ({ id: held })), goes_to: ACCOUNT, style: "DangerButton" }),
          ui.when(show.map((held) => !!held?.series), ui.button(Desk.DELETES_LATER, { payload: id.map((held) => ({ id: held })), goes_to: ACCOUNT, style: "DangerButton" })),
          ui.button(Ui.CLOSES, { style: "SecondaryButton" }),
        ], "Actions"),
      ], "Confirm");
    });
    return ui.column([
      ui.text(Phrase.of("All times are UK time (London), however they look where you are."), "Quiet").wraps(),
      ui.row([ui.button(Desk.PREVIOUS_WEEK, { style: "SecondaryButton" }), ui.text(weekWords, "WeekWords").grow(), ui.button(Desk.NEXT_WEEK, { style: "SecondaryButton" })], "WeekNav"),
      ui.eachAcross(days, (held) => ui.pressable(Desk.CHOOSES_DAY, held.map((d) => ({ day: d?.id })), [ui.text(held.map((d) => (d ? weekdayOf(d.date) : "")), "DayWords")], "DayChoice")
        .currentWhile(ui.bound(() => desk.day.read() === held.read()?.id)), (d) => d.id, "Days"),
      ui.row([ui.text(dayWords, "SectionTitle").grow(), ui.button(Desk.NEW_SHOW, { style: "PrimaryButton" }).absentWhenRefused()], "SectionHead"),
      ui.text(desk.notice, "Notice").hidesEmpty(),
      ui.when(ui.bound(() => desk.editing.read() === null), ui.text(desk.problem, "Problem").wraps().hidesEmpty()),
      ui.when(desk.loading.map((now) => now === "loading"), ui.text(Phrase.of("Finding the week's shows…"), "Quiet")),
      ui.each(shows, (held) => ui.row([
        ui.text(held.map((show) => (show ? slotOf(show) : "")), "ShowTime"),
        ui.column([
          ui.text(held.map((show) => show?.title ?? ""), "ShowTitle").wraps(),
          ui.text(held.map((show) => (show ? djsOf(show) : "")), "ShowWho").hidesEmpty(),
          this.tags(held),
          ui.when(held.map((show) => !!show?.series), ui.text(Phrase.of("Weekly regular"), "Tag")),
        ], "ShowWords").grow(),
        ui.row([
          ui.button(Desk.EDITS_SHOW, { payload: held.map((show) => ({ id: show?.id })), style: "SecondaryButton" }).absentWhenRefused(),
          ui.button(ASKS_TO_DELETE, { opens: confirm, with: held.map((show) => show?.id), style: "SecondaryButton" }),
        ], "ShowActions"),
      ], "ShowRow"), (show) => show.id, "ShowList"),
      ui.when(ui.bound(() => desk.loading.read() === "ready" && !shows.read().length), ui.text(Phrase.of("Nothing on this day yet."), "Quiet")),
      ui.when(ui.bound(() => desk.editing.read() !== null), this.showForm()),
    ], "Manager");
  }

  showForm() {
    const ui = this.ui;
    const desk = this.desk;
    const isNew = desk.editing.map((now) => now === "new");
    const chips = (list, chosen, toggles) => ui.eachAcross(list, (held) => ui.pressable(toggles, held.map((item) => ({ id: item?.id })), [ui.text(held.map((item) => item?.name ?? ""), "ChipWords")], "Chip")
      .currentWhile(ui.bound(() => chosen.read().includes(held.read()?.id))), (item) => item.id, "Chips");
    const nextDay = ui.bound(() => { const times = desk.times(); return times && dayId(times.ends) !== dayId(times.starts) ? Phrase.of("It ends the next day.") : null; });
    return ui.surface("Form", [
      ui.text(isNew.map((held) => (held ? Phrase.of("New show") : Phrase.of("Edit show"))), "SectionTitle"),
      ui.field(Desk.SETS_TITLE, "", { label: Phrase.of("Title"), changes: Desk.SETS_TITLE, shows: desk.title }),
      ui.row([
        ui.field(Desk.SETS_DATE, "", { label: Phrase.of("Day"), kind: "date", changes: Desk.SETS_DATE, shows: desk.date }),
        ui.field(Desk.SETS_FROM, "", { label: Phrase.of("Starts (UK time)"), kind: "time", changes: Desk.SETS_FROM, shows: desk.from }),
        ui.field(Desk.SETS_TO, "", { label: Phrase.of("Ends (UK time)"), kind: "time", changes: Desk.SETS_TO, shows: desk.to }),
      ], "FormRow"),
      ui.text(nextDay, "Quiet").hidesEmpty(),
      ui.text(Phrase.of("DJs (choose more than one for back to back: each can edit the show)"), "Label"),
      chips(desk.djs, desk.chosenDjs, Desk.TOGGLES_DJ),
      ui.field(Desk.ADDS_DJ, "", { label: Phrase.of("A DJ not on the list"), placeholder: Phrase.of("Their name, then Enter") }),
      ui.text(Phrase.of("Genres"), "Label"),
      chips(desk.genres, desk.chosenGenres, Desk.TOGGLES_GENRE),
      ui.field(Desk.ADDS_GENRE, "", { label: Phrase.of("A genre not on the list"), placeholder: Phrase.of("The genre, then Enter") }),
      ui.text(Phrase.of("Description (optional: the show's DJs can write it themselves)"), "Label"),
      ui.area(Desk.SETS_WORDS, desk.words),
      ui.when(isNew, ui.field(Desk.SETS_REPEAT, "", { label: Phrase.of("Repeat weekly for how many more weeks? 0 for a one-off"), kind: "number", changes: Desk.SETS_REPEAT, shows: desk.repeat })),
      ui.text(desk.problem, "Problem").wraps().hidesEmpty(),
      ui.row([ui.button(Desk.SAVES, { style: "PrimaryButton" }), ui.button(Desk.CANCELS, { style: "SecondaryButton" })], "Actions"),
    ]);
  }

}

/** One of several, chosen on a screen: a day, a genre. */
class Choice extends Controller {
  constructor(chimes, action, initial) { super(chimes); this.action = action; this.chosen = this.value(initial); }
  answers() { return [this.action]; }
  told(_action, payload) { this.chosen.setValue(payload.choice); return null; }
}

/** A search typed into a screen's field: the words, as they are typed. */
class Searches extends Controller {
  constructor(chimes, action) { super(chimes); this.action = action; this.words = this.value(""); }
  answers() { return [this.action]; }
  told(_action, payload) { this.words.setValue(payload.line ?? ""); return null; }
}

/** Asking for the schedule again, after it couldn't be found. */
class Reloads extends Controller {
  constructor(chimes, schedule) { super(chimes); this.schedule = schedule; }
  answers() { return [RELOADS]; }
  would() { return this.schedule.loading.read() === "loading" ? Phrase.of("Finding the schedule") : null; }
  told() { this.schedule.load(); return null; }
}

ChimeApp.start(TheHatch, document.getElementById("app"));
