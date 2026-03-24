/**
 * Immune System Rules
 * Data-driven gate definitions. Each rule is a self-contained object
 * with trigger patterns, enforcement gate, and violation response.
 *
 * Severity levels:
 *   IDENTITY    — protects core agent identity and values (never bypass)
 *   OPERATIONAL — protects workflow quality (can be overridden with intent)
 */

export const IMMUNE_RULES = [
  {
    id: "context-before-creation",
    severity: "OPERATIONAL",
    description: "Read files before claiming their contents. Verify before building.",
    triggers: ["create", "build", "write", "generate"],
    gate: "Must read relevant existing files first",
    violation_response: "BLOCK + explain what to read first",
    enabled: true
  },
  {
    id: "trash-over-rm",
    severity: "OPERATIONAL",
    description: "Use trash/recycle instead of permanent delete",
    triggers: ["rm ", "delete", "remove file"],
    gate: "Prefer trash command or confirm permanent delete",
    violation_response: "SUBSTITUTE trash for rm",
    enabled: true
  },
  {
    id: "discuss-before-building",
    severity: "OPERATIONAL",
    description: "Discuss approach before building silently on complex tasks",
    triggers: ["large build", "refactor", "new system"],
    gate: "Surface plan before executing",
    violation_response: "PAUSE + surface plan",
    enabled: true
  },
  {
    id: "memory-before-speaking",
    severity: "OPERATIONAL",
    description: "Run memory_search before claiming facts about prior work",
    triggers: ["what did we", "remember when", "we decided"],
    gate: "Search memory before asserting",
    violation_response: "SEARCH first",
    enabled: true
  },
  {
    id: "no-exfiltration",
    severity: "IDENTITY",
    description: "Never send private data outside the machine without explicit permission",
    triggers: ["send to", "email", "post publicly"],
    gate: "Confirm scope before sending",
    violation_response: "BLOCK + ask",
    enabled: true
  },
  {
    id: "soul-protection",
    severity: "IDENTITY",
    description: "Never modify SOUL.md, USER.md, AGENTS.md without explicit instruction",
    triggers: ["edit soul", "update soul", "change personality"],
    gate: "Explicit user instruction required",
    violation_response: "BLOCK + explain",
    enabled: true
  },
  {
    id: "scan-before-building",
    severity: "OPERATIONAL",
    description: "Search for existing implementations before building new ones",
    triggers: ["new component", "create module", "implement"],
    gate: "Search workspace before building",
    violation_response: "WARN + suggest search",
    enabled: true
  },
  {
    id: "deep-read-on-modify",
    severity: "OPERATIONAL",
    description: "Read the full file before modifying critical systems",
    triggers: ["modify", "update", "patch"],
    gate: "Full file read required before critical system edits",
    violation_response: "BLOCK until file is read",
    enabled: true
  }
];

/**
 * Returns only enabled rules.
 * Config overrides (from immune-system.config.json) are applied by the caller.
 */
export function getActiveRules(configOverrides = {}) {
  return IMMUNE_RULES.map(rule => ({
    ...rule,
    enabled: rule.id in configOverrides
      ? configOverrides[rule.id].enabled ?? rule.enabled
      : rule.enabled
  })).filter(r => r.enabled);
}

/**
 * Look up a rule by id. Returns undefined if not found.
 */
export function getRuleById(id) {
  return IMMUNE_RULES.find(r => r.id === id);
}
