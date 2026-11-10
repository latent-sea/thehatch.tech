// Who is signed in, and whether they run the station: signing in with Google,
// or with a code emailed to any address (studio.js), then taking up whatever an admin invited their email to - a
// DJ profile, admin (the_hatch_claim) - and asking whether the account is an
// admin's and has a DJ profile. No one ever handles an account id: an
// account that is neither is told to ask an admin to invite its email.

import { Controller, Phrase } from "./gd_chime/gd_chime.js?v=da145a9c9aa1";

export const SIGNS_OUT = "signs_out";
export const SETS_EMAIL = "sets_the_email_to_sign_in_with";
export const SENDS_CODE = "emails_me_a_code";
export const SETS_CODE = "sets_the_emailed_code";
export const SIGNS_IN_WITH_CODE = "signs_in_with_the_code";
export const OTHER_EMAIL = "uses_another_email";

export const WORDS = {
  [SIGNS_OUT]: ["Sign out"],
  [SETS_EMAIL]: ["Your email"],
  [SENDS_CODE]: ["Email me a code"],
  [SETS_CODE]: ["The code"],
  [SIGNS_IN_WITH_CODE]: ["Sign in"],
  [OTHER_EMAIL]: ["Use another email"],
};

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    this.typed = this.value(""); // the email typed to sign in with
    this.code = this.value("");
    this.codeSentTo = this.value(""); // where a code was emailed, while it's waited for
    this.busy = this.value(false);
    // a guest - a visitor who sent a message - is not signed in, as far as anyone can see
    // back from Google on a phone: its answer signs in; else whoever was signed in before
    const google = studio ? this.studio.googleAnswer() : null;
    if (google?.credential) this.signInWithGoogle(google.credential, google.nonce).then(() => { if (this.state.read() !== "in") this.state.setValue("out"); });
    else if (studio) {
      if (google?.error) this.problem.setValue(google.error);
      this.studio.restore().then((signed) => (signed && !this.studio.isGuest() ? this.signedIn() : this.state.setValue("out")));
    }
  }

  answers() { return Object.keys(WORDS); }

  would(action) {
    if (action === SIGNS_OUT && this.state.read() !== "in") return Phrase.of("Not signed in");
    if ((action === SENDS_CODE || action === SIGNS_IN_WITH_CODE) && this.busy.read()) return Phrase.of("Just a moment");
    if (action === SENDS_CODE && !ADDRESS.test(this.typed.read().trim())) return Phrase.of("Type your email address");
    if (action === SIGNS_IN_WITH_CODE && !/^\d{6,10}$/.test(this.code.read().replace(/\s/g, ""))) return Phrase.of("Type the code from the email");
    return null;
  }

  told(action, payload) {
    if (action === SETS_EMAIL) this.typed.setValue(payload.line);
    if (action === SETS_CODE) this.code.setValue(payload.line);
    if (action === SENDS_CODE) this.sendCode();
    if (action === SIGNS_IN_WITH_CODE) this.signInWithCode();
    if (action === OTHER_EMAIL) { this.codeSentTo.setValue(""); this.code.setValue(""); this.problem.setValue(""); }
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

  /** A sign-in code emailed to the address typed: the same account as Google's, where it is the same address. */
  async sendCode() {
    const email = this.typed.read().trim().toLowerCase();
    this.problem.setValue("");
    this.busy.setValue(true);
    const sent = await this.studio.requestCode(email);
    this.busy.setValue(false);
    if (!sent.ok) { this.problem.setValue(sent.error); return; }
    this.code.setValue("");
    this.codeSentTo.setValue(email);
  }

  /** The emailed code typed: signed in. */
  async signInWithCode() {
    this.problem.setValue("");
    this.busy.setValue(true);
    const signed = await this.studio.verifyCode(this.codeSentTo.read(), this.code.read().replace(/\s/g, ""));
    this.busy.setValue(false);
    if (!signed.ok) { this.problem.setValue(/expired|invalid|token/i.test(signed.error ?? "") ? "That code isn't right, or has run out: check the email, or ask for another." : signed.error); return; }
    this.codeSentTo.setValue("");
    this.code.setValue("");
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
