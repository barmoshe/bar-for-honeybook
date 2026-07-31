// Runs the Next dev server and the Go rules engine side by side, because the
// app is genuinely two processes in development and remembering to start the
// second one in another terminal is a tax nobody should pay twice.
//
// Zero dependencies on purpose: this repo should stay `npm install && npm run
// dev` for anyone who clones it.
import { spawn } from "node:child_process";

const procs = [];

function run(name, cmd, args, colour) {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  procs.push(child);

  const prefix = `\x1b[${colour}m[${name}]\x1b[0m `;
  const pipe = (stream) => {
    stream.setEncoding("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited with ${code}\n`);
    shutdown(code ?? 0);
  });

  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) p.kill("SIGTERM");
  // Give them a moment to go quietly before the process ends.
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("engine", "go", ["run", "./cmd/engine"], "36");
run("next", "npx", ["next", "dev"], "35");
