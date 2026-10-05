import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { productJsonLd } from "@/lib/json-ld";
import { siteOrigin } from "@/lib/seo";

// Public "For Organizations" front door shown on the platform host.
// Tenant hosts keep their own community homepage (see page.tsx).
// Keep every claim here matched to shipped features (README feature table,
// docs/ORGANIZATION-REVIEW-GUIDE.md, docs/LOCATION-PRIVACY.md).

export const DEMO_URL = "https://demo.bandwagon.club/";

const audiences = [
  ["School bands and marching bands", "Rides to rehearsals, football games, competitions, and concerts, planned around your band calendar."],
  ["Sports teams", "Practices, home and away games, and tournaments for school and youth sports teams."],
  ["Clubs and activities", "Theatre, robotics, debate, choir, and other school clubs with events after hours or off campus."],
  ["Scouting and faith groups", "Troop meetings, campouts, youth group events, and service projects."],
] as const;

const steps = [
  ["Request a community", "Tell us about your group and who will run it. We set up a private BandWagon space with its own web address."],
  ["Set your rules", "Choose driver requirements, turn optional features on or off, and add your events by hand or sync them from a Google or Microsoft calendar."],
  ["Families plan rides", "Invite your families. Parents add their household, then request or offer seats for your events."],
  ["Confirm and pick up", "Families review and accept each match. Reminders go out, and an optional pickup handshake confirms the right child got in the right car."],
] as const;

const safety = [
  ["Guardian control", "Parents manage student profiles and can require their approval before a student requests a ride. Student sign-in is off unless the organization and a guardian both allow it."],
  ["Driver requirements you set", "Each organization picks its own rules: minimum age, license, insurance, district volunteer approval, and manual admin approval. Offers from drivers who do not qualify are blocked."],
  ["Private credential review", "Drivers upload documents to private storage. Only authorized admins can view them, and every view is logged. Expired credentials can suspend a driver automatically."],
  ["Verified pickup", "A one-time pickup handshake lets the driver and family confirm the handoff before the ride is marked picked up."],
  ["Emergency Assist", "During an active ride, one tap calls 911 and a help alert can reach the family's safety contacts. BandWagon is not emergency dispatch."],
  ["Addresses stay hidden", "Before a match, others see only a general area. The exact address is shown only to the matched driver for a confirmed ride, and each view is recorded."],
] as const;

const privacy = [
  "We never sell personal information.",
  "No ads, no ad trackers, and no behavioral analytics.",
  "No live GPS tracking of people or cars.",
  "No school roster, student ID, grades, or school records needed.",
  "Profile phone numbers, exact addresses, and driver credentials are encrypted at rest.",
  "Each community's data is kept separate from every other community.",
  "Families can export or delete their data from their settings.",
  "Sponsors and donors never get participant data.",
] as const;

export const faqs = [
  ["Is this school transportation?", "No. BandWagon is a private tool that helps families who already know each other coordinate their own carpools. It does not provide rides, employ or dispatch drivers, or replace school buses. Schools and programs do not have to be part of the ride arrangement."],
  ["Is BandWagon a rideshare company?", "No. There are no paid drivers and no payment for rides. Volunteer adults offer open seats to families in their own community, and families decide whether to accept."],
  ["What does it cost?", "Nothing. BandWagon is free for organizations and families. Optional donations from families and support from local sponsors help cover running costs. Giving never changes access, matching, or safety decisions."],
  ["What data do sponsors get?", "None. Sponsors get a thank-you acknowledgment that adults can see. They get no names, contact details, ride information, or reports about participants."],
  ["Do students need accounts?", "No. A parent can add a student to their household and handle everything. If your organization turns on student sign-in, a parent must still set it up and give consent, and can turn it off at any time."],
  ["How are drivers checked?", "Your organization decides. You can require a license, insurance, district volunteer approval, a minimum age, and admin approval. Drivers upload documents privately and your admins review them. BandWagon records your decision. It does not run background checks or certify drivers itself."],
  ["Who can see a family's address?", "Only the people who need it. Others see a general area until a ride is confirmed. Then the matched driver can see the exact pickup or drop-off location."],
  ["Does BandWagon track where kids are?", "No. There is no continuous location tracking. A person can choose to share their location only when they use Emergency Assist."],
  ["Does it use AI?", "Only if your organization turns it on. AI can help turn event details into calendar entries or read driver documents, but a person always makes the decision. Matching, eligibility, and safety rules do not use AI."],
  ["What if we stop using BandWagon?", "An organization can close its community. Open requests are cancelled, the web address is turned off, and after a confirmation step and a holding period (30 days by default) the community's data is deleted. Families who also belong to other BandWagon communities keep their accounts."],
] as const;

const card = { padding: 24, border: "1px solid var(--line-2)", borderRadius: 20, background: "var(--surface)", boxShadow: "0 12px 36px rgba(7,26,51,.055)" } as const;
const grid = (min: number) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 16 }) as const;

export default function ProductHome() {
  return (
    <main className="home-shell">
      <JsonLd data={productJsonLd(siteOrigin())} />
      <section className="home-hero" aria-labelledby="home-heading">
        <div className="hero-copy">
          <div className="hero-kicker"><span aria-hidden="true">●</span> For Bands, Teams, Troops, And Other Trusted Groups</div>
          <div className="eyebrow">BandWagon For Organizations</div>
          <h1 id="home-heading">Free, private carpools for bands, teams, and school groups.</h1>
          <p className="hero-lede">
            BandWagon is a free carpool app for community groups. It helps families in your group share rides to rehearsals, games, and events. No public addresses. No live tracking. No messy group texts.
            Free for organizations and families.
          </p>
          <div className="actions">
            <Link className="button" href="/start">Start A Community <ArrowRight className="icon" aria-hidden="true" /></Link>
            <a className="button ghost" href={DEMO_URL} target="_blank" rel="noreferrer">Try The Demo<span className="sr-only"> (opens in a new tab)</span></a>
            <Link className="button ghost" href="/login">Sign In</Link>
          </div>
          <div className="hero-trust" aria-label="Platform commitments">
            <span>Free To Use</span><span>Guardian Controlled</span><span>Never Sells Data</span>
          </div>
        </div>

        <div className="ride-preview" aria-label="Example BandWagon ride workflow">
          <div className="preview-topline"><span>Saturday Rehearsal</span><span className="status-pill">Ride Matched</span></div>
          <div className="route-line" aria-hidden="true"><span></span><i></i><span></span><i></i><span></span></div>
          <ol className="ride-steps">
            <li><span className="step-icon">1</span><div><strong>Request Made</strong><small>General Area Shared</small></div><time>8:10 AM</time></li>
            <li><span className="step-icon">2</span><div><strong>Eligible Driver Matched</strong><small>Guardian Approved</small></div><time>8:22 AM</time></li>
            <li><span className="step-icon verified"><Check className="icon" aria-hidden="true" /></span><div><strong>Pickup Verified</strong><small>Exact Details Stay Private</small></div><time>9:00 AM</time></li>
          </ol>
          <div className="privacy-chip"><span aria-hidden="true"><ShieldCheck className="icon" aria-hidden="true" /></span><div><strong>Privacy By Design</strong><small>No Passive Location Tracking</small></div></div>
        </div>
      </section>

      <section className="independence-notice" aria-label="What BandWagon is not">
        <span className="notice-icon" aria-hidden="true">i</span>
        <div>
          <strong>Carpool coordination, not transportation.</strong> BandWagon is not a rideshare company, a taxi service, or school transportation.
          It helps people who already belong to your group arrange rides with each other. It does not provide, supervise, track, or guarantee rides.
        </div>
      </section>

      <section className="feature-section" aria-labelledby="audience-heading">
        <div className="section-heading">
          <div className="eyebrow">Who It Is For</div>
          <h2 id="audience-heading">Built for groups whose families already know each other.</h2>
          <p>
            BandWagon is a carpool organizer for parents and volunteer drivers in the same group. A band director, booster club, coach, troop leader,
            or parent volunteer starts a private community, and families in that group use it to find and offer seats.
          </p>
        </div>
        <ul style={{ ...grid(220), listStyle: "none", padding: 0, margin: 0 }}>
          {audiences.map(([title, body]) => (
            <li key={title} style={card}>
              <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>{title}</h3>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="feature-section" aria-labelledby="how-heading">
        <div className="section-heading">
          <div className="eyebrow">How It Works</div>
          <h2 id="how-heading">Up and running in four steps.</h2>
          <p>You stay in charge of who joins and who can drive. Families stay in charge of every ride.</p>
        </div>
        <ol style={{ ...grid(230), listStyle: "none", padding: 0, margin: 0 }}>
          {steps.map(([title, body], index) => (
            <li key={title} style={card}>
              <span className="feature-number">STEP {index + 1}</span>
              <h3 style={{ margin: "14px 0 8px", fontSize: 21 }}>{title}</h3>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="feature-section" aria-labelledby="safety-heading">
        <div className="section-heading">
          <div className="eyebrow">Safety Built In</div>
          <h2 id="safety-heading">Safety features that are in the product today.</h2>
          <p>These are working features, not plans. Your organization sets the rules. BandWagon enforces them.</p>
        </div>
        <div style={grid(280)}>
          {safety.map(([title, body]) => (
            <article key={title} style={card}>
              <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>{title}</h3>
              <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="feature-section" aria-labelledby="privacy-heading">
        <div style={{ ...grid(300), alignItems: "start" }}>
          <div className="section-heading" style={{ marginBottom: 0 }}>
            <div className="eyebrow">Privacy Promises</div>
            <h2 id="privacy-heading">Your families' information stays theirs.</h2>
            <p>
              Read the <Link href="/privacy">Privacy Policy</Link>, the <Link href="/legal/student-data">student data statement</Link>, and the{" "}
              <Link href="/legal/subprocessors">list of service providers</Link>.
            </p>
          </div>
          <ul style={{ ...card, margin: 0, paddingLeft: 44, color: "var(--text)", lineHeight: 1.9, fontWeight: 650 }}>
            {privacy.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </section>

      <section className="feature-section" aria-labelledby="cost-heading">
        <div style={{ ...card, background: "var(--bg-cream)", borderColor: "var(--line-warn)" }}>
          <div className="eyebrow">Cost</div>
          <h2 id="cost-heading" style={{ margin: "8px 0 10px", fontSize: 30, color: "var(--text)" }}>Free for organizations and families.</h2>
          <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.65, maxWidth: 820 }}>
            There is no fee to start a community or to use it. BandWagon is supported by optional donations and by local sponsors.
            Giving is never required, never changes who gets a ride, and never buys access to anyone's data.{" "}
            <Link href="/support">Support BandWagon</Link>.
          </p>
        </div>
      </section>

      <section className="feature-section" aria-labelledby="faq-heading">
        <div className="section-heading">
          <div className="eyebrow">Questions</div>
          <h2 id="faq-heading">Frequently Asked Questions</h2>
          <p>Reviewing BandWagon for a board or school? Download the <a href="/api/review-package">organization review package</a>.</p>
        </div>
        <div style={{ ...card, padding: "6px 24px" }}>
          {faqs.map(([question, answer], index) => (
            <details key={question} style={{ borderTop: index ? "1px solid var(--line-2)" : "none", padding: "16px 0" }}>
              <summary style={{ cursor: "pointer", fontWeight: 850, fontSize: 18, color: "var(--text)" }}>{question}</summary>
              <p style={{ margin: "10px 0 0", color: "var(--text-muted)", lineHeight: 1.65 }}>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="community-banner">
        <div>
          <div className="eyebrow">Ready When Your Community Is</div>
          <h2>Bring your group on board.</h2>
          <p>Start a free community, try the demo with fake data, or read the review package and legal documents first.</p>
        </div>
        <div className="actions">
          <Link className="button light" href="/start">Start A Community</Link>
          <a className="button outline-light" href={DEMO_URL} target="_blank" rel="noreferrer">Demo<span className="sr-only"> (opens in a new tab)</span></a>
          <a className="button outline-light" href="/api/review-package">Review Package</a>
          <Link className="button outline-light" href="/legal">Legal</Link>
        </div>
      </section>
    </main>
  );
}
