#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { run } from "../src/cli.mjs";

const BUGS = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).bugs.url;

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(`site2paper: ${error instanceof Error ? error.message : error}`);
    if (error?.code === "USAGE") console.error("run site2paper --help for the options");
    else if (error?.code !== "SITE") console.error(`if this looks like a bug, report it at ${BUGS}`);
    process.exit(error?.code === "USAGE" ? 2 : 1);
  },
);
