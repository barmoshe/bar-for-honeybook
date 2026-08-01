import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

/**
 * The rules engine as an in-process function call.
 *
 * `public/engine.wasm` is the same Go `engine` package the Vercel Function
 * compiles, built for `GOOS=js GOARCH=wasm`. Both transports marshal through
 * `encoding/json`, so neither can invent its own opinion about how a struct
 * becomes JSON, and CI asserts they agree byte for byte.
 *
 * The instance is booted once and parked on `globalThis`: a Go WASM program is
 * a running process with a scheduler, not a pure library, so instantiating one
 * per call would pay a hundred milliseconds to save a network hop that costs
 * less than that.
 *
 * **Server only, deliberately.** The build is 3.5MB, 1.0MB gzipped. Running the
 * identical binary in the browser would be a lovely sentence and a megabyte on
 * someone's phone for a demo page, so the browser talks to the server and the
 * server talks to this.
 */

type GoRuntime = {
  run: (instance: WebAssembly.Instance) => void;
  importObject: WebAssembly.Imports;
};

type EngineGlobal = { call: (json: string) => string };

const globalForWasm = globalThis as unknown as {
  __hbWasm?: Promise<EngineGlobal>;
  Go?: new () => GoRuntime;
  __hbEngine?: EngineGlobal;
};

async function boot(): Promise<EngineGlobal> {
  // wasm_exec.js is vendored rather than resolved from GOROOT: the Go toolchain
  // exists during Vercel's build and not inside the running function, and the
  // file moved from misc/wasm to lib/wasm between Go versions.
  //
  // Read and evaluated rather than imported, for two reasons. It is not a
  // module: it is a script whose entire job is to assign globalThis.Go, which is
  // exactly what runInThisContext does and what an import would fight. And a
  // bundler resolves `require(computedPath)` statically anyway, so importing it
  // fails the build with "Can't resolve /ROOT/lib/wasm/wasm_exec.cjs".
  const glue = await readFile(
    path.join(process.cwd(), "lib", "wasm", "wasm_exec.cjs"),
    "utf8",
  );
  vm.runInThisContext(glue, { filename: "wasm_exec.cjs" });

  const Go = globalForWasm.Go;
  if (!Go) throw new Error("wasm_exec.cjs did not define globalThis.Go.");

  const go = new Go();
  const bytes = await readFile(path.join(process.cwd(), "public", "engine.wasm"));
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);

  // `go.run` never resolves: the Go program blocks on `select {}` so its
  // exported function keeps answering. Awaiting it would hang forever, so it is
  // started and deliberately not awaited.
  void go.run(instance);

  const api = globalForWasm.__hbEngine;
  if (!api) throw new Error("The wasm module did not export __hbEngine.");
  return api;
}

function runtime(): Promise<EngineGlobal> {
  globalForWasm.__hbWasm ??= boot();
  return globalForWasm.__hbWasm;
}

/** Sends one request through the WASM engine and parses its answer. */
export async function callWasm<T>(body: unknown): Promise<T> {
  const api = await runtime();
  const out = api.call(JSON.stringify(body));
  return JSON.parse(out) as T;
}
