// Package engine is the rules half of the smart-file demo.
//
// It is deliberately pure: no database, no network, no clock, no environment.
// Everything it needs arrives as an argument and everything it decides comes
// back as a value. That is what makes it testable in the way the tests in this
// package are testable, and it is why the same code can answer an HTTP request
// on Vercel and run in `go test` with nothing stubbed.
//
// The split it enforces: this package owns *what is allowed*, and the Next.js
// side owns *what happened*. Rules are a pure function, state is Postgres.
package engine

// BlockKind enumerates the block types a smart file can be composed from.
// These mirror the composable pieces of the format the demo is modelled on:
// a file can be a single signature request or an entire onboarding flow,
// depending on which of these you stack and in what order.
type BlockKind string

const (
	KindServices      BlockKind = "services"
	KindContract      BlockKind = "contract"
	KindInvoice       BlockKind = "invoice"
	KindQuestionnaire BlockKind = "questionnaire"
	KindScheduler     BlockKind = "scheduler"
)

// Document is a smart file: an ordered list of blocks plus the gating rules
// between them. Order is meaningful. A client walks the blocks top to bottom,
// which is why Validate rejects a dependency that points forward.
type Document struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Business string  `json:"business"`
	Client   string  `json:"client"`
	Currency string  `json:"currency"`
	Blocks   []Block `json:"blocks"`
}

// Block is one step in the file. Exactly one of the kind-specific pointers is
// expected to be set, matching Kind; Validate reports it when that is not true
// rather than panicking later in Resolve.
type Block struct {
	ID    string    `json:"id"`
	Kind  BlockKind `json:"kind"`
	Title string    `json:"title"`

	// Required marks a block the client cannot skip. An optional block never
	// blocks anything downstream even if something names it in RequiresComplete.
	Required bool `json:"required"`

	// RequiresComplete is the gating edge set: this block stays locked until
	// every block named here is complete. This is the mechanism behind the
	// rule the whole demo hangs on, "the invoice is unreachable until the
	// contract is signed", and it is general rather than special-cased.
	RequiresComplete []string `json:"requiresComplete,omitempty"`

	Services      *ServicesBlock      `json:"services,omitempty"`
	Contract      *ContractBlock      `json:"contract,omitempty"`
	Invoice       *InvoiceBlock       `json:"invoice,omitempty"`
	Questionnaire *QuestionnaireBlock `json:"questionnaire,omitempty"`
	Scheduler     *SchedulerBlock     `json:"scheduler,omitempty"`
}

// SelectionMode controls how many options a services block accepts.
type SelectionMode string

const (
	SelectOne  SelectionMode = "single"
	SelectMany SelectionMode = "multi"
)

type ServicesBlock struct {
	Mode    SelectionMode   `json:"mode"`
	Options []ServiceOption `json:"options"`
}

type ServiceOption struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Blurb      string `json:"blurb,omitempty"`
	PriceCents int64  `json:"priceCents"`
	// MaxQty caps how many of this option a client can take. Zero means one.
	MaxQty int `json:"maxQty,omitempty"`
}

type ContractBlock struct {
	// Body is prose with {{token}} placeholders. Resolve interpolates them from
	// the live totals and selections, so a contract cannot drift from the
	// invoice it sits next to. Validate reports tokens nothing provides.
	Body              string `json:"body"`
	SignatureRequired bool   `json:"signatureRequired"`
}

type InvoiceBlock struct {
	// DepositBps is the share due up front, in basis points. 0 means the whole
	// balance is due; 5000 means half. Basis points rather than a float keeps
	// every number in this package an integer.
	DepositBps int `json:"depositBps"`
	TaxBps     int `json:"taxBps"`
}

type QuestionnaireBlock struct {
	Questions []Question `json:"questions"`
}

type QuestionKind string

const (
	QuestionText   QuestionKind = "text"
	QuestionChoice QuestionKind = "choice"
)

type Question struct {
	ID       string       `json:"id"`
	Prompt   string       `json:"prompt"`
	Kind     QuestionKind `json:"kind"`
	Options  []string     `json:"options,omitempty"`
	Required bool         `json:"required"`
}

type SchedulerBlock struct {
	Slots []Slot `json:"slots"`
}

type Slot struct {
	ID string `json:"id"`
	// StartsAt is an opaque display string rather than a time.Time on purpose:
	// the engine never reasons about the calendar, so giving it a real clock
	// would only buy it a way to be non-deterministic.
	StartsAt    string `json:"startsAt"`
	DurationMin int    `json:"durationMin"`
}

// ---------------------------------------------------------------------------
// Client state: everything the person on the other end of the link has done.
// ---------------------------------------------------------------------------

// State is the accumulated client input. It is passed in whole on every call;
// the engine keeps nothing between invocations.
type State struct {
	// Selections maps a services block ID to the option IDs and quantities
	// chosen in it.
	Selections map[string][]Pick `json:"selections,omitempty"`
	// Answers maps a questionnaire block ID to question ID to answer.
	Answers map[string]map[string]string `json:"answers,omitempty"`
	// Signed maps a contract block ID to the typed signature.
	Signed map[string]string `json:"signed,omitempty"`
	// Booked maps a scheduler block ID to the chosen slot ID.
	Booked map[string]string `json:"booked,omitempty"`
	// PaidCents is the reconciled total already collected, in cents. It comes
	// from the ledger on the Postgres side, which is the only component that
	// gets to decide what was actually paid.
	PaidCents int64 `json:"paidCents,omitempty"`
}

type Pick struct {
	OptionID string `json:"optionId"`
	Qty      int    `json:"qty,omitempty"`
}

// ---------------------------------------------------------------------------
// Resolve output.
// ---------------------------------------------------------------------------

type BlockStatus string

const (
	// StatusLocked means an upstream dependency is not complete yet. A locked
	// block is not merely hidden in the UI: Resolve refuses to render its
	// contents, so there is nothing for a client to read off the wire.
	StatusLocked   BlockStatus = "locked"
	StatusOpen     BlockStatus = "open"
	StatusComplete BlockStatus = "complete"
)

type Resolved struct {
	DocumentID string          `json:"documentId"`
	Currency   string          `json:"currency"`
	Blocks     []ResolvedBlock `json:"blocks"`
	Totals     Totals          `json:"totals"`
	// Next is the single action the client is allowed to take right now, or
	// nil when the file is finished. Having exactly one keeps the client UI
	// from having to re-derive the rules it was just handed.
	Next     *NextAction `json:"next,omitempty"`
	Complete bool        `json:"complete"`
}

type ResolvedBlock struct {
	ID     string      `json:"id"`
	Kind   BlockKind   `json:"kind"`
	Title  string      `json:"title"`
	Status BlockStatus `json:"status"`

	// LockedBy lists the block IDs still standing in the way, and LockReason
	// says it in a sentence a person can read.
	LockedBy   []string `json:"lockedBy,omitempty"`
	LockReason string   `json:"lockReason,omitempty"`

	Services      *ResolvedServices      `json:"services,omitempty"`
	Contract      *ResolvedContract      `json:"contract,omitempty"`
	Invoice       *ResolvedInvoice       `json:"invoice,omitempty"`
	Questionnaire *ResolvedQuestionnaire `json:"questionnaire,omitempty"`
	Scheduler     *ResolvedScheduler     `json:"scheduler,omitempty"`
}

type ResolvedServices struct {
	Mode     SelectionMode    `json:"mode"`
	Options  []ResolvedOption `json:"options"`
	Selected int              `json:"selected"`
}

type ResolvedOption struct {
	ServiceOption
	Chosen bool `json:"chosen"`
	Qty    int  `json:"qty"`
	// LineCents is PriceCents times quantity, present so the client never
	// multiplies money itself.
	LineCents int64 `json:"lineCents"`
}

type ResolvedContract struct {
	// Body has every token replaced. The raw body with tokens is never sent.
	Body              string `json:"body"`
	SignatureRequired bool   `json:"signatureRequired"`
	Signature         string `json:"signature,omitempty"`
	Signed            bool   `json:"signed"`
}

type ResolvedInvoice struct {
	Lines []InvoiceLine `json:"lines"`
	Totals
}

type InvoiceLine struct {
	Label       string `json:"label"`
	Qty         int    `json:"qty"`
	UnitCents   int64  `json:"unitCents"`
	AmountCents int64  `json:"amountCents"`
}

type ResolvedQuestionnaire struct {
	Questions []ResolvedQuestion `json:"questions"`
}

type ResolvedQuestion struct {
	Question
	Answer string `json:"answer,omitempty"`
}

type ResolvedScheduler struct {
	Slots  []Slot `json:"slots"`
	Booked string `json:"booked,omitempty"`
}

// Totals is every money figure in the document, in integer cents. There is no
// float anywhere in this package; see money.go for the rounding rule.
type Totals struct {
	SubtotalCents   int64 `json:"subtotalCents"`
	TaxCents        int64 `json:"taxCents"`
	TotalCents      int64 `json:"totalCents"`
	DepositDueCents int64 `json:"depositDueCents"`
	PaidCents       int64 `json:"paidCents"`
	// DueNowCents is what the client owes at this moment: the deposit if none
	// has been paid, the remaining balance once it has.
	DueNowCents  int64 `json:"dueNowCents"`
	BalanceCents int64 `json:"balanceCents"`
}

// NextAction names the one thing the client can do next.
type NextAction struct {
	BlockID string    `json:"blockId"`
	Kind    BlockKind `json:"kind"`
	Verb    string    `json:"verb"`
	Label   string    `json:"label"`
}
