// Proves the schema, the seed and every hand-written query actually run,
// outside Next, before any page depends on them.
//
//   node scripts/prove-db.mjs
//   node scripts/prove-db.mjs --explain    # also dump query plans
//
// It imports lib/db/queries.ts directly rather than restating its SQL, so this
// cannot drift from what the app runs. Node executes the TypeScript as-is.
//
// This is a tool, not a test. The engine has tests; the database has this,
// because what it checks is "does Postgres accept this", which is a question
// only Postgres can answer. It runs against a throwaway in-memory database, so
// it can never touch local state.
process.env.PGLITE_DATA_DIR = "memory://";

const { ensureWorkspace, query, explain } = await import("../lib/db/client.ts");
const q = await import("../lib/db/queries.ts");

const WORKSPACE = "ws_prove";
const showPlans = process.argv.includes("--explain");

const ok = (label, detail = "") =>
  console.log(`  \x1b[32mok\x1b[0m ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const fail = (msg) => {
  console.error(`\n\x1b[31mFAILED\x1b[0m ${msg}\n`);
  process.exit(1);
};

section("schema + seed");
const t0 = performance.now();
const { seeded } = await ensureWorkspace(WORKSPACE);
const seedMs = performance.now() - t0;
if (!seeded) fail("workspace already existed in a fresh in-memory database");
ok("workspace seeded", `${seedMs.toFixed(0)}ms`);

for (const table of ["documents", "selections", "signatures", "payment_events", "document_events"]) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM ${table}`);
  ok(table, `${rows[0].n} rows`);
}

// Seeding twice must be a no-op, because a warm instance serving a returning
// visitor calls this on every request.
const again = await ensureWorkspace(WORKSPACE);
if (again.seeded) fail("re-seeded an existing workspace");
ok("re-entry is a no-op");

section("documents");
const summaries = await q.documentSummaries(WORKSPACE);
ok("summaries", `${summaries.rows.length} files`);
const stages = summaries.rows.reduce((acc, r) => ({ ...acc, [r.stage]: (acc[r.stage] ?? 0) + 1 }), {});
ok("stages", JSON.stringify(stages));
if (!summaries.rows.some((r) => r.stage === "paid")) fail("no file reached paid");

const first = summaries.rows[0];
const byToken = await q.documentByToken(first.token);
if (!byToken || byToken.id !== first.id) fail("token lookup missed");
ok("token lookup", first.token.slice(0, 12) + "...");
if (!Array.isArray(byToken.doc.blocks) || byToken.doc.blocks.length !== 3) {
  fail("document jsonb did not round-trip as a block tree");
}
ok("jsonb round-trips as a document", `${byToken.doc.blocks.length} blocks`);

section("client state");
const paid = summaries.rows.find((r) => r.stage === "paid");
const state = await q.clientState(paid.id);
ok("gathered", JSON.stringify({
  selections: Object.keys(state.selections).length,
  signed: Object.keys(state.signed).length,
  paidCents: state.paidCents,
}));
if (state.paidCents <= 0) fail("a paid file reported nothing paid");

section("ledger");
const before = state.paidCents;
const replay = await q.capturePayment(WORKSPACE, paid.id, `${paid.id}:deposit`, 999999);
if (replay.applied) fail("a replayed idempotency key was applied twice");
const afterReplay = await q.clientState(paid.id);
if (afterReplay.paidCents !== before) fail("a replayed payment moved the balance");
ok("replay changed nothing", `${before} cents before and after`);

// Out of order: happened ten days ago, arrived now. A SUM does not care.
const late = await q.capturePayment(
  WORKSPACE, paid.id, `${paid.id}:late`, 1000,
  new Date(Date.now() - 10 * 864e5),
);
if (!late.applied) fail("a genuinely new payment was rejected");
const afterLate = await q.clientState(paid.id);
if (afterLate.paidCents !== before + 1000) fail("a late payment did not land on the total");
ok("late payment landed", `${before} -> ${afterLate.paidCents}`);

const entries = await q.ledger(paid.id);
const flagged = entries.rows.filter((r) => r.out_of_order).length;
ok("ledger with running total", `${entries.rows.length} entries, ${flagged} flagged out of order`);
const running = entries.rows.map((r) => Number(r.running_cents));
if (running.some((v, i) => i > 0 && v < running[i - 1])) fail("running total went backwards");
ok("running total is monotonic");

section("reporting");
const revenue = await q.monthlyRevenue(WORKSPACE);
ok("monthly revenue", `${revenue.rows.length} months`);
if (revenue.rows[0].prev_cents !== null) fail("the first month reported a previous month");
ok("first month has no period-over-period", "NULL, not a divide by zero");

const ranking = await q.serviceRanking(WORKSPACE);
ok("service ranking", ranking.rows.map((r) => `${r.rank}. ${r.name}`).join(", "));
const shares = ranking.rows.reduce((n, r) => n + Number(r.share_bps), 0);
if (Math.abs(shares - 10000) > ranking.rows.length) fail(`shares summed to ${shares}bps`);
ok("shares sum to 100 percent", `${shares}bps`);

const steps = await q.funnel(WORKSPACE);
ok("funnel", steps.rows.map((s) => `${s.step} ${s.n}`).join(" -> "));
const counts = steps.rows.map((s) => Number(s.n));
if (counts.some((v, i) => i > 0 && v > counts[i - 1])) fail("the funnel widened at some step");
ok("funnel never widens");

const tts = await q.timeToSign(WORKSPACE);
ok("time to sign", `median ${tts.median_hours}h, p90 ${tts.p90_hours}h, n=${tts.n}`);

const tl = await q.timeline(paid.id);
ok("timeline", `${tl.rows.length} events, first gap ${tl.rows[1]?.gap_seconds ?? "n/a"}s`);
if (tl.rows[0].gap_seconds !== null) fail("the first event reported a gap from nothing");
ok("first event has no gap");

if (showPlans) {
  section("plans");
  const plan = await explain(
    `SELECT d.id, d.title FROM documents d WHERE d.workspace_id = $1 ORDER BY d.created_at DESC LIMIT 50`,
    [WORKSPACE],
  );
  for (const line of plan) console.log("   " + line);
}

console.log(
  `\nschema and seed cost ${seedMs.toFixed(0)}ms, well inside the 10s function ceiling.\n`,
);
process.exit(0);
