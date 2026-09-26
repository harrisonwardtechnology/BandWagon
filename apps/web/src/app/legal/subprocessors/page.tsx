import type { Metadata } from "next";
import Link from "next/link";
import { LegalDraftBanner } from "@/components/legal-draft-banner";
import { SupportContact } from "@/components/support-contact";
import { SUBPROCESSOR_LIST_VERSION } from "@/lib/legal-versions";

export const metadata: Metadata = {
  title: "Subprocessors (Draft)",
  description: "The outside services that help run BandWagon, what data each one receives, and when it is used.",
  alternates: { canonical: "/legal/subprocessors" },
};

type Vendor = { name: string; purpose: string; data: string; when: string; always: boolean };

// Keep in sync with the providers the code actually calls. Search src/lib for
// provider hostnames (api.twilio.com, api.smtp2go.com, googleapis.com,
// graph.microsoft.com, api.stripe.com, api.cloudflare.com, app.dodomain.io,
// LITELLM_BASE_URL) before publishing a new version.
const vendors: Vendor[] = [
  {
    name: "IONOS",
    purpose: "Cloud servers that run BandWagon, its database, and its cache. S3-compatible private object storage for driver documents and other uploaded files.",
    data: "All service data, including account, household, event, and ride records. Sensitive fields such as phone numbers, exact addresses, and credentials are encrypted before storage. Uploaded driver documents.",
    when: "Always.",
    always: true,
  },
  {
    name: "Cloudflare",
    purpose: "DNS, network security, and Turnstile bot protection on sign-in and contact forms. Custom hostname certificates when a community uses its own domain.",
    data: "IP address, browser and request details, and bot-check signals. Community hostnames.",
    when: "Always for DNS, security, and Turnstile. Custom hostnames only if the organization adds its own domain.",
    always: true,
  },
  {
    name: "SMTP2GO",
    purpose: "Sends email, such as sign-in codes, ride notices, and account and privacy notices.",
    data: "Email address, message subject and text, and delivery status.",
    when: "Always. A verified email is required for an account.",
    always: true,
  },
  {
    name: "Twilio",
    purpose: "Sends text messages (SMS and RCS) and handles STOP and HELP replies.",
    data: "Mobile number, message text, and delivery status.",
    when: "Only if a person adds a mobile number, for sign-in codes they request or text notices they opt in to. Ride text notices also require the organization to turn on text messaging.",
    always: false,
  },
  {
    name: "Web push services (Apple, Google, Microsoft, Mozilla)",
    purpose: "Delivers browser and installed-app notifications through the push service built into each browser.",
    data: "A push subscription address for the device and an encrypted notification. The push service cannot read the message.",
    when: "Only if a person turns on notifications on a device.",
    always: false,
  },
  {
    name: "Google Maps Platform (Geocoding and Routes)",
    purpose: "Turns an entered address into a general area and map coordinates. Suggests rides that fit a driver's route when RouteAssist is on.",
    data: "Addresses or coordinates for pickup, drop-off, and event locations. No names or contact details are sent.",
    when: "When the platform has mapping configured and someone enters an address. Route suggestions only if the organization turns on RouteAssist.",
    always: false,
  },
  {
    name: "Google Calendar",
    purpose: "Reads events from a calendar an admin chooses to connect.",
    data: "The connected Google account identifier, the selected calendars, and event details. Access tokens are encrypted.",
    when: "Only if an organization admin connects a Google calendar.",
    always: false,
  },
  {
    name: "Microsoft Graph (Microsoft 365 calendars)",
    purpose: "Reads events from a Microsoft calendar an admin chooses to connect.",
    data: "The connected Microsoft account identifier, the selected calendars, and event details. Access tokens are encrypted.",
    when: "Only if an organization admin connects a Microsoft calendar.",
    always: false,
  },
  {
    name: "Google Document AI",
    purpose: "Reads fields from a driver's license image to help an admin review it. A person always makes the approval decision.",
    data: "The uploaded driver's license image and the fields read from it.",
    when: "Only if the organization turns on AI document review.",
    always: false,
  },
  {
    name: "Configured AI model providers (currently OpenAI), through our self-hosted LiteLLM gateway",
    purpose: "Optional help with admin tasks, such as turning event details into calendar entries or reading an insurance card image for review.",
    data: "Only the text or image needed for the task the organization turned on.",
    when: "Only if the organization turns on the specific AI feature. Matching, eligibility, and safety rules never use AI.",
    always: false,
  },
  {
    name: "Stripe",
    purpose: "Processes optional donations and sponsor payments on a Stripe-hosted checkout page.",
    data: "Payment amount and status, and what the payer enters on the Stripe page. Card details go to Stripe and are never stored by BandWagon.",
    when: "Only if someone chooses to give.",
    always: false,
  },
  {
    name: "DoDomain",
    purpose: "Guided DNS setup when an organization connects its own domain.",
    data: "The domain name and the DNS records needed to connect it. No member data.",
    when: "Only if an organization uses automatic custom domain setup.",
    always: false,
  },
];

export default function SubprocessorsPage() {
  return (
    <main className="shell legal-shell">
      <header className="legal-header">
        <Link className="brand-link" href="/">BandWagon</Link>
        <div className="eyebrow">A Harrison Ward Technology product</div>
        <h1>Subprocessors</h1>
        <p>Version {SUBPROCESSOR_LIST_VERSION}</p>
      </header>

      <LegalDraftBanner />

      <article className="legal-card">
        <h2>What this page covers</h2>
        <p>
          Harrison Ward Technology runs BandWagon. We use a small number of outside services to host it and deliver messages. Each service gets only the data it needs for its job.
          Several services are used only if an organization or a person turns on the related feature. We do not sell personal information, and sponsors get no participant data.
        </p>
        <p>
          Some tools we run ourselves on our own servers, so no outside company receives data through them. These include our deployment platform (Coolify), our status monitoring (Uptime Kuma),
          our error monitoring, and our AI gateway (LiteLLM).
        </p>

        <h2>Current list</h2>
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr><th scope="col">Service</th><th scope="col">Purpose</th><th scope="col">Data it receives</th><th scope="col">When it is used</th></tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.name}>
                  <th scope="row" style={{ background: "#fff" }}>{vendor.name}<div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: vendor.always ? "#1d4ed8" : "#15803d" }}>{vendor.always ? "Always used" : "Only if enabled"}</div></th>
                  <td>{vendor.purpose}</td>
                  <td>{vendor.data}</td>
                  <td>{vendor.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Where data is processed</h2>
        <p>
          BandWagon is operated from the United States and uses United States production hosting. Some providers may process data in other countries to deliver their service, as described in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>Changes to this list</h2>
        <p>
          When we add a provider that receives member data, we will update this page with a new version number before the provider is used. Organizations that have accepted the{" "}
          <Link href="/legal/organization-agreement">Organization Agreement</Link> will be told about material changes.
        </p>

        <h2>Questions</h2>
        <p>Contact <SupportContact />.</p>

        <div className="legal-links">
          <Link href="/legal">All Legal Documents</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/legal/student-data">Student Data</Link>
          <Link href="/legal/organization-agreement">Organization Agreement</Link>
        </div>
      </article>
    </main>
  );
}
