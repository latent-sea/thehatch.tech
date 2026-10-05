// What visitors send the station: a message from the Contact form, and an
// application to DJ from Join Us. Each is sent as a guest of the platform
// (studio.js) and lands in the admins' Inbox (inbox.js). The forms say what
// is missing before sending, and thank the visitor once sent.

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=f905a68000af";

export const SETS_CONTACT = "sets_a_contact_field";
export const SETS_MESSAGE_BODY = "sets_the_message";
export const SENDS_MESSAGE = "sends_the_message";
export const SETS_APPLICATION = "sets_an_application_field";
export const SETS_APPLICATION_ABOUT = "sets_the_application_note";
export const SENDS_APPLICATION = "sends_the_application";

export const WORDS = {
  [SETS_CONTACT]: ["Your message"],
  [SETS_MESSAGE_BODY]: ["Message"],
  [SENDS_MESSAGE]: ["Send"],
  [SETS_APPLICATION]: ["Your application"],
  [SETS_APPLICATION_ABOUT]: ["About you"],
  [SENDS_APPLICATION]: ["Apply →"],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_LINK = /^https?:\/\/\S+$/i;

export class Letters extends Controller {
  /** Through the studio, or none: the page walked by its probe, handed a stand-in. */
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.contact = this.value({ name: "", email: "", body: "" });
    this.application = this.value({ artist: "", email: "", genres: "", mix: "", about: "" });
    this.sending = this.value("");   // "", "message" or "application"
    this.sent = this.value("");      // the last one sent: "message" or "application"
    this.problem = this.value("");
  }

  answers() { return Object.keys(WORDS); }

  would(action) {
    if ([SENDS_MESSAGE, SENDS_APPLICATION].includes(action) && this.sending.read()) return Phrase.of("Sending");
    if (action === SENDS_MESSAGE) {
      const { name, email, body } = this.contact.read();
      if (!name.trim()) return Phrase.of("Add your name");
      if (!EMAIL.test(email.trim())) return Phrase.of("Add an email address we can reply to");
      if (!body.trim()) return Phrase.of("Write your message");
    }
    if (action === SENDS_APPLICATION) {
      const { artist, email, mix } = this.application.read();
      if (!artist.trim()) return Phrase.of("Add your artist name");
      if (!EMAIL.test(email.trim())) return Phrase.of("Add an email address we can reply to");
      if (!WEB_LINK.test(mix.trim())) return Phrase.of("Link a mix (https://...)");
    }
    return null;
  }

  told(action, payload) {
    if (action === SETS_CONTACT) { this.contact.update((now) => ({ ...now, [payload.field]: payload.line })); this.sent.setValue(""); }
    if (action === SETS_MESSAGE_BODY) this.told(SETS_CONTACT, { field: "body", line: payload.line });
    if (action === SETS_APPLICATION_ABOUT) this.told(SETS_APPLICATION, { field: "about", line: payload.line });
    if (action === SETS_APPLICATION) { this.application.update((now) => ({ ...now, [payload.field]: payload.line })); this.sent.setValue(""); }
    if (action === SENDS_MESSAGE) {
      const { name, email, body } = this.contact.read();
      this.send("message", () => this.studio.sendMessage({ name: name.trim(), email: email.trim(), body: body.trim() }), () => this.contact.setValue({ name: "", email: "", body: "" }));
    }
    if (action === SENDS_APPLICATION) {
      const { artist, email, genres, mix, about } = this.application.read();
      this.send("application", () => this.studio.apply({ artist: artist.trim(), email: email.trim(), genres: genres.trim(), mix: mix.trim(), about: about.trim() }),
        () => this.application.setValue({ artist: "", email: "", genres: "", mix: "", about: "" }));
    }
    return null;
  }

  async send(kind, work, clear) {
    this.sending.setValue(kind);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.sending.setValue("");
    if (!done.ok) { this.problem.setValue(done.error); return; }
    clear();
    this.sent.setValue(kind);
  }
}
