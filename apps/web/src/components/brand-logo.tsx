import Image from "next/image";
import Link from "next/link";

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
  const image = (
    <Image
      src={compact ? "/bandwagon-icon.svg" : "/bandwagon-logo.svg"}
      alt="BandWagon"
      width={compact ? 52 : 245}
      height={compact ? 52 : 60}
      className={`brand-logo ${compact ? "brand-logo-mark" : "brand-logo-full"} ${className}`.trim()}
      priority={priority}
    />
  );

  return href ? (
    <Link href={href} className="brand-logo-link" aria-label="BandWagon home">
      {image}
    </Link>
  ) : image;
}
