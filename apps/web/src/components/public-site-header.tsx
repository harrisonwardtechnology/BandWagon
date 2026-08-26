"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

const links = [
  ["Home", "/"],
  ["Help", "/help"],
  ["Demo", "https://bandwagon-demo.harrisonward.net/"],
  ["Review package", "/api/review-package"],
  ["Support", "/support"],
] as const;

export function PublicSiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/app") || pathname.startsWith("/admin")) return null;

  return (
    <header className="public-site-header">
      <div className="public-nav-shell">
        <BrandLogo priority />
        <nav className="public-nav-links" aria-label="Primary navigation">
          {links.map(([label, href]) => {
            const external = href.startsWith("https://");
            const current = !external && (href === "/" ? pathname === "/" : pathname.startsWith(href));
            return external ? (
              <a key={href} href={href} target="_blank" rel="noreferrer">
                {label}<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <Link key={href} href={href} aria-current={current ? "page" : undefined}>{label}</Link>
            );
          })}
          <Link className="public-nav-sign-in" href="/login" aria-current={pathname === "/login" ? "page" : undefined}>Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
