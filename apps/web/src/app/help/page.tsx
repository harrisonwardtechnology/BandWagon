const reviewPackageUrl = "/documents/BandWagon_Organization_Proposal_and_Review_Package.docx";

const sections = [
  {
    title: "I Run a Community",
    items: [
      ["Start a Community", "Create your community, choose its name and short URL, assign at least one admin, then review the launch checklist. Your BandWagon hostname is created automatically."],
      ["Review and Approval", "Use the proposal and evidence package to document your organization’s own review. BandWagon does not replace your board, school, insurer, or other approval process."],
      ["Choose Features", "Optional modules can be enabled or disabled by each organization. Safety, privacy, tenant isolation, audit logging, and guardian protections remain mandatory."],
      ["Custom Domain", "Enter the domain you want to use. BandWagon prepares the Cloudflare custom-hostname request and tells you exactly which DNS record to add. After you add it, click Check Again and BandWagon verifies DNS and TLS before activation."],
      ["Members and Drivers", "Invite members, define driver requirements, review eligible drivers, and keep administrative access limited to people who need it."],
      ["Monitoring and Status", "Each community is registered for monitoring automatically. New communities stay pending until their hostname is healthy so they are not published as down during setup."],
    ],
  },
  {
    title: "I Am a Parent or Guardian",
    items: [
      ["Create Your Household", "Add yourself first, then add students or other household members you manage. Student participation stays under guardian control."],
      ["Request a Ride", "Choose the event, passenger, direction, and pickup and drop-off information. Exact addresses stay private until they are needed for a confirmed ride."],
      ["Review an Offer", "You choose whether to accept a driver offer. BandWagon does not dispatch drivers or guarantee transportation."],
      ["Privacy Controls", "Phone and email can remain hidden while still being used for account verification and notifications. You can request access, correction, export, or deletion of your information."],
    ],
  },
  {
    title: "I Am a Driver",
    items: [
      ["Become a Driver", "Enable your driver profile for the organization, provide the required organization-specific information, and wait for any required approval."],
      ["RouteAssist", "Optional RouteAssist can suggest open requests that fit your route and detour limits. It never automatically accepts a ride for you."],
      ["Offer a Ride", "Choose an open request, offer available seats, and confirm the plan with the parent or guardian."],
      ["Pickup Verification", "When enabled or required, use the one-time pickup handshake before marking the passenger picked up."],
    ],
  },
  {
    title: "I Need Help",
    items: [
      ["Check Platform Status", "If something appears unavailable, check the BandWagon public status page first."],
      ["Contact Your Organization", "For membership, driver approval, event, or organization-policy questions, start with your organization administrator."],
      ["Platform Support", "For account, technical, privacy, or platform issues, contact BandWagon support. Support staff may use time-limited, audited ViewAs mode to see your screen without asking for your password."],
      ["Report a Security Issue", "Use the Security and Responsible Disclosure page for security, privacy, or safety vulnerabilities. Sensitive evidence should be sent through secret.harrisonward.com and only the secure reference should be included in the report."],
      ["Emergency or Safety Issue", "BandWagon is not emergency dispatch. For an emergency, contact 911 or the appropriate emergency service, then follow your organization’s safety escalation process."],
    ],
  },
];

const review = [
  ["Is the proposal an approval?", "No. It is a reusable proposal and evidence package. Each participating organization keeps its own approval authority and attaches its official decision and conditions."],
  ["Is BandWagon required?", "No. Participation is voluntary and parent initiated."],
  ["Is the core platform free?", "Yes. The core platform is provided without a participation fee. Optional adult-user contributions, organization support, grants, in-kind services, and approved sponsors may support operating costs."],
  ["Do sponsors get participant data?", "No. Funding does not buy data access, ride visibility, matching priority, safety influence, or organization authority."],
  ["Does BandWagon use school records?", "Not by default. The platform is designed so a community can operate without school rosters, student IDs, grades, attendance, district passwords, or official transportation records."],
  ["Which ThirdParty services can receive data?", "Core hosting, edge-security, and email providers process the data needed to operate the service. Twilio, Google Maps, Google Calendar, Microsoft Graph, Web Push, payment, and AI providers receive feature-specific data only when the related organization control and any required user authorization are enabled. The proposal lists why each provider is used and what it can process."],
  ["Is AI required?", "No. Core authorization, eligibility, matching, and safety boundaries are deterministic. AI is optional and organization controlled."],
  ["Does BandWagon certify drivers?", "No. Each organization defines any required volunteer, background, license, or insurance process. BandWagon records the organization’s approved status."],
];

export default function HelpPage() {
  const card = { background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18 } as const;
  return (
    <main style={{ maxWidth: 1120, margin: "32px auto", padding: "0 20px", fontFamily: "system-ui,sans-serif", background: "#f8fafc" }}>
      <header style={{ background: "#101b33", color: "white", padding: 30, borderRadius: 22, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1 }}>BANDWAGON HELP CENTER</div>
        <h1 style={{ fontSize: 40, margin: "6px 0" }}>What are you trying to do?</h1>
        <p style={{ margin: 0, opacity: 0.9 }}>Plain-language guides for community admins, families, and drivers.</p>
      </header>

      <section style={{ ...card, marginBottom: 22, background: "#eff6ff", borderColor: "#93c5fd" }} aria-labelledby="review-package-title">
        <div style={{ fontSize: 12, fontWeight: 900, color: "#1d4ed8", letterSpacing: 0.8 }}>ORGANIZATION REVIEW PACKAGE</div>
        <h2 id="review-package-title" style={{ margin: "6px 0 8px", color: "#101b33" }}>Review the full proposal before making a decision.</h2>
        <p style={{ color: "#475569", lineHeight: 1.6, maxWidth: 850 }}>
          The package covers governance, privacy, data flows, ThirdParty services, security, AI, transportation boundaries, consent, and reusable review worksheets. It is proposal material - not an approval or launch authorization. Each organization must complete its own review and attach its official decision.
        </p>
        <a href={reviewPackageUrl} download style={{ display: "inline-block", padding: "12px 16px", borderRadius: 10, background: "#2458d8", color: "white", textDecoration: "none", fontWeight: 900 }}>
          Download the Organization Proposal (.docx)
        </a>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14, marginBottom: 22 }}>
        {sections.map((section) => (
          <div key={section.title} style={card}>
            <h2 style={{ marginTop: 0 }}>{section.title}</h2>
            {section.items.map(([title, body]) => (
              <details key={title} style={{ borderTop: "1px solid #e2e8f0", padding: "11px 0" }}>
                <summary style={{ cursor: "pointer", fontWeight: 850 }}>{title}</summary>
                <p style={{ color: "#475569", lineHeight: 1.55, marginBottom: 0 }}>{body}</p>
                {title === "Review and Approval" && <p><a href={reviewPackageUrl} download><strong>Download the proposal and evidence package</strong></a></p>}
                {title === "Report a Security Issue" && <p><a href="/security"><strong>Open Security Reporting</strong></a></p>}
              </details>
            ))}
          </div>
        ))}
      </section>

      <section style={{ ...card, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>For Organizations Reviewing BandWagon</h2>
        <p style={{ color: "#64748b" }}>These are baseline answers from the BandWagon proposal and evidence package. Your organization keeps its own approval authority and should document any local conditions separately.</p>
        {review.map(([question, answer]) => (
          <div key={question} style={{ padding: "11px 0", borderTop: "1px solid #e2e8f0" }}>
            <strong>{question}</strong>
            <div style={{ color: "#475569", marginTop: 4 }}>{answer}</div>
          </div>
        ))}
      </section>

      <section style={{ ...card, background: "#eff6ff", borderColor: "#bfdbfe" }}>
        <h2 style={{ marginTop: 0 }}>Still stuck?</h2>
        <p>Use your organization admin for organization-specific questions. Use BandWagon Support for account, privacy, or technical problems. Never send passwords, one-time codes, full payment-card details, or sensitive documents in a support message. For sensitive security evidence, use <a href="https://secret.harrisonward.com" target="_blank" rel="noreferrer"><strong>secret.harrisonward.com</strong></a>.</p>
      </section>
    </main>
  );
}
