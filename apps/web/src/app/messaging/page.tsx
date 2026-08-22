import Link from "next/link";

export const metadata = {
  title: "Messaging & SMS Consent | BandWagon",
  description: "How BandWagon users opt in, opt out, and manage SMS and RCS messaging."
};

export default function MessagingPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>Messaging & SMS Consent</h1>
        <p>BandWagon transactional messaging program</p>
      </header>

      <section className="notice">
        <strong>SMS/RCS is optional.</strong> A user can maintain a BandWagon account using a verified email address without consenting to ride notifications by text message.
      </section>

      <article className="legal-card">
        <h2>How Users Opt In</h2>
        <p>During BandWagon account setup or later within notification settings, a user may voluntarily provide a mobile phone number. The number is verified using a one-time connection or verification flow. Mobile messaging is enabled only after the user makes a separate, affirmative choice to receive BandWagon SMS/RCS messages.</p>

        <div className="consent-example" aria-label="Example SMS consent control">
          <div className="eyebrow">Example consent shown to users</div>
          <label className="consent-row">
            <input type="checkbox" disabled />
            <span>I agree to receive transactional SMS/RCS messages from BandWagon, a Harrison Ward Technology product, about account verification, ride requests, ride offers, ride confirmations, schedule changes, reminders, pickup/drop-off status, and cancellations. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is optional and is not a condition of creating or using a BandWagon account.</span>
          </label>
          <p className="fine-print">The checkbox is shown unchecked by default in the actual registration/settings workflow. This public page documents the consent language; the production signup workflow will record the user's affirmative consent, timestamp, method, and policy version.</p>
        </div>

        <h2>Messages Users May Receive</h2>
        <ul>
          <li>Phone verification or one-time sign-in messages.</li>
          <li>Ride request and driver-offer notifications.</li>
          <li>Parent or household approval requests.</li>
          <li>Ride acceptance, changes, cancellation, and reopening notices.</li>
          <li>One-hour and optional advance ride reminders.</li>
          <li>"Still good?" ride-check prompts.</li>
          <li>On My Way, Picked Up, Dropped Off, and Confirm Arrival notifications.</li>
          <li>Responses to supported user-initiated commands or support requests.</li>
        </ul>

        <h2>Message Frequency</h2>
        <p>Message frequency varies based on the user's account activity, number of rides, notification preferences, and actions taken by other confirmed ride participants.</p>

        <h2>Charges</h2>
        <p>Message and data rates may apply according to the user's mobile carrier and plan.</p>

        <h2>Opt Out</h2>
        <p>Reply <strong>STOP</strong> to stop SMS/RCS messages. BandWagon may also recognize other standard carrier-supported opt-out keywords. Opting out stops mobile messaging but does not delete the user's BandWagon account. Users may continue to receive supported notifications by email.</p>

        <h2>Help</h2>
        <p>Reply <strong>HELP</strong> for assistance or use the BandWagon support/contact process.</p>

        <h2>Resubscribe</h2>
        <p>A user who previously opted out must complete a new affirmative opt-in process before BandWagon resumes non-exempt mobile messaging.</p>

        <h2>Mobile Information Privacy</h2>
        <p><strong>BandWagon does not sell, rent, or share mobile phone numbers or SMS/RCS consent information with third parties or affiliates for marketing or promotional purposes.</strong> Information may be provided to telecommunications carriers and messaging service providers only as necessary to deliver requested messages or operate and secure the service.</p>

        <h2>Sender Identity</h2>
        <p>BandWagon is a Harrison Ward Technology product. Organization-specific messages may identify the community service, such as FloMoGo, while also identifying BandWagon or Harrison Ward Technology as the platform/operator where appropriate.</p>

        <h2>Delivery</h2>
        <p>Wireless carriers are not liable for delayed or undelivered messages. BandWagon cannot guarantee that any specific email, SMS, RCS, or notification will be delivered on time.</p>

        <h2>Related Policies</h2>
        <p>See the <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Use</Link> for additional information.</p>

        <div className="legal-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Use</Link>
          <Link href="/">BandWagon Home</Link>
        </div>
      </article>
    </main>
  );
}
