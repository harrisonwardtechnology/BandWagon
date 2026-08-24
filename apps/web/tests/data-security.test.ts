import assert from "node:assert/strict";
import test from "node:test";
import { decryptSensitive,encryptSensitive,lookupHash } from "../src/lib/data-security.ts";

test("previous data key decrypts values during staged rotation",()=>{
  const original={current:process.env.DATA_ENCRYPTION_KEY,previous:process.env.DATA_ENCRYPTION_KEY_PREVIOUS,lookup:process.env.LOOKUP_HASH_KEY};
  try{
    process.env.DATA_ENCRYPTION_KEY="old-data-key-with-enough-entropy-for-test";
    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
    const oldCiphertext=encryptSensitive("private value");
    process.env.DATA_ENCRYPTION_KEY="new-data-key-with-enough-entropy-for-test";
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS="old-data-key-with-enough-entropy-for-test";
    assert.equal(decryptSensitive(oldCiphertext),"private value");
    const newCiphertext=encryptSensitive(decryptSensitive(oldCiphertext));
    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
    assert.equal(decryptSensitive(newCiphertext),"private value");
    assert.throws(()=>decryptSensitive(oldCiphertext),/configured data keys/);
  }finally{
    if(original.current===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=original.current;
    if(original.previous===undefined)delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;else process.env.DATA_ENCRYPTION_KEY_PREVIOUS=original.previous;
    if(original.lookup===undefined)delete process.env.LOOKUP_HASH_KEY;else process.env.LOOKUP_HASH_KEY=original.lookup;
  }
});

test("independent lookup key keeps blind indexes stable while data key rotates",()=>{
  const original={current:process.env.DATA_ENCRYPTION_KEY,lookup:process.env.LOOKUP_HASH_KEY};
  try{
    process.env.LOOKUP_HASH_KEY="stable-lookup-key-with-enough-entropy-for-test";
    process.env.DATA_ENCRYPTION_KEY="first-data-key";
    const before=lookupHash(" +14695551212 ");
    process.env.DATA_ENCRYPTION_KEY="second-data-key";
    assert.equal(lookupHash("+14695551212"),before);
  }finally{
    if(original.current===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=original.current;
    if(original.lookup===undefined)delete process.env.LOOKUP_HASH_KEY;else process.env.LOOKUP_HASH_KEY=original.lookup;
  }
});
