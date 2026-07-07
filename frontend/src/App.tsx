import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clearToken,
  downloadFile,
  getToken,
  listFiles,
  login,
  setToken,
  uploadFile,
  type FileInfo,
} from "@/lib/api";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const USERNAME = "demo";
const PASSWORD = "password123";

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState(USERNAME);
  const [password, setPassword] = useState(PASSWORD);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setToken(await login(username, password));
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Demo credentials: <code className="font-mono">{USERNAME}</code> /{" "}
          <code className="font-mono">{PASSWORD}</code>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Log in"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function FilesView({ onLogout }: { onLogout: () => void }) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleError = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (!getToken()) onLogout();
    },
    [onLogout],
  );

  const refresh = useCallback(async () => {
    setError("");
    try {
      setFiles(await listFiles());
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError("");
    setStatus(`Uploading ${file.name} to S3…`);
    setUploading(true);
    try {
      await uploadFile(file);
      setStatus(`Uploaded ${file.name} ✔`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (err) {
      setStatus("");
      handleError(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(name: string) {
    setError("");
    try {
      // The file arrives MTE-encrypted via the relay; hand the decrypted
      // blob to the browser as a regular download.
      const blob = await downloadFile(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      handleError(err);
    }
  }

  return (
    <div className="grid w-full max-w-2xl gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-semibold text-foreground">demo</span>
        </p>
        <Button variant="outline" size="sm" onClick={onLogout}>
          Log out
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a file</CardTitle>
          <CardDescription>
            Uploads go to S3 with a presigned URL, MTE-encrypted through the
            relay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex items-center gap-3">
            <Input
              ref={fileInputRef}
              type="file"
              required
              className="max-w-xs"
            />
            <Button type="submit" disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </form>
          {status && (
            <p role="status" className="mt-3 text-sm text-emerald-600">
              {status}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Files</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No files in the bucket yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Last modified</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.name}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{formatSize(f.size)}</TableCell>
                    <TableCell>
                      {new Date(f.lastModified).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDownload(f.name)}
                      >
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => Boolean(getToken()));

  function logout() {
    clearToken();
    setLoggedIn(false);
  }

  return (
    <main className="flex min-h-svh flex-col items-center gap-8 bg-background px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">S3 File Demo</h1>
      {loggedIn ? (
        <FilesView onLogout={logout} />
      ) : (
        <LoginView onLogin={() => setLoggedIn(true)} />
      )}
    </main>
  );
}
