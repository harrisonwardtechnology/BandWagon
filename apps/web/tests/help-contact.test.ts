import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("help contact requires Turnstile and sends only through the support endpoint",()=>{
  const form=fs.readFileSync("src/components/help-contact-form.tsx","utf8");
  const route=fs.readFileSync("src/app/api/help/contact/route.ts","utf8");
  const widget=fs.readFileSync("src/components/turnstile-widget.tsx","utf8");
  const verifier=fs.readFileSync("src/lib/turnstile.ts","utf8");
  assert.match(widget,/challenges\.cloudflare\.com\/turnstile/);
  assert.match(form,/action="support_contact"/);
  assert.match(verifier,/TURNSTILE_SECRET_KEY/);
  assert.match(route,/verifyTurnstileToken\(request,token,"support_contact"\)/);
  assert.match(route,/SUPPORT_EMAIL/);
  assert.match(route,/help:ip:/);
  assert.match(route,/help:email:/);
});

test("public account and contact submissions verify a purpose-bound Turnstile token",()=>{
  const surfaces=[
    ["src/app/login/page.tsx","src/app/api/auth/otp/route.ts","otp_request"],
    ["src/app/security/page.tsx","src/app/api/security/report/route.ts","security_report"],
    ["src/components/help-contact-form.tsx","src/app/api/help/contact/route.ts","support_contact"],
  ];
  for(const [pagePath,routePath,action] of surfaces){const page=fs.readFileSync(pagePath,"utf8"),route=fs.readFileSync(routePath,"utf8");assert.ok(page.includes(`action="${action}"`),`${pagePath} must render Turnstile action ${action}`);assert.ok(route.includes(`"${action}"`),`${routePath} must verify Turnstile action ${action}`);}
});
