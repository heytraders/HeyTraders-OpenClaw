# Browser Transport Evidence

Verified locally on 2026-09-02 using Docker Desktop on Apple Silicon.

## Runtime identity

- OpenClaw release: `2026.8.2` (`0965053` in the running CLI banner).
- Image: `ghcr.io/openclaw/openclaw:2026.8.2-browser` pinned to digest `sha256:e164a318801fad2d49dc19b99adadfa629fa5f9ffb43673e73661c1d3f9cc7de`.
- Platform: Linux ARM64 manifest present and pulled successfully.
- Gateway: healthy on the container's port `18789`; host mappings are loopback-only.
- Browser: managed profile `openclaw`, driver `openclaw`, CDP `http://127.0.0.1:18800`, headless Chromium from the official browser image.

## Public OpenClaw contracts used

The plugin imports only public SDK paths:

- `openclaw/plugin-sdk/tool-plugin` for plugin and tool definition;
- `openclaw/plugin-sdk/browser-config` for current browser configuration and profile resolution.

The resolved managed profile supplies the local CDP origin. The adapter then uses standard CDP target discovery plus the Chromium `Page` and `WebMCP` domains. Its protocol methods are limited to:

- `Page.enable` and `Page.getFrameTree` to bind to the current canonical top-level frame and detect navigation;
- `WebMCP.enable`;
- `WebMCP.invokeTool` with tool name `heytraders_cli`, the validated `{ command, args }` input, and the exact top-level frame ID.

An attempted generic Gateway method dispatch from an ordinary tool plugin was rejected by OpenClaw's plugin contract, so that privileged route was not used or bypassed.

## Artifact and runtime proof

The packed artifact `heytraders-openclaw-plugin-0.1.0.tgz` contained only:

- compiled JavaScript and declaration files under `dist/`;
- `openclaw.plugin.json`;
- `package.json`;
- `README.md`;
- `skills/heytraders-browser/SKILL.md`.

The final locally installed archive had SHA-256 `ec62c73e9d6afe3270f437c2c3110b3a30e3a5ae8fa0d0f0e88072b20380d001`.

After installation with explicit capability acceptance, runtime inspection reported:

- plugin ID `heytraders`, version `0.1.0`, status `loaded`;
- built-with OpenClaw version `2026.8.2`;
- one optional tool, `heytraders_cli`;
- one accepted skill directory, `./skills`;
- installed runtime dependency `typebox@1.1.38`;
- no HTTP routes, Gateway methods, services, MCP servers, CLI commands, hooks, or providers.

Skill inspection reported `heytraders-browser` as eligible, model-visible, not user-invocable, and free of missing requirements.

## Browser boundary proof

Observed fail-closed behavior through the installed plugin:

- no eligible tab returned `HEYTRADERS_TAB_NOT_FOUND`;
- two eligible exact-origin tabs returned `AMBIGUOUS_HEYTRADERS_TAB`;
- one eligible exact-origin tab allowed invocation;
- the live top-level frame ID matched the page target and the `heytraders_cli` registration frame ID;
- unsupported remote, extension, attach-only, unsafe CDP, wrong/changing top-level origin, child-frame name collision, invalid request, credential-like field, timeout, close, and malformed response paths are covered by unit tests.

With exactly one `https://hey-traders.com/` tab open, direct invocation through the authenticated local Gateway tool endpoint returned HTTP 200 and structured success for:

- `help`: protocol version 3 and the live domain summary;
- `status`: live domain readiness; all landing-page gateways except the chart gateway were ready;
- `describe status`: the current empty input schema and query/concurrency-safe execution policy.

The Gateway bearer value was read only from the container environment for this local diagnostic and was never printed or passed into the plugin.

## Input and transport controls

- Selector commands are trimmed, non-empty, control-character-free, and limited to 512 characters.
- Arguments must be plain JSON objects with finite numbers, bounded depth, and bounded value count.
- Prototype-polluting keys and credential-like field names are rejected before browser access.
- CDP HTTP is restricted to credential-free `http://127.0.0.1:<port>`.
- Page WebSockets are restricted to credential-free loopback `ws://.../devtools/page/<selected-target>` URLs.
- CDP tab-list bodies and messages are bounded; each command has a configurable timeout and abort handling.
- Logs include only a fixed error type and validated error code, never application error text, arguments, tokens, or tab URLs.

## Verification result and limits

- Unit tests: 48 passed in the final verification pass, including explicit structured-error, user-action-handoff, missing-facade timeout, child-frame rejection, navigation, early-tab-close, token-identifier, and log-redaction coverage.
- npm audit: zero findings for runtime-only dependencies and zero findings for the full lockfile.
- Browser page: public, unauthenticated HeyTraders landing page.
- Mutation coverage: none; no order, strategy, exchange, wallet, or settings mutation was attempted.
- Agent coverage: the registered tool and bundled skill were verified directly; no model-provider-backed agent turn was run because no provider credential was added.
- Publication: no npm publish, ClawHub publish, release, or `main`-branch commit was performed.
