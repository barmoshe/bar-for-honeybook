package engine

import (
	"strings"
	"testing"
)

func contract(id, title string, requires ...string) Block {
	return Block{ID: id, Kind: KindContract, Title: title, RequiresComplete: requires,
		Contract: &ContractBlock{Body: "terms", SignatureRequired: true}}
}

func problemCodes(v Validation) []string {
	out := make([]string, 0, len(v.Problems))
	for _, p := range v.Problems {
		out = append(out, p.Code)
	}
	return out
}

func hasCode(v Validation, code string) bool {
	for _, p := range v.Problems {
		if p.Code == code {
			return true
		}
	}
	return false
}

// TestValidateSeparatesCyclesFromOrdering is the distinction the studio's error
// messages depend on. A cycle cannot be fixed by dragging blocks around; a
// forward dependency can be fixed by exactly that, and telling an author the
// wrong one sends them down a dead end.
func TestValidateSeparatesCyclesFromOrdering(t *testing.T) {
	t.Run("cycle names the ring and refuses to suggest an order", func(t *testing.T) {
		doc := &Document{ID: "d", Blocks: []Block{
			contract("a", "A", "c"),
			contract("b", "B", "a"),
			contract("c", "C", "b"),
		}}
		v := Validate(doc)

		if v.OK {
			t.Fatal("a three-block loop validated as OK")
		}
		if !hasCode(v, "cycle") {
			t.Fatalf("codes = %v, want a cycle", problemCodes(v))
		}
		if hasCode(v, "forward_dependency") {
			t.Error("reported a reordering problem for a document no order can fix")
		}
		if v.Order != nil {
			t.Errorf("offered an order for a cyclic document: %v", v.Order)
		}
	})

	t.Run("forward dependency is reported as fixable, with an order", func(t *testing.T) {
		doc := &Document{ID: "d", Blocks: []Block{
			contract("early", "Early", "late"),
			contract("late", "Late"),
		}}
		v := Validate(doc)

		if v.OK {
			t.Fatal("a block waiting on a later block validated as OK")
		}
		if !hasCode(v, "forward_dependency") {
			t.Fatalf("codes = %v, want a forward dependency", problemCodes(v))
		}
		if hasCode(v, "cycle") {
			t.Error("called a satisfiable document cyclic")
		}
		if len(v.Order) != 2 || v.Order[0] != "late" {
			t.Errorf("order = %v, want late first", v.Order)
		}
	})
}

func TestValidateStructuralErrors(t *testing.T) {
	cases := []struct {
		name string
		doc  *Document
		want string
	}{
		{"empty", &Document{ID: "d"}, "empty"},
		{"nil", nil, "empty"},
		{
			"self dependency",
			&Document{ID: "d", Blocks: []Block{contract("a", "A", "a")}},
			"self_dependency",
		},
		{
			"dependency on a block that is not here",
			&Document{ID: "d", Blocks: []Block{contract("a", "A", "ghost")}},
			"unknown_dependency",
		},
		{
			"two blocks with one id",
			&Document{ID: "d", Blocks: []Block{contract("a", "A"), contract("a", "Also A")}},
			"duplicate_id",
		},
		{
			"kind and payload disagree",
			&Document{ID: "d", Blocks: []Block{{ID: "a", Kind: KindInvoice, Title: "Pay"}}},
			"missing_payload",
		},
		{
			"services block with nothing in it",
			&Document{ID: "d", Blocks: []Block{{ID: "s", Kind: KindServices, Title: "Pick",
				Services: &ServicesBlock{Mode: SelectMany}}}},
			"no_options",
		},
		{
			"deposit outside the possible range",
			&Document{ID: "d", Blocks: []Block{{ID: "i", Kind: KindInvoice, Title: "Pay",
				Invoice: &InvoiceBlock{DepositBps: 12000}}}},
			"bad_deposit",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			v := Validate(c.doc)
			if v.OK {
				t.Fatalf("validated as OK, want error %q", c.want)
			}
			if !hasCode(v, c.want) {
				t.Errorf("codes = %v, want %q", problemCodes(v), c.want)
			}
		})
	}
}

// TestUngatedInvoiceIsAWarningNotAnError encodes the judgement call: a file that
// takes money before the terms are signed still works, so refusing to save it
// would be the tool overruling its user. Saying so out loud is the right amount
// of opinion.
func TestUngatedInvoiceIsAWarningNotAnError(t *testing.T) {
	doc := &Document{ID: "d", Blocks: []Block{
		{ID: "s", Kind: KindServices, Title: "Package", Services: &ServicesBlock{
			Mode: SelectOne, Options: []ServiceOption{{ID: "o", Name: "One", PriceCents: 100}}}},
		contract("c", "Terms", "s"),
		{ID: "i", Kind: KindInvoice, Title: "Pay", RequiresComplete: []string{"s"},
			Invoice: &InvoiceBlock{DepositBps: 5000}},
	}}

	v := Validate(doc)
	if !v.OK {
		t.Fatalf("an ungated invoice should still be a valid document: %v", problemCodes(v))
	}
	if !hasCode(v, "ungated_invoice") {
		t.Fatalf("codes = %v, want an ungated_invoice warning", problemCodes(v))
	}
	for _, p := range v.Problems {
		if p.Code == "ungated_invoice" && p.Severity != SeverityWarning {
			t.Errorf("ungated_invoice severity = %q, want warning", p.Severity)
		}
	}
}

// A gate counts even when it is inherited through another block, which is the
// case that a naive "does the invoice list the contract" check gets wrong.
func TestGateIsRecognisedThroughAnIntermediateBlock(t *testing.T) {
	doc := &Document{ID: "d", Blocks: []Block{
		{ID: "s", Kind: KindServices, Title: "Package", Services: &ServicesBlock{
			Mode: SelectOne, Options: []ServiceOption{{ID: "o", Name: "One", PriceCents: 100}}}},
		contract("c", "Terms", "s"),
		{ID: "q", Kind: KindQuestionnaire, Title: "Details", RequiresComplete: []string{"c"},
			Questionnaire: &QuestionnaireBlock{Questions: []Question{{ID: "q1", Prompt: "Where?", Kind: QuestionText}}}},
		{ID: "i", Kind: KindInvoice, Title: "Pay", RequiresComplete: []string{"q"},
			Invoice: &InvoiceBlock{DepositBps: 5000}},
	}}

	if v := Validate(doc); hasCode(v, "ungated_invoice") {
		t.Errorf("called an invoice ungated when it inherits the signature gate: %v", problemCodes(v))
	}
}

// The token check has to stay honest against Resolve, so this test asserts the
// two agree rather than asserting a hardcoded list that could drift.
func TestUnknownTokenIsWarnedAndEveryRealTokenIsAccepted(t *testing.T) {
	var b strings.Builder
	for name := range contractTokens(nil, Totals{}, nil) {
		b.WriteString("{{" + name + "}} ")
	}
	b.WriteString("{{not_a_real_token}}")

	doc := &Document{ID: "d", Blocks: []Block{
		{ID: "c", Kind: KindContract, Title: "Terms", Contract: &ContractBlock{Body: b.String()}},
	}}
	v := Validate(doc)

	var unknown []string
	for _, p := range v.Problems {
		if p.Code == "unknown_token" {
			unknown = append(unknown, p.Message)
		}
	}
	if len(unknown) != 1 {
		t.Fatalf("got %d unknown-token warnings, want exactly 1: %v", len(unknown), unknown)
	}
	if !strings.Contains(unknown[0], "not_a_real_token") {
		t.Errorf("warned about the wrong token: %s", unknown[0])
	}
}

func TestValidDocumentPassesCleanly(t *testing.T) {
	v := Validate(demoDoc())
	if !v.OK {
		t.Fatalf("the demo document does not validate: %v", problemCodes(v))
	}
	for _, p := range v.Problems {
		t.Errorf("unexpected %s: %s", p.Severity, p.Message)
	}
	if len(v.Order) != 3 {
		t.Errorf("order = %v, want three blocks", v.Order)
	}
}
