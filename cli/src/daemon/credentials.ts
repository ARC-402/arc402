import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface ProviderConfig {
  enabled: boolean;
  auth: string;           // "api_key" | "oauth"
  env?: string;           // env var name
  oauth_token_path?: string;
  hosts: string[];
  service_account_path?: string;
}

interface CredentialsConfig {
  providers: Record<string, ProviderConfig>;
}

export const CREDENTIALS_PATH = path.join(os.homedir(), ".arc402", "worker", "credentials.toml");

export async function loadCredentials(): Promise<CredentialsConfig | null> {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  const { parse } = await import("smol-toml");
  const raw = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
  return parse(raw) as unknown as CredentialsConfig;
}

export async function getEnabledProviders(): Promise<Array<{
  name: string;
  env?: string;
  hosts: string[];
  auth: string;
  hasKey: boolean;
}>> {
  const creds = await loadCredentials();
  if (!creds?.providers) return [];

  return Object.entries(creds.providers)
    .filter(([_name, p]) => p.enabled)
    .map(([name, p]) => ({
      name,
      env: p.env,
      hosts: p.hosts || [],
      auth: p.auth || "api_key",
      hasKey: p.env ? !!process.env[p.env] : false,
    }));
}

export async function getDockerEnvFlags(): Promise<string[]> {
  const providers = await getEnabledProviders();
  const flags: string[] = [];
  for (const p of providers) {
    if (p.env && process.env[p.env]) {
      flags.push("-e", `${p.env}=${process.env[p.env]}`);
    }
  }
  return flags;
}

export async function getProviderHosts(): Promise<string[]> {
  const providers = await getEnabledProviders();
  return providers.flatMap(p => p.hosts);
}
