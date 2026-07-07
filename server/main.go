package main

import (
	"context"
	"log"
	"net/http"
	"os"
)

func main() {
	bucket := os.Getenv("S3_BUCKET")
	if bucket == "" {
		bucket = "mte-relay-s3-demo-001"
	}
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "us-east-1"
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}

	s3c, err := newS3Client(context.Background(), bucket, region)
	if err != nil {
		log.Fatalf("failed to init S3 client: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/login", handleLogin)
	mux.Handle("GET /api/files", requireAuth(http.HandlerFunc(s3c.handleList)))
	mux.Handle("POST /api/files/upload", requireAuth(http.HandlerFunc(s3c.handleUpload)))
	mux.Handle("GET /api/files/{name}", requireAuth(http.HandlerFunc(s3c.handleDownload)))
	mux.Handle("/", http.FileServer(http.Dir("frontend/dist")))

	log.Printf("listening on %s (bucket=%s region=%s)", addr, bucket, region)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

// withCORS lets the Vite dev server origin call the API from another port.
// Production builds are served by this server, so those requests are
// same-origin and skip CORS entirely.
func withCORS(next http.Handler) http.Handler {
	allowedOrigin := os.Getenv("CORS_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "http://localhost:5173"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") == allowedOrigin {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", allowedOrigin)
			h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			h.Set("Vary", "Origin")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := jsonEncode(w, v); err != nil {
		log.Printf("write response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
