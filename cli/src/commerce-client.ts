export interface X402PaymentRequirement {
  receiver?: string;
  amount?: string;
  currency?: string;
  network?: string;
  description?: string;
}

export interface SubscriptionOfferHint {
  plan?: string;
  rate?: string;
  endpoint?: string;
}

export interface CommerceGatewayInspection {
  url: string;
  status: number;
  ok: boolean;
  paymentRequired: boolean;
  paymentOptions: string[];
  x402?: X402PaymentRequirement;
  subscription?: SubscriptionOfferHint;
}

export interface NewsletterIssueFetchOptions {
  signer?: string;
  signature?: string;
  apiToken?: string;
}

export interface NewsletterIssueFetchResult extends CommerceGatewayInspection {
  body?: string;
  contentType?: string;
}

function header(headers: Headers, key: string): string | undefined {
  const value = headers.get(key);
  return value === null || value.trim() === "" ? undefined : value.trim();
}

export function parseCommerceHeaders(url: string, status: number, headers: Headers): CommerceGatewayInspection {
  const paymentOptions = (header(headers, "x-payment-options") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const x402: X402PaymentRequirement = {
    receiver: header(headers, "x-x402-receiver"),
    amount: header(headers, "x-x402-amount"),
    currency: header(headers, "x-x402-currency"),
    network: header(headers, "x-x402-network"),
    description: header(headers, "x-x402-description"),
  };

  const subscription: SubscriptionOfferHint = {
    plan: header(headers, "x-subscription-plan"),
    rate: header(headers, "x-subscription-rate"),
    endpoint: header(headers, "x-subscription-endpoint"),
  };

  return {
    url,
    status,
    ok: status >= 200 && status < 300,
    paymentRequired: (header(headers, "x-payment-required") ?? "").toLowerCase() === "true" || status === 402,
    paymentOptions,
    x402: Object.values(x402).some(Boolean) ? x402 : undefined,
    subscription: Object.values(subscription).some(Boolean) ? subscription : undefined,
  };
}

export async function inspectCommerceEndpoint(
  url: string,
  init?: RequestInit
): Promise<CommerceGatewayInspection> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    redirect: "manual",
    ...init,
  });
  return parseCommerceHeaders(url, response.status, response.headers);
}

export function buildNewsletterAccessMessage(newsletterId: string, issueHash: string): string {
  return `arc402:newsletter:${newsletterId}:${issueHash}`;
}

export async function fetchNewsletterIssue(
  baseUrl: string,
  newsletterId: string,
  issueHash: string,
  options: NewsletterIssueFetchOptions = {}
): Promise<NewsletterIssueFetchResult> {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const url = `${normalizedBase}/newsletter/${encodeURIComponent(newsletterId)}/issues/${encodeURIComponent(issueHash)}`;
  const headers: Record<string, string> = {};

  if (options.apiToken) {
    headers.Authorization = `Bearer ${options.apiToken}`;
  }
  if (options.signer) {
    headers["X-ARC402-Signer"] = options.signer;
  }
  if (options.signature) {
    headers["X-ARC402-Signature"] = options.signature;
  }

  const response = await fetch(url, { method: "GET", headers });
  const inspection = parseCommerceHeaders(url, response.status, response.headers);

  return {
    ...inspection,
    body: response.ok ? await response.text() : undefined,
    contentType: header(response.headers, "content-type"),
  };
}
