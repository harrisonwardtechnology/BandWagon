import Image from "next/image";
import Link from "next/link";

// The full wordmark has a navy "Band", so a light version is swapped in when
// the device is in dark mode. The compact icon works on both.
export function BrandLogo({
  compact = false,
  href = "/",
  className = "",
  priority = false,
}: {
  compact?: boolean;
  href?: string | null;
  className?: string;
  priority?: boolean;
}) {
  const img = (
    <Image
      src={compact ? "/bandwagon-icon.svg" : "/bandwagon-logo.svg"}
      alt="BandWagon"
      width={compact ? 52 : 245}
      height={compact ? 52 : 60}
      className={`brand-logo ${compact ? "brand-logo-mark" : "brand-logo-full"} ${className}`.trim()}
      priority={priority}
    />
  );
  const image = compact ? img : (
    <picture>
      <source srcSet="/bandwagon-logo-dark.svg" media="(prefers-color-scheme: dark)" />
      {img}
    </picture>
  );

  return href ? (
    <Link href={href} className="brand-logo-link" aria-label="BandWagon home">
      {image}
    </Link>
  ) : image;
}
