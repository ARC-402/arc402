#!/usr/bin/env node
/**
 * @arc402/daemon — entrypoint.
 * Starts the ARC-402 daemon HTTP server on port 4402.
 * Spec 46 §14 — Node Architecture.
 */

import { runDaemon } from "./server";

const foreground =
  process.argv.includes("--foreground") ||
  process.env.ARC402_DAEMON_FOREGROUND === "1";

runDaemon(foreground).catch((err: unknown) => {
  process.stderr.write(
    `Daemon fatal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
