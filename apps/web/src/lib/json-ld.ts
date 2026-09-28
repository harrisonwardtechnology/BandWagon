// Structured data (schema.org JSON-LD) for public pages. Pure functions only
// (no imports) so tests can load this file directly.

export type JsonLdObject = Record<string, unknown>;

/**
 * Serialize for an inline <script type="application/ld+json">. Escapes the
 * characters that could close the script element or break parsing, so text
 * from anywhere (including org-provided names) cannot inject markup.
 */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export const PRODUCT_NAME = "BandWagon";
export const PRODUCT_TAGLINE = "Free community carpools for schools, bands, and teams";
export const PRODUCT_DESCRIPTION =
  "BandWagon is a free, privacy-first carpool coordination tool for school bands, teams, clubs, troops, and other trusted groups. Families share rides to rehearsals, games, and events without group texts or public addresses.";
export const VENDOR_NAME = "Harrison Ward Technology";
export const LOGO_URL = "https://bandwagon.club/icons/icon-512.png";

/** Organization, WebSite, and SoftwareApplication for the product home page. */
export function productJsonLd(origin: string): JsonLdObject[] {
  const url = `${origin.replace(/\/$/, "")}/`;
  const vendor = { "@type": "Organization", name: VENDOR_NAME };
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${url}#organization`,
      name: PRODUCT_NAME,
      url,
      logo: LOGO_URL,
      description: PRODUCT_DESCRIPTION,
      parentOrganization: vendor,
      brand: { "@type": "Brand", name: PRODUCT_NAME },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${url}#website`,
      name: PRODUCT_NAME,
      url,
      description: PRODUCT_TAGLINE,
      inLanguage: "en-US",
      publisher: { "@id": `${url}#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: PRODUCT_NAME,
      url,
      description: PRODUCT_DESCRIPTION,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web, iOS, Android (installable web app)",
      image: LOGO_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${url}#organization` },
      provider: vendor,
    },
  ];
}

/** FAQPage from question/answer pairs that are visible on the page. */
export function faqJsonLd(items: ReadonlyArray<ReadonlyArray<string>>): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.filter((item) => item[0] && item[1]).map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
