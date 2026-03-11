#!/usr/bin/env node
"use strict";

import { Command } from "commander";
import { registerConfigCommands } from "./commands/config";
import { registerAgentCommands } from "./commands/agent";
import { registerDiscoverCommand } from "./commands/discover";
import { registerAgreementsCommands } from "./commands/agreements";
import { registerHireCommand } from "./commands/hire";
import { registerAcceptCommand } from "./commands/accept";
import { registerDeliverCommand } from "./commands/deliver";
import { registerDisputeCommand } from "./commands/dispute";
import { registerCancelCommand } from "./commands/cancel";
import { registerTrustCommand } from "./commands/trust";
import { registerWalletCommands } from "./commands/wallet";

const program = new Command();

program
  .name("arc402")
  .description("ARC-402 Agent Intelligence Exchange CLI")
  .version("0.1.0");

// Register all command groups
registerConfigCommands(program);
registerAgentCommands(program);
registerDiscoverCommand(program);
registerAgreementsCommands(program);
registerHireCommand(program);
registerAcceptCommand(program);
registerDeliverCommand(program);
registerDisputeCommand(program);
registerCancelCommand(program);
registerTrustCommand(program);
registerWalletCommands(program);

program.parse(process.argv);
