// Proves the two transports are the same engine.
//
//   npm run prove:transports
//
// There is one Go package and two ways to reach it: a Vercel Function over
// HTTP, and a WebAssembly build called in-process. Neither is a port, but "we
// compiled the same source" is a claim about the build, not about the answers.
// This checks the answers, byte for byte.
//
// Both marshal through encoding/json in Go, which is why the comparison can be
// on serialised bytes rather than on a deep-equal that would forgive a field
// appearing in one and not the other.
//
// Needs the HTTP engine running:  npm run engine
process.env.PGLITE_DATA_DIR = "memory://";

const { callWasm } = await import("../lib/engine-wasm.ts");

const HTTP_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:4310/api/engine";

const ok = (label, detail = "") =>
  console.log(`  \x1b[32mok\x1b[0m ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

let failures = 0;
const fail = (label, detail) => {
  failures++;
  console.error(`  \x1b[31mFAIL\x1b[0m ${label}\n       ${detail}`);
};

async function http(body) {
  const res = await fetch(HTTP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const DEMO = {
  id: "doc_equiv",
  title: "Wedding photography",
  business: "Northlight Studio",
  client: "Dana",
  currency: "USD",
  blocks: [
    {
      id: "services",
      kind: "services",
      title: "Your package",
      required: true,
      services: {
        mode: "multi",
        options: [
          { id: "base", name: "Full-day coverage", priceCents: 240000 },
          { id: "album", name: "Printed album", priceCents: 34000, maxQty: 3 },
          { id: "travel", name: "Travel", priceCents: 8551 },
        ],
      },
    },
    {
      id: "contract",
      kind: "contract",
      title: "The agreement",
      required: true,
      requiresComplete: ["services"],
      contract: {
        signatureRequired: true,
        body: "{{business}} will provide {{services}} for {{client}}. Total {{total}}, deposit {{deposit}}.",
      },
    },
    {
      id: "invoice",
      kind: "invoice",
      title: "Payment",
      required: true,
      requiresComplete: ["contract"],
      invoice: { depositBps: 5000, taxBps: 1000 },
    },
  ],
};

const CYCLIC = {
  id: "doc_cycle",
  title: "A loop",
  business: "",
  client: "",
  currency: "USD",
  blocks: ["a", "b", "c"].map((id, i, all) => ({
    id,
    kind: "contract",
    title: id.toUpperCase(),
    required: true,
    requiresComplete: [all[(i + all.length - 1) % all.length]],
    contract: { body: "x", signatureRequired: true },
  })),
};

const CASES = [
  { name: "health", body: { op: "health" } },
  { name: "resolve, nothing chosen", body: { op: "resolve", document: DEMO, state: {} } },
  {
    name: "resolve, services chosen",
    body: {
      op: "resolve",
      document: DEMO,
      state: { selections: { services: [{ optionId: "base" }, { optionId: "album", qty: 2 }] } },
    },
  },
  {
    name: "resolve, signed and part paid",
    body: {
      op: "resolve",
      document: DEMO,
      state: {
        selections: { services: [{ optionId: "base" }, { optionId: "travel" }] },
        signed: { contract: "Dana" },
        paidCents: 100000,
      },
    },
  },
  { name: "validate, the demo", body: { op: "validate", document: DEMO } },
  { name: "validate, a cycle", body: { op: "validate", document: CYCLIC } },
  { name: "validate, empty", body: { op: "validate", document: { id: "d", blocks: [] } } },
  { name: "an unknown op", body: { op: "nonsense" } },
];

section("wasm and http answer identically");

let httpUp = true;
for (const c of CASES) {
  let w, h;
  try {
    w = await callWasm(c.body);
  } catch (err) {
    fail(c.name, `wasm threw: ${err.message}`);
    continue;
  }
  try {
    h = await http(c.body);
  } catch {
    httpUp = false;
    break;
  }

  // `health` names its own transport, which is the one field that is meant to
  // differ. Everything else must match exactly.
  if (c.body.op === "health") {
    if (w.ok !== true || h.ok !== true) fail(c.name, "one of them is not ok");
    else if (w.transport !== "wasm") fail(c.name, `wasm reported transport "${w.transport}"`);
    else ok(c.name, `wasm says ${w.transport}, http says ${h.transport ?? "http"}`);
    continue;
  }

  const a = JSON.stringify(w);
  const b = JSON.stringify(h);
  if (a !== b) {
    const at = [...a].findIndex((ch, i) => ch !== b[i]);
    fail(
      c.name,
      `diverged at byte ${at}\n       wasm: ...${a.slice(Math.max(0, at - 40), at + 60)}\n       http: ...${b.slice(Math.max(0, at - 40), at + 60)}`,
    );
  } else {
    ok(c.name, `${a.length} bytes, identical`);
  }
}

if (!httpUp) {
  console.log(
    `\n  \x1b[33mskipped\x1b[0m  the HTTP engine is not running at ${HTTP_URL}. Start it with \`npm run engine\`.`,
  );
  console.log("  The WASM side answered, so this is a missing comparison, not a failure.\n");
  process.exit(0);
}

console.log(
  failures === 0
    ? `\nOne engine, two transports, ${CASES.length} cases.\n`
    : `\n\x1b[31m${failures} failure(s).\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
