// The admin's DJs: every DJ on the station's list, added by name, made
// resident or not, given to the account they sign in with (by the id their
// own Account screen shows them), or taken off the list. Their profiles are
// edited in the same workspace a DJ uses for their own (workspace.js).

import { Controller, Phrase } from "./gd_chime/gd_chime.js";

export const ADDS_NEW_DJ = "adds_a_new_dj";
export const TOGGLES_RESIDENT = "toggles_resident";
export const SETS_ACCOUNT_ID = "sets_an_account_id";
export const LINKS_ACCOUNT = "links_an_account";
export const UNLINKS_ACCOUNT = "unlinks_an_account";
export const EDITS_DJ = "edits_a_dj";
export const DELETES_DJ = "deletes_a_dj";

export const WORDS = {
  [ADDS_NEW_DJ]: ["Add a DJ"],
  [TOGGLES_RESIDENT]: ["Resident"],
  [SETS_ACCOUNT_ID]: ["Account id"],
  [LINKS_ACCOUNT]: ["Link account"],
  [UNLINKS_ACCOUNT]: ["Unlink account"],
  [EDITS_DJ]: ["Edit profile"],
  [DELETES_DJ]: ["Remove from the list"],
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AdminDjs extends Controller {
  /** Through the studio, or none: the page walked by its probe. Told when anything public changed, and when a profile is to be edited. */
  constructor(chimes, studio, changed = () => {}, edit = () => {}) {
    super(chimes);
    this.studio = studio;
    this.changed = changed;
    this.edit = edit;
    this.djs = this.value([]);
    this.ids = this.value({}); // dj id -> an account id as typed
    this.busy = this.value(false);
    this.problem = this.value("");
    this.notice = this.value("");
  }

  async load() {
    const found = await this.studio.djList();
    if (this.disposed) return;
    if (found.ok) this.djs.setValue(found.data);
    else this.problem.setValue(found.error);
  }

  answers() { return Object.keys(WORDS); }

  would(action, payload) {
    if (action !== SETS_ACCOUNT_ID && this.busy.read()) return Phrase.of("Saving");
    if (action === LINKS_ACCOUNT && !ID.test((this.ids.read()[payload?.id] ?? "").trim())) return Phrase.of("Paste the id from their Account screen");
    return null;
  }

  told(action, payload) {
    this.notice.setValue("");
    const dj = this.djs.read().find((held) => held.id === payload?.id);
    if (action === ADDS_NEW_DJ) {
      const name = (payload.line ?? "").trim();
      if (!name) return Phrase.of("A DJ needs a name");
      this.change(() => this.studio.addDj(name), () => `${name} added`);
    }
    if (action === SETS_ACCOUNT_ID) this.ids.update((ids) => ({ ...ids, [payload.id]: payload.line }));
    if (action === TOGGLES_RESIDENT && dj) this.change(() => this.studio.setResident(dj.id, !dj.resident), () => (dj.resident ? `${dj.name} is no longer a resident` : `${dj.name} is a resident`));
    if (action === LINKS_ACCOUNT && dj) this.change(() => this.studio.linkAccount(dj.id, this.ids.read()[dj.id].trim()), () => `${dj.name}'s account linked: they can edit their own page`);
    if (action === UNLINKS_ACCOUNT && dj) this.change(() => this.studio.linkAccount(dj.id, null), () => `${dj.name}'s account unlinked`);
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
    this.notice.setValue(said());
    await this.load();
    this.changed();
  }
}
