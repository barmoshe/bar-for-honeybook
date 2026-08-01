// Command engine serves the rules engine over HTTP for local development.
//
// In production the engine is a Vercel Function built from ../../api/engine.go.
// `vercel dev` is supposed to serve that same function locally, but its Go dev
// builder generates its entrypoint and its dev-server main into one directory
// and then fails to build them ("found packages handler and main"), so the
// local loop needs its own front door.
//
// It is deliberately the *same* handler rather than a reimplementation, so
// there is nothing to keep in sync: if this server answers, the deployed
// function answers identically.
//
//	go run ./cmd/engine               # listens on :4310
//	ENGINE_PORT=5000 go run ./cmd/engine
package main

import (
	"log"
	"net/http"
	"os"

	handler "github.com/barmoshe/bar-for-honeybook/api"
)

func main() {
	// ENGINE_PORT rather than PORT on purpose. Next also reads PORT, and any
	// harness that runs `npm run dev` with one injected (a preview runner, a
	// container, a CI job) would otherwise hand the same port to both processes
	// and leave whichever bound first serving everything. That failure is
	// especially unhelpful because it looks like a routing bug in the app: the
	// pages return Go's plain "404 page not found".
	port := os.Getenv("ENGINE_PORT")
	if port == "" {
		port = "4310"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/engine", withDevCORS(handler.Engine))

	log.Printf("rules engine listening on http://127.0.0.1:%s/api/engine", port)
	if err := http.ListenAndServe("127.0.0.1:"+port, mux); err != nil {
		log.Fatal(err)
	}
}

// withDevCORS allows the Next dev server on another port to call this one.
// It is scoped to localhost origins and only compiled into this command, so
// nothing this permissive ever reaches the deployed function.
func withDevCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Headers", "content-type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}
