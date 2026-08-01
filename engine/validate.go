package engine

import (
	"fmt"
	"sort"
	"strings"
)

// Severity separates "this document cannot work" from "this document will
// work and you probably did not mean it".
type Severity string

const (
	SeverityError   Severity = "error"
	SeverityWarning Severity = "warning"
)

type Problem struct {
	Code      string   `json:"code"`
	Severity  Severity `json:"severity"`
	BlockID   string   `json:"blockId,omitempty"`
	DependsOn string   `json:"dependsOn,omitempty"`
	Message   string   `json:"message"`
}

type Validation struct {
	// OK is false when there is at least one error. Warnings do not block.
	OK       bool      `json:"ok"`
	Problems []Problem `json:"problems"`
	// Order is a topological ordering of the blocks when one exists. The studio
	// uses it to offer a one-click fix for a document whose blocks are simply
	// in the wrong sequence.
	Order []string `json:"order,omitempty"`
}

// Validate decides whether a document can be completed by a client walking it
// top to bottom, and explains every reason it cannot.
//
// The two structural failures are different and get different messages:
//
//   - A *cycle* is unsatisfiable in any order. Nothing can be reordered to fix
//     "the contract needs the invoice and the invoice needs the contract".
//   - A *forward dependency* is satisfiable, just not in this sequence. Block 2
//     waiting on block 5 leaves a client stuck at a locked block with nothing
//     ahead of it they are allowed to touch.
//
// Cycles are checked first, so the more useful of the two messages wins when a
// document manages both.
func Validate(doc *Document) Validation {
	v := Validation{Problems: []Problem{}}
	add := func(p Problem) { v.Problems = append(v.Problems, p) }

	if doc == nil || len(doc.Blocks) == 0 {
		add(Problem{Code: "empty", Severity: SeverityError,
			Message: "A smart file needs at least one block."})
		return finish(v)
	}

	index := map[string]int{}
	for i, b := range doc.Blocks {
		if b.ID == "" {
			add(Problem{Code: "missing_id", Severity: SeverityError,
				Message: fmt.Sprintf("The block at position %d has no id.", i+1)})
			continue
		}
		if _, dup := index[b.ID]; dup {
			add(Problem{Code: "duplicate_id", Severity: SeverityError, BlockID: b.ID,
				Message: fmt.Sprintf("Two blocks share the id %q.", b.ID)})
			continue
		}
		index[b.ID] = i
	}

	for _, b := range doc.Blocks {
		if problem, bad := checkPayload(b); bad {
			add(problem)
		}
	}

	// Edges, filtered down to the ones that can actually be evaluated. An edge
	// pointing at a block that does not exist is reported and then dropped, so
	// one typo does not cascade into a bogus cycle report.
	edges := map[string][]string{}
	for _, b := range doc.Blocks {
		for _, dep := range b.RequiresComplete {
			switch {
			case dep == b.ID:
				add(Problem{Code: "self_dependency", Severity: SeverityError, BlockID: b.ID, DependsOn: dep,
					Message: fmt.Sprintf("%q waits for itself.", label(doc, b.ID))})
			default:
				if _, ok := index[dep]; !ok {
					add(Problem{Code: "unknown_dependency", Severity: SeverityError, BlockID: b.ID, DependsOn: dep,
						Message: fmt.Sprintf("%q waits for %q, which is not in this file.", label(doc, b.ID), dep)})
					continue
				}
				edges[b.ID] = append(edges[b.ID], dep)
			}
		}
	}

	order, cycle := topoSort(doc, edges)
	if cycle != nil {
		names := make([]string, 0, len(cycle))
		for _, id := range cycle {
			names = append(names, label(doc, id))
		}
		add(Problem{Code: "cycle", Severity: SeverityError, BlockID: cycle[0],
			Message: fmt.Sprintf("These blocks wait for each other in a loop, so none of them can ever open: %s.",
				strings.Join(names, " to "))})
	} else {
		v.Order = order
		for _, b := range doc.Blocks {
			for _, dep := range edges[b.ID] {
				if index[dep] > index[b.ID] {
					add(Problem{Code: "forward_dependency", Severity: SeverityError, BlockID: b.ID, DependsOn: dep,
						Message: fmt.Sprintf("%q waits for %q, which comes after it. A client walking the file in order would stop here.",
							label(doc, b.ID), label(doc, dep))})
				}
			}
		}
	}

	for _, p := range semanticChecks(doc, index, edges) {
		add(p)
	}

	return finish(v)
}

// checkPayload confirms Kind and the kind-specific pointer agree. Catching it
// here means Resolve can dereference without a nil check on every line.
func checkPayload(b Block) (Problem, bool) {
	set := 0
	if b.Services != nil {
		set++
	}
	if b.Contract != nil {
		set++
	}
	if b.Invoice != nil {
		set++
	}
	if b.Questionnaire != nil {
		set++
	}
	if b.Scheduler != nil {
		set++
	}

	present := false
	switch b.Kind {
	case KindServices:
		present = b.Services != nil
	case KindContract:
		present = b.Contract != nil
	case KindInvoice:
		present = b.Invoice != nil
	case KindQuestionnaire:
		present = b.Questionnaire != nil
	case KindScheduler:
		present = b.Scheduler != nil
	default:
		return Problem{Code: "unknown_kind", Severity: SeverityError, BlockID: b.ID,
			Message: fmt.Sprintf("%q has an unrecognised kind %q.", b.ID, b.Kind)}, true
	}

	if !present {
		return Problem{Code: "missing_payload", Severity: SeverityError, BlockID: b.ID,
			Message: fmt.Sprintf("%q is a %s block with no %s content.", b.ID, b.Kind, b.Kind)}, true
	}
	if set > 1 {
		return Problem{Code: "ambiguous_payload", Severity: SeverityError, BlockID: b.ID,
			Message: fmt.Sprintf("%q carries content for more than one kind of block.", b.ID)}, true
	}
	return Problem{}, false
}

// semanticChecks are the "this will work and you probably did not mean it"
// findings: a document can ship with every one of these and still function.
func semanticChecks(doc *Document, index map[string]int, edges map[string][]string) []Problem {
	var out []Problem

	// Every token a contract body is allowed to use. Taken from the same
	// function Resolve interpolates with, so the two cannot drift apart.
	allowed := map[string]bool{}
	for k := range contractTokens(doc, Totals{}, nil) {
		allowed[k] = true
	}

	var firstServices, firstSignedContract = -1, -1
	for i, b := range doc.Blocks {
		if b.Kind == KindServices && firstServices < 0 {
			firstServices = i
		}
		if b.Kind == KindContract && b.Contract != nil && b.Contract.SignatureRequired && firstSignedContract < 0 {
			firstSignedContract = i
		}
	}

	for i, b := range doc.Blocks {
		// checkPayload has already reported any block whose Kind and payload
		// disagree. Skip those here rather than dereferencing a pointer it just
		// told us is nil: a second complaint about the same block adds nothing,
		// and a panic in a validator is the worst possible way to say "invalid".
		if _, bad := checkPayload(b); bad {
			continue
		}

		switch b.Kind {
		case KindServices:
			if len(b.Services.Options) == 0 {
				out = append(out, Problem{Code: "no_options", Severity: SeverityError, BlockID: b.ID,
					Message: fmt.Sprintf("%q offers nothing to choose from.", label(doc, b.ID))})
			}

		case KindContract:
			for _, tok := range tokensIn(b.Contract.Body) {
				if !allowed[tok] {
					out = append(out, Problem{Code: "unknown_token", Severity: SeverityWarning, BlockID: b.ID,
						Message: fmt.Sprintf("%q references {{%s}}, which nothing in this file provides. It will render empty.",
							label(doc, b.ID), tok)})
				}
			}

		case KindInvoice:
			if firstServices < 0 || firstServices > i {
				out = append(out, Problem{Code: "invoice_without_services", Severity: SeverityWarning, BlockID: b.ID,
					Message: fmt.Sprintf("%q has no services block before it, so it will always total zero.", label(doc, b.ID))})
			}
			// The rule the format exists for. An invoice that is not gated
			// behind a required signature lets a client pay for terms they
			// never agreed to, which is the mistake worth catching.
			if firstSignedContract >= 0 && !dependsOnSignedContract(doc, index, edges, b.ID) {
				out = append(out, Problem{Code: "ungated_invoice", Severity: SeverityWarning, BlockID: b.ID,
					Message: fmt.Sprintf("%q is reachable before the contract is signed. Add the contract to its requirements to gate payment behind signature.",
						label(doc, b.ID))})
			}
			if b.Invoice.DepositBps < 0 || b.Invoice.DepositBps > 10000 {
				out = append(out, Problem{Code: "bad_deposit", Severity: SeverityError, BlockID: b.ID,
					Message: fmt.Sprintf("%q asks for a deposit outside 0 to 100 percent.", label(doc, b.ID))})
			}

		case KindQuestionnaire:
			if len(b.Questionnaire.Questions) == 0 {
				out = append(out, Problem{Code: "no_questions", Severity: SeverityError, BlockID: b.ID,
					Message: fmt.Sprintf("%q asks nothing.", label(doc, b.ID))})
			}

		case KindScheduler:
			if len(b.Scheduler.Slots) == 0 {
				out = append(out, Problem{Code: "no_slots", Severity: SeverityError, BlockID: b.ID,
					Message: fmt.Sprintf("%q offers no times.", label(doc, b.ID))})
			}
		}
	}
	return out
}

// dependsOnSignedContract walks the gating edges transitively. A gate is still
// a gate when it is inherited: invoice waits on questionnaire waits on the
// signed contract means the invoice is gated.
func dependsOnSignedContract(doc *Document, index map[string]int, edges map[string][]string, from string) bool {
	seen := map[string]bool{}
	var walk func(string) bool
	walk = func(id string) bool {
		if seen[id] {
			return false
		}
		seen[id] = true
		for _, dep := range edges[id] {
			i, ok := index[dep]
			if !ok {
				continue
			}
			b := doc.Blocks[i]
			if b.Kind == KindContract && b.Contract != nil && b.Contract.SignatureRequired {
				return true
			}
			if walk(dep) {
				return true
			}
		}
		return false
	}
	return walk(from)
}

// topoSort runs Kahn's algorithm over the dependency edges. On success it
// returns an order in which every block's requirements come first. On failure
// it returns the actual ring of blocks involved, because "there is a cycle" is
// a much less useful sentence than naming the three blocks in it.
func topoSort(doc *Document, edges map[string][]string) (order []string, cycle []string) {
	indeg := map[string]int{}
	dependents := map[string][]string{}
	for _, b := range doc.Blocks {
		if _, ok := indeg[b.ID]; !ok {
			indeg[b.ID] = 0
		}
	}
	for id, deps := range edges {
		for _, dep := range deps {
			indeg[id]++
			dependents[dep] = append(dependents[dep], id)
		}
	}

	// Seed in document order so the result is stable rather than map-ordered.
	var queue []string
	for _, b := range doc.Blocks {
		if indeg[b.ID] == 0 {
			queue = append(queue, b.ID)
		}
	}

	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		order = append(order, id)
		next := append([]string(nil), dependents[id]...)
		sort.Strings(next)
		for _, d := range next {
			indeg[d]--
			if indeg[d] == 0 {
				queue = append(queue, d)
			}
		}
	}

	if len(order) == len(doc.Blocks) {
		return order, nil
	}

	// Whatever Kahn could not drain is inside or downstream of a cycle. Walk it
	// with DFS to pull out one concrete ring to name.
	remaining := map[string]bool{}
	for _, b := range doc.Blocks {
		remaining[b.ID] = true
	}
	for _, id := range order {
		delete(remaining, id)
	}
	return nil, findRing(doc, edges, remaining)
}

// findRing returns one cycle from the unresolved subgraph, as a path that
// starts and ends at the same block.
func findRing(doc *Document, edges map[string][]string, remaining map[string]bool) []string {
	state := map[string]int{} // 0 unvisited, 1 on stack, 2 done
	var stack []string
	var ring []string

	var dfs func(string) bool
	dfs = func(id string) bool {
		state[id] = 1
		stack = append(stack, id)
		for _, dep := range edges[id] {
			if !remaining[dep] {
				continue
			}
			if state[dep] == 1 {
				for i, s := range stack {
					if s == dep {
						ring = append(append([]string(nil), stack[i:]...), dep)
						return true
					}
				}
				ring = []string{dep, dep}
				return true
			}
			if state[dep] == 0 && dfs(dep) {
				return true
			}
		}
		stack = stack[:len(stack)-1]
		state[id] = 2
		return false
	}

	for _, b := range doc.Blocks {
		if remaining[b.ID] && state[b.ID] == 0 {
			if dfs(b.ID) {
				return ring
			}
		}
	}
	return nil
}

func label(doc *Document, id string) string {
	for _, b := range doc.Blocks {
		if b.ID == id {
			if b.Title != "" {
				return b.Title
			}
			return b.ID
		}
	}
	return id
}

func finish(v Validation) Validation {
	v.OK = true
	for _, p := range v.Problems {
		if p.Severity == SeverityError {
			v.OK = false
			break
		}
	}
	return v
}
