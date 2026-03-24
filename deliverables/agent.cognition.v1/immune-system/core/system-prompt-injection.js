/**
 * Immune System Prompt Injection
 * Generates the compact system-message block injected before every agent response.
 * Kept under 400 chars — just active rules as bullets.
 */

/**
 * @param {Array} rules - Active rule objects from getActiveRules()
 * @param {Object} config - Optional config (reserved for future use)
 * @returns {string} Markdown block for system prompt injection
 */
export function generateImmuneSystemPrompt(rules, config = {}) {
  const identityRules = rules.filter(r => r.severity === "IDENTITY");
  const opRules = rules.filter(r => r.severity === "OPERATIONAL");

  const lines = [
    "**[IMMUNE SYSTEM ACTIVE]**",
    ...identityRules.map(r => `- IDENTITY: ${r.gate}`),
    ...opRules.map(r => `- OP: ${r.gate}`)
  ];

  const block = lines.join("\n");

  // Warn if we're approaching 400 chars — callers can truncate if needed
  if (block.length > 400) {
    const truncated = block.slice(0, 397) + "...";
    return truncated;
  }

  return block;
}

/**
 * Returns a single-line summary for logging/status display.
 */
export function generateImmuneStatusLine(rules) {
  const identity = rules.filter(r => r.severity === "IDENTITY").length;
  const op = rules.filter(r => r.severity === "OPERATIONAL").length;
  return `[IMMUNE] ${identity} identity gates + ${op} operational gates active`;
}
