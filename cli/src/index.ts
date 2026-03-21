#!/usr/bin/env node
import { createProgram } from "./program";
import { startREPL } from "./repl";

if (process.argv.length <= 2) {
  // No subcommand — enter interactive REPL
  void startREPL();
} else {
  // One-shot mode — arc402 wallet deploy still works as usual
  const program = createProgram();
  program.parse(process.argv);
}
