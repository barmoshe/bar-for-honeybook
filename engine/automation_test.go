package engine

import (
	"testing"
	"time"
)

func at(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

// chase is the automation the demo is built around, and the one worth reading:
// when a file is signed, thank them, wait three days, and only if they still
// have not paid, chase and flag it.
func chase() *Automation {
	return &Automation{
		ID:      "auto_chase",
		Name:    "Chase an unpaid deposit",
		Trigger: TriggerSigned,
		Steps: []Step{
			{Kind: StepEmail, Subject: "Thanks, {{client}}", Body: "We have your signature. {{balance}} is due."},
			{Kind: StepWait, WaitHours: 72},
			{Kind: StepCondition, If: &Condition{Fact: "paid", Op: "is", Value: "false"}},
			{Kind: StepEmail, Subject: "A gentle nudge", Body: "{{balance}} is still outstanding on {{title}}."},
			{Kind: StepTask, Title: "Call {{client}}"},
			{Kind: StepStage, Stage: "chasing"},
		},
	}
}

var signedUnpaid = Facts{
	Signed: true, Paid: false, TotalCents: 348206, BalanceCents: 348206,
	Client: "Dana", Business: "Northlight Studio", Title: "Wedding photography", Currency: "USD",
}

// TestAdvanceWalksToTheWaitAndResumesPastIt is the whole contract in one test:
// a run goes as far as it can, parks with a resume time, and does not repeat the
// wait when it comes back.
func TestAdvanceWalksToTheWaitAndResumesPastIt(t *testing.T) {
	a := chase()
	start := at("2026-08-01T09:00:00Z")

	first := Advance(a, 0, signedUnpaid, start)

	if first.Status != RunWaiting {
		t.Fatalf("status = %q, want waiting", first.Status)
	}
	if len(first.Actions) != 1 || first.Actions[0].Kind != StepEmail {
		t.Fatalf("actions = %+v, want one email", first.Actions)
	}
	if got := first.Actions[0].Subject; got != "Thanks, Dana" {
		t.Errorf("subject = %q, want the token interpolated", got)
	}
	if want := "2026-08-04T09:00:00Z"; first.ResumeAt != want {
		t.Errorf("resumeAt = %q, want %q", first.ResumeAt, want)
	}
	if first.Cursor != 2 {
		t.Errorf("cursor = %d, want 2 (past the wait, not on it)", first.Cursor)
	}

	// Resuming must not wait again, which is the bug the cursor placement exists
	// to prevent and the one that would loop forever in production.
	second := Advance(a, first.Cursor, signedUnpaid, at(first.ResumeAt))

	if second.Status != RunDone {
		t.Fatalf("status = %q (%s), want done", second.Status, second.Note)
	}
	if len(second.Actions) != 3 {
		t.Fatalf("got %d actions, want email + task + stage: %+v", len(second.Actions), second.Actions)
	}
	if second.Actions[0].Body != "$3,482.06 is still outstanding on Wedding photography." {
		t.Errorf("body = %q", second.Actions[0].Body)
	}
	if second.Actions[1].Title != "Call Dana" {
		t.Errorf("task = %q", second.Actions[1].Title)
	}
	if second.Actions[2].Stage != "chasing" {
		t.Errorf("stage = %q", second.Actions[2].Stage)
	}
}

// A client who paid during the wait must not be chased. This is the case the
// condition exists for, and getting it wrong means emailing someone a demand
// for money they already sent.
func TestAdvanceStopsWhenTheConditionFails(t *testing.T) {
	a := chase()
	paid := signedUnpaid
	paid.Paid = true
	paid.BalanceCents = 0

	first := Advance(a, 0, signedUnpaid, at("2026-08-01T09:00:00Z"))
	second := Advance(a, first.Cursor, paid, at(first.ResumeAt))

	if second.Status != RunStopped {
		t.Fatalf("status = %q, want stopped", second.Status)
	}
	if len(second.Actions) != 0 {
		t.Errorf("chased a client who had paid: %+v", second.Actions)
	}
	if second.Note == "" {
		t.Error("stopped without saying why")
	}
}

func TestAdvanceIsPureInTime(t *testing.T) {
	a := chase()
	one := Advance(a, 0, signedUnpaid, at("2026-08-01T09:00:00Z"))
	two := Advance(a, 0, signedUnpaid, at("2026-08-01T09:00:00Z"))

	if one.ResumeAt != two.ResumeAt || one.Cursor != two.Cursor || one.Status != two.Status {
		t.Fatalf("same input, different answers:\n %+v\n %+v", one, two)
	}

	// A different asOf must move the resume time by exactly that much, which is
	// what makes "jump forward three days" a real parameter rather than a lie
	// told to the UI.
	later := Advance(a, 0, signedUnpaid, at("2026-08-02T09:00:00Z"))
	if later.ResumeAt != "2026-08-05T09:00:00Z" {
		t.Errorf("resumeAt = %q, want the wait measured from asOf", later.ResumeAt)
	}
}

func TestConditions(t *testing.T) {
	cases := []struct {
		name string
		cond Condition
		f    Facts
		want bool
	}{
		{"signed is true", Condition{Fact: "signed", Op: "is", Value: "true"}, Facts{Signed: true}, true},
		{"signed is false", Condition{Fact: "signed", Op: "is", Value: "true"}, Facts{Signed: false}, false},
		{"not paid", Condition{Fact: "paid", Op: "not", Value: "true"}, Facts{Paid: false}, true},
		{"total above", Condition{Fact: "total", Op: "gt", Value: "100000"}, Facts{TotalCents: 100001}, true},
		{"total not above", Condition{Fact: "total", Op: "gt", Value: "100000"}, Facts{TotalCents: 100000}, false},
		{"balance below", Condition{Fact: "balance", Op: "lt", Value: "500"}, Facts{BalanceCents: 499}, true},
		{"a value that is not a number", Condition{Fact: "total", Op: "gt", Value: "lots"}, Facts{}, false},
		{"a fact nobody provides", Condition{Fact: "weather", Op: "is", Value: "true"}, Facts{}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, why := evaluate(&c.cond, c.f)
			if got != c.want {
				t.Errorf("got %v (%s), want %v", got, why, c.want)
			}
			if !got && why == "" {
				t.Error("refused without a reason")
			}
		})
	}
}

func TestAdvanceHandlesDegenerateAutomations(t *testing.T) {
	now := at("2026-08-01T09:00:00Z")

	if got := Advance(nil, 0, Facts{}, now); got.Status != RunDone {
		t.Errorf("nil automation: status = %q", got.Status)
	}

	empty := &Automation{ID: "a", Steps: nil}
	if got := Advance(empty, 0, Facts{}, now); got.Status != RunDone || got.Cursor != 0 {
		t.Errorf("empty automation: %+v", got)
	}

	// A cursor past the end is what a run looks like after its last step, and it
	// must settle rather than index out of range.
	if got := Advance(chase(), 99, Facts{}, now); got.Status != RunDone {
		t.Errorf("cursor past the end: %+v", got)
	}

	bad := &Automation{ID: "a", Steps: []Step{{Kind: "teleport"}}}
	got := Advance(bad, 0, Facts{}, now)
	if got.Status != RunStopped || got.Note == "" {
		t.Errorf("unknown step kind: %+v", got)
	}

	// A zero-hour wait is still a wait: it parks and resumes immediately, rather
	// than being silently optimised into nothing.
	instant := &Automation{ID: "a", Steps: []Step{{Kind: StepWait, WaitHours: 0}, {Kind: StepTask, Title: "go"}}}
	first := Advance(instant, 0, Facts{}, now)
	if first.Status != RunWaiting || first.ResumeAt != "2026-08-01T09:00:00Z" {
		t.Errorf("zero wait: %+v", first)
	}
}
