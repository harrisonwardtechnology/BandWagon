import Link from "next/link";

export const metadata = {
  title: "SMS Opt-In | BandWagon",
  description: "Public example of the BandWagon SMS consent experience."
};

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

          <label className="consent-row">
            <input type="checkbox" />
            <span>I agree to receive transactional SMS messages from BandWagon, a Harrison Ward Technology product, about ride requests, ride offers, confirmations, schedule changes, reminders, account activity, pickup/drop-off status, cancellations, and ride coordination. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.</span>
          </label>

          <p className="fine-print">SMS consent is optional and is not required to create or use a BandWagon account. The checkbox above is intentionally unchecked by default.</p>

          <button type="button" disabled style={{marginTop:"8px",padding:"11px 18px",borderRadius:"8px",border:"1px solid #cbd5e1",cursor:"not-allowed"}}>Save Preferences</button>
          <p className="fine-print">This public page demonstrates the consent language and presentation. The button is disabled because this page does not enroll a visitor in messaging.</p>
        </div>

        <h2>What Users Are Consenting To</h2>
        <ul>
          <li>Ride request and driver-offer notifications.</li>
          <li>Ride confirmations, changes, cancellations, and reminders.</li>
          <li>Pickup and drop-off status messages.</li>
          <li>Account and ride-coordination notifications.</li>
        </ul>

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
