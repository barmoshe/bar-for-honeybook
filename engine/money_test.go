package engine

import "testing"

// TestApplyBpsRoundsHalfAwayFromZero pins the rounding rule down, including
// below zero. The negative cases are the ones worth having: nothing in the demo
// refunds anything today, and a money helper that quietly behaves differently
// on one side of zero is exactly the kind of thing that is discovered later by
// someone reconciling a statement.
func TestApplyBpsRoundsHalfAwayFromZero(t *testing.T) {
	cases := []struct {
		cents int64
		bps   int
		want  int64
	}{
		{0, 5000, 0},
		{100, 0, 0},
		{100, 10000, 100},
		{1, 5000, 1},          // 0.5 rounds up, not to even
		{3, 5000, 2},          // 1.5 rounds up
		{2, 5000, 1},          // exact
		{316551, 1000, 31655}, // 31655.1 rounds down
		{316555, 1000, 31656}, // 31655.5 rounds up
		{-1, 5000, -1},        // symmetric below zero
		{-3, 5000, -2},
		{-316551, 1000, -31655},
	}
	for _, c := range cases {
		if got := applyBps(c.cents, c.bps); got != c.want {
			t.Errorf("applyBps(%d, %d) = %d, want %d", c.cents, c.bps, got, c.want)
		}
	}
}

func TestFormatMoney(t *testing.T) {
	cases := []struct {
		cents    int64
		currency string
		want     string
	}{
		{0, "USD", "$0.00"},
		{5, "USD", "$0.05"},
		{100, "USD", "$1.00"},
		{99999, "USD", "$999.99"},
		{100000, "USD", "$1,000.00"},
		{123456789, "USD", "$1,234,567.89"},
		{-2550, "USD", "-$25.50"},
		{174103, "EUR", "€1,741.03"},
		{174103, "ILS", "₪1,741.03"},
		{174103, "", "$1,741.03"},
		// An unfamiliar currency gets its code rather than a guessed glyph.
		{174103, "JPY", "1,741.03 JPY"},
	}
	for _, c := range cases {
		if got := FormatMoney(c.cents, c.currency); got != c.want {
			t.Errorf("FormatMoney(%d, %q) = %q, want %q", c.cents, c.currency, got, c.want)
		}
	}
}
