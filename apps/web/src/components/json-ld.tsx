import { serializeJsonLd } from "@/lib/json-ld";

/** Inline schema.org structured data. Server component; output is escaped. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
