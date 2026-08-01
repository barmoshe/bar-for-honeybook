// Proves the automation runner: enqueue, claim, advance, park, resume.
//
//   npm run prove:automations
//
// The engine's own step logic is tested in Go. What this checks is the half
// that cannot be pure: that a trigger starts exactly one run, that a run parks
// with a resume time and is not picked up early, that advancing the clock
// resumes it, that a condition can stop it, and that the actions actually
// landed in the outbox and the log.
//
// Time is a parameter throughout, so a three-day wait is tested in a
// millisecond by the same mechanism the page's "advance the clock" control
// uses. Neither is a simulation of the other.
process.env.PGLITE_DATA_DIR = "memory://";

const { ensureWorkspace, query } = await import("../lib/db/client.ts");
const db = await import("../lib/db/queries.ts");
const flow = await import("../lib/clientflow.ts");
const auto = await import("../lib/automations.ts");

const WORKSPACE = "ws_automations";
const DAY = 24 * 60 * 60 * 1000;

const ok = (label, detail = "") =>
  console.log(`  \x1b[32mok\x1b[0m ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

let failures = 0;
const fail = (label, detail) => {
  failures++;
  console.error(`  \x1b[31mFAIL\x1b[0m ${label}\n       ${detail}`);
};
const check = (label, problem, detail = "") =>
  problem ? fail(label, problem) : ok(label, detail);

async function runFor(documentId) {
  const { rows } = await query(
    `SELECT id::text, status, cursor, resume_at FROM automation_runs WHERE document_id = $1`,
    [documentId],
  );
  return rows[0];
}

async function outboxFor(documentId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM outbox WHERE document_id = $1`,
    [documentId],
  );
  return rows[0].n;
}

// ---------------------------------------------------------------------------

await ensureWorkspace(WORKSPACE);

const files = await db.documentSummaries(WORKSPACE);
const fresh = files.rows.filter((f) => f.stage === "sent" || f.stage === "opened");
if (fresh.length < 2) {
  console.error("Need two untouched files to drive both paths.");
  process.exit(1);
}

const autos = await auto.listAutomations(WORKSPACE);
check(
  "the workspace seeds with an automation",
  autos.rows.length !== 1 ? `${autos.rows.length} automations` : null,
  autos.rows[0]?.name,
);

// ---------------------------------------------------------------------------
section("a trigger starts exactly one run");
// ---------------------------------------------------------------------------

const unpaid = fresh.at(-1);
const unpaidDoc = await db.documentByToken(unpaid.token);
const [svc, contract] = unpaidDoc.doc.blocks.map((b) => b.id);
const option = unpaidDoc.doc.blocks[0].services.options[0].id;

await flow.toggleService(unpaid.token, svc, option, 1);
await flow.signContract(unpaid.token, contract, "Dana Levin");

{
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM automation_runs WHERE document_id = $1`,
    [unpaid.id],
  );
  check("signing started a run", rows[0].n !== 1 ? `${rows[0].n} runs` : null, "1 run");
}

{
  // Enqueueing again is what a replayed event looks like. The unique index, not
  // a check in application code, is what makes it a no-op.
  const again = await auto.enqueue(WORKSPACE, unpaid.id, "signed");
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM automation_runs WHERE document_id = $1`,
    [unpaid.id],
  );
  check(
    "a repeated trigger does not start a second run",
    again.started !== 0 || rows[0].n !== 1 ? `started ${again.started}, now ${rows[0].n}` : null,
    "still 1 run",
  );
}

// ---------------------------------------------------------------------------
section("the run parks on its wait");
// ---------------------------------------------------------------------------

const t0 = new Date();

{
  const result = await auto.tick(WORKSPACE, t0);
  const run = await runFor(unpaid.id);
  const sent = await outboxFor(unpaid.id);

  check(
    "the first tick sends the thank-you and parks",
    run.status !== "waiting"
      ? `status ${run.status}`
      : sent !== 1
        ? `${sent} outbox rows, wanted 1`
        : run.cursor !== 2
          ? `cursor ${run.cursor}, wanted 2 (past the wait)`
          : null,
    `${result.advanced} advanced, ${sent} sent, resumes ${String(run.resume_at).slice(0, 16)}`,
  );
}

{
  // One hour later is not three days later. A queue that ignores resume_at is a
  // queue that emails everyone immediately.
  const early = await auto.tick(WORKSPACE, new Date(t0.getTime() + 60 * 60 * 1000));
  const sent = await outboxFor(unpaid.id);
  check(
    "ticking before it is due does nothing",
    early.claimed !== 0 ? `claimed ${early.claimed}` : sent !== 1 ? `${sent} outbox rows` : null,
    "claimed 0",
  );
}

// ---------------------------------------------------------------------------
section("advancing the clock resumes it");
// ---------------------------------------------------------------------------

{
  const later = await auto.tick(WORKSPACE, new Date(t0.getTime() + 4 * DAY));
  const run = await runFor(unpaid.id);
  const sent = await outboxFor(unpaid.id);

  check(
    "four days on, the unpaid client is chased",
    run.status !== "done"
      ? `status ${run.status}`
      : sent !== 2
        ? `${sent} outbox rows, wanted 2`
        : null,
    `${later.actions} actions, ${sent} sent, run ${run.status}`,
  );

  const log = await auto.runLog(run.id);
  const kinds = log.rows.map((r) => r.kind).join(" ");
  check(
    "the log records every step",
    !/started/.test(kinds) || !/email/.test(kinds) || !/task/.test(kinds) || !/stage/.test(kinds)
      ? kinds
      : null,
    kinds,
  );
}

// ---------------------------------------------------------------------------
section("a client who paid is not chased");
// ---------------------------------------------------------------------------

{
  const paidFile = fresh.at(-2);
  const paidDoc = await db.documentByToken(paidFile.token);
  const [pSvc, pContract, pInvoice] = paidDoc.doc.blocks.map((b) => b.id);
  const pOption = paidDoc.doc.blocks[0].services.options[0].id;

  await flow.toggleService(paidFile.token, pSvc, pOption, 1);
  await flow.signContract(paidFile.token, pContract, "Tom Aldridge");

  const start = new Date();
  await auto.tick(WORKSPACE, start);
  const afterFirst = await outboxFor(paidFile.id);

  // They pay during the wait, which is the whole point of the condition.
  await flow.payNow(paidFile.token, pInvoice);

  await auto.tick(WORKSPACE, new Date(start.getTime() + 4 * DAY));
  const run = await runFor(paidFile.id);
  const sent = await outboxFor(paidFile.id);

  check(
    "the run stops instead of chasing",
    run.status !== "stopped"
      ? `status ${run.status}`
      : sent !== afterFirst
        ? `sent ${sent}, wanted ${afterFirst}: it chased a client who had paid`
        : null,
    `stopped, ${sent} email(s) total`,
  );

  const log = await auto.runLog(run.id);
  const stopped = log.rows.find((r) => r.kind === "stopped");
  check(
    "and says why in the log",
    !stopped ? "no stopped entry" : !stopped.detail?.note ? "no reason" : null,
    stopped?.detail?.note ?? "",
  );
}

// ---------------------------------------------------------------------------
section("the queue");
// ---------------------------------------------------------------------------

{
  // FOR UPDATE SKIP LOCKED is the claim, and the point is that it is a real
  // Postgres queue rather than a scan. What is checkable here is that a
  // finished run is never claimed again.
  const before = await auto.tick(WORKSPACE, new Date(Date.now() + 30 * DAY));
  const after = await auto.tick(WORKSPACE, new Date(Date.now() + 60 * DAY));
  check(
    "finished runs are never claimed again",
    before.claimed !== 0 || after.claimed !== 0
      ? `claimed ${before.claimed} then ${after.claimed}`
      : null,
    "claimed 0, twice",
  );
}

{
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM automation_runs WHERE status = 'waiting' AND resume_at IS NULL`,
  );
  check(
    "no run is waiting without a time to wake up",
    rows[0].n !== 0 ? `${rows[0].n} runs` : null,
  );
}

console.log(
  failures === 0
    ? `\nTriggers fire once, waits are real, conditions stop.\n`
    : `\n\x1b[31m${failures} failure(s).\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
