import { isStagingEnvironment } from "@/lib/public-links";

/** Loud banner so nobody mistakes staging for production. */
export function StagingBanner() {
  if (!isStagingEnvironment()) return null;
  return (
    <div
      role="status"
      style={{ position: "sticky", top: 0, zIndex: 1000, padding: "8px 16px", background: "#b91c1c", color: "#fff", textAlign: "center", fontWeight: 900, letterSpacing: 1, fontFamily: "system-ui,sans-serif", fontSize: 14 }}
    >
      STAGING. Test data only. Messages go only to allowlisted test recipients.
    </div>
  );
}
