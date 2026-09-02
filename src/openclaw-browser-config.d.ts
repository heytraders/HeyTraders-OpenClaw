declare module "openclaw/plugin-sdk/browser-config" {
  export type ResolvedBrowserConfig = {
    enabled: boolean;
    defaultProfile: string;
  };

  export type ResolvedBrowserProfile = {
    name: string;
    cdpPort: number;
    cdpUrl: string;
    cdpHost: string;
    cdpIsLoopback: boolean;
    driver: string;
    attachOnly: boolean;
  };

  export function resolveBrowserConfig(
    browserConfig: unknown,
    rootConfig?: unknown,
  ): ResolvedBrowserConfig;

  export function resolveProfile(
    config: ResolvedBrowserConfig,
    profileName: string,
  ): ResolvedBrowserProfile;
}
