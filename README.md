# S3 File Demo

> ## 📺 [Watch the Video Demo](https://www.youtube.com/watch?v=-o2bXwdbRJ8)
>
> ## 💻 [GitHub Repo](https://github.com/Eclypses/aws-s3-bucket-presigned-url-demo)

A small demo app: log in, list files in an S3 bucket, upload new ones, and download them.

- **Frontend** — Vite + React + TypeScript with Tailwind CSS v4 and shadcn/ui, in [frontend/](frontend/).
- **Backend** — Go API in [server/](server/) using stdlib `net/http`, the AWS SDK v2, and JWT auth.
- **Uploads/downloads** go browser → S3 directly via presigned URLs; the server only signs URLs, so AWS credentials never leave it and file bytes never pass through it.

## Prerequisites

- **Go** 1.25+
- **Node.js** 20+ (for the frontend build/dev server)
- **An AWS account** with permission to create and use an S3 bucket
- **AWS CLI** configured (`aws configure`) — used to provision the bucket and to supply credentials to the server

## Setup

### 1. Configure AWS credentials

The server uses the AWS SDK's default credential chain, so any standard method works:

- `aws configure` (writes `~/.aws/credentials` and `~/.aws/config`), or
- environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`), or
- an SSO profile / IAM role.

The identity you use needs `s3:CreateBucket`, `s3:PutBucketCors`, `s3:PutBucketPublicAccessBlock` (for provisioning) and `s3:ListBucket`, `s3:GetObject`, `s3:PutObject` (at runtime).

### 2. Provision the S3 bucket

**Pick your own bucket name.** S3 bucket names are globally unique across all AWS accounts, so you can't reuse the one from this demo — choose your own and substitute it everywhere `<your-bucket-name>` appears below.

Run the provisioning script, which creates the bucket, blocks all public access, and applies the CORS rule the browser needs for presigned PUT/GET from `localhost`:

PowerShell:

```powershell
.\scripts\provision-s3.ps1 -Bucket <your-bucket-name> -Region us-east-1
```

Bash:

```bash
./scripts/provision-s3.sh <your-bucket-name> us-east-1
```

<details>
<summary>What the script does (equivalent manual commands)</summary>

Create the bucket (`us-east-1` must **not** pass a `LocationConstraint`; every other region requires one):

```bash
aws s3api create-bucket --bucket <your-bucket-name> --region us-east-1
```

Block all public access (presigned URLs still work with this on):

```bash
aws s3api put-public-access-block --bucket <your-bucket-name> \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

Apply the CORS rule — required because the browser PUTs/GETs directly to S3 with presigned URLs. Both the dev (5173) and production (8080) origins are allowed:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["http://localhost:8080", "http://localhost:5173"],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

```bash
aws s3api put-bucket-cors --bucket <your-bucket-name> --cors-configuration file://cors.json
```

Verify:

```bash
aws s3api get-bucket-cors --bucket <your-bucket-name>
aws s3api get-public-access-block --bucket <your-bucket-name>
```

</details>

### 3. Point the server at your bucket

The server reads the bucket name from the `S3_BUCKET` environment variable, and falls back to a compiled-in default in [server/main.go](server/main.go). That default is the original demo's bucket, which you can't use — so when recreating this on your own infrastructure you **must** either:

- set `S3_BUCKET=<your-bucket-name>` whenever you run the server (shown below), or
- edit the default in [server/main.go](server/main.go) to your own bucket name.

Otherwise the server will start against a bucket you don't own and every S3 call will fail.

## Running

### Start the Go API

```bash
S3_BUCKET=<your-bucket-name> AWS_REGION=us-east-1 go run ./server
```

PowerShell:

```powershell
$env:S3_BUCKET = "<your-bucket-name>"; $env:AWS_REGION = "us-east-1"; go run ./server
```

The server listens on `:8080` by default. See [Configuration](#configuration) for all environment variables.

### Start the frontend

**Development** (hot reload; the app calls the Go API cross-origin at `localhost:8080`, which allows CORS from the Vite origin):

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

Then open **http://localhost:5173**.

**Production mode** (Go serves the built app itself — build once, then only the Go server is needed):

```bash
npm run build --prefix frontend
```

Then open **http://localhost:8080** (the Go server serves `frontend/dist`).

### Log in

```
username: demo
password: password123
```

Upload a file, refresh the list, download it.

## Configuration

The server is configured entirely through environment variables:

| Variable      | Default                 | Purpose                                                                   |
| ------------- | ----------------------- | ------------------------------------------------------------------------- |
| `S3_BUCKET`   | (compiled-in default)   | Target S3 bucket                                                          |
| `AWS_REGION`  | `us-east-1`             | Bucket region                                                             |
| `ADDR`        | `:8080`                 | Address the API listens on                                                |
| `JWT_SECRET`  | `dev-secret-change-me`  | Signing secret for auth tokens — **set a real value outside local demos** |
| `CORS_ORIGIN` | `http://localhost:5173` | Browser origin allowed to call the API cross-origin in dev                |

Plus the standard AWS credential variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE`, etc.), which the SDK reads directly.

## API

| Route                    | Auth       | Behavior                                               |
| ------------------------ | ---------- | ------------------------------------------------------ |
| `POST /api/login`        | none       | `{username, password}` → `{token}` (JWT, 1 h expiry)   |
| `GET /api/files`         | Bearer JWT | Lists bucket objects as `[{name, size, lastModified}]` |
| `POST /api/files/upload` | Bearer JWT | `{filename}` → `{url}` presigned PUT URL (5 min)       |
| `GET /api/files/{name}`  | Bearer JWT | → `{url}` presigned GET URL (5 min)                    |

## Frontend stack

Scaffolded with `npm create vite@latest -- --template react-ts`, then:

- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin (no `tailwind.config` needed; `@import "tailwindcss"` in [src/index.css](frontend/src/index.css)).
- **shadcn/ui** initialized with `npx shadcn@latest init -y -b radix -p nova`; components added with `npx shadcn@latest add button card input label table -y`.
- In dev, the app calls the API directly at `http://localhost:8080` (no Vite proxy); the Go server answers CORS preflights for the 5173 origin ([server/main.go](server/main.go)). Production builds are served by the Go server itself from `frontend/dist`, so those requests are same-origin.

## Troubleshooting

### Running on Windows with WSL

If you build/run the Go server inside WSL while your AWS credentials live on the Windows side, point the SDK at the Windows credential files:

```bash
AWS_SHARED_CREDENTIALS_FILE=/mnt/c/Users/<you>/.aws/credentials \
AWS_CONFIG_FILE=/mnt/c/Users/<you>/.aws/config \
S3_BUCKET=<your-bucket-name> go run ./server
```

### Port 8080 already forwarded

On some Windows machines a `netsh` portproxy rule forwards `0.0.0.0:8080` into WSL, so a server on the Windows side can't bind 8080. Either run the Go server inside WSL (where 8080 is free and still reachable at `localhost:8080` through the rule), or set a different port with `ADDR` (e.g. `ADDR=:9090`). WSL2 IPs change across reboots — if `localhost:8080` stops responding, compare `netsh interface portproxy show all` against `wsl hostname -I` and update or delete the stale rule.

## Notes / demo limitations

- Single hardcoded user; a real app would use a user store with hashed passwords.
- Object keys are restricted to flat filenames (no `/`).
- `JWT_SECRET` has a dev default — set a real one anywhere beyond local demos.
