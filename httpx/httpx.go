// Package httpx holds the JSON plumbing shared by the functions under /api.
//
// It exists because of a real constraint rather than a preference: Vercel's Go
// builder compiles each file under /api on its own, alongside a generated
// entrypoint, so two files in that directory cannot see each other even when
// they declare the same package. Anything shared has to be somewhere importable.
// Finding that out cost one 502 and was worth writing down.
package httpx

import (
	"encoding/json"
	"io"
	"net/http"
)

// MaxBody caps request size. These endpoints are public and unauthenticated, so
// the cheapest abuse available is a very large body. 256KB is far more than any
// smart file the studio can build and far less than anything worth parsing by
// accident.
const MaxBody = 256 << 10

// Decode reads a capped JSON body and writes the error response itself when it
// cannot, returning false so the caller can simply stop.
func Decode(w http.ResponseWriter, r *http.Request, into any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, MaxBody))
	if err != nil {
		WriteError(w, http.StatusRequestEntityTooLarge, "That document is too large.")
		return false
	}
	if err := json.Unmarshal(body, into); err != nil {
		WriteError(w, http.StatusBadRequest, "That is not a document this engine understands.")
		return false
	}
	return true
}

func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	// The engine is a pure function of its input, so a response is safe to
	// reuse for an identical request and useless to keep past that.
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

// RequirePost rejects anything that is not a POST, writing the response itself.
func RequirePost(w http.ResponseWriter, r *http.Request, hint string) bool {
	if r.Method != http.MethodPost {
		WriteError(w, http.StatusMethodNotAllowed, hint)
		return false
	}
	return true
}
