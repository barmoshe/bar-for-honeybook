package engine

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// The automation half of the engine: triggers, actions, waits and conditions.
//
// Same discipline as the rules. `Advance` is a pure function of its arguments,
// including the current time, which arrives as `asOf` rather than being read
// from a clock. That is not fussiness. A workflow engine whose behaviour
// depends on `time.Now()` can only be tested by waiting, and a demo of one can
// only be shown by waiting, so both the tests below and the "jump forward three
// days" control on the page are the same mechanism rather than one being a
// simulation of the other.
//
// What this deliberately is not: durable. There are no retries with backoff, no
// heartbeats, no cancellation tokens, no versioning of running workflows. Those
// are the reasons Temporal exists and the reason nobody should write this for
// production. What is here is the shape: a queue of runs, each parked on a
// resume time, advanced by a pure step function.

// TriggerKind names the document event that starts a run. Each one already
// exists in the `document_events` stream the smart file writes, so nothing new
// has to be emitted for automations to work.
type TriggerKind string

const (
	TriggerOpened   TriggerKind = "opened"
	TriggerSelected TriggerKind = "selected"
	TriggerSigned   TriggerKind = "signed"
	TriggerPaid     TriggerKind = "paid"
)

type StepKind string

const (
	StepWait      StepKind = "wait"
	StepEmail     StepKind = "email"
	StepTask      StepKind = "task"
	StepStage     StepKind = "stage"
	StepCondition StepKind = "condition"
)

type Automation struct {
	ID      string      `json:"id"`
	Name    string      `json:"name"`
	Trigger TriggerKind `json:"trigger"`
	Steps   []Step      `json:"steps"`
}

type Step struct {
	Kind StepKind `json:"kind"`

	// wait
	WaitHours int `json:"waitHours,omitempty"`

	// email. Subject and Body accept the same {{tokens}} a contract does.
	Subject string `json:"subject,omitempty"`
	Body    string `json:"body,omitempty"`

	// task
	Title string `json:"title,omitempty"`

	// stage
	Stage string `json:"stage,omitempty"`

	// condition
	If *Condition `json:"if,omitempty"`
}

// Condition is the branch. A run that fails one stops rather than skipping
// ahead: "if they still have not paid, chase them" reads as a guard on the rest
// of the sequence, and a step that could be skipped over would need its own
// notion of where the skipped region ends.
type Condition struct {
	Fact  string `json:"fact"`  // signed | paid | complete | total | balance
	Op    string `json:"op"`    // is | not | gt | lt
	Value string `json:"value"` // "true" / "false" for flags, cents for amounts
}

// Facts is what the automation engine is told about a document. It is passed in
// whole, like State, so the engine keeps nothing and reads nothing.
type Facts struct {
	Signed       bool   `json:"signed"`
	Paid         bool   `json:"paid"`
	Complete     bool   `json:"complete"`
	TotalCents   int64  `json:"totalCents"`
	BalanceCents int64  `json:"balanceCents"`
	Client       string `json:"client"`
	Business     string `json:"business"`
	Title        string `json:"title"`
	Currency     string `json:"currency"`
}

type RunStatus string

const (
	// RunRunning is transient: Advance never returns it, because a run that can
	// keep going does keep going, all the way to a wait or the end.
	RunRunning RunStatus = "running"
	RunWaiting RunStatus = "waiting"
	RunDone    RunStatus = "done"
	// RunStopped means a condition was false. Not an error: the automation
	// decided this file was not the one.
	RunStopped RunStatus = "stopped"
)

type Action struct {
	StepIndex int      `json:"stepIndex"`
	Kind      StepKind `json:"kind"`
	Subject   string   `json:"subject,omitempty"`
	Body      string   `json:"body,omitempty"`
	Title     string   `json:"title,omitempty"`
	Stage     string   `json:"stage,omitempty"`
}

type Advanced struct {
	// Cursor is the step to start from next time.
	Cursor int       `json:"cursor"`
	Status RunStatus `json:"status"`
	// ResumeAt is set only when Status is waiting, as RFC3339.
	ResumeAt string `json:"resumeAt,omitempty"`
	// Actions are the things to do now, in order. The caller performs them; the
	// engine only decides that they are due.
	Actions []Action `json:"actions"`
	// Note explains a stop, for the run log.
	Note string `json:"note,omitempty"`
}

// Advance runs an automation from `cursor` until it hits a wait, fails a
// condition, or runs out of steps.
//
// It performs nothing. It returns the actions that are due and the caller
// writes them, which is what keeps this testable and what lets the same
// function decide a run whether it is being ticked by a page load or by a
// person pressing "advance the clock".
func Advance(a *Automation, cursor int, facts Facts, asOf time.Time) Advanced {
	out := Advanced{Cursor: cursor, Status: RunDone, Actions: []Action{}}
	if a == nil {
		out.Note = "no automation"
		return out
	}
	if cursor < 0 {
		cursor = 0
	}

	for i := cursor; i < len(a.Steps); i++ {
		step := a.Steps[i]

		switch step.Kind {
		case StepWait:
			hours := step.WaitHours
			if hours < 0 {
				hours = 0
			}
			// Resume *after* this step, so a resumed run does not wait again.
			out.Cursor = i + 1
			out.Status = RunWaiting
			out.ResumeAt = asOf.Add(time.Duration(hours) * time.Hour).UTC().Format(time.RFC3339)
			out.Note = fmt.Sprintf("waiting %s", humanHours(hours))
			return out

		case StepCondition:
			okCond, why := evaluate(step.If, facts)
			if !okCond {
				out.Cursor = i
				out.Status = RunStopped
				out.Note = why
				return out
			}

		case StepEmail:
			out.Actions = append(out.Actions, Action{
				StepIndex: i,
				Kind:      StepEmail,
				Subject:   interpolate(step.Subject, automationTokens(facts)),
				Body:      interpolate(step.Body, automationTokens(facts)),
			})

		case StepTask:
			out.Actions = append(out.Actions, Action{
				StepIndex: i,
				Kind:      StepTask,
				Title:     interpolate(step.Title, automationTokens(facts)),
			})

		case StepStage:
			out.Actions = append(out.Actions, Action{
				StepIndex: i, Kind: StepStage, Stage: step.Stage,
			})

		default:
			out.Cursor = i
			out.Status = RunStopped
			out.Note = fmt.Sprintf("unknown step kind %q", step.Kind)
			return out
		}
	}

	out.Cursor = len(a.Steps)
	out.Status = RunDone
	return out
}

// evaluate answers a condition and says why in words the run log can show.
func evaluate(c *Condition, f Facts) (bool, string) {
	if c == nil {
		return true, ""
	}

	flag := func(name string, v bool) (bool, string) {
		want := strings.EqualFold(c.Value, "true")
		if c.Op == "not" {
			want = !want
		}
		if v == want {
			return true, ""
		}
		return false, fmt.Sprintf("stopped: %s is %v", name, v)
	}

	switch strings.ToLower(c.Fact) {
	case "signed":
		return flag("signed", f.Signed)
	case "paid":
		return flag("paid", f.Paid)
	case "complete":
		return flag("complete", f.Complete)
	case "total", "balance":
		have := f.TotalCents
		if strings.ToLower(c.Fact) == "balance" {
			have = f.BalanceCents
		}
		want, err := strconv.ParseInt(strings.TrimSpace(c.Value), 10, 64)
		if err != nil {
			return false, fmt.Sprintf("stopped: %q is not a number of cents", c.Value)
		}
		switch c.Op {
		case "gt":
			if have > want {
				return true, ""
			}
			return false, fmt.Sprintf("stopped: %s %d is not above %d", c.Fact, have, want)
		case "lt":
			if have < want {
				return true, ""
			}
			return false, fmt.Sprintf("stopped: %s %d is not below %d", c.Fact, have, want)
		default:
			if have == want {
				return true, ""
			}
			return false, fmt.Sprintf("stopped: %s %d is not %d", c.Fact, have, want)
		}
	}
	return false, fmt.Sprintf("stopped: unknown fact %q", c.Fact)
}

// automationTokens reuses the contract vocabulary so an author who has written
// one has already learned the other.
func automationTokens(f Facts) map[string]string {
	currency := f.Currency
	if currency == "" {
		currency = "USD"
	}
	return map[string]string{
		"client":   f.Client,
		"business": f.Business,
		"title":    f.Title,
		"total":    FormatMoney(f.TotalCents, currency),
		"balance":  FormatMoney(f.BalanceCents, currency),
	}
}

func humanHours(h int) string {
	switch {
	case h == 0:
		return "no time at all"
	case h%24 == 0 && h >= 24:
		d := h / 24
		if d == 1 {
			return "1 day"
		}
		return fmt.Sprintf("%d days", d)
	case h == 1:
		return "1 hour"
	default:
		return fmt.Sprintf("%d hours", h)
	}
}
