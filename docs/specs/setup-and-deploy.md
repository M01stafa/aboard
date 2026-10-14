# Aboard spec — Accounts, keys, environment, libraries and deployment

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

## 5. Requirements checklist (accounts, tools, keys)

### 5.1 Accounts and services
| Item | Purpose | Cost note |
|---|---|---|
| Domain (e.g. `aboard.example`) with DNS access | App, API, OAuth branding | Required for Google verification |
| Google Cloud project | OAuth client, Drive API, Picker API | Free at this usage |
| Google Search Console | Verify domain ownership for the OAuth consent screen | Free |
| Supabase project | Auth, index DB, Edge Functions | Free tier is enough at start; usage is tiny |
| Vercel (recommended for Next.js) | Web app | Free tier to start; check current limits |
| VPS (2 vCPU / 4 GB to start) | Stirling-PDF + gateway | Paid |
| Public GitHub repo for the CircuitJS1 fork | GPL source obligation | Free |
| Privacy policy and terms pages on your domain | Required by Google OAuth verification | — |

### 5.2 Developer tools
Node.js 22 LTS, pnpm 9+, Supabase CLI, Docker + Docker Compose, Git; for the circuit build: Gradle **8.7** and OpenJDK 11 (confirmed in Spike S2 / V18; builds GWT 2.8.2 cleanly in 1m 10s without requiring JDK 17).

### 5.3 Google Cloud setup (step by step)
1. Create a project, e.g. `aboard-app`.
2. **APIs & Services → Library:** enable **Google Drive API** and **Google Picker API**.
3. **Google Auth Platform → Branding:** app name "Aboard", logo, support email, homepage URL, privacy policy URL, terms URL, authorized domain (`aboard.example`, verified in Search Console).
4. **Audience:** User type **External**. While in **Testing**, add test users (max 100). Note: in Testing, **refresh tokens expire after 7 days**; plan to publish before real users arrive.
5. **Data Access (scopes):** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `https://www.googleapis.com/auth/drive.file`. No other Drive scope.
6. **Clients → Create OAuth client → Web application** (one client, used by both Supabase login and the Drive functions, so tokens are interchangeable):
   - Authorized JavaScript origins: `https://aboard.example`, `http://localhost:3000`
   - Authorized redirect URIs:
     - `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase Google login)
     - `https://<project-ref>.supabase.co/functions/v1/drive-callback` (Drive connect flow)
7. **Credentials → API key** for the Picker: restrict to **Google Picker API** and HTTP referrers `https://aboard.example/*`, `http://localhost:3000/*`.
8. Note the **project number** (Picker `appId`).
9. Before launch: publish the app and submit for verification. `drive.file` is non-sensitive, so only basic (brand) verification is needed, not a security assessment. The privacy policy must describe what the app does with Drive data and comply with the Google API Services User Data Policy, including the Limited Use requirements.

### 5.4 Supabase setup
1. **Auth → Providers → Google:** enable; paste the client ID and secret from 5.3 step 6.
2. **Auth → URL Configuration:** Site URL `https://aboard.example`; redirect allow-list `https://aboard.example/auth/callback`, `http://localhost:3000/auth/callback`.
3. Run migrations from §9.
4. Set Edge Function secrets (§10.6) and deploy functions.

### 5.5 Environment variables
| Where | Name | Value |
|---|---|---|
| Web (public, `NEXT_PUBLIC_`) | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key (public by design) |
| | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | OAuth client ID (Picker) |
| | `NEXT_PUBLIC_GOOGLE_API_KEY` | Picker API key (referrer-restricted) |
| | `NEXT_PUBLIC_GOOGLE_APP_ID` | Google Cloud project number |
| | `NEXT_PUBLIC_PDF_API_URL` | `https://api.aboard.example/pdf` |
| Edge Functions (secrets) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from 5.3 |
| | `TOKEN_ENC_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`) |
| | `APP_URL` | `https://aboard.example` |
| | `APP_ORIGINS` | `https://aboard.example,http://localhost:3000` |
| | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | provided automatically by Supabase |
| pdf-gateway | `SUPABASE_URL`, `STIRLING_URL`, `ALLOWED_ORIGINS`, `MAX_UPLOAD_MB` | see §13 |

Never put `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY` or the service role key in the web app.

### 5.6 Libraries (pin exact versions)
| Package | Version checked | License | Use |
|---|---|---|---|
| `react`, `react-dom` | 19.3.0 | MIT | UI |
| `next` | 16.4.0 | MIT | Framework (App Router) |
| `@excalidraw/excalidraw` | 0.18.1 | MIT | Whiteboard |
| `@embedpdf/core` + plugins (`render`, `scroll`, `viewport`, `zoom`, `thumbnail`, `selection`, `search`, `annotation`, `history`, `export`) | 2.15.x | MIT | PDF viewer/annotator |
| `@cantoo/pdf-lib` | 2.11.x | MIT | PDF page operations, board→PDF |
| `@supabase/supabase-js` | 2.117.x | MIT | Auth, index, function calls |
| `dexie` | 4.4.x | Apache-2.0 | IndexedDB |
| `@zip.js/zip.js` | 2.23.x | BSD-3-Clause | `.alpha` ZIP write (streams to disk) and read (random access from a `File`, no full load), ZIP64 for large projects |
| `hash-wasm` | 4.12.x | MIT | Streaming SHA-256 for large files |
| `zod` | 3.24.x | MIT | `.alpha` manifest validation |
| `zustand` | 5.x | MIT | App state |
| `mitt` | 3.x | MIT | Event bus |
| `react-resizable-panels` (optional) | 4.x | MIT | Divider logic only; panes stay CSS-grid placed (§6) |

#### Development tooling (approved in Task 9)
| Tool / Package | Exact Version | License / Source | Use |
|---|---|---|---|
| `typescript` | 5.9.3 | Apache-2.0 | Type checking (`pnpm typecheck`) |
| `@types/react`, `@types/react-dom` | 19.3.0 | MIT | React 19 type definitions |
| `@types/node` | 22.13.0 | MIT | Node.js 22 LTS type definitions |
| `eslint` | 9.39.5 | MIT | Linter core (highest 9.x compatible with plugins) |
| `eslint-config-next` | 16.4.0 | MIT | Next.js lint configuration |
| `eslint-plugin-react` | 7.37.5 | MIT | React security rules (`react/no-danger` for SEC-7) |
| `eslint-plugin-no-unsanitized` | 4.1.5 | MIT | DOM-XSS prevention (`no-unsanitized/*` for SEC-7) |
| `vitest` | 5.0.4 | MIT | Unit test runner (`pnpm test`) |
| `@playwright/test` | 1.64.0 | Apache-2.0 | E2E browser testing (`pnpm test:e2e`) |
| `gitleaks` | 8.30.1 | MIT / winget (`Gitleaks.Gitleaks`) | Native secret scanning binary (`pnpm ci:security`) |
| `happy-dom` | 21.0.1 | MIT | Vitest DOM environment for React lifecycle tests |

---

## 13. Deployment

| Component | Where |
|---|---|
| Web app (Next.js) | Vercel; headers/CSP from `next.config.ts` (§14) |
| Auth, index DB, Edge Functions | Supabase |
| OAuth, Drive API, Picker | Google Cloud project |
| `api.aboard.example` | VPS: Caddy (TLS) → pdf-gateway → Stirling-PDF |

`services/deploy/docker-compose.yml`:
```yaml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile", "caddy_data:/data"]
    networks: [edge]
  gateway:
    build: ../gateway
    environment:
      STIRLING_URL: http://stirling:8080
      SUPABASE_URL: https://<project-ref>.supabase.co     # JWT verification via the project's JWKS
      ALLOWED_ORIGINS: https://aboard.example
      MAX_UPLOAD_MB: "50"
    networks: [edge, internal]
  stirling:
    image: docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest   # full image: OCR + LibreOffice; pin a version tag after testing
    environment:
      SECURITY_ENABLELOGIN: "false"    # safe only because it is unreachable from outside
      SYSTEM_MAXFILESIZE: "50"
    volumes: ["./stirling/configs:/configs"]
    deploy: { resources: { limits: { memory: 3G } } }
    networks: [internal]               # no "ports:" on purpose
networks:
  edge: {}
  internal: { internal: true }
volumes: { caddy_data: {} }
```
`Caddyfile`:
```
api.aboard.example {
  encode zstd gzip
  request_body { max_size 55MB }
  reverse_proxy /pdf/* gateway:8787
}
```
Gateway JWT check: verify the Supabase access token with the project's JWKS (asymmetric signing keys) or the legacy JWT secret if the project still uses it (**VERIFY** in the Supabase dashboard). Also set Stirling's `corsAllowedOrigins` explicitly: an empty list allows every origin with credentials.
