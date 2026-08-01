package engine

import (
	"fmt"
	"strings"
)

// applyBps multiplies an integer cent amount by a basis-point rate and rounds
// half away from zero, staying in int64 throughout.
//
// The rounding rule is a decision, not an accident. Half away from zero is what
// an invoice reader expects (a 50% deposit on $10.01 is $5.01, not $5.00) and
// it is what spreadsheets do, so a member reconciling by hand agrees with the
// software. Banker's rounding is better for long statistical sums and worse
// here, because nobody is summing thousands of deposits and everybody notices
// a cent missing from theirs.
//
// Negative amounts round symmetrically, so a credit of -1001 at 5000bps is
// -501 rather than -500. Refunds are not modelled in the demo, but a money
// helper that quietly behaves differently below zero is a landmine.
func applyBps(cents int64, bps int) int64 {
	if bps == 0 || cents == 0 {
		return 0
	}
	n := cents * int64(bps)
	if n < 0 {
		return -((-n + 5000) / 10000)
	}
	return (n + 5000) / 10000
}

// FormatMoney renders integer cents for display, with thousands separators and
// a currency symbol where there is a familiar one.
//
// Formatting lives here rather than in the UI so the contract text, the invoice
// lines and the totals row can never disagree about how the same number looks.
func FormatMoney(cents int64, currency string) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	whole := cents / 100
	frac := cents % 100

	digits := fmt.Sprintf("%d", whole)
	var b strings.Builder
	for i, r := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}

	symbol, suffix := currencyAffix(currency)
	out := fmt.Sprintf("%s%s.%02d%s", symbol, b.String(), frac, suffix)
	if neg {
		out = "-" + out
	}
	return out
}

// currencyAffix returns a leading symbol and a trailing code. Anything not in
// the short list falls back to a trailing ISO code rather than guessing a
// glyph, because a wrong currency symbol on an invoice is worse than a verbose
// correct one.
func currencyAffix(currency string) (symbol, suffix string) {
	switch strings.ToUpper(currency) {
	case "", "USD":
		return "$", ""
	case "EUR":
		return "€", ""
	case "GBP":
		return "£", ""
	case "ILS":
		return "₪", ""
	default:
		return "", " " + strings.ToUpper(currency)
	}
}
