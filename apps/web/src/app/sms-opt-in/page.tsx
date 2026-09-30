import Link from "next/link";
import { OTP_SEND_BUTTON_LABEL, SMS_CONSENT_TEXT, SMS_OTP_DISCLOSURE_TEXT, SMS_WELCOME_TEXT } from "@/lib/sms-consent-policy";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "SMS Opt-In",
  description: "Public example of the BandWagon SMS consent experience: what members agree to, how often messages are sent, and how to opt out.",
  path: "/sms-opt-in",
});

export default function SmsOptInPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>BandWagon SMS Notifications</h1>
        <p>Public example of the consent experience presented to BandWagon users.</p>
      </header>

      <section className="notice">
        <strong>SMS is optional.</strong> Users can create and use a BandWagon account with a verified email address without consenting to SMS notifications.
      </section>

      <article className="legal-card">
        <h2>SMS Consent Example</h2>
        <p>During account setup or from notification settings, users may provide a mobile number and separately choose whether to receive transactional SMS messages. The consent option is unchecked by default.</p>

        <div className="consent-example" aria-label="BandWagon SMS opt-in example">
          <div className="eyebrow">Example shown to users</div>
          <label htmlFor="example-mobile"><strong>Mobile Number</strong></label>
          <input id="example-mobile" type="tel" value="(469) 555-0123" readOnly aria-label="Example mobile number"
            style={{width:"100%",maxWidth:"360px",margin:"10px 0 18px",padding:"12px",borderRadius:"8px",border:"1px solid #cbd5e1",background:"#fff",color:"#111827"}} />

          <p className="fine-print" style={{margin:"0 0 14px"}}><strong>Don&apos;t Want A Text?</strong> Texting is not required to sign in. <Link href="/login">Get Your Code By Email Instead</Link>, or sign in with a passkey.</p>

          <div className="eyebrow">Optional: Ride Update Texts</div>
          <label className="consent-row">
            <input type="checkbox" />
            <span>{SMS_CONSENT_TEXT}</span>
          </label>

          <span style={{display:"inline-block",margin:"8px 0 4px",padding:"11px 18px",borderRadius:"8px",background:"#101b33",color:"#fff",fontWeight:800}}>{OTP_SEND_BUTTON_LABEL}</span>
          <p className="fine-print">{SMS_OTP_DISCLOSURE_TEXT}</p>

          <p className="fine-print">SMS consent is optional and is not required to create or use a BandWagon account. The checkbox above is intentionally unchecked by default. By opting in you agree to our <Link href="/terms">Terms of Use</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>

          <Link href="/login" style={{display:"inline-block",marginTop:"8px",padding:"11px 18px",borderRadius:"8px",background:"#101b33",color:"#fff",textDecoration:"none",fontWeight:800}}>Sign Up For Ride Texts</Link>
          <p className="fine-print">Opting in happens on the sign-in page (choose Mobile Phone and tick the box) or later under Notifications. After opting in you receive one welcome text: {SMS_WELCOME_TEXT}</p>
        </div>

        <h2>What Users Are Consenting To</h2>
        <ul>
          <li>Ride request and driver-offer notifications.</li>
          <li>Ride confirmations, changes, cancellations, and reminders.</li>
          <li>Pickup and drop-off status messages.</li>
          <li>Driver alerts and other ride-coordination notifications.</li>
        </ul>

        <h2>Sign-In Codes Are Separate</h2>
        <p>Requesting a one-time sign-in code by text is its own choice and does not sign you up for ride texts. Codes can also be sent by email, and passkeys need no code at all.</p>

        <h2>Opt Out and Help</h2>
        <p>Reply <strong>STOP</strong> to opt out of SMS messages. Reply <strong>HELP</strong> for assistance. Message frequency varies. Message and data rates may apply.</p>

        <h2>Mobile Information Privacy</h2>
        <p><strong>BandWagon does not sell, rent, or share mobile phone numbers or SMS consent information with third parties or affiliates for marketing or promotional purposes.</strong></p>

        <p>Review the <Link href="/privacy">Privacy Policy</Link>, <Link href="/terms">Terms of Use</Link>, and <Link href="/messaging">Messaging &amp; SMS Consent</Link> page for more information.</p>

        <div className="legal-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Use</Link>
          <Link href="/messaging">Messaging</Link>
          <Link href="/">BandWagon Home</Link>
        </div>
      </article>
    </main>
  );
}
