import Script from "next/script";
import { analyticsConfig } from "@/lib/analytics-policy";

// Self-hosted Umami (stats.harrisonward.net). No cookies, no personal data,
// nothing tied to a person. Off unless NEXT_PUBLIC_UMAMI_WEBSITE_ID is set.
// Query strings, hashes and invite tokens are removed before anything is sent
// (see scrubAnalyticsUrl). Browsers that send Do Not Track are skipped.
export default function UmamiAnalytics() {
  const config = analyticsConfig(process.env);
  if (!config) return null;
  return (
    <>
      <Script id="bw-umami-scrub" strategy="afterInteractive">{`
        window.bwUmamiBeforeSend = function (type, payload) {
          try {
            var p = new URL(payload.url || "/", location.origin).pathname;
            var m = p.match(/^\\/(invite|household-invite)\\/[^/]+(.*)$/);
            if (m) p = "/" + m[1] + "/:token" + m[2];
            payload.url = p;
            if (payload.referrer) { try { var r = new URL(payload.referrer); payload.referrer = r.origin + r.pathname.replace(/^\\/(invite|household-invite)\\/[^/]+/, "/$1/:token"); } catch (e) { payload.referrer = ""; } }
            return payload;
          } catch (e) { return false; }
        };
      `}</Script>
      <Script
        src={config.src}
        strategy="afterInteractive"
        data-website-id={config.websiteId}
        data-exclude-search="true"
        data-exclude-hash="true"
        data-do-not-track="true"
        data-before-send="bwUmamiBeforeSend"
      />
    </>
  );
}
