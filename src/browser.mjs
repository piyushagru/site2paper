import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const LAUNCH_ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]; // WebGL for maps in headless

/** Reuses Chrome or Edge already on the machine; downloads Chromium only when neither exists. */
export async function launchBrowser({ log = () => {} } = {}) {
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true, args: LAUNCH_ARGS });
    } catch {
      // not installed, try the next one
    }
  }
  try {
    return await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  } catch {
    log("No Chrome or Edge found. Downloading Chromium once (about 150 MB)...");
    execFileSync(process.execPath, [require.resolve("playwright-core/cli"), "install", "chromium"], { stdio: "inherit" });
    return chromium.launch({ headless: true, args: LAUNCH_ARGS });
  }
}
