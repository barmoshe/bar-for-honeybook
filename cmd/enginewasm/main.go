//go:build js && wasm

// Command enginewasm is the same rules engine, compiled to WebAssembly.
//
// Not a port. It imports the identical `engine` package the Vercel Function
// imports, so there is no second implementation to keep in agreement, and the
// CI equivalence check proves it byte for byte.
//
// # Why this exists
//
// The HTTP transport works and has one sharp edge that only appears in
// production: a server component fetching its own function has to name a host,
// and the deployment-specific host sits behind Vercel's SSO wall, so two routes
// 500'd while two were fine. That class of bug does not exist when the engine is
// a function call.
//
// It also removes a whole invocation per render on a plan metered by CPU.
//
//	npm run build:wasm      # -> public/engine.wasm
//
// The build is checked into the repo and CI rebuilds it to assert it matches.
// Committing a binary is normally a smell; here it buys deploy determinism,
// because the Go toolchain exists during Vercel's build and not inside the
// running function, and the staleness check means it cannot quietly rot.
package main

import (
	"encoding/json"
	"syscall/js"
	"time"

	"github.com/barmoshe/bar-for-honeybook/engine"
)

func main() {
	js.Global().Set("__hbEngine", js.ValueOf(map[string]any{
		"call": js.FuncOf(call),
	}))

	// A Go program whose main returns takes the runtime down with it, and the
	// exported function would stop answering. Block forever instead: the host
	// decides when this instance dies.
	select {}
}

// call takes one JSON string and returns one JSON string.
//
// Strings rather than JS objects on purpose. Marshalling through
// encoding/json is the same path the HTTP handler takes, so the two transports
// cannot disagree about how a struct becomes JSON, which is exactly what the
// equivalence check is there to guarantee. Passing js.Value objects would be
// marginally faster and would introduce a second serialisation to be wrong.
func call(_ js.Value, args []js.Value) any {
	if len(args) != 1 {
		return errorJSON("expected exactly one argument")
	}

	var req struct {
		Op       string          `json:"op"`
		Document engine.Document `json:"document"`
		State    engine.State    `json:"state"`

		Automation engine.Automation `json:"automation"`
		Cursor     int               `json:"cursor"`
		Facts      engine.Facts      `json:"facts"`
		AsOf       string            `json:"asOf"`
	}
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return errorJSON("That is not a document this engine understands.")
	}

	var payload any
	switch req.Op {
	case "resolve":
		payload = engine.Resolve(&req.Document, req.State)
	case "validate":
		payload = engine.Validate(&req.Document)
	case "advance":
		asOf, err := time.Parse(time.RFC3339, req.AsOf)
		if err != nil {
			return errorJSON("asOf must be an RFC3339 timestamp.")
		}
		payload = engine.Advance(&req.Automation, req.Cursor, req.Facts, asOf)
	case "health":
		payload = map[string]any{"ok": true, "engine": "go", "transport": "wasm"}
	default:
		return errorJSON(`Unknown op. Use "resolve", "validate", "advance", or "health".`)
	}

	out, err := json.Marshal(payload)
	if err != nil {
		return errorJSON("The engine could not encode its answer.")
	}
	return string(out)
}

func errorJSON(message string) string {
	out, _ := json.Marshal(map[string]string{"error": message})
	return string(out)
}
