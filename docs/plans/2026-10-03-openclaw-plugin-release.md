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
- [x] Commit and push release source c39408d861327f2f1182819c9bbafd1e6bb2c7bb to main. Publication dry-run matches 14 files and 19,668 bytes.
- [x] Publish plugin 0.1.6 in attempt zx74mh62sbne5zngh9ahbpgp0d8fj4dx; publication status is published and scan is clean. Public download matches the runtime-tested candidate byte-for-byte; ClawHub digest verification succeeds. Browser shows latest 0.1.6 and Security audit Pass.
- [x] Publish standalone skill 2.0.6 after public plugin availability (one attempt zx7f2r38hty1t713g0m9c2y7gn8fk2hb). Public latest/tag are 2.0.6; its SKILL.md matches local SHA-256 24ad564ac6c28bf1bca10e27230603a89a73280f6b6832d0fdc8d882fc987945. Security/moderation are clean with no warnings. The separate skill verify command returns fail only for card.missing; no security failure remains. Do not claim formal card/signature verification passed.
- [x] Restore local runtime configuration and prepare handoff with public URLs, versions, and verification limits. Install public 0.1.6 through the normal clawhub resolver, restart the existing Gateway, and confirm loaded/enabled plus managed browser ready. Original origin and Agent identity metadata are unchanged.

## Verification

Use docker compose --profile dev run --rm plugin-dev run verify. Pack with the same pinned runtime; include only built dist files, package.json, openclaw.plugin.json, README.md, and the bundled SKILL.md. Require a successful real model run with canonical heytraders_cli receipts against the production origin. Download the immutable public archive and compare bytes with the tested candidate.

Production runtime evidence: the restored browser initially held Frontend bridge v6 and correctly returned HEYTRADERS_BRIDGE_UPGRADE_REQUIRED. Reloading the same intended work tab exposed bridge v7. Session ecdaaf05-5dd2-43ae-b7b5-3c0c2ce24a12 then completed all four read-only calls in 37 seconds. No fallback transport, financial action, or outgoing delivery was used.

Public verification: plugin 0.1.6 has source-linked commit c39408d861327f2f1182819c9bbafd1e6bb2c7bb and a clean scan. Downloaded bytes match the tested archive; package verify returns verified true. The standard OpenClaw clawhub install succeeds and reports Safe. Browser shows v0.1.6/latest and Security audit Pass. Standalone skill 2.0.6 is public and security-clean; skill verify reports card.missing and unsigned, with no server-resolved GitHub import provenance. These attestations are separate from successful publication and security scans.

Public URLs:
- https://clawhub.ai/heytraders/plugins/openclaw-plugin
- https://clawhub.ai/heytraders/skills/heytraders

## Recovery Notes

Completed: release source c39408d861327f2f1182819c9bbafd1e6bb2c7bb on origin/main. Public plugin 0.1.6 and standalone skill 2.0.6 are published, both security-clean. Gateway and managed browser run with public 0.1.6; the original ignored appOrigin http://127.0.0.1:5173 and browserProfile openclaw are restored. Preserve the existing state directory and untracked reports. Exact candidate, validator output, verified public archive, and Browser screenshot: /tmp/heytraders-openclaw-release.Gn0MFG. Successful production runtime session: ecdaaf05-5dd2-43ae-b7b5-3c0c2ce24a12. Identity file retains mode 0600, size 276, mtime 1789117956, and inode 301675579. A final documentation-only commit records the completed verification; distributable files still match the release source.
