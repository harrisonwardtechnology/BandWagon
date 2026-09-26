# BandWagon: Insurance and Legal Brief

**Not legal or insurance advice.** This is a plain summary prepared by Harrison Ward Technology, LLC to start conversations with an insurance broker and a lawyer. It describes how the product works so they can advise on coverage and legal structure.

Prepared: September 2026 · Company: Harrison Ward Technology, LLC (HWTech), Flower Mound, Texas · Product: BandWagon · First community: FloMoGo (Flower Mound band families)

## 1. What BandWagon is

BandWagon is web software (an installable web app) that helps members of a trusted group, such as a school band's families, coordinate their own carpools to rehearsals, games, and events. Families request seats, volunteer adult drivers offer seats, BandWagon suggests matches, and families confirm. It sends reminders and offers a pickup confirmation step.

It is free for organizations and families. It is supported by optional donations and local sponsors. Sponsors receive no participant data.

## 2. What BandWagon does not do

- It does not provide rides, own or operate vehicles, or employ, hire, pay, dispatch, or supervise drivers.
- **No one pays for a ride.** There is no fare, tip, reimbursement, or payment between riders and drivers, and BandWagon takes no cut. Donations go to HWTech for operating costs and do not change who gets a ride.
- It does not run background checks or certify drivers. Each organization sets its own driver rules (minimum age, license, insurance, district volunteer approval, admin approval) and makes its own approval decisions. BandWagon records that decision and blocks drivers who do not meet it.
- It is not school transportation and does not require the school to take part.
- It does not track people or vehicles live. It is not emergency dispatch.

## 3. Who uses it

| User | Role |
|---|---|
| Organization admins | Volunteer leaders (for example, booster officers) who run a community, set driver rules, and approve drivers. |
| Parents and guardians | Adults who manage a household, add students, and request, offer, or approve rides. |
| Students (minors) | Riders. Managed by a guardian. Students do not need their own account. Optional student sign-in requires the organization to allow it and a guardian to set it up and consent. Children under 13 cannot create their own account. |
| Volunteer drivers | Adults, usually other parents, who choose to offer open seats in their own vehicles. |
| HWTech | Builds, hosts, secures, and supports the platform. |

## 4. Data BandWagon holds

- Names, verified email, optional mobile number, birth month and year (not full date of birth), household and guardian relationships.
- Event details, ride requests and offers, matches, and ride history.
- Pickup and drop-off addresses. Exact addresses are encrypted and shown only to the matched driver for a confirmed ride. Deleted after 30 days by default once a ride is over.
- Driver credential documents (license, insurance, volunteer approval), stored encrypted in private storage and viewable only by authorized admins. Views are logged.
- Message and consent records (SMS opt-in and STOP), audit logs, and security logs.
- Payment records for donations. Card details are handled by Stripe and never stored by BandWagon.
- **Not collected:** school rosters, student IDs, grades, health or disability records, live GPS location.

Service providers are listed at `/legal/subprocessors` in the app (IONOS hosting and storage, Cloudflare, SMTP2GO, Twilio, Google Maps and Calendar, Microsoft Graph, Stripe, optional AI providers).

## 5. Where the risk sits

| Risk | Example | Notes |
|---|---|---|
| Volunteer driver accident | A volunteer parent has a crash with another family's child in the car. | The biggest real-world risk. Injured parties may name the driver, the organization, the school, and HWTech. The driver's personal auto policy is normally primary. |
| Platform negligence claim | A claim that BandWagon matched a child with a driver who should have been blocked, or a reminder failed. | Tied to software errors, driver-eligibility features, and what our marketing promises. |
| Data breach | Unauthorized access to addresses, phone numbers, or driver documents. | Includes minors' information, which raises notice duties and reputational harm. |
| Minors' data and consent | A student account created without a guardian, or a school says student data was mishandled. | Guardian control is built in, but the process and wording need legal review. |
| Messaging compliance | Texts sent without proper consent. | TCPA exposure. BandWagon records opt-in and honors STOP, and staging is sandboxed. |
| Misclassification | A regulator views BandWagon as a transportation network company. | See lawyer question 3. The no-payment design is the main defense. |

## 6. Coverage to ask the broker about

1. **General liability** for HWTech (bodily injury and property damage claims, including events or meetings we attend).
2. **Technology errors and omissions (tech E&O) / professional liability.** Claims that the software failed or that our service caused a loss. Ask whether bodily injury arising from software use is excluded, and whether it can be added back.
3. **Cyber liability**, first party and third party: breach response, notification costs, forensics, regulatory defense, and claims from affected families. Ask about coverage for minors' data and for incidents at our providers.
4. **Hired and non-owned auto (HNOA)** for HWTech itself, in case an employee or the owner drives for business. HWTech does not provide rides through BandWagon, but ask whether HNOA matters for our exposure anyway.
5. **Umbrella / excess** over general liability and auto.
6. **Directors and officers / management liability**, if the broker thinks it is relevant for a single-owner LLC with a public-facing platform.
7. Ask how the **organizations' own policies** interact with ours: booster club general liability, volunteer accident policies, and whether their policies cover volunteer drivers. Ask whether we should require or recommend that organizations carry certain coverage, or name HWTech as additional insured.
8. Ask whether **volunteer driver coverage** (excess auto for volunteers, often sold to nonprofits) is something we should point organizations to.
9. Ask what underwriters will want to see: our Terms, Organization Agreement, security practices, and incident response plan.

## 7. Questions for the lawyer

1. **Entity structure.** Is a single Texas LLC enough, or should BandWagon sit in a separate entity from the MSP business to contain risk? Any operating agreement or asset protection changes?
2. **Organization Agreement review.** Review the draft at `/legal/organization-agreement` (roles, not a transportation provider, admin duties, data processing, incident notice, US$100 liability cap, Texas law, Denton County venue). Is the liability cap enforceable for a free service? Is the venue right for Flower Mound?
3. **TNC question.** Could BandWagon be treated as a transportation network company under Texas Occupations Code chapter 2402? Our understanding is that the chapter focuses on digital networks that connect riders with drivers for **prearranged rides for compensation**. BandWagon is built so that no payment ever changes hands for a ride. Please confirm how much that design matters, whether donations or sponsor money could be seen as compensation, and what we must never add (for example, gas money splitting or driver reimbursement).
4. **Minors and guardian consent.** Are our guardian-managed profiles, age gate (13+ for direct accounts, birth month and year only), and guardian consent for student sign-in enough? Does COPPA apply to any part of the service? What consent wording should families see?
5. **Texas privacy law.** Does the Texas Data Privacy and Security Act apply to HWTech at our size, or does the small business exemption apply? Do any Texas student privacy laws (for example, laws aimed at school operators or digital services for minors) apply even though the school is not our customer? What changes if a school district itself wants to sponsor a community?
6. **Terms enforceability.** Are the Terms of Use and click-to-accept flow enforceable, including for minors using the service under a guardian's account? Should we add arbitration or a class action waiver?
7. **Volunteer and organization liability.** Do Texas charitable immunity or volunteer protection laws help the organizations or their volunteer drivers? Does anything we say or do (like enforcing driver rules) increase HWTech's duty of care?
8. **Messaging.** Review our SMS consent flow and records against the TCPA and carrier rules.
9. **Sponsors.** Any rules for sponsor recognition shown to families, given that sponsors get no data and the audience includes minors?

## 8. Documents to share

- Terms of Use (`/terms`), Privacy Policy (`/privacy`), Cookie Policy (`/cookies`), Messaging and SMS Consent (`/messaging`)
- Draft Organization Agreement (`/legal/organization-agreement`)
- Subprocessor list (`/legal/subprocessors`)
- Student Data Statement (`/legal/student-data`)
- Organization Review Package (`/api/review-package`)
- `docs/ORGANIZATION-REVIEW-GUIDE.md` and `docs/LOCATION-PRIVACY.md` from the repository

**Not legal or insurance advice.** Everything above needs review by a licensed Texas attorney and a licensed insurance professional before HWTech relies on it.
