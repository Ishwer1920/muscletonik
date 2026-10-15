#!/usr/bin/env node
/**
 * Switch which site/API the Android app loads, then re-sync the native project.
 *
 *   node scripts/switch-env.mjs prod      -> https://muscletonik.com  (default)
 *   node scripts/switch-env.mjs staging   -> edit STAGING_URL below first
 *
 * It only rewrites `server.url` in capacitor.config.json and makes sure the
 * host is present in `server.allowNavigation`, then runs `npx cap sync android`.
 * Keep release builds pointed at production over HTTPS.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENVS = {
  prod: "https://muscletonik.com",
  // Change this to your staging host if/when you have one:
  staging: "https://staging.muscletonik.com",
};

const target = (process.argv[2] || "prod").toLowerCase();
const url = ENVS[target];
if (!url) {
  console.error(`Unknown env "${target}". Choose: ${Object.keys(ENVS).join(", ")}`);
  process.exit(1);
}
if (!url.startsWith("https://")) {
  console.error("Refusing to set a non-HTTPS url for a mobile build.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, "..", "capacitor.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const host = new URL(url).host;

config.server = config.server || {};
config.server.url = url;
config.server.allowNavigation = config.server.allowNavigation || [];
if (!config.server.allowNavigation.includes(host)) {
  config.server.allowNavigation.unshift(host);
}

writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(`server.url -> ${url}`);

console.log("Running: npx cap sync android");
execSync("npx cap sync android", { cwd: join(here, ".."), stdio: "inherit" });
