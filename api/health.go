// Spike: proves the Go runtime is reachable from inside this Next.js project.
// Vercel turns every .go file under /api that exports an http.HandlerFunc into
// its own function, resolving dependencies from the go.mod at the repo root.
// If this responds in a preview deployment, the rules engine can live in Go.
package handler

import (
	"encoding/json"
	"net/http"
	"runtime"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":      true,
		"runtime": runtime.Version(),
		"arch":    runtime.GOARCH,
	})
}
