# OpenClaw Plugin 0.1.6 Release Plan

Goal: Publish the existing domain-prefixed command, shared-help, and signup-client changes to ClawHub and verify the public release.

Architecture: The OpenClaw adapter continues to own one optional browser tool and its Agent login identity. The deployed Frontend owns the bridge v7 command catalog, navigation, authentication operations, and exchange workflows. Publish a verified npm-pack artifact from the current main checkout, then synchronize the standalone skill's instructions.

Tech Stack: TypeScript ESM, Vitest, OpenClaw 2026.8.2, pinned Docker harness, ClawHub CLI.

## Constraints

- Keep the current checkout and main branch; preserve unrelated reports and operator identity, model, browser, and Telegram state.
- Release plugin 0.1.6 only after production bridge v7 and real read-only Agent command execution are verified.
- Preserve the existing backtest-report sharing behavior; describe any ClawHub review marker accurately.
- Verification excludes exchange credentials, wallet actions, orders, strategy starts, and outgoing messages.
- Restore the ignored local appOrigin after production verification.

## Checklist

- [x] Compare public plugin 0.1.5/source a8976f4 and skill 2.0.5 against current main 2f7e63c; confirm only reports is untracked.
- [x] Align package, lockfile, manifest, public install pins, Compose archive, and development guide with 0.1.6.
- [x] Run pinned-container verify (84 tests, compiled build, metadata check, OpenClaw validation).
- [x] Pack and inspect the exact artifact; unpacked ClawHub validation reports no issues. Inventory: 14 regular files, 19,668 bytes. SHA-256: 96c37945c07c96216b377f3a6581030f5dca8883a825595a7d1e3c71f3b08a1b.
- [x] Install the candidate into the existing local runtime and verify production help list, help list auth, help describe auth status, and auth status through heytraders_cli. All four tool receipts are ok; auth status is authenticated/session-verified with provider agent.
- [~] Commit and push the verified release to main; run publication dry-run with the full source commit.
- [ ] Publish one ClawHub plugin attempt; verify final version, scans, download, and artifact equality.
- [ ] Publish standalone skill 2.0.6 after public plugin availability; verify its public guidance and exact security verdict.
- [ ] Restore local runtime configuration and report public URLs, versions, and verification limits.

## Verification

Use docker compose --profile dev run --rm plugin-dev run verify. Pack with the same pinned runtime; include only built dist files, package.json, openclaw.plugin.json, README.md, and the bundled SKILL.md. Require a successful real model run with canonical heytraders_cli receipts against the production origin. Download the immutable public archive and compare bytes with the tested candidate.

Production runtime evidence: the restored browser initially held Frontend bridge v6 and correctly returned HEYTRADERS_BRIDGE_UPGRADE_REQUIRED. Reloading the same intended work tab exposed bridge v7. Session ecdaaf05-5dd2-43ae-b7b5-3c0c2ce24a12 then completed all four read-only calls in 37 seconds. No fallback transport, financial action, or outgoing delivery was used.

## Recovery Notes

Initial main HEAD: 2f7e63c91a35ccdc53886c9ea53a6e03610e669c (also origin/main). Public baseline: plugin 0.1.5, skill 2.0.5. Gateway is running with candidate 0.1.6; appOrigin is temporarily https://hey-traders.com for read-only verification. Original ignored appOrigin is http://127.0.0.1:5173 and browserProfile is openclaw. Preserve the existing state directory and untracked reports. Exact candidate and validator output: /tmp/heytraders-openclaw-release.Gn0MFG. Successful runtime session: ecdaaf05-5dd2-43ae-b7b5-3c0c2ce24a12.
