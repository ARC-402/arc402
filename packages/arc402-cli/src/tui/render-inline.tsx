export function isTuiRenderMode(): boolean {
  return process.env.ARC402_TUI_MODE === "1";
}
