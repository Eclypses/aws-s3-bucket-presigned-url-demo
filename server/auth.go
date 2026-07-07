package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Demo credentials — a real app would use a user store with hashed passwords.
const (
	demoUsername = "demo"
	demoPassword = "password123"
)

func jwtSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("dev-secret-change-me")
}

func jsonEncode(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	// Emit presigned URLs with literal ampersands, not unicode-escaped ones.
	enc.SetEscapeHTML(false)
	return enc.Encode(v)
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if req.Username != demoUsername || req.Password != demoPassword {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	claims := jwt.MapClaims{
		"sub": req.Username,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(time.Hour).Unix(),
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(jwtSecret())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not sign token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authz := r.Header.Get("Authorization")
		tokenStr, ok := strings.CutPrefix(authz, "Bearer ")
		if !ok || tokenStr == "" {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		_, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			return jwtSecret(), nil
		}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		next.ServeHTTP(w, r)
	})
}
