package engine

import (
	"encoding/json"
	"strings"
	"testing"
)

// demoDoc is the canonical three-block file the whole demo turns on: choose
// services, sign the agreement, then pay. The invoice waits on the contract,
// which is the one rule everything else here exists to check.
func demoDoc() *Document {
	return &Document{
		ID:       "doc_demo",
		Title:    "Wedding photography",
		Business: "Northlight Studio",
		Client:   "Dana",
		Currency: "USD",
		Blocks: []Block{
			{
				ID: "services", Kind: KindServices, Title: "Your package", Required: true,
				Services: &ServicesBlock{
					Mode: SelectMany,
					Options: []ServiceOption{
						{ID: "base", Name: "Full-day coverage", PriceCents: 240000},
						{ID: "album", Name: "Printed album", PriceCents: 34000, MaxQty: 3},
						{ID: "travel", Name: "Travel", PriceCents: 8551},
					},
				},
			},
			{
				ID: "contract", Kind: KindContract, Title: "The agreement", Required: true,
				RequiresComplete: []string{"services"},
				Contract: &ContractBlock{
					SignatureRequired: true,
					Body: "{{business}} will provide {{services}} for {{client}}. " +
						"The total is {{total}}, with {{deposit}} due to reserve the date.",
				},
			},
			{
				ID: "invoice", Kind: KindInvoice, Title: "Payment", Required: true,
				RequiresComplete: []string{"contract"},
				Invoice:          &InvoiceBlock{DepositBps: 5000, TaxBps: 1000},
			},
		},
	}
}

func blockByID(r Resolved, id string) ResolvedBlock {
	for _, b := range r.Blocks {
		if b.ID == id {
			return b
		}
	}
	return ResolvedBlock{}
}

// TestGatingWalkthrough is the golden test: one document, walked the way a real
// client walks it, asserting the whole state at each step. If the demo's
// central claim is ever wrong, it is wrong here first.
func TestGatingWalkthrough(t *testing.T) {
	doc := demoDoc()

	steps := []struct {
		name string
		st   State

		wantStatus   map[string]BlockStatus
		wantSubtotal int64
		wantTax      int64
		wantTotal    int64
		wantDeposit  int64
		wantDueNow   int64
		wantNextVerb string
		wantComplete bool
	}{
		{
			name: "nothing chosen yet",
			st:   State{},
			wantStatus: map[string]BlockStatus{
				"services": StatusOpen, "contract": StatusLocked, "invoice": StatusLocked,
			},
			wantNextVerb: "select",
		},
		{
			// 240000 + 34000*2 + 8551 = 316551. Tax 10% of that is 31655.1,
			// which rounds to 31655 rather than 31656.
			name: "services chosen, contract opens",
			st: State{Selections: map[string][]Pick{
				"services": {{OptionID: "base"}, {OptionID: "album", Qty: 2}, {OptionID: "travel"}},
			}},
			wantStatus: map[string]BlockStatus{
				"services": StatusComplete, "contract": StatusOpen, "invoice": StatusLocked,
			},
			wantSubtotal: 316551,
			wantTax:      31655,
			wantTotal:    348206,
			wantDeposit:  174103,
			wantDueNow:   174103,
			wantNextVerb: "sign",
		},
		{
			name: "signed, invoice finally opens",
			st: State{
				Selections: map[string][]Pick{
					"services": {{OptionID: "base"}, {OptionID: "album", Qty: 2}, {OptionID: "travel"}},
				},
				Signed: map[string]string{"contract": "Dana"},
			},
			wantStatus: map[string]BlockStatus{
				"services": StatusComplete, "contract": StatusComplete, "invoice": StatusOpen,
			},
			wantSubtotal: 316551,
			wantTax:      31655,
			wantTotal:    348206,
			wantDeposit:  174103,
			wantDueNow:   174103,
			wantNextVerb: "pay",
		},
		{
			name: "deposit paid, the balance is what is left",
			st: State{
				Selections: map[string][]Pick{
					"services": {{OptionID: "base"}, {OptionID: "album", Qty: 2}, {OptionID: "travel"}},
				},
				Signed:    map[string]string{"contract": "Dana"},
				PaidCents: 174103,
			},
			wantStatus: map[string]BlockStatus{
				"services": StatusComplete, "contract": StatusComplete, "invoice": StatusComplete,
			},
			wantSubtotal: 316551,
			wantTax:      31655,
			wantTotal:    348206,
			wantDeposit:  174103,
			wantDueNow:   174103, // the remaining balance, now that the deposit is settled
			wantComplete: true,
		},
	}

	for _, s := range steps {
		t.Run(s.name, func(t *testing.T) {
			got := Resolve(doc, s.st)

			for id, want := range s.wantStatus {
				if b := blockByID(got, id); b.Status != want {
					t.Errorf("block %q status = %q, want %q", id, b.Status, want)
				}
			}
			if got.Totals.SubtotalCents != s.wantSubtotal {
				t.Errorf("subtotal = %d, want %d", got.Totals.SubtotalCents, s.wantSubtotal)
			}
			if got.Totals.TaxCents != s.wantTax {
				t.Errorf("tax = %d, want %d", got.Totals.TaxCents, s.wantTax)
			}
			if got.Totals.TotalCents != s.wantTotal {
				t.Errorf("total = %d, want %d", got.Totals.TotalCents, s.wantTotal)
			}
			if got.Totals.DepositDueCents != s.wantDeposit {
				t.Errorf("deposit = %d, want %d", got.Totals.DepositDueCents, s.wantDeposit)
			}
			if got.Totals.DueNowCents != s.wantDueNow {
				t.Errorf("due now = %d, want %d", got.Totals.DueNowCents, s.wantDueNow)
			}
			if got.Complete != s.wantComplete {
				t.Errorf("complete = %v, want %v", got.Complete, s.wantComplete)
			}
			switch {
			case s.wantNextVerb == "" && got.Next != nil:
				t.Errorf("next = %+v, want none", got.Next)
			case s.wantNextVerb != "" && got.Next == nil:
				t.Errorf("next = none, want verb %q", s.wantNextVerb)
			case s.wantNextVerb != "" && got.Next.Verb != s.wantNextVerb:
				t.Errorf("next verb = %q, want %q", got.Next.Verb, s.wantNextVerb)
			}
		})
	}
}

// TestLockedBlocksCarryNoPayload is the security-shaped half of the gate. It is
// not enough for a locked block to be labelled locked: an unsigned client must
// not receive the invoice lines or the contract prose at all, because a label
// is a suggestion and an absent field is not.
func TestLockedBlocksCarryNoPayload(t *testing.T) {
	doc := demoDoc()
	got := Resolve(doc, State{Selections: map[string][]Pick{
		"services": {{OptionID: "base"}},
	}})

	inv := blockByID(got, "invoice")
	if inv.Status != StatusLocked {
		t.Fatalf("invoice status = %q, want locked", inv.Status)
	}
	if inv.Invoice != nil {
		t.Errorf("locked invoice carried a payload: %+v", inv.Invoice)
	}
	if len(inv.LockedBy) != 1 || inv.LockedBy[0] != "contract" {
		t.Errorf("lockedBy = %v, want [contract]", inv.LockedBy)
	}
	if !strings.Contains(inv.LockReason, "The agreement") {
		t.Errorf("lock reason %q does not name the blocking block", inv.LockReason)
	}
	if got.Next != nil && got.Next.Verb == "pay" {
		t.Errorf("offered a payment action before the contract was signed: %+v", got.Next)
	}

	// And prove it over the wire, not just in the struct.
	wire, err := json.Marshal(inv)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(wire), "amountCents") {
		t.Errorf("locked invoice serialised line amounts: %s", wire)
	}
}

// TestContractInterpolation checks that the prose a client signs is built from
// the same numbers the invoice charges, rather than from a copy that can drift.
func TestContractInterpolation(t *testing.T) {
	doc := demoDoc()
	got := Resolve(doc, State{
		Selections: map[string][]Pick{
			"services": {{OptionID: "base"}, {OptionID: "album", Qty: 2}},
		},
	})

	body := blockByID(got, "contract").Contract.Body
	for _, want := range []string{
		"Northlight Studio",
		"Full-day coverage, Printed album (x2)",
		"Dana",
		"$3,388.00", // 240000 + 34000x2 = 308000, plus 10% tax
		"$1,694.00", // half of it, the deposit
	} {
		if !strings.Contains(body, want) {
			t.Errorf("contract body missing %q\ngot: %s", want, body)
		}
	}
	if strings.Contains(body, "{{") {
		t.Errorf("contract body still contains an unresolved token: %s", body)
	}
}

func TestUnknownTokensRenderEmptyRatherThanRaw(t *testing.T) {
	doc := &Document{
		ID: "d", Currency: "USD",
		Blocks: []Block{{
			ID: "c", Kind: KindContract, Title: "Terms",
			Contract: &ContractBlock{Body: "Signed by {{clinet}} today."},
		}},
	}
	body := Resolve(doc, State{}).Blocks[0].Contract.Body
	if strings.Contains(body, "{{") {
		t.Errorf("a typo'd token leaked into signable prose: %q", body)
	}
	if body != "Signed by  today." {
		t.Errorf("body = %q", body)
	}
}

func TestSingleSelectTakesOneChoice(t *testing.T) {
	doc := &Document{
		ID: "d", Currency: "USD",
		Blocks: []Block{{
			ID: "tier", Kind: KindServices, Title: "Tier", Required: true,
			Services: &ServicesBlock{Mode: SelectOne, Options: []ServiceOption{
				{ID: "silver", Name: "Silver", PriceCents: 50000},
				{ID: "gold", Name: "Gold", PriceCents: 90000},
			}},
		}},
	}
	got := Resolve(doc, State{Selections: map[string][]Pick{
		"tier": {{OptionID: "silver"}, {OptionID: "gold"}},
	}})
	if got.Totals.SubtotalCents != 50000 {
		t.Errorf("subtotal = %d, want 50000 (first choice only)", got.Totals.SubtotalCents)
	}
	if n := blockByID(got, "tier").Services.Selected; n != 1 {
		t.Errorf("selected = %d, want 1", n)
	}
}

func TestQuantityIsCappedByMaxQty(t *testing.T) {
	doc := demoDoc()
	got := Resolve(doc, State{Selections: map[string][]Pick{
		"services": {{OptionID: "album", Qty: 99}},
	}})
	if got.Totals.SubtotalCents != 34000*3 {
		t.Errorf("subtotal = %d, want %d (capped at maxQty 3)", got.Totals.SubtotalCents, 34000*3)
	}
}

// TestResolveSurvivesAnInvalidDocument matters because Validate and Resolve are
// separate calls, and a studio in mid-edit will hand Resolve a document that has
// not passed validation yet. It must answer, not hang.
func TestResolveSurvivesAnInvalidDocument(t *testing.T) {
	doc := &Document{
		ID: "d", Currency: "USD",
		Blocks: []Block{
			{ID: "a", Kind: KindContract, Title: "A", RequiresComplete: []string{"b"},
				Contract: &ContractBlock{Body: "x", SignatureRequired: true}},
			{ID: "b", Kind: KindContract, Title: "B", RequiresComplete: []string{"a"},
				Contract: &ContractBlock{Body: "y", SignatureRequired: true}},
			{ID: "c", Kind: KindContract, Title: "C", RequiresComplete: []string{"ghost"},
				Contract: &ContractBlock{Body: "z", SignatureRequired: true}},
		},
	}

	done := make(chan Resolved, 1)
	go func() { done <- Resolve(doc, State{}) }()

	got := <-done
	if len(got.Blocks) != 3 {
		t.Fatalf("got %d blocks, want 3", len(got.Blocks))
	}
	if s := blockByID(got, "a").Status; s != StatusLocked {
		t.Errorf("a status = %q, want locked", s)
	}
	// An edge pointing at a block that does not exist is ignored rather than
	// treated as an unsatisfiable gate, so one typo does not brick the file.
	if s := blockByID(got, "c").Status; s != StatusOpen {
		t.Errorf("c status = %q, want open despite its dangling requirement", s)
	}
}
