import assert from "node:assert/strict";
import test from "node:test";
import { managedStudentMayAuthenticate,normalizeManagedStudentEmail } from "../src/lib/student-account-policy.ts";

test("managed student emails are normalized",()=>{
  assert.equal(normalizeManagedStudentEmail(" Student@Example.COM "),"student@example.com");
  assert.throws(()=>normalizeManagedStudentEmail("not-an-email"),/valid student email/);
});

test("configured managed students require enabled access and active consent",()=>{
  assert.equal(managedStudentMayAuthenticate({accessConfigured:true,enabled:true,hasActiveGuardianConsent:true}),true);
  assert.equal(managedStudentMayAuthenticate({accessConfigured:true,enabled:false,hasActiveGuardianConsent:true}),false);
  assert.equal(managedStudentMayAuthenticate({accessConfigured:true,enabled:true,hasActiveGuardianConsent:false}),false);
});

test("unconfigured profiles preserve existing direct-account behavior",()=>{
  assert.equal(managedStudentMayAuthenticate({accessConfigured:false,enabled:false,hasActiveGuardianConsent:false}),true);
});
