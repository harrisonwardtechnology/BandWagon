type CoolifyDomainConfig = {
  apiUrl: string;
  apiToken: string;
  applicationUuid: string;
};

function normalizedOrigin(hostname: string): string {
  return `https://${hostname.trim().toLowerCase()}`;
}

export async function addDomainToCoolify(
  cfg: CoolifyDomainConfig,
  currentDomains: string[],
  verifiedHostname: string,
): Promise<void> {
  // Caller MUST verify TXT ownership and BandWagon uniqueness before calling.
  const origin = normalizedOrigin(verifiedHostname);
  const next = Array.from(new Set([...currentDomains, origin]));

  const response = await fetch(`${cfg.apiUrl.replace(/\/$/, "")}/api/v1/applications/${cfg.applicationUuid}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      domains: next.join(","),
      // Intentionally do not set force_domain_override.
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Coolify domain update failed (${response.status}): ${body}`);
  }
}
