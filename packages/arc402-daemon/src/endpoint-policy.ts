import type { IncomingHttpHeaders } from "http";

const LOCKED_COMMERCE_ENDPOINTS = new Set([
  "/hire",
  "/subscribe",
  "/compute/propose",
]);

function isTruthy(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "allow", "granted", "*"].includes(value.trim().toLowerCase());
  }
  return false;
}

function objectHasEndpointDelegate(value: Record<string, unknown>, endpoint: string): boolean {
  if (isTruthy(value.commerce)) return true;
  if (isTruthy(value.allowCommerce)) return true;
  if (isTruthy(value.allow_commerce)) return true;
  if (isTruthy(value.allowed)) return true;
  if (isTruthy(value.all)) return true;
  if (Array.isArray(value.endpoints)) {
    return value.endpoints.some((entry) => typeof entry === "string" && (entry === endpoint || entry === "*"));
  }
  return false;
}

export function resolveJobId(headers: IncomingHttpHeaders): string | null {
  const raw = headers["x-arc402-job-id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return null;
}

export function hasExplicitCommerceDelegation(payload: unknown, endpoint: string): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const directKeys = [
    "commerceDelegation",
    "grantCommerceDelegation",
    "allowCommerceDelegation",
    "allow_commerce_delegation",
    "commerceDelegate",
  ];
  for (const key of directKeys) {
    if (isTruthy(record[key])) {
      return true;
    }
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (objectHasEndpointDelegate(value as Record<string, unknown>, endpoint)) {
        return true;
      }
    }
  }

  if (Array.isArray(record.delegatedEndpoints)) {
    return record.delegatedEndpoints.some((value) => typeof value === "string" && (value === endpoint || value === "*"));
  }
  if (Array.isArray(record.allowedEndpoints)) {
    return record.allowedEndpoints.some((value) => typeof value === "string" && (value === endpoint || value === "*"));
  }
  if (record.delegation && typeof record.delegation === "object" && !Array.isArray(record.delegation)) {
    return objectHasEndpointDelegate(record.delegation as Record<string, unknown>, endpoint);
  }
  return false;
}

export class EndpointPolicy {
  private readonly activeJobLocks = new Map<string, Set<string>>();

  lockForJob(jobId: string): void {
    this.activeJobLocks.set(jobId, new Set(LOCKED_COMMERCE_ENDPOINTS));
  }

  grantCommerceDelegate(jobId: string): void {
    this.activeJobLocks.get(jobId)?.clear();
  }

  releaseJob(jobId: string): void {
    this.activeJobLocks.delete(jobId);
  }

  isAllowed(jobId: string | null, endpoint: string): boolean {
    if (!jobId) {
      return true;
    }
    const locks = this.activeJobLocks.get(jobId);
    if (!locks) {
      return true;
    }
    return !locks.has(endpoint);
  }
}
