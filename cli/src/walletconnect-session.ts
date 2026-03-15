import { Arc402Config, saveConfig } from "./config";

export interface WCSessionData {
  topic: string;
  expiry: number;   // Unix timestamp
  account: string;  // Phone wallet address
  chainId: number;
}

/** Returns null if no session, expired, or wrong chainId. */
export function loadWCSession(config: Arc402Config, requiredChainId: number): WCSessionData | null {
  if (!config.wcSession) return null;
  const now = Math.floor(Date.now() / 1000);
  if (config.wcSession.expiry <= now) return null;
  if (config.wcSession.chainId !== requiredChainId) return null;
  return config.wcSession as WCSessionData;
}

export function saveWCSession(config: Arc402Config, session: WCSessionData): void {
  config.wcSession = session;
  saveConfig(config);
}

export function clearWCSession(config: Arc402Config): void {
  delete config.wcSession;
  saveConfig(config);
}
