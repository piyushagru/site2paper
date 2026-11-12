#!/usr/bin/env node
import { run } from "../src/cli.mjs";

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(`site2paper: ${error instanceof Error ? error.message : error}`);
    if (error?.code === "USAGE") console.error("run site2paper --help for the options");
    process.exit(error?.code === "USAGE" ? 2 : 1);
  },
);
