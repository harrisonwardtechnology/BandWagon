import { NextRequest, NextResponse } from "next/server";
import { legacyRedirectTarget, platformHostSet } from "@/lib/platform-hosts";
import { hostKind, robotsHeaderFor } from "@/lib/seo-policy";

const SUPPORT_COOKIE="bw_support";
const SAFE_METHODS=new Set(["GET","HEAD","OPTIONS"]);
const ALLOWED_WRITE_PATHS=new Set(["/api/admin/support-mode/end"]);

// X-Robots-Tag keeps signed-in areas, token links, community (tenant) pages
// other than the landing page, and all of staging out of search results.
function withRobotsHeader(response:NextResponse,host:string,pathname:string){
  const value=robotsHeaderFor({kind:hostKind(host,platformHostSet(process.env.PLATFORM_HOSTNAMES)),staging:String(process.env.NEXT_PUBLIC_ENVIRONMENT||"").trim().toLowerCase()==="staging",pathname});
  if(value)response.headers.set("X-Robots-Tag",value);
  return response;
}

export function middleware(request:NextRequest){
  // Old harrisonward.* hosts send page visits to bandwagon.club (permanent).
  const host=(request.headers.get("x-forwarded-host")||request.headers.get("host")||"").split(",")[0].trim();
  const pathname=request.nextUrl.pathname;
  const moved=legacyRedirectTarget({host,pathname,search:request.nextUrl.search,method:request.method});
  if(moved)return NextResponse.redirect(moved,308);
  const supportToken=request.cookies.get(SUPPORT_COOKIE)?.value;
  if(!supportToken||SAFE_METHODS.has(request.method)||ALLOWED_WRITE_PATHS.has(pathname))return withRobotsHeader(NextResponse.next(),host,pathname);
  if(pathname.startsWith('/api/')){
    return NextResponse.json({error:"Support Mode is read-only. End Support Mode before making changes."},{status:403,headers:{"x-bandwagon-support-mode":"read-only","X-Robots-Tag":"noindex, nofollow"}});
  }
  return new NextResponse("Support Mode is read-only. End Support Mode before making changes.",{status:403,headers:{"content-type":"text/plain; charset=utf-8","x-bandwagon-support-mode":"read-only","X-Robots-Tag":"noindex, nofollow"}});
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|icons/|social/).*)"]};
