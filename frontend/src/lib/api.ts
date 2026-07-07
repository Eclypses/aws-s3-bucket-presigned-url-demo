export interface FileInfo {
  name: string
  size: number
  lastModified: string
}

// In dev the API runs on its own port and the Go server allows CORS from 5173;
// in production the Go server serves this app, so requests are same-origin.
const API_BASE = import.meta.env.DEV ? "http://localhost:8080" : ""

const TOKEN_KEY = "token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired — please log in again.")
  }
}

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || "Login failed")
  return body.token as string
}

// Calls the Go API with the JWT attached; throws SessionExpiredError on 401.
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${getToken()}`,
    },
  })
  if (res.status === 401) {
    clearToken()
    throw new SessionExpiredError()
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export function listFiles(): Promise<FileInfo[]> {
  return api<FileInfo[]>("/api/files")
}

export async function getDownloadUrl(name: string): Promise<string> {
  const { url } = await api<{ url: string }>(`/api/files/${encodeURIComponent(name)}`)
  return url
}

// Two-step presigned upload: ask the API for a PUT URL, then send the file straight to S3.
export async function uploadFile(file: File): Promise<void> {
  const { url } = await api<{ url: string }>("/api/files/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name }),
  })
  const put = await fetch(url, { method: "PUT", body: file })
  if (!put.ok) throw new Error(`S3 upload failed (${put.status})`)
}
