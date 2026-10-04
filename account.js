// Who is signed in, and whether they run the station: signing in with Google
// (studio.js), then asking the platform whether the account is an admin's
// (the_hatch_admins) and whether it has a DJ profile (the_hatch_djs). An
// account that is neither is shown its id: the id an admin gives a DJ
// profile, or puts in the_hatch_admins.

import { Controller, Phrase } from "./gd_chime/gd_chime.js";

export const SIGNS_OUT = "signs_out";

export class Account extends Controller {
  /** Through the studio, or none: the page walked by its probe, told who is signed in instead. */
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.state = this.value(studio ? "checking" : "out"); // checking, out or in
    this.name = this.value("");
    this.id = this.value("");
    this.admin = this.value(false);
    this.dj = this.value(null); // the account's DJ profile, or null
    this.problem = this.value("");
    // a guest - a visitor who sent a message - is not signed in, as far as anyone can see
    if (studio) this.studio.restore().then((signed) => (signed && !this.studio.isGuest() ? this.signedIn() : this.state.setValue("out")));
  }

  answers() { return [SIGNS_OUT]; }

  would(action) { return action === SIGNS_OUT && this.state.read() !== "in" ? Phrase.of("Not signed in") : null; }

  told(action) {
    if (action === SIGNS_OUT) {
      this.studio?.signOut();
      this.became({ state: "out", name: "", id: "", admin: false, dj: null });
    }
    return null;
  }

  /** Google's answer, handed on by its button: a press of the reader's own on Google's side. */
  async signInWithGoogle(credential, nonce) {
    this.problem.setValue("");
    const signed = await this.studio.signInWithGoogle(credential, nonce);
    if (!signed.ok) { this.problem.setValue(signed.error); return; }
    await this.signedIn();
  }

  /** Someone is signed in: who, whether they are an admin, and their DJ profile if they have one. */
  async signedIn() {
    const [admin, dj] = await Promise.all([this.studio.isAdmin(), this.studio.myDj()]);
    if (this.disposed) return;
    this.became({ state: "in", name: this.studio.userName(), id: this.studio.backend.playerId(), admin: admin.ok && admin.data, dj: dj.ok ? dj.data : null });
    if (!admin.ok || !dj.ok) this.problem.setValue(admin.error || dj.error);
  }

  /** The account as it now stands. */
  became({ state, name, id, admin, dj = null }) {
    this.name.setValue(name);
    this.id.setValue(id);
    this.admin.setValue(admin);
    this.dj.setValue(dj);
    this.state.setValue(state);
  }
}
