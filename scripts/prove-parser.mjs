// Proves the plain-language parser on a fixed set of briefs, including ones it
// must refuse.
//
//   node scripts/prove-parser.mjs
//   node scripts/prove-parser.mjs --show    # print each derivation in full
//
// The parser has no model behind it, so it is deterministic and can simply be
// asserted. That is most of the argument for building it this way: a spec you
// can check beats a spec you can only sample.
//
// It also runs every produced document through the real Go engine's validator,
// so a brief that parses into an unsatisfiable file fails here rather than in
// front of somebody. That needs the engine running:  npm run engine
const { parseBrief } = await import("../lib/parser.ts");

const show = process.argv.includes("--show");

const ok = (label, detail = "") =>
  console.log(`  \x1b[32mok\x1b[0m ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

let failures = 0;
const fail = (label, detail) => {
  failures++;
  console.error(`  \x1b[31mFAIL\x1b[0m ${label}\n       ${detail}`);
};

/** Blocks in order, as a compact string: "services>contract>invoice". */
const shape = (doc) => (doc ? doc.blocks.map((b) => b.id).join(">") : "(none)");

/** The gating edges, as "invoice<-contract". */
const gates = (doc) =>
  doc
    ? doc.blocks
        .filter((b) => b.requiresComplete?.length)
        .map((b) => `${b.id}<-${b.requiresComplete.join("+")}`)
        .join(" ")
    : "";

const CASES = [
  {
    name: "the canonical brief",
    input: "photography package, two tiers, contract before payment, 50% deposit",
    expect(d) {
      if (!d.document) return "produced no document";
      if (shape(d.document) !== "services>contract>invoice")
        return `shape was ${shape(d.document)}`;
      const inv = d.document.blocks.find((b) => b.id === "invoice");
      if (inv.invoice.depositBps !== 5000) return `deposit was ${inv.invoice.depositBps}bps`;
      if (!inv.requiresComplete?.includes("contract")) return "payment was not gated";
      const svc = d.document.blocks.find((b) => b.id === "services");
      if (svc.services.options.length !== 2)
        return `${svc.services.options.length} options, wanted 2`;
      if (svc.services.mode !== "single") return `mode was ${svc.services.mode}`;
      // "contract before payment" is one statement about ordering, and the
      // derivation has to say so. If the narrow `contract` and `payment` rules
      // claim those words first, the file still comes out right and the
      // explanation is the weaker one, which is a silent regression.
      if (!d.findings.some((f) => f.rule === "gate"))
        return `the ordering phrase produced no gate finding: ${d.findings.map((f) => f.rule).join(",")}`;
      const why = d.edges.find((e) => e.from === "invoice")?.because ?? "";
      if (!/you asked/.test(why)) return `edge reason was "${why}"`;
      return null;
    },
  },
  {
    name: "a signature implies the gate even when nobody asked",
    input: "coaching retainer, $2,400, signed agreement, then they pay",
    expect(d) {
      const inv = d.document?.blocks.find((b) => b.id === "invoice");
      if (!inv) return "no invoice";
      if (!inv.requiresComplete?.includes("contract"))
        return "payment was reachable before the signature";
      const svc = d.document.blocks.find((b) => b.id === "services");
      if (svc.services.options[0].priceCents !== 240000)
        return `price was ${svc.services.options[0].priceCents}`;
      return null;
    },
  },
  {
    name: "all five block kinds",
    input:
      "branding session with add-ons, intake questionnaire, terms to sign before paying, 25% deposit, 17% VAT, then book a call",
    expect(d) {
      if (shape(d.document) !== "services>questionnaire>contract>invoice>scheduler")
        return `shape was ${shape(d.document)}`;
      const inv = d.document.blocks.find((b) => b.id === "invoice");
      if (inv.invoice.depositBps !== 2500) return `deposit ${inv.invoice.depositBps}`;
      if (inv.invoice.taxBps !== 1700) return `tax ${inv.invoice.taxBps}`;
      const svc = d.document.blocks.find((b) => b.id === "services");
      if (svc.services.mode !== "multi") return "add-ons did not make it multi-select";
      return null;
    },
  },
  {
    name: "currency follows the symbol",
    input: "web design package €1,800, contract, pay after signing",
    expect(d) {
      if (d.document?.currency !== "EUR") return `currency was ${d.document?.currency}`;
      return null;
    },
  },
  {
    name: "a bare signature request is a whole file",
    input: "just a contract to sign, nothing else",
    expect(d) {
      if (!d.document) return "produced no document";
      if (!d.document.blocks.some((b) => b.kind === "contract")) return "no contract";
      if (d.document.blocks.some((b) => b.kind === "invoice")) return "invented an invoice";
      return null;
    },
  },
  {
    name: "unrecognised words are reported, not swallowed",
    input: "photography package with underwater welding certification and a contract",
    expect(d) {
      const text = d.unmatched.map((u) => u.text).join(" | ");
      if (!/welding/i.test(text)) return `unmatched was "${text}", expected the welding phrase`;
      return null;
    },
  },
  {
    name: "MUST REFUSE: nothing recognisable",
    input: "asdf qwerty zzz",
    expect(d) {
      if (d.document) return "produced a document from noise";
      if (d.problems.length === 0) return "refused without saying why";
      if (!/recognised/i.test(d.problems[0])) return `unhelpful problem: ${d.problems[0]}`;
      return null;
    },
  },
  {
    name: "MUST REFUSE: an empty brief",
    input: "",
    expect(d) {
      if (d.document) return "produced a document from nothing";
      if (d.problems.length === 0) return "refused silently";
      return null;
    },
  },
];

section("parsing");
const derivations = [];

for (const c of CASES) {
  const d = parseBrief(c.input, { id: "doc_test", business: "Northlight Studio", client: "Dana" });
  derivations.push({ c, d });
  const problem = c.expect(d);
  if (problem) {
    fail(c.name, problem);
  } else {
    ok(c.name, d.document ? `${shape(d.document)}  ${gates(d.document)}` : "refused");
  }

  if (show) {
    console.log(`\n    \x1b[2m"${c.input}"\x1b[0m`);
    for (const f of d.findings) {
      console.log(`      \x1b[36m${f.spans.map((s) => s.text).join(" + ")}\x1b[0m -> ${f.intent} -> ${f.effect}`);
    }
    for (const u of d.unmatched) console.log(`      \x1b[33m?\x1b[0m ${u.text}`);
    for (const p of d.problems) console.log(`      \x1b[33m!\x1b[0m ${p}`);
    console.log("");
  }
}

section("determinism");
{
  const a = JSON.stringify(parseBrief(CASES[0].input));
  const b = JSON.stringify(parseBrief(CASES[0].input));
  if (a !== b) fail("same brief twice", "produced different output");
  else ok("same brief twice", "byte-identical");
}

section("every produced document validates");
{
  const url = process.env.ENGINE_URL ?? "http://127.0.0.1:4310/api/engine";
  let reachable = true;

  for (const { c, d } of derivations) {
    if (!d.document) continue;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "validate", document: d.document }),
      });
    } catch {
      reachable = false;
      break;
    }
    const v = await res.json();
    if (!v.ok) {
      fail(c.name, `engine rejected it: ${v.problems.map((p) => p.code).join(", ")}`);
      continue;
    }
    const warnings = v.problems.filter((p) => p.severity === "warning");
    ok(c.name, warnings.length ? `valid, ${warnings.length} warning(s)` : "valid, no warnings");
  }

  if (!reachable) {
    console.log(
      `  \x1b[33mskipped\x1b[0m  the engine is not running at ${url}. Start it with \`npm run engine\`.`,
    );
  }
}

console.log(
  failures === 0
    ? `\n${CASES.length} briefs, all as specified.\n`
    : `\n\x1b[31m${failures} failure(s).\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
