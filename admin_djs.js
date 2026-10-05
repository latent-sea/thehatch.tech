// The admin's DJs: every DJ on the station's list, added by name, made
// resident or not, invited by the email address they sign in with - when
// they sign in with Google, the platform matches the email and gives them
// their page (the_hatch_claim) - or taken off the list. Their profiles are
// edited in the same workspace a DJ uses for their own (workspace.js).

import { renew } from "./renew.js?v=0d17fe3039de";
import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=0d17fe3039de";

export const ADDS_NEW_DJ = "adds_a_new_dj";
export const TOGGLES_RESIDENT = "toggles_resident";
export const SETS_DJ_EMAIL = "sets_a_dj_email";
export const SAVES_DJ_EMAIL = "saves_a_dj_email";
export const UNLINKS_ACCOUNT = "unlinks_an_account";
export const EDITS_DJ = "edits_a_dj";
export const DELETES_DJ = "deletes_a_dj";

export const WORDS = {
  [ADDS_NEW_DJ]: ["Add a DJ"],
  [TOGGLES_RESIDENT]: ["Resident"],
  [SETS_DJ_EMAIL]: ["Their sign-in email"],
  [SAVES_DJ_EMAIL]: ["Save email"],
  [UNLINKS_ACCOUNT]: ["Unlink their sign-in"],
  [EDITS_DJ]: ["Edit profile"],
  [DELETES_DJ]: ["Remove from the list"],
};

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AdminDjs extends Controller {
  /** Through the studio, or none: the page walked by its probe. Told when anything public changed, and when a profile is to be edited. */
  constructor(chimes, studio, changed = () => {}, edit = () => {}) {
    super(chimes);
    this.studio = studio;
    this.changed = changed;
    this.edit = edit;
    this.djs = this.value([]);
    this.accounts = this.value({}); // dj id -> { invite_email, account_email }
    this.emails = this.value({}); // dj id -> an email as typed
    this.typed = new Set(); // the DJs whose email is typed and not saved: kept when the list is found again
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
  }

  async load() {
    const [found, accounts] = await Promise.all([this.studio.djList(), this.studio.djAccounts()]);
    if (this.disposed) return;
    if (found.ok) renew(this.djs, found.data);
    if (accounts.ok) {
      const held = Object.fromEntries(accounts.data.map((row) => [row.dj_id, { invite: row.invite_email ?? "", account: row.account_email ?? "" }]));
      renew(this.accounts, held);
      const typed = this.emails.read();
      renew(this.emails, Object.fromEntries(Object.entries(held).map(([id, row]) => [id, this.typed.has(id) ? typed[id] : row.invite])));
    }
    if (!found.ok || !accounts.ok) this.problem.setValue(found.error || accounts.error);
  }

  /** How a DJ signs in: "in" (signed in, as account), "invited" (as invite, not yet signed in) or "none". */
  signIn(id) {
    const row = this.accounts.read()[id] ?? { invite: "", account: "" };
    if (row.account) return { state: "in", email: row.account };
    if (row.invite) return { state: "invited", email: row.invite };
    return { state: "none", email: "" };
  }

  answers() { return Object.keys(WORDS); }

  would(action, payload) {
    if (action !== SETS_DJ_EMAIL && this.busy.read()) return Phrase.of("Saving");
    if (action === SAVES_DJ_EMAIL) {
      const email = (this.emails.read()[payload?.id] ?? "").trim().toLowerCase();
      if (email === (this.accounts.read()[payload?.id]?.invite ?? "")) return Phrase.of("Nothing to save");
      if (email && !EMAIL.test(email)) return Phrase.of("An email address, please");
    }
    if (action === UNLINKS_ACCOUNT && this.signIn(payload?.id).state !== "in") return Phrase.of("Not signed in yet");
    return null;
  }

  told(action, payload) {
    this.notice.setValue("");
    const dj = this.djs.read().find((held) => held.id === payload?.id);
    if (action === ADDS_NEW_DJ) {
      const name = (payload.line ?? "").trim();
      if (!name) return Phrase.of("A DJ needs a name");
      this.change(() => this.studio.addDj(name), () => `${name} added: give them their sign-in email below`);
    }
    if (action === SETS_DJ_EMAIL) { this.typed.add(payload.id); this.emails.update((emails) => ({ ...emails, [payload.id]: payload.line })); }
    if (action === TOGGLES_RESIDENT && dj) this.change(() => this.studio.setResident(dj.id, !dj.resident), () => (dj.resident ? `${dj.name} is no longer a resident` : `${dj.name} is a resident`));
    if (action === SAVES_DJ_EMAIL && dj) {
      const email = (this.emails.read()[dj.id] ?? "").trim().toLowerCase();
      this.typed.delete(dj.id);
      this.change(() => this.studio.inviteDj(dj.id, email), (linked) => {
        if (!email) return `${dj.name}'s invite taken back`;
        return linked ? `${dj.name} is linked: they've signed in with ${email} before` : `Saved: when ${dj.name} signs in with Google as ${email}, they get their page`;
      });
    }
    if (action === UNLINKS_ACCOUNT && dj) this.change(() => this.studio.unlinkDj(dj.id), () => `${dj.name}'s sign-in unlinked`);
    if (action === DELETES_DJ && dj) this.change(() => this.studio.deleteDj(dj.id), () => `${dj.name} removed`);
    if (action === EDITS_DJ && dj) this.open(dj.id);
    return null;
  }

  async open(id) {
    const found = await this.studio.djProfile(id);
    if (found.ok && found.data) this.edit(found.data);
    else this.problem.setValue(found.error || "That DJ is no longer on the list");
  }

  /** A change sent, then the list found again, and what was done said; while it goes nothing else is sent. */
  async change(work, said) {
    this.busy.setValue(true);
    this.problem.setValue("");
    const done = await work();
    if (this.disposed) return;
    this.busy.setValue(false);
    if (!done.ok) { this.problem.setValue(done.error); return; }
    this.notice.setValue(said(done.data));
    await this.load();
    this.changed();
  }
}
