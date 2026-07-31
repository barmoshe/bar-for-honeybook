package engine

import (
	"fmt"
	"regexp"
	"strings"
)

// Resolve turns a document plus everything the client has done so far into the
// exact view that client is allowed to see right now.
//
// It runs in two passes on purpose. The first works out what is *complete*,
// which depends only on the client's own input; the second works out what is
// *locked*, which depends on the first. Splitting them means Resolve does not
// care what order the blocks are in and cannot recurse, so a document that
// failed Validate still produces a sane, safe answer instead of hanging.
//
// The safety property, stated precisely: a locked block's payload is never
// assembled, so an unsigned client receives no invoice lines and no contract
// text over the wire. Document-level Totals are still present, because the
// client chose the services that produced them and hiding their own arithmetic
// from them would be theatre rather than security. The gate that actually
// refuses a payment lives in the action layer, and it refuses by asking this
// function.
func Resolve(doc *Document, state State) Resolved {
	out := Resolved{Currency: "USD"}
	if doc == nil {
		return out
	}
	out.DocumentID = doc.ID
	if doc.Currency != "" {
		out.Currency = doc.Currency
	}

	lines, chosen := lineItems(doc, state)
	totals := totalsFor(doc, lines, state)
	out.Totals = totals

	// Pass 1: completeness, from client input alone.
	complete := map[string]bool{}
	for _, b := range doc.Blocks {
		complete[b.ID] = isComplete(b, state, totals)
	}

	// Pass 2: gating, from completeness.
	for _, b := range doc.Blocks {
		rb := ResolvedBlock{ID: b.ID, Kind: b.Kind, Title: b.Title}

		var blockers []string
		for _, dep := range b.RequiresComplete {
			if dep == b.ID {
				continue
			}
			if !known(doc, dep) {
				continue
			}
			if !complete[dep] {
				blockers = append(blockers, dep)
			}
		}

		switch {
		case len(blockers) > 0:
			rb.Status = StatusLocked
			rb.LockedBy = blockers
			rb.LockReason = lockSentence(doc, blockers)
		case complete[b.ID]:
			rb.Status = StatusComplete
		default:
			rb.Status = StatusOpen
		}

		if rb.Status != StatusLocked {
			attachPayload(&rb, b, doc, state, totals, lines, chosen)
		}

		out.Blocks = append(out.Blocks, rb)
	}

	out.Complete = true
	for _, b := range doc.Blocks {
		if b.Required && !complete[b.ID] {
			out.Complete = false
			break
		}
	}

	for i, rb := range out.Blocks {
		if rb.Status == StatusOpen {
			out.Next = nextAction(doc.Blocks[i], totals, out.Currency)
			break
		}
	}
	return out
}

// effectiveQty is the single source of truth for "how many of this option did
// the client actually take", after the block's selection mode and the option's
// own cap have had their say. Pricing and rendering both go through it, so the
// invoice can never charge for a choice the UI is not showing as chosen.
//
// takenSoFar is the number of options already accepted in this block, which is
// what lets a single-select block keep the first choice and drop the rest
// rather than silently summing a selection it never offered.
func effectiveQty(b Block, picks []Pick, opt ServiceOption, takenSoFar int) int {
	qty := 0
	for _, p := range picks {
		if p.OptionID != opt.ID {
			continue
		}
		qty = p.Qty
		if qty <= 0 {
			qty = 1
		}
		break
	}
	if qty <= 0 {
		return 0
	}
	if b.Services != nil && b.Services.Mode == SelectOne {
		if takenSoFar > 0 {
			return 0
		}
		return 1
	}
	max := opt.MaxQty
	if max <= 0 {
		max = 1
	}
	if qty > max {
		qty = max
	}
	return qty
}

// lineItems flattens every services selection in the document into invoice
// lines, and returns the display labels alongside for contract interpolation.
func lineItems(doc *Document, state State) ([]InvoiceLine, []string) {
	var lines []InvoiceLine
	var labels []string

	for _, b := range doc.Blocks {
		if b.Kind != KindServices || b.Services == nil {
			continue
		}
		picks := state.Selections[b.ID]
		taken := 0
		for _, opt := range b.Services.Options {
			qty := effectiveQty(b, picks, opt, taken)
			if qty <= 0 {
				continue
			}
			taken++
			lines = append(lines, InvoiceLine{
				Label:       opt.Name,
				Qty:         qty,
				UnitCents:   opt.PriceCents,
				AmountCents: opt.PriceCents * int64(qty),
			})
			if qty > 1 {
				labels = append(labels, fmt.Sprintf("%s (x%d)", opt.Name, qty))
			} else {
				labels = append(labels, opt.Name)
			}
		}
	}
	return lines, labels
}

// totalsFor prices the document. Tax and deposit terms come from the first
// invoice block; a document with two invoices is not something the demo builds,
// and pretending to split a single running total across several of them would
// be a worse lie than taking the first.
func totalsFor(doc *Document, lines []InvoiceLine, state State) Totals {
	var t Totals
	for _, l := range lines {
		t.SubtotalCents += l.AmountCents
	}

	var inv *InvoiceBlock
	for _, b := range doc.Blocks {
		if b.Kind == KindInvoice && b.Invoice != nil {
			inv = b.Invoice
			break
		}
	}

	if inv != nil {
		t.TaxCents = applyBps(t.SubtotalCents, inv.TaxBps)
	}
	t.TotalCents = t.SubtotalCents + t.TaxCents

	t.DepositDueCents = t.TotalCents
	if inv != nil && inv.DepositBps > 0 && inv.DepositBps < 10000 {
		t.DepositDueCents = applyBps(t.TotalCents, inv.DepositBps)
	}

	t.PaidCents = state.PaidCents
	t.BalanceCents = t.TotalCents - t.PaidCents

	switch {
	case t.PaidCents < t.DepositDueCents:
		t.DueNowCents = t.DepositDueCents - t.PaidCents
	default:
		t.DueNowCents = t.BalanceCents
	}
	if t.DueNowCents < 0 {
		t.DueNowCents = 0
	}
	return t
}

// isComplete answers "has the client done what this block asks", using nothing
// but their own input. Deliberately independent of gating, so the two passes in
// Resolve cannot chase each other.
func isComplete(b Block, state State, t Totals) bool {
	switch b.Kind {
	case KindServices:
		if b.Services == nil {
			return false
		}
		return len(state.Selections[b.ID]) > 0

	case KindContract:
		if b.Contract == nil {
			return false
		}
		if !b.Contract.SignatureRequired {
			// Nothing to satisfy, so an unsigned contract never holds up the
			// blocks behind it.
			return true
		}
		return strings.TrimSpace(state.Signed[b.ID]) != ""

	case KindInvoice:
		if t.TotalCents == 0 {
			return true
		}
		return t.PaidCents >= t.DepositDueCents

	case KindQuestionnaire:
		if b.Questionnaire == nil {
			return false
		}
		answers := state.Answers[b.ID]
		for _, q := range b.Questionnaire.Questions {
			if q.Required && strings.TrimSpace(answers[q.ID]) == "" {
				return false
			}
		}
		return true

	case KindScheduler:
		if b.Scheduler == nil {
			return false
		}
		return state.Booked[b.ID] != ""
	}
	return false
}

func attachPayload(rb *ResolvedBlock, b Block, doc *Document, state State, t Totals, lines []InvoiceLine, chosen []string) {
	switch b.Kind {
	case KindServices:
		if b.Services == nil {
			return
		}
		picks := state.Selections[b.ID]
		rs := &ResolvedServices{Mode: b.Services.Mode}
		for _, opt := range b.Services.Options {
			qty := effectiveQty(b, picks, opt, rs.Selected)
			ro := ResolvedOption{ServiceOption: opt, Chosen: qty > 0, Qty: qty}
			if qty > 0 {
				ro.LineCents = opt.PriceCents * int64(qty)
				rs.Selected++
			}
			rs.Options = append(rs.Options, ro)
		}
		rb.Services = rs

	case KindContract:
		if b.Contract == nil {
			return
		}
		sig := state.Signed[b.ID]
		rb.Contract = &ResolvedContract{
			Body:              interpolate(b.Contract.Body, contractTokens(doc, t, chosen)),
			SignatureRequired: b.Contract.SignatureRequired,
			Signature:         sig,
			Signed:            strings.TrimSpace(sig) != "",
		}

	case KindInvoice:
		if b.Invoice == nil {
			return
		}
		rb.Invoice = &ResolvedInvoice{Lines: lines, Totals: t}

	case KindQuestionnaire:
		if b.Questionnaire == nil {
			return
		}
		answers := state.Answers[b.ID]
		rq := &ResolvedQuestionnaire{}
		for _, q := range b.Questionnaire.Questions {
			rq.Questions = append(rq.Questions, ResolvedQuestion{Question: q, Answer: answers[q.ID]})
		}
		rb.Questionnaire = rq

	case KindScheduler:
		if b.Scheduler == nil {
			return
		}
		rb.Scheduler = &ResolvedScheduler{Slots: b.Scheduler.Slots, Booked: state.Booked[b.ID]}
	}
}

func nextAction(b Block, t Totals, currency string) *NextAction {
	na := &NextAction{BlockID: b.ID, Kind: b.Kind}
	switch b.Kind {
	case KindServices:
		na.Verb, na.Label = "select", "Choose your services"
	case KindContract:
		na.Verb, na.Label = "sign", "Read and sign the agreement"
	case KindInvoice:
		na.Verb = "pay"
		na.Label = fmt.Sprintf("Pay %s", FormatMoney(t.DueNowCents, currency))
	case KindQuestionnaire:
		na.Verb, na.Label = "answer", "Answer a few questions"
	case KindScheduler:
		na.Verb, na.Label = "book", "Pick a time"
	default:
		return nil
	}
	return na
}

func lockSentence(doc *Document, blockers []string) string {
	names := make([]string, 0, len(blockers))
	for _, id := range blockers {
		names = append(names, fmt.Sprintf("%q", label(doc, id)))
	}
	switch len(names) {
	case 1:
		return fmt.Sprintf("Unlocks once you finish %s.", names[0])
	case 2:
		return fmt.Sprintf("Unlocks once you finish %s and %s.", names[0], names[1])
	default:
		return fmt.Sprintf("Unlocks once you finish %s and %s.",
			strings.Join(names[:len(names)-1], ", "), names[len(names)-1])
	}
}

func known(doc *Document, id string) bool {
	for _, b := range doc.Blocks {
		if b.ID == id {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Contract interpolation.
// ---------------------------------------------------------------------------

var tokenPattern = regexp.MustCompile(`\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}`)

// contractTokens is the single source of truth for what a contract body may
// reference. Validate takes its key set to flag unknown tokens, so a token that
// renders is always a token the studio accepts, and vice versa.
func contractTokens(doc *Document, t Totals, chosen []string) map[string]string {
	business, client, title, currency := "", "", "", "USD"
	if doc != nil {
		business, client, title = doc.Business, doc.Client, doc.Title
		if doc.Currency != "" {
			currency = doc.Currency
		}
	}
	services := strings.Join(chosen, ", ")
	if services == "" {
		services = "the services selected above"
	}
	return map[string]string{
		"business": business,
		"client":   client,
		"title":    title,
		"services": services,
		"subtotal": FormatMoney(t.SubtotalCents, currency),
		"tax":      FormatMoney(t.TaxCents, currency),
		"total":    FormatMoney(t.TotalCents, currency),
		"deposit":  FormatMoney(t.DepositDueCents, currency),
		"balance":  FormatMoney(t.BalanceCents, currency),
		"due_now":  FormatMoney(t.DueNowCents, currency),
	}
}

// interpolate replaces every known token and blanks the rest. Leaving an
// unresolved {{token}} visible in a contract a client is about to sign would be
// worse than an empty gap, and Validate has already warned the author about it.
func interpolate(body string, tokens map[string]string) string {
	return tokenPattern.ReplaceAllStringFunc(body, func(m string) string {
		name := tokenPattern.FindStringSubmatch(m)[1]
		return tokens[name]
	})
}

func tokensIn(body string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range tokenPattern.FindAllStringSubmatch(body, -1) {
		if !seen[m[1]] {
			seen[m[1]] = true
			out = append(out, m[1])
		}
	}
	return out
}
