export type GuardSeverity = "high" | "critical";

export interface InjectionPattern {
  pattern: RegExp;
  category: string;
  severity: GuardSeverity;
}

export type GuardResult =
  | { safe: true }
  | {
      safe: false;
      category: string;
      severity: GuardSeverity;
      pattern: string;
      excerpt: string;
    };

export const INJECTION_PATTERNS: InjectionPattern[] = [
  { pattern: /ignore\s+(previous|prior|all|earlier)\s+instructions?/i, category: "instruction_override", severity: "critical" },
  { pattern: /disregard\s+(all\s+)?(previous|prior|system|developer)\s+instructions?/i, category: "instruction_override", severity: "critical" },
  { pattern: /forget\s+everything\s+(above|before|prior)/i, category: "instruction_override", severity: "critical" },
  { pattern: /override\s+(the\s+)?(system|developer|safety)\s+instructions?/i, category: "instruction_override", severity: "critical" },
  { pattern: /replace\s+(the\s+)?(system|developer)\s+prompt/i, category: "instruction_override", severity: "critical" },
  { pattern: /your\s+(true|real|actual)\s+(goal|purpose|instructions?)\s+is/i, category: "instruction_override", severity: "critical" },
  { pattern: /new\s+(system|developer|hidden)\s+instructions?/i, category: "instruction_override", severity: "critical" },
  { pattern: /follow\s+these\s+instructions\s+instead/i, category: "instruction_override", severity: "high" },

  { pattern: /you\s+are\s+now\s+(a\s+)?(different|new|unrestricted|jailbroken|unfiltered|unconstrained)/i, category: "role_override", severity: "critical" },
  { pattern: /act\s+as\s+(if\s+you\s+are\s+)?an?\s+(unrestricted|jailbroken|different|unconstrained|root)/i, category: "role_override", severity: "critical" },
  { pattern: /pretend\s+(you\s+)?(have\s+no|there\s+are\s+no)\s+(restrictions|limits|rules|guidelines)/i, category: "role_override", severity: "high" },
  { pattern: /assume\s+the\s+role\s+of\s+(system|developer|administrator|root)/i, category: "role_override", severity: "critical" },
  { pattern: /simulate\s+(being\s+)?(root|admin|an\s+operator)/i, category: "role_override", severity: "high" },

  { pattern: /arc402\s+(hire|deliver|verify|subscribe|wallet\s+transfer|compute\s+hire|compute\s+propose)/i, category: "protocol_injection", severity: "critical" },
  { pattern: /\/(hire|subscribe|compute\/propose|wallet\/transfer|verify)\b/i, category: "protocol_injection", severity: "critical" },
  { pattern: /commitDeliverable|executeContractCall|executeSpend|validateSpend/i, category: "protocol_injection", severity: "critical" },
  { pattern: /call\s+(the\s+)?(daemon|wallet|commerce)\s+api/i, category: "protocol_injection", severity: "critical" },
  { pattern: /invoke\s+(an?\s+)?(on-?chain|wallet|payment)\s+(action|operation|transaction)/i, category: "protocol_injection", severity: "high" },

  { pattern: /machineKey|machine_key|MACHINE_KEY/i, category: "key_exfiltration", severity: "critical" },
  { pattern: /DEPLOYER_PRIVATE_KEY|PRIVATE_KEY\s*=|SECRET_KEY\s*=/i, category: "key_exfiltration", severity: "critical" },
  { pattern: /seed\s+phrase|mnemonic|wallet\s+secret/i, category: "key_exfiltration", severity: "critical" },
  { pattern: /print\s+(the\s+)?(env|environment)\b.*(secret|token|key)/i, category: "key_exfiltration", severity: "critical" },
  { pattern: /cat\s+\S*(\.env|id_rsa|id_ed25519|credentials)/i, category: "key_exfiltration", severity: "critical" },

  { pattern: /send\s+.{0,120}\s+to\s+0x[0-9a-f]{40}/i, category: "exfiltration", severity: "critical" },
  { pattern: /transfer\s+\d+(\.\d+)?\s*(ETH|USDC|wei|USD)/i, category: "exfiltration", severity: "critical" },
  { pattern: /POST\s+https?:\/\/.{0,160}\b(private|key|secret|wallet|token)\b/i, category: "exfiltration", severity: "high" },
  { pattern: /curl\s+-X\s+POST.{0,240}\b(private|secret|key|wallet|token)\b/i, category: "exfiltration", severity: "high" },
  { pattern: /upload\s+.{0,120}\b(secrets?|wallet|keys?)\b/i, category: "exfiltration", severity: "high" },
  { pattern: /exfiltrat(e|ion)|leak\s+(data|secrets?)/i, category: "exfiltration", severity: "critical" },

  { pattern: /---+\s*(SYSTEM|OVERRIDE|ADMIN|ROOT|SUDO|NEW\s+INSTRUCTIONS)/i, category: "delimiter_injection", severity: "critical" },
  { pattern: /<\/?(system|assistant|developer|tool)>/i, category: "delimiter_injection", severity: "critical" },
  { pattern: /\[INST\]|\[\/INST\]/i, category: "delimiter_injection", severity: "high" },
  { pattern: /<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|assistant\|>/i, category: "delimiter_injection", severity: "critical" },
  { pattern: /###\s*(System|Human|Assistant|Developer)\s*:/i, category: "delimiter_injection", severity: "high" },
  { pattern: /BEGIN\s+(SYSTEM|PROMPT|OVERRIDE)\b|END\s+(SYSTEM|PROMPT|OVERRIDE)\b/i, category: "delimiter_injection", severity: "high" },

  { pattern: /\\u[0-9a-f]{4}.*(?:ignore|system|override|developer)/i, category: "encoded_injection", severity: "high" },
  { pattern: /base64.*(?:aWdub3Jl|c3lzdGVt|ZGV2ZWxvcGVy|b3ZlcnJpZGU)/i, category: "encoded_injection", severity: "high" },
  { pattern: /&#(?:\d+|x[0-9a-f]+);.*(?:instructions?|system|override)/i, category: "encoded_injection", severity: "high" },
  { pattern: /vtaber\s+cerivbhf|flfgrz\s+cebzcg|bireevqr/i, category: "encoded_injection", severity: "high" },
];

function sanitizeExcerpt(raw: string): string {
  return raw
    .replace(/0x[0-9a-f]{40}/gi, "0x[redacted]")
    .replace(/\b[0-9a-f]{64}\b/gi, "[key-redacted]")
    .replace(/\b(sk|pk|rk)_[a-z0-9_-]+\b/gi, "[token-redacted]");
}

export function guardTaskContent(content: string): GuardResult {
  for (const { pattern, category, severity } of INJECTION_PATTERNS) {
    const match = pattern.exec(content);
    if (!match) {
      continue;
    }
    const idx = match.index;
    const raw = content.slice(Math.max(0, idx - 40), Math.min(content.length, idx + 140));
    return {
      safe: false,
      category,
      severity,
      pattern: pattern.toString(),
      excerpt: sanitizeExcerpt(raw),
    };
  }
  return { safe: true };
}
