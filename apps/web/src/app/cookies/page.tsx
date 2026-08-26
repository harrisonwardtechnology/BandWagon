import Link from "next/link";

export const metadata = {
  title: "Cookie Policy | BandWagon",
  description: "Explicit details about BandWagon cookies, browser storage, security technology, and privacy choices."
};

export default function CookiePolicyPage() {
  return <main className="shell legal-shell">
    <header className="legal-header">
      <Link className="brand-link" href="/">BandWagon</Link>
      <div className="eyebrow">A Harrison Ward Technology product</div>
      <h1>Cookie and Similar Technologies Policy</h1>
      <p>Effective August 26, 2026</p>
    </header>

    <section className="notice"><strong>Plain-language summary:</strong> BandWagon uses essential cookies for sign-in, security, and remembering your privacy choice. Optional functional storage is off until you allow it. BandWagon does not currently use advertising cookies, cross-site tracking, session replay, or behavioral analytics.</section>

    <article className="legal-card">
      <h2>1. Scope</h2>
      <p>This policy explains how BandWagon, operated by Harrison Ward Technology, uses cookies, browser storage, service workers, device permissions, and similar technologies. It supplements the <Link href="/privacy">Privacy Policy</Link>.</p>

      <h2>2. Your Controls</h2>
      <p>On first visit, BandWagon offers three equally available choices: accept optional functional storage, reject optional storage, or manage preferences. Essential technology remains active because the requested service cannot be securely provided without it. Rejecting optional storage does not prevent sign-in, form submission, or core ride coordination.</p>
      <p>Your preference is stored for 12 months in this browser. You may change it at any time through <strong>Cookie preferences</strong> in the site footer. Clearing browser data removes the saved choice and BandWagon will ask again. A material change in categories, purposes, or providers will also trigger a new choice.</p>

      <h2>3. First-Party Cookies</h2>
      <div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Name</th><th>Category and purpose</th><th>Typical duration</th></tr></thead><tbody>
        <tr><td><code>bw_session</code></td><td><strong>Essential.</strong> Authenticates the signed-in user, protects the account, and authorizes requested application functions. It is configured as HttpOnly, Secure in production, and SameSite=Lax.</td><td>Configured from 1–90 days; normally 30 days, subject to server-side idle expiration and revocation.</td></tr>
        <tr><td><code>bw_support</code></td><td><strong>Essential.</strong> Protects temporary, explicitly authorized administrator support-mode sessions. It is configured as HttpOnly, Secure in production, and SameSite=Strict.</td><td>5–60 minutes; normally 30 minutes.</td></tr>
        <tr><td><code>bw_privacy_preferences</code></td><td><strong>Essential.</strong> Records the policy version, timestamp, and whether this browser allowed optional functional storage so BandWagon can honor the choice.</td><td>12 months.</td></tr>
      </tbody></table></div>

      <h2>4. Cloudflare Turnstile</h2>
      <p>Public forms use Cloudflare Turnstile to distinguish legitimate users from automated abuse. It may process security signals such as IP address, browser/device characteristics, challenge results, and short-lived identifiers. BandWagon treats this as essential security technology and does not use it for advertising. Form entries are sent to BandWagon only when the user submits the form.</p>
      <p>If Cloudflare pre-clearance is enabled for a protected hostname, Cloudflare may issue a security cookie such as <code>cf_clearance</code>. That cookie is limited to bot and access-control protection. See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare's Privacy Policy<span className="sr-only"> (opens in a new tab)</span></a>.</p>

      <h2>5. Optional PWA Storage</h2>
      <p>When functional storage is allowed, BandWagon registers a service worker and caches only the public offline page, web app manifest, and application icons. It does not intentionally cache authenticated pages, ride details, addresses, messages, form entries, or API responses. Rejecting optional storage prevents automatic registration and removes unused BandWagon offline caches where the browser permits.</p>

      <h2>6. Push Notifications</h2>
      <p>Push notifications are separate from cookie consent. BandWagon requests browser notification permission only after a user selects the enable action. If enabled, the browser creates a device subscription containing an endpoint and encryption keys. The user may disable push in BandWagon and in browser/device settings. A service worker may remain active when necessary to honor an existing push subscription requested by the user.</p>

      <h2>7. Hosted Payments and Connected Services</h2>
      <p>Support payments redirect to Stripe-hosted Checkout. Stripe controls technology used on its own domain under its privacy and cookie disclosures. Google and Microsoft calendar connections use explicit authorization; OAuth credentials are protected server-side and are not stored as BandWagon browser cookies.</p>

      <h2>8. No Analytics or Advertising Tracking</h2>
      <p>BandWagon does not currently use Google Analytics, Meta Pixel, behavioral advertising, cross-site profiling, heatmaps, session replay, or similar browser tracking. Server-side operational counts and security logs are used to operate and protect the platform, not to follow users across unrelated services.</p>
      <p>BandWagon will not add optional analytics or advertising technology under an existing functional-storage choice. A future addition requires an updated disclosure, a new policy version, prior consent where required, and an equally accessible rejection option.</p>

      <h2>9. Browser Controls and Global Privacy Signals</h2>
      <p>Users may also block or delete cookies and site data through browser settings. Because BandWagon does not sell personal information or use data for targeted advertising, there is no sale or targeted-advertising processing to opt out of. BandWagon treats supported Global Privacy Control signals as an instruction not to enable any future sale, sharing, or targeted-advertising processing for that browser.</p>

      <h2>10. Contact</h2>
      <p>Questions or requests about cookies and browser storage may be submitted through the <Link href="/help">Help Center</Link> using the Privacy Request topic or by email to <a href="mailto:help+privacy@harrisonward.com">help+privacy@harrisonward.com</a>.</p>

      <div className="legal-links"><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms of Use</Link><Link href="/help">Privacy Request</Link><Link href="/">BandWagon Home</Link></div>
    </article>
  </main>;
}
