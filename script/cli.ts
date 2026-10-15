#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { createCommand } from "./parser/create-command";
import { showHelp } from "./parser/commands";
import * as execute from "./command-executor";
import * as chalk from "chalk";

function run() {
  const command = createCommand();

  if (!command) {
    showHelp(/*showRootDescription*/ false);
    return;
  }

  execute.execute(command).catch((error: any): void => {
    console.error(chalk.red(`[Error]  ${error.message}`));
    process.exit(1);
  });
}

run();
