import { mteFetch } from "mte-relay-browser-public-client"

export interface FileInfo {
  name: string
  size: number
  lastModified: string
}

// All HTTP traffic is MTE-encrypted and sent through the MTE Relay on port
// 8080 (docker-compose.yml), which decrypts and forwards by Host header:
//   api-relay.local:8080 -> the Go API (localhost:8081)
//   s3-relay.local:8080  -> the S3 bucket
const API_RELAY = "http://api-relay.local:8080"
const S3_RELAY = "http://s3-relay.local:8080"

// Presigned URLs point at the real S3 host. Swap the origin for the S3 relay
// host so the transfer goes through MTE; the path and query (including the
// SigV4 signature) must pass through unchanged, and the relay restores the
// bucket host it proxies to, which is what the signature covers.
function toS3RelayUrl(presigned: string): string {
  const u = new URL(presigned)
  return `${S3_RELAY}${u.pathname}${u.search}`
}

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
  const res = await mteFetch(`${API_RELAY}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || "Login failed")
  return body.token as string
}

// Calls the Go API through the relay with the JWT attached; throws
// SessionExpiredError on 401.
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await mteFetch(`${API_RELAY}${path}`, {
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

// Two-step presigned upload: ask the API for a PUT URL, then send the file
// to S3 through the S3 relay.
export async function uploadFile(file: File): Promise<void> {
  const { url } = await api<{ url: string }>("/api/files/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name }),
  })
  // S3 rejects chunked PUTs without a Content-Length (501 NotImplemented),
  // so disable streaming and let the relay forward a fixed-length body.
  const put = await mteFetch(
    toS3RelayUrl(url),
    { method: "PUT", body: file },
    { useStreaming: false },
  )
  if (!put.ok) throw new Error(`S3 upload failed (${put.status})`)
}

// Fetches the object through the S3 relay (presigned GET) as a Blob so the
// download itself is MTE-encrypted, not a plain browser navigation.
export async function downloadFile(name: string): Promise<Blob> {
  const { url } = await api<{ url: string }>(`/api/files/${encodeURIComponent(name)}`)
  const res = await mteFetch(toS3RelayUrl(url))
  if (!res.ok) throw new Error(`S3 download failed (${res.status})`)
  return res.blob()
}
