// Proves the gate: the claim the whole demo rests on.
//
//   npm run prove:actions
//
// "The invoice is unreachable until the contract is signed" is enforced in
// exactly one place, lib/clientflow.ts, which asks the engine before it writes.
// Everything else in this repo had a test and that did not, which is backwards:
// the engine's 43 cases protect a pure function, and this protects the boundary
// where a stranger with a link meets the database.
//
// These are not unit tests of the rules. They call the real functions the
// server actions call, against a real embedded Postgres, and then check the
// ledger and the tables rather than the return value. A gate that returns
// "refused" and writes the row anyway would pass a weaker test than this one.
//
// Needs the engine running:  npm run engine
process.env.PGLITE_DATA_DIR = "memory://";

const { ensureWorkspace, query } = await import("../lib/db/client.ts");
const db = await import("../lib/db/queries.ts");
const flow = await import("../lib/clientflow.ts");

const WORKSPACE = "ws_actions";

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

/** Counts rows, so a refusal can be checked against the database and not a string. */
async function count(table, documentId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM ${table} WHERE document_id = $1`,
    [documentId],
  );
  return rows[0].n;
}

async function paid(documentId) {
  return (await db.clientState(documentId)).paidCents ?? 0;
}

// ---------------------------------------------------------------------------

await ensureWorkspace(WORKSPACE);
const files = await db.documentSummaries(WORKSPACE);

// An untouched file, so the walk starts where a real client would.
const fresh = files.rows.filter((f) => f.stage === "sent" || f.stage === "opened").at(-1);
if (!fresh) {
  console.error("No untouched file in the seeded workspace to drive.");
  process.exit(1);
}
const token = fresh.token;
const id = fresh.id;
const doc = await db.documentByToken(token);
const [servicesBlock, contractBlock, invoiceBlock] = doc.doc.blocks.map((b) => b.id);
const firstOption = doc.doc.blocks[0].services.options[0].id;

console.log(`\n\x1b[2mdriving ${fresh.title} (${id})\x1b[0m`);

// ---------------------------------------------------------------------------
section("the gate refuses, and writes nothing");
// ---------------------------------------------------------------------------

{
  const before = await count("payment_events", id);
  const res = await flow.payNow(token, invoiceBlock);
  const after = await count("payment_events", id);

  check(
    "paying before anything is chosen is refused",
    res.ok ? "it was allowed" : after !== before ? `wrote ${after - before} ledger row(s) anyway` : null,
    res.ok ? "" : res.error,
  );
}

{
  const res = await flow.signContract(token, contractBlock, "Dana");
  const signed = await count("signatures", id);
  check(
    "signing before choosing is refused",
    res.ok ? "it was allowed" : signed !== 0 ? "wrote a signature anyway" : null,
    res.ok ? "" : res.error,
  );
}

// ---------------------------------------------------------------------------
section("the walk, in order");
// ---------------------------------------------------------------------------

{
  const res = await flow.toggleService(token, servicesBlock, firstOption, 1);
  check("choose a service", res.ok ? null : res.error, firstOption);
}

{
  // The contract is open now, but the invoice must not be.
  const before = await count("payment_events", id);
  const res = await flow.payNow(token, invoiceBlock);
  const after = await count("payment_events", id);
  check(
    "paying after choosing but before signing is still refused",
    res.ok ? "it was allowed" : after !== before ? "wrote a ledger row anyway" : null,
    res.ok ? "" : res.error,
  );
}

{
  const res = await flow.signContract(token, contractBlock, "Dana Levin");
  check("sign", res.ok ? null : res.error);
}

{
  const res = await flow.payNow(token, invoiceBlock);
  const balance = await paid(id);
  const rows = await count("payment_events", id);
  check(
    "pay, now that it is open",
    !res.ok ? res.error : balance <= 0 ? "balance did not move" : rows !== 1 ? `${rows} ledger rows` : null,
    `${balance} cents, ${rows} row`,
  );
}

// ---------------------------------------------------------------------------
section("nothing happens twice");
// ---------------------------------------------------------------------------

{
  const before = await paid(id);
  const rowsBefore = await count("payment_events", id);
  const res = await flow.payNow(token, invoiceBlock);
  const after = await paid(id);
  const rowsAfter = await count("payment_events", id);

  // The deposit is settled, so the balance is what is due next and this is a
  // genuinely different payment. What must not happen is the *same* one twice.
  check(
    "paying again does not replay the settled deposit",
    rowsAfter > rowsBefore + 1 ? `wrote ${rowsAfter - rowsBefore} rows` : null,
    res.ok ? `${before} -> ${after} cents` : res.error,
  );
}

{
  // The scenario the key was designed for: two clicks close enough together
  // that neither has seen the other's write. Both compute the same "moves from"
  // balance, so both produce the same key, and the unique index picks one.
  //
  // Sequential calls cannot test this, because by the second one the balance has
  // genuinely moved and a different key is the correct answer.
  const race = {
    id: `${WORKSPACE}-race`,
    title: "Race",
    business: "Northlight Studio",
    client: "Dana",
    currency: "USD",
    blocks: [
      {
        id: "svc",
        kind: "services",
        title: "Package",
        required: true,
        services: { mode: "multi", options: [{ id: "one", name: "One", priceCents: 100000 }] },
      },
      {
        id: "inv",
        kind: "invoice",
        title: "Payment",
        required: true,
        requiresComplete: ["svc"],
        invoice: { depositBps: 5000, taxBps: 0 },
      },
    ],
  };
  const raceToken = "tok_double_click";
  await db.insertDocument(WORKSPACE, race, raceToken);
  await flow.toggleService(raceToken, "svc", "one", 1);

  await Promise.all([flow.payNow(raceToken, "inv"), flow.payNow(raceToken, "inv")]);

  const rows = await count("payment_events", race.id);
  const balance = await paid(race.id);
  check(
    "two simultaneous clicks charge once",
    rows !== 1 ? `${rows} ledger rows` : balance !== 50000 ? `balance ${balance}, wanted 50000` : null,
    `1 row, ${balance} cents`,
  );
}

{
  const { rows } = await query(
    `SELECT count(*)::int AS n, count(DISTINCT idempotency_key)::int AS keys
       FROM payment_events WHERE document_id = $1`,
    [id],
  );
  check(
    "every ledger row has its own idempotency key",
    rows[0].n !== rows[0].keys ? `${rows[0].n} rows, ${rows[0].keys} keys` : null,
    `${rows[0].n} rows, ${rows[0].keys} keys`,
  );
}

{
  const { rows: was } = await query(
    `SELECT signed_at FROM signatures WHERE document_id = $1 AND block_id = $2`,
    [id, contractBlock],
  );
  const res = await flow.signContract(token, contractBlock, "Someone Else");
  const { rows: now } = await query(
    `SELECT signed_name, signed_at FROM signatures WHERE document_id = $1 AND block_id = $2`,
    [id, contractBlock],
  );

  check(
    "signing twice is refused and does not move the timestamp",
    res.ok
      ? "the second signature was accepted"
      : String(was[0].signed_at) !== String(now[0].signed_at)
        ? "signed_at moved"
        : now[0].signed_name === "Someone Else"
          ? "the name was overwritten"
          : null,
    `still ${now[0].signed_name}`,
  );
}

// ---------------------------------------------------------------------------
section("the other refusals");
// ---------------------------------------------------------------------------

{
  const res = await flow.payNow("not-a-real-token", invoiceBlock);
  check("an unknown token is refused", res.ok ? "it was allowed" : null, res.ok ? "" : res.error);
}

{
  const res = await flow.payNow(token, servicesBlock);
  check(
    "paying a block that is not an invoice is refused",
    res.ok ? "it was allowed" : null,
    res.ok ? "" : res.error,
  );
}

{
  const res = await flow.signContract(token, contractBlock, " D ");
  check("a one-character signature is refused", res.ok ? "it was allowed" : null, res.ok ? "" : res.error);
}

{
  const res = await flow.toggleService(token, "ghost-block", firstOption, 1);
  check("a block that is not in the file is refused", res.ok ? "it was allowed" : null, res.ok ? "" : res.error);
}

// ---------------------------------------------------------------------------
section("single-select never accumulates");
// ---------------------------------------------------------------------------

{
  const single = {
    id: `${WORKSPACE}-single`,
    title: "Tiers",
    business: "Northlight Studio",
    client: "Dana",
    currency: "USD",
    blocks: [
      {
        id: "tier",
        kind: "services",
        title: "Pick a tier",
        required: true,
        services: {
          mode: "single",
          options: [
            { id: "silver", name: "Silver", priceCents: 50000 },
            { id: "gold", name: "Gold", priceCents: 90000 },
          ],
        },
      },
    ],
  };
  const singleToken = "tok_single_select";
  await db.insertDocument(WORKSPACE, single, singleToken);

  await flow.toggleService(singleToken, "tier", "silver", 1);
  await flow.toggleService(singleToken, "tier", "gold", 1);

  const rows = await count("selections", single.id);
  const state = await db.clientState(single.id);
  const chosen = state.selections?.tier ?? [];

  check(
    "choosing a second tier replaces the first",
    rows !== 1 ? `${rows} selection rows` : chosen[0]?.optionId !== "gold" ? `kept ${chosen[0]?.optionId}` : null,
    `1 row, ${chosen[0]?.optionId}`,
  );
}

console.log(
  failures === 0
    ? `\nThe gate holds.\n`
    : `\n\x1b[31m${failures} failure(s).\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
