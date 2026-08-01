// Runs the Next dev server and the Go rules engine side by side.
//
// The app no longer needs the second process: the engine is called in-process
// as WebAssembly, so `next dev` alone serves every route. It is still started
// here for two reasons. `prove:parser` and `prove:transports` need the HTTP
// engine up, and the HTTP transport is a real deployed surface that should not
// rot from never being run.
//
// Zero dependencies on purpose: this repo should stay `npm install && npm run
// dev` for anyone who clones it.
import { spawn } from "node:child_process";

const procs = [];

function run(name, cmd, args, colour, env) {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
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

// PORT is stripped from the engine's environment: it belongs to Next, and
// handing it to both leaves them racing for the same socket.
run("engine", "go", ["run", "./cmd/engine"], "36", { PORT: "" });
run("next", "npx", ["next", "dev"], "35");
