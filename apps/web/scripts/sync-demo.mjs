// Copies the What's New entries into the demo so it always lists the same
// updates as the real site. Run after editing src/lib/whats-new.ts:
//   npm run demo:sync
// tests/demo-sync.test.ts fails the build if the demo copy is out of date.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { WHATS_NEW } = await import(path.join(here, "../src/lib/whats-new.ts"));
const out = path.join(here, "../../../demo/whats-new.json");
fs.writeFileSync(out, JSON.stringify(WHATS_NEW, null, 2) + "\n");
console.log(`Wrote ${WHATS_NEW.length} What's New entries to demo/whats-new.json`);
