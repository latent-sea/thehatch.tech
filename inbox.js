// The admins' Inbox: messages from the Contact form, newest first, each
// marked read or not, answered by email, or deleted; and DJ applications
// from Join Us, each approved - which adds the applicant to the DJs - or
// declined.

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=fc8f4b8b1b3f";

export const MARKS_READ = "marks_a_message_read";
export const MARKS_UNREAD = "marks_a_message_unread";
export const DELETES_MESSAGE = "deletes_a_message";
export const APPROVES = "approves_an_application";
export const DECLINES = "declines_an_application";

export const WORDS = {
  [MARKS_READ]: ["Mark read"],
  [MARKS_UNREAD]: ["Mark unread"],
  [DELETES_MESSAGE]: ["Delete"],
  [APPROVES]: ["Approve → DJ"],
  [DECLINES]: ["Decline"],
};

export class Inbox extends Controller {
  /** Through the studio, or none: the page walked by its probe. Told when a DJ was added. */
  constructor(chimes, studio, changed = () => {}) {
    super(chimes);
    this.studio = studio;
    this.changed = changed;
    this.messages = this.value([]);
    this.applications = this.value([]);
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
  }

  async load() {
    const [messages, applications] = await Promise.all([this.studio.messages(), this.studio.applications()]);
    if (this.disposed) return;
    if (messages.ok) this.messages.setValue(messages.data);
    if (applications.ok) this.applications.setValue(applications.data);
    if (!messages.ok || !applications.ok) this.problem.setValue(messages.error || applications.error);
  }

  unread() { return this.messages.read().filter((message) => !message.read).length; }

  pending() { return this.applications.read().filter((application) => application.status === "pending"); }

  answers() { return Object.keys(WORDS); }

  would(action, payload) {
    if (this.busy.read()) return Phrase.of("Saving");
    const message = this.messages.read().find((held) => held.id === payload?.id);
    if (action === MARKS_READ && message?.read) return Phrase.of("Read");
    if (action === MARKS_UNREAD && message && !message.read) return Phrase.of("Unread");
    return null;
  }

  told(action, payload) {
    this.notice.setValue("");
    const id = payload.id;
    const application = this.applications.read().find((held) => held.id === id);
    if (action === MARKS_READ) this.change(() => this.studio.markRead(id, true), "");
    if (action === MARKS_UNREAD) this.change(() => this.studio.markRead(id, false), "");
    if (action === DELETES_MESSAGE) this.change(() => this.studio.deleteMessage(id), "Message deleted");
    if (action === APPROVES) this.change(() => this.studio.approve(id), `${application?.artist_name ?? "They"} added to the DJs`, true);
    if (action === DECLINES) this.change(() => this.studio.decline(id), "Application declined");
    return null;
  }

  async change(work, said, addsDj = false) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.busy.setValue(false);
    if (!done.ok) { this.problem.setValue(done.error); return; }
    this.notice.setValue(said);
    await this.load();
    if (addsDj) this.changed();
  }
}
