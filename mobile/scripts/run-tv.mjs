import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const child = spawn(process.execPath, [expoCli, ...process.argv.slice(2)], {
  env: { ...process.env, EXPO_TV: "1" },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
