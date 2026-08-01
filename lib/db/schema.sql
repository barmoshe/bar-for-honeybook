-- Relational model behind the smart-file demo.
--
-- The split is deliberate. A smart file's *definition* is a document: an
-- ordered tree of blocks whose shape the Go engine owns. Shredding that into
-- tables would buy nothing and cost the ability to change a block type without
-- a migration, so it lives in one jsonb column and the engine stays the only
-- thing that understands it.
--
-- Everything a client *does* is relational, because that is what gets queried:
-- selections, signatures, answers, bookings, an append-only payment ledger, and
-- an append-only event timeline. The reporting on /console runs over those, and
-- that is where the SQL earns its keep.
--
-- Every table is scoped by workspace_id. Each visitor gets their own workspace
-- on first arrival, so nobody ever opens the demo and finds a stranger's signed
-- contract. It is also the honest model: the product this imitates is
-- multi-tenant, so the demo is too.

CREATE TABLE IF NOT EXISTS workspaces (
  id           text PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id           text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- The client link. Unguessable, and the only credential the client side has:
  -- there is no login on a smart file, which is the point of the format.
  token        text NOT NULL UNIQUE,
  title        text NOT NULL,
  business     text NOT NULL,
  client       text NOT NULL,
  currency     text NOT NULL DEFAULT 'USD',
  -- The block tree. Opaque here, authoritative in the engine.
  doc          jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- The console lists a workspace's files newest first, which is the whole
-- access pattern, so index exactly that.
CREATE INDEX IF NOT EXISTS ix_documents_workspace
  ON documents (workspace_id, created_at DESC);

-- --------------------------------------------------------------------------
-- Client state. Reassembled into the engine's State on every read, which is a
-- four-table gather; see queries.ts.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS selections (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id     text NOT NULL,
  option_id    text NOT NULL,
  qty          integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  PRIMARY KEY (document_id, block_id, option_id)
);

CREATE TABLE IF NOT EXISTS signatures (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id     text NOT NULL,
  signed_name  text NOT NULL,
  signed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, block_id)
);

CREATE TABLE IF NOT EXISTS answers (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id     text NOT NULL,
  question_id  text NOT NULL,
  answer       text NOT NULL,
  PRIMARY KEY (document_id, block_id, question_id)
);

CREATE TABLE IF NOT EXISTS bookings (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id     text NOT NULL,
  slot_id      text NOT NULL,
  booked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, block_id)
);

-- --------------------------------------------------------------------------
-- The ledger. Append-only, and the only thing allowed to decide what was paid.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_events (
  id              bigserial PRIMARY KEY,
  workspace_id    text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id     text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  -- The gateway's key for this attempt. The unique constraint below is the
  -- entire idempotency mechanism: a webhook delivered twice loses the race on
  -- the second insert and changes nothing. No read-then-write, no lock, no
  -- window in which two workers can both decide they are the first.
  idempotency_key text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('captured', 'failed', 'refunded')),
  amount_cents    bigint NOT NULL,
  -- occurred_at is when the gateway says it happened; received_at is when we
  -- heard. They differ when events arrive out of order, which is why the
  -- balance is a SUM over this table and never a column someone updates:
  -- addition does not care what order it is done in.
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  received_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ix_payments_document
  ON payment_events (document_id, occurred_at);

-- --------------------------------------------------------------------------
-- The timeline. Append-only, and the reason the console can answer "what
-- happened and when" without a separate audit system.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_events (
  id           bigserial PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  block_id     text,
  kind         text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_events_document
  ON document_events (document_id, at DESC);

-- The console's activity feed spans a whole workspace rather than one file, so
-- it needs its own leading column. Two indexes on one table is a cost worth
-- naming: writes here are one row per client action, so it is cheap.
CREATE INDEX IF NOT EXISTS ix_events_workspace
  ON document_events (workspace_id, at DESC);

-- --------------------------------------------------------------------------
-- Automations: triggers, actions, waits and conditions.
--
-- The definition is a document, for the same reason a smart file's is: it is a
-- sequence whose shape the Go engine owns, and shredding it into a step table
-- would buy nothing and cost a migration every time a step kind is added.
--
-- What is relational is the part that gets queried and the part that must not
-- be lost: which runs exist, where each one is, when it should wake, and what
-- it did.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS automations (
  id           text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  -- The document event that starts a run. Every value already exists in
  -- document_events, so automations needed no new event plumbing.
  trigger_kind text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  definition   jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_automations_trigger
  ON automations (workspace_id, trigger_kind) WHERE enabled;

CREATE TABLE IF NOT EXISTS automation_runs (
  id            bigserial PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id text NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  document_id   text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('waiting', 'done', 'stopped')),
  cursor        integer NOT NULL DEFAULT 0,
  -- When this run should next be looked at. NULL once it is finished.
  resume_at     timestamptz,
  attempts      integer NOT NULL DEFAULT 0,
  last_error    text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- One automation starts one run per file. This is the whole guard against a
  -- trigger that fires twice, and it is a constraint rather than a check in
  -- application code for the same reason the ledger's key is.
  UNIQUE (automation_id, document_id)
);

-- The queue's only access pattern: what is due. Partial, because finished runs
-- are the overwhelming majority and none of them are ever due again.
CREATE INDEX IF NOT EXISTS ix_runs_due
  ON automation_runs (resume_at) WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS ix_runs_workspace
  ON automation_runs (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS automation_log (
  id          bigserial PRIMARY KEY,
  run_id      bigint NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  step_index  integer,
  kind        text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_automation_log_run
  ON automation_log (run_id, id);

-- Simulated sends. Nothing leaves the building: an outbox row is what "we
-- emailed them" means here, and saying so is better than pretending otherwise.
CREATE TABLE IF NOT EXISTS outbox (
  id           bigserial PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id  text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  run_id       bigint REFERENCES automation_runs(id) ON DELETE CASCADE,
  channel      text NOT NULL DEFAULT 'email',
  subject      text NOT NULL,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_outbox_workspace
  ON outbox (workspace_id, created_at DESC);
