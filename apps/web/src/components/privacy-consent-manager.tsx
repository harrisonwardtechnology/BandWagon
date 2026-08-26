"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createPrivacyPreferences,
  OPEN_PRIVACY_PREFERENCES_EVENT,
  PRIVACY_CONSENT_COOKIE,
  PRIVACY_CONSENT_EVENT,
  PRIVACY_CONSENT_MAX_AGE_SECONDS,
  privacyPreferencesFromCookieHeader,
  serializePrivacyPreferences,
} from "@/lib/consent-policy";
import type { PrivacyPreferences } from "@/lib/consent-policy";

function savePreferences(preferences: PrivacyPreferences) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PRIVACY_CONSENT_COOKIE}=${encodeURIComponent(serializePrivacyPreferences(preferences))}; Path=/; Max-Age=${PRIVACY_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_EVENT, { detail: preferences }));
}

async function removeUnusedFunctionalStorage() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  let activePushSubscription = false;
  for (const registration of registrations) {
    const subscription = await registration.pushManager?.getSubscription().catch(() => null);
    if (subscription) activePushSubscription = true;
    else await registration.unregister().catch(() => false);
  }
  if (!activePushSubscription && "caches" in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.filter(key => key.startsWith("bandwagon-shell-")).map(key => caches.delete(key)));
  }
}

export function hasFunctionalConsent(cookieHeader = typeof document === "undefined" ? "" : document.cookie) {
  return Boolean(privacyPreferencesFromCookieHeader(cookieHeader)?.functional);
}

export function requestPrivacyPreferences() {
  window.dispatchEvent(new Event(OPEN_PRIVACY_PREFERENCES_EVENT));
}

export function PrivacyPreferencesButton() {
  return <button className="footer-privacy-button" type="button" onClick={requestPrivacyPreferences}>Cookie preferences</button>;
}

export default function PrivacyConsentManager() {
  const [preferences, setPreferences] = useState<PrivacyPreferences | null>(null);
  const [ready, setReady] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [functional, setFunctional] = useState(false);

  useEffect(() => {
    const current = privacyPreferencesFromCookieHeader(document.cookie);
    setPreferences(current);
    setFunctional(Boolean(current?.functional));
    setReady(true);
    const open = () => {
      const latest = privacyPreferencesFromCookieHeader(document.cookie);
      setFunctional(Boolean(latest?.functional));
      setManageOpen(true);
    };
    window.addEventListener(OPEN_PRIVACY_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_PRIVACY_PREFERENCES_EVENT, open);
  }, []);

  function choose(nextFunctional: boolean) {
    const next = createPrivacyPreferences(nextFunctional);
    savePreferences(next);
    setPreferences(next);
    setFunctional(nextFunctional);
    setManageOpen(false);
    if (!nextFunctional) void removeUnusedFunctionalStorage();
  }

  if (!ready) return null;

  return <>
    {!preferences && !manageOpen && <section className="privacy-banner" role="dialog" aria-modal="false" aria-labelledby="privacy-banner-title" aria-describedby="privacy-banner-description">
      <div className="privacy-banner-copy">
        <div className="privacy-banner-kicker">YOUR PRIVACY, YOUR CHOICE</div>
        <h2 id="privacy-banner-title">BandWagon uses only essential technology unless you say yes.</h2>
        <p id="privacy-banner-description">Essential cookies keep sign-in, security, and forms working. With your permission, functional storage adds the offline app experience. We do not use advertising cookies or behavioral analytics.</p>
        <p className="privacy-banner-links"><Link href="/cookies">Cookie Policy</Link><Link href="/privacy">Privacy Policy</Link></p>
      </div>
      <div className="privacy-banner-actions">
        <button type="button" className="consent-button consent-accept" onClick={() => choose(true)}>Accept optional</button>
        <button type="button" className="consent-button consent-reject" onClick={() => choose(false)}>Reject optional</button>
        <button type="button" className="consent-button consent-manage" onClick={() => setManageOpen(true)}>Manage preferences</button>
      </div>
    </section>}

    {manageOpen && <div className="privacy-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && preferences) setManageOpen(false); }}>
      <section className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-modal-title" aria-describedby="privacy-modal-description">
        <div className="privacy-modal-heading">
          <div><div className="privacy-banner-kicker">PRIVACY PREFERENCES</div><h2 id="privacy-modal-title">Choose what BandWagon may store</h2></div>
          {preferences && <button className="privacy-modal-close" type="button" aria-label="Close privacy preferences" onClick={() => setManageOpen(false)}>×</button>}
        </div>
        <p id="privacy-modal-description">Your choice applies to this browser for 12 months. You can return here from the footer at any time. A material policy or technology change will require a new choice.</p>

        <div className="privacy-category">
          <div><h3>Essential</h3><p>Authentication, account security, support-mode protection, consent memory, and Cloudflare Turnstile bot protection.</p></div>
          <span className="privacy-always-on" aria-label="Essential technology is always active">Always active</span>
        </div>
        <label className="privacy-category privacy-category-toggle">
          <div><h3>Functional</h3><p>Stores the public offline app shell so BandWagon can provide its installable PWA experience. Push notifications remain a separate, explicit device choice.</p></div>
          <input type="checkbox" checked={functional} onChange={event => setFunctional(event.target.checked)} aria-label="Allow optional functional storage" />
        </label>
        <div className="privacy-category privacy-category-disabled">
          <div><h3>Analytics</h3><p>Not used. BandWagon does not currently deploy behavioral analytics or session replay.</p></div><span>Off</span>
        </div>
        <div className="privacy-category privacy-category-disabled">
          <div><h3>Advertising</h3><p>Not used. BandWagon does not deploy advertising pixels or cross-site tracking.</p></div><span>Off</span>
        </div>

        <div className="privacy-modal-actions">
          <button type="button" className="consent-button consent-accept" onClick={() => choose(functional)}>Save my choices</button>
          <button type="button" className="consent-button consent-reject" onClick={() => choose(false)}>Reject optional</button>
        </div>
        <p className="privacy-modal-policy"><Link href="/cookies">Read the full Cookie Policy</Link></p>
      </section>
    </div>}
  </>;
}
