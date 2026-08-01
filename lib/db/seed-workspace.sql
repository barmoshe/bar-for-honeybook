-- Seeds one workspace's back catalogue.
--
-- The workspace id arrives as a session setting rather than a bind parameter,
-- because this file is several statements and a parameterised query is one.
-- set_config is called with a real bind parameter just before this runs, so
-- nothing is ever interpolated into SQL text. It is also the same mechanism
-- row-level security uses to scope a tenant in production Postgres, so the
-- shape here is not a demo shortcut.
--
-- Runs once, the first time a visitor arrives, so /console has something real
-- to report on before they have done anything themselves. Everything here is
-- fictional. No HoneyBook data, no real business, no implication of any
-- commercial relationship with anyone.
--
-- There is no random() and no setseed in this file. Every varying value is
-- modular arithmetic on the row index, so two workspaces seeded a month apart
-- hold identical data and the EXPLAIN output on /engineering describes a table
-- that will still look the same tomorrow. Determinism by construction beats
-- determinism by a seeded PRNG, because nothing else in the session can
-- disturb it.

-- --------------------------------------------------------------------------
-- 14 past files, spread over roughly seven months, at four different stages.
-- --------------------------------------------------------------------------
WITH cfg AS (
  SELECT
    ARRAY['Dana and Ori','Maya Levin','Tom Aldridge','Noa Barak','The Feldman family',
          'Rin Watanabe','Sofia Marques','Adam Cohen','Priya Nair','Leon Fischer',
          'Hana Kim','Marco Ricci','Yara Haddad','Elise Dupont'] AS clients,
    -- Five real service lines rather than one per file. The base option's id is
    -- derived from this, so /console can rank services against each other; with
    -- a per-file option id every service would be a group of one and the
    -- ranking would be a list of documents wearing a hat.
    ARRAY['svc_wedding','svc_brand','svc_portrait','svc_event','svc_family'] AS service_ids,
    ARRAY['Wedding day coverage','Brand session','Portrait session',
          'Event coverage','Family session'] AS service_names
),
gen AS (
  SELECT
    i,
    current_setting('app.workspace_id') || '-doc-' || i                       AS doc_id,
    -- Tokens are derived rather than random so a reseed is idempotent. They are
    -- unguessable in the sense that matters here, which is that nothing links
    -- one workspace's token to another's.
    md5(current_setting('app.workspace_id') || ':' || i)                      AS token,
    c.clients[1 + (i - 1) % 14]              AS client,
    c.service_ids[1 + (i - 1) % 5]           AS service_id,
    -- The file is named after what it sells. Drawing the title from its own
    -- list produced files called "Elopement coverage" offering a brand session,
    -- which is the kind of detail that quietly tells a reader the data is fake.
    c.service_names[1 + (i - 1) % 5]         AS service_name,
    c.service_names[1 + (i - 1) % 5]         AS title,
    -- Prices land between 1,800 and 4,000 dollars, stepped so the reporting
    -- has a spread to rank rather than fourteen identical rows.
    (180000 + ((i * 37) % 11) * 22000)::bigint AS base_cents,
    -- Stage: 1 sent, 2 services chosen, 3 signed, 4 paid. Five in seven reach
    -- payment, which is roughly what a working funnel looks like.
    CASE WHEN i % 7 = 0 THEN 2 WHEN i % 7 = 1 THEN 3 ELSE 4 END AS stage,
    now() - (((14 - i) * 15 + (i * 7) % 9) || ' days')::interval AS created_at
  FROM generate_series(1, 14) AS i
  CROSS JOIN cfg c
),
priced AS (
  SELECT
    g.*,
    g.base_cents + ((g.base_cents * 1000 + 5000) / 10000) AS total_cents
  FROM gen g
),
withdeposit AS (
  SELECT p.*, ((p.total_cents * 5000 + 5000) / 10000) AS deposit_cents
  FROM priced p
),
inserted AS (
  INSERT INTO documents (id, workspace_id, token, title, business, client, currency, doc, created_at)
  SELECT
    d.doc_id, current_setting('app.workspace_id'), d.token, d.title, 'Northlight Studio', d.client, 'USD',
    jsonb_build_object(
      'id', d.doc_id,
      'title', d.title,
      'business', 'Northlight Studio',
      'client', d.client,
      'currency', 'USD',
      'blocks', jsonb_build_array(
        jsonb_build_object(
          'id', 'services', 'kind', 'services', 'title', 'Your package', 'required', true,
          'services', jsonb_build_object(
            'mode', 'multi',
            'options', jsonb_build_array(
              jsonb_build_object('id', d.service_id, 'name', d.service_name, 'priceCents', d.base_cents,
                                 'blurb', 'The core session, edited and delivered.'),
              jsonb_build_object('id', 'album', 'name', 'Printed album', 'priceCents', 34000,
                                 'blurb', 'Hand-bound, thirty spreads.', 'maxQty', 3),
              jsonb_build_object('id', 'travel', 'name', 'Travel', 'priceCents', 8551,
                                 'blurb', 'Anywhere beyond the metro area.')
            )
          )
        ),
        jsonb_build_object(
          'id', 'contract', 'kind', 'contract', 'title', 'The agreement', 'required', true,
          'requiresComplete', jsonb_build_array('services'),
          'contract', jsonb_build_object(
            'signatureRequired', true,
            'body', '{{business}} will provide {{services}} for {{client}}. ' ||
                    'The total is {{total}}, of which {{deposit}} is due to reserve the date. ' ||
                    'The balance is payable on delivery. Either party may cancel in writing up to 30 days before.'
          )
        ),
        jsonb_build_object(
          'id', 'invoice', 'kind', 'invoice', 'title', 'Payment', 'required', true,
          'requiresComplete', jsonb_build_array('contract'),
          'invoice', jsonb_build_object('depositBps', 5000, 'taxBps', 1000)
        )
      )
    ),
    d.created_at
  FROM withdeposit d
  RETURNING id
)
SELECT count(*) FROM inserted;

-- Everything below re-derives the same values from the rows just written, so
-- the seed cannot drift out of agreement with itself.

-- Stage 2 and up: the client chose a package. The option id is read back out of
-- the document that was just written rather than recomputed, so this cannot
-- disagree with the catalogue it points at.
INSERT INTO selections (workspace_id, document_id, block_id, option_id, qty)
SELECT d.workspace_id, d.id, 'services', d.doc->'blocks'->0->'services'->'options'->0->>'id', 1
FROM documents d
WHERE d.workspace_id = current_setting('app.workspace_id')
  AND (substring(d.id from '[0-9]+$')::int % 7) <> 0;

-- Every third file also took an album, so the service ranking has something
-- other than the base package in it.
INSERT INTO selections (workspace_id, document_id, block_id, option_id, qty)
SELECT d.workspace_id, d.id, 'services', 'album', 1 + (substring(d.id from '[0-9]+$')::int % 2)
FROM documents d
WHERE d.workspace_id = current_setting('app.workspace_id')
  AND (substring(d.id from '[0-9]+$')::int % 7) NOT IN (0)
  AND (substring(d.id from '[0-9]+$')::int % 3) = 0;

-- Stage 3 and up: signed. Not stage 4, so two of these stay signed-but-unpaid,
-- which is a real state a console has to be able to show.
--
-- The delay varies from a few hours to nine days. A fixed offset would make
-- every file take exactly the same time and the median and the 90th percentile
-- on /console would print the same number, which is a tell that a dashboard is
-- reporting a constant rather than a measurement.
INSERT INTO signatures (workspace_id, document_id, block_id, signed_name, signed_at)
SELECT
  d.workspace_id, d.id, 'contract', d.client,
  d.created_at
    + (((substring(d.id from '[0-9]+$')::int * 3) % 9) || ' days')::interval
    + (((substring(d.id from '[0-9]+$')::int * 7) % 23) || ' hours')::interval
    + interval '40 minutes'
FROM documents d
WHERE d.workspace_id = current_setting('app.workspace_id')
  AND (substring(d.id from '[0-9]+$')::int % 7) <> 0;

-- Stage 4: the deposit was captured. Recomputed here from the document's own
-- jsonb rather than carried along, so the ledger agrees with the file even if
-- the price above ever changes.
INSERT INTO payment_events
  (workspace_id, document_id, idempotency_key, kind, amount_cents, occurred_at, received_at)
SELECT
  d.workspace_id, d.id, d.id || ':deposit', 'captured',
  ((line.total * 5000 + 5000) / 10000),
  g.signed_at + interval '11 minutes',
  g.signed_at + interval '11 minutes'
FROM documents d
JOIN signatures g ON g.document_id = d.id
CROSS JOIN LATERAL (
  SELECT (
    SELECT COALESCE(SUM((opt->>'priceCents')::bigint * s.qty), 0)
    FROM selections s
    JOIN LATERAL jsonb_array_elements(d.doc->'blocks'->0->'services'->'options') opt
      ON opt->>'id' = s.option_id
    WHERE s.document_id = d.id
  ) AS subtotal
) sub
CROSS JOIN LATERAL (
  SELECT sub.subtotal + ((sub.subtotal * 1000 + 5000) / 10000) AS total
) line
WHERE d.workspace_id = current_setting('app.workspace_id')
  AND (substring(d.id from '[0-9]+$')::int % 7) NOT IN (0, 1);

-- Four of the paid files also settled the balance, so the running-total column
-- on /console has more than one payment per file to accumulate.
INSERT INTO payment_events
  (workspace_id, document_id, idempotency_key, kind, amount_cents, occurred_at, received_at)
SELECT
  p.workspace_id, p.document_id, p.document_id || ':balance', 'captured',
  p.amount_cents,
  p.occurred_at + interval '38 days',
  p.occurred_at + interval '38 days'
FROM payment_events p
WHERE p.workspace_id = current_setting('app.workspace_id')
  AND p.idempotency_key LIKE '%:deposit'
  AND (substring(p.document_id from '[0-9]+$')::int % 4) = 0
  -- Only for files old enough that the balance has genuinely come due. Without
  -- this the newest file settles 38 days from now and the revenue chart shows
  -- income in a month that has not happened yet.
  AND p.occurred_at + interval '38 days' <= now();

-- --------------------------------------------------------------------------
-- The timeline, derived from the state above so it can never describe
-- something that did not happen.
-- --------------------------------------------------------------------------

INSERT INTO document_events (workspace_id, document_id, block_id, kind, detail, at)
SELECT d.workspace_id, d.id, NULL, 'created', jsonb_build_object('title', d.title), d.created_at
FROM documents d WHERE d.workspace_id = current_setting('app.workspace_id');

INSERT INTO document_events (workspace_id, document_id, block_id, kind, detail, at)
SELECT d.workspace_id, d.id, NULL, 'opened', '{}'::jsonb, d.created_at + interval '5 hours'
FROM documents d WHERE d.workspace_id = current_setting('app.workspace_id');

INSERT INTO document_events (workspace_id, document_id, block_id, kind, detail, at)
SELECT s.workspace_id, s.document_id, 'services', 'selected',
       jsonb_build_object('optionId', s.option_id, 'qty', s.qty),
       d.created_at + interval '6 hours'
FROM selections s JOIN documents d ON d.id = s.document_id
WHERE s.workspace_id = current_setting('app.workspace_id');

INSERT INTO document_events (workspace_id, document_id, block_id, kind, detail, at)
SELECT g.workspace_id, g.document_id, 'contract', 'signed',
       jsonb_build_object('name', g.signed_name), g.signed_at
FROM signatures g WHERE g.workspace_id = current_setting('app.workspace_id');

INSERT INTO document_events (workspace_id, document_id, block_id, kind, detail, at)
SELECT p.workspace_id, p.document_id, 'invoice', 'paid',
       jsonb_build_object('amountCents', p.amount_cents), p.occurred_at
FROM payment_events p WHERE p.workspace_id = current_setting('app.workspace_id') AND p.kind = 'captured';

-- Statistics matter. Without ANALYZE the planner works from defaults, and every
-- EXPLAIN shown on /engineering would be describing a table it never measured.
ANALYZE;
