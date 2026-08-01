// Package handler is the HTTP boundary in front of the rules engine.
//
// It does three things and nothing else: read JSON, call a pure function, write
// JSON. Every decision worth arguing about lives in the engine package, where it
// can be tested without a server.
//
// # Why one function instead of several
//
// Vercel turns each .go file under /api into its own function, so the obvious
// shape here is /api/resolve and /api/validate as separate files. Two things
// pushed against that, both found by trying it:
//
//  1. Each file is compiled in isolation alongside a generated entrypoint, so
//     files in this directory cannot see each other even when they declare the
//     same package. Shared plumbing has to live somewhere importable, which is
//     what ../httpx is for.
//  2. `vercel dev` generates its entrypoint and its dev-server main into the
//     same cache directory per function, and with more than one Go function
//     that build fails with "found packages handler and main". A local dev loop
//     that does not run the real engine is not worth having.
//
// So: one function, dispatching on an op. That is not a compromise for a pure
// rules engine, which is genuinely RPC rather than REST. It also keeps a single
// function warm instead of two, which matters on a free plan metered by CPU.
package handler

import (
	"net/http"
	"time"

	"github.com/barmoshe/bar-for-honeybook/engine"
	"github.com/barmoshe/bar-for-honeybook/httpx"
)

type request struct {
	// Op selects the operation: "resolve", "validate", "advance", or "health".
	Op       string          `json:"op"`
	Document engine.Document `json:"document"`
	State    engine.State    `json:"state"`

	// advance
	Automation engine.Automation `json:"automation"`
	Cursor     int               `json:"cursor"`
	Facts      engine.Facts      `json:"facts"`
	// AsOf is the automation engine's clock, passed in rather than read, so a
	// three-day wait can be a parameter instead of three days.
	AsOf string `json:"asOf"`
}

// Engine answers one of three questions, all of them pure functions of the
// request body:
//
//	resolve  - what is this client allowed to see and do right now
//	validate - can this document be completed at all, and if not, why
//	advance  - what does this automation run do next, as of a given moment
//	health   - is the Go runtime up
func Engine(w http.ResponseWriter, r *http.Request) {
	if !httpx.RequirePost(w, r, `POST {"op":"resolve"|"validate"|"advance"|"health", ...}.`) {
		return
	}

	var req request
	if !httpx.Decode(w, r, &req) {
		return
	}

	switch req.Op {
	case "resolve":
		httpx.WriteJSON(w, http.StatusOK, engine.Resolve(&req.Document, req.State))
	case "validate":
		httpx.WriteJSON(w, http.StatusOK, engine.Validate(&req.Document))
	case "advance":
		asOf, err := time.Parse(time.RFC3339, req.AsOf)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "asOf must be an RFC3339 timestamp.")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, engine.Advance(&req.Automation, req.Cursor, req.Facts, asOf))
	case "health":
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "engine": "go"})
	default:
		httpx.WriteError(w, http.StatusBadRequest,
			`Unknown op. Use "resolve", "validate", "advance", or "health".`)
	}
}
