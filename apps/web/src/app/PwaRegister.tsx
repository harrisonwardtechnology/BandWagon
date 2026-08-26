"use client";

import { useEffect } from "react";
import { privacyPreferencesFromCookieHeader, PRIVACY_CONSENT_EVENT } from "@/lib/consent-policy";
import type { PrivacyPreferences } from "@/lib/consent-policy";

async function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  await registration.update();
}

async function removeUnusedWorkerAndCache() {
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

export default function PwaRegister() {
  useEffect(() => {
    const apply = (functional: boolean) => {
      if (functional) void registerWorker().catch(() => {});
      else void removeUnusedWorkerAndCache();
    };
    apply(Boolean(privacyPreferencesFromCookieHeader(document.cookie)?.functional));
    const changed = (event: Event) => apply(Boolean((event as CustomEvent<PrivacyPreferences>).detail?.functional));
    window.addEventListener(PRIVACY_CONSENT_EVENT, changed);
    return () => window.removeEventListener(PRIVACY_CONSENT_EVENT, changed);
  }, []);
  return null;
}
