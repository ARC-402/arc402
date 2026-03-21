#!/usr/bin/env node
import { createProgram } from "./program";
import { startREPL } from "./repl";

// Handle --print flag: clean text output, no ANSI colors, no REPL.
// Strip it before Commander sees it so it doesn't error on an unknown option.
const printIdx = process.argv.indexOf("--print");
if (printIdx !== -1) {
  process.argv.splice(printIdx, 1);
  process.env.NO_COLOR = "1";
  process.env.ARC402_PRINT = "1";
}

if (process.argv.length <= 2) {
  // No subcommand — enter interactive REPL
  void startREPL();
} else {
  // One-shot mode — arc402 wallet deploy still works as usual
  const program = createProgram();
  program.parse(process.argv);
}
