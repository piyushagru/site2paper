import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("install-time lifecycle scripts never reference files outside the published set", () => {
  // 0.1.1 shipped `preinstall: node scripts/check-registry.mjs` with scripts/ not in `files`:
  // every `npx site2paper` for a new user exited 1 with no message. Dev-only hooks go in `prepare`.
  for (const hook of ["preinstall", "install", "postinstall"]) {
    const cmd = pkg.scripts[hook];
    if (!cmd) continue;
    for (const ref of cmd.match(/[\w./-]+\.(?:mjs|js|sh)/g) ?? []) {
      const top = ref.replace(/^\.\//, "").split("/")[0];
      assert.ok(pkg.files.includes(top), `${hook} references ${ref}, but ${top} is not in "files"`);
    }
  }
});

test("prepare keeps the registry guard for contributors", () => {
  assert.match(pkg.scripts.prepare, /check-registry\.mjs/);
});
