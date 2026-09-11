import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const manifest = JSON.parse(read("openclaw.plugin.json"));

describe("production release documentation", () => {
  it("keeps development infrastructure and publishing instructions out of public guidance", () => {
    const internalSetup = /docker|compose|vault|local development harness|npm[- ]pack|openssl|\.env(?:\.example)?\b|host\.docker\.internal|127\.0\.0\.1|noSandbox|\/workspace\/|plugin-dev|deploy the matching frontend|distribution boundary/i;

    for (const path of ["README.md", "skills/heytraders/SKILL.md"]) {
      expect(read(path).match(internalSetup)?.[0], path).toBeUndefined();
    }
  });

  it("describes public configuration without internal development hostnames", () => {
    expect(JSON.stringify(manifest.configSchema)).not.toMatch(
      /host\.docker\.internal|loopback|development|noSandbox/i,
    );
    expect(manifest.configSchema.properties.appOrigin.description).toContain(
      "https://hey-traders.com",
    );
  });

  it("keeps manifest, lockfile and installation references on the package version", () => {
    expect(manifest.version).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
    for (const path of ["README.md", "skills/heytraders/SKILL.md"]) {
      expect(read(path), path).toContain(
        `openclaw plugins install clawhub:${pkg.name}@${pkg.version}`,
      );
    }
  });

  it("excludes contributor documentation and the local harness from the package allowlist", () => {
    expect(pkg.files).toEqual([
      "dist",
      "skills",
      "openclaw.plugin.json",
      "README.md",
    ]);
  });

  it("separates Agent research navigation from operator-facing backtest sharing", () => {
    const skill = read("skills/heytraders/SKILL.md");

    expect(skill).toMatch(
      /`navigation\.result\.href` and `dashboardUrl` as the Agent account's authenticated workspace locations/i,
    );
    expect(skill).toMatch(
      /Whenever you report a completed strategy's backtest performance to the OpenClaw operator[\s\S]*`share-backtest-result`/i,
    );
    expect(skill).toMatch(
      /include the returned `url` intact[\s\S]*Do not send `navigation\.result\.href` or `dashboardUrl` as the operator's result link/i,
    );
  });
});
