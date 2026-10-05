// Who is signed in, and whether they run the station: signing in with Google
// (studio.js), then taking up whatever an admin invited their email to - a
// DJ profile, admin (the_hatch_claim) - and asking whether the account is an
// admin's and has a DJ profile. No one ever handles an account id: an
// account that is neither is told to ask an admin to invite its email.

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=0d17fe3039de";

export const SIGNS_OUT = "signs_out";

export class Account extends Controller {
  /** Through the studio, or none: the page walked by its probe, told who is signed in instead. */
  constructor(chimes, studio) {
    super(chimes);
    this.studio = studio;
    this.state = this.value(studio ? "checking" : "out"); // checking, out or in
    this.name = this.value("");
    this.id = this.value("");
    this.email = this.value("");
    this.admin = this.value(false);
    this.dj = this.value(null); // the account's DJ profile, or null
    this.problem = this.value("");
    // a guest - a visitor who sent a message - is not signed in, as far as anyone can see
    // back from Google on a phone: its answer signs in; else whoever was signed in before
    const google = studio ? this.studio.googleAnswer() : null;
    if (google?.credential) this.signInWithGoogle(google.credential, google.nonce).then(() => { if (this.state.read() !== "in") this.state.setValue("out"); });
    else if (studio) {
      if (google?.error) this.problem.setValue(google.error);
      this.studio.restore().then((signed) => (signed && !this.studio.isGuest() ? this.signedIn() : this.state.setValue("out")));
    }
  }

  answers() { return [SIGNS_OUT]; }

  would(action) { return action === SIGNS_OUT && this.state.read() !== "in" ? Phrase.of("Not signed in") : null; }

  told(action) {
    if (action === SIGNS_OUT) {
      this.studio?.signOut();
      this.became({ state: "out", name: "", id: "", email: "", admin: false, dj: null });
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
    const claimed = await this.studio.claim();
    const [admin, dj] = await Promise.all([this.studio.isAdmin(), this.studio.myDj()]);
    if (this.disposed) return;
    this.became({ state: "in", name: this.studio.userName(), id: this.studio.backend.playerId(), email: this.studio.userEmail(), admin: admin.ok && admin.data, dj: dj.ok ? dj.data : null });
    if (!claimed.ok || !admin.ok || !dj.ok) this.problem.setValue(claimed.error || admin.error || dj.error);
  }

  /** The account as it now stands. */
  became({ state, name, id, email = "", admin, dj = null }) {
    this.name.setValue(name);
    this.id.setValue(id);
    this.email.setValue(email);
    this.admin.setValue(admin);
    this.dj.setValue(dj);
    this.state.setValue(state);
  }
}
