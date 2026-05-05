import fs from "node:fs";

let cachedPackageVersion: string | null = null;

export function getPackageVersion(): string {
  if (cachedPackageVersion) {
    return cachedPackageVersion;
  }

  const raw = fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8");
  const parsed = JSON.parse(raw) as { version?: string };
  if (!parsed.version) {
    throw new Error("agent-cdp package version is missing");
  }

  cachedPackageVersion = parsed.version;
  return cachedPackageVersion;
}
