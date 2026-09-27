import { NextRequest, NextResponse } from "next/server";
import { legacyRedirectTarget } from "@/lib/platform-hosts";

const SUPPORT_COOKIE="bw_support";
const SAFE_METHODS=new Set(["GET","HEAD","OPTIONS"]);
const ALLOWED_WRITE_PATHS=new Set(["/api/admin/support-mode/end"]);

export function middleware(request:NextRequest){
  // Old harrisonward.* hosts send page visits to bandwagon.club (permanent).
  const host=(request.headers.get("x-forwarded-host")||request.headers.get("host")||"").split(",")[0].trim();
  const moved=legacyRedirectTarget({host,pathname:request.nextUrl.pathname,search:request.nextUrl.search,method:request.method});
  if(moved)return NextResponse.redirect(moved,308);
  const supportToken=request.cookies.get(SUPPORT_COOKIE)?.value;
  if(!supportToken||SAFE_METHODS.has(request.method)||ALLOWED_WRITE_PATHS.has(request.nextUrl.pathname))return NextResponse.next();
  if(request.nextUrl.pathname.startsWith('/api/')){
    return NextResponse.json({error:"Support Mode is read-only. End Support Mode before making changes."},{status:403,headers:{"x-bandwagon-support-mode":"read-only"}});
  }
  return new NextResponse("Support Mode is read-only. End Support Mode before making changes.",{status:403,headers:{"content-type":"text/plain; charset=utf-8","x-bandwagon-support-mode":"read-only"}});
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|icons/|social/).*)"]};
