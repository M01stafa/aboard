# Aboard — Production Deployment & Device Verification Guide

> Task 46 · Production Deployment Guide and Manual Testing Checklist (Vercel + Supabase).  
> Last updated: 2026-11-10.

---

## 1. Live Production Architecture & URLs

| Component | Target / Service | Live URL / Reference |
|---|---|---|
| **Web Application** | Vercel (Next.js 16.4 / React 19.3) | `https://alpha-board-app.vercel.app` |
| **Database & Auth** | Supabase (Postgres with RLS) | `https://fmlpkcbpoziwkjuxuyaf.supabase.co` |
| **Edge Function: `drive-connect`** | Supabase Edge Runtime (Deno) | `https://fmlpkcbpoziwkjuxuyaf.supabase.co/functions/v1/drive-connect` |
| **Edge Function: `drive-callback`** | Supabase Edge Runtime (Deno) | `https://fmlpkcbpoziwkjuxuyaf.supabase.co/functions/v1/drive-callback` |
| **Edge Function: `drive-token`** | Supabase Edge Runtime (Deno) | `https://fmlpkcbpoziwkjuxuyaf.supabase.co/functions/v1/drive-token` |
| **Edge Function: `drive-link-token`** | Supabase Edge Runtime (Deno) | `https://fmlpkcbpoziwkjuxuyaf.supabase.co/functions/v1/drive-link-token` |
| **Edge Function: `drive-disconnect`** | Supabase Edge Runtime (Deno) | `https://fmlpkcbpoziwkjuxuyaf.supabase.co/functions/v1/drive-disconnect` |
| **Edge Function: `account-delete`** | Supabase Edge Runtime (Deno) | `https://fmlpkcbpoziwkjuxuyaf.supabase.co/functions/v1/account-delete` |

---

## 2. Google Cloud Console Configuration (Step-by-Step)

To complete the production launch and prevent the 7-day refresh token expiration limit of Testing mode, the owner must configure the Google Cloud Console settings:

### Step 2.1: Open the Project
1. Navigate to [Google Cloud Console](https://console.cloud.google.com).
2. Select the project: **`aboard-app`** (Project Number: `791651476865`).
3. Verify that **Google Drive API** and **Google Picker API** are enabled in **APIs & Services → Enabled APIs & services**.

### Step 2.2: OAuth Consent Screen & App Publishing
1. Go to **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding**).
2. Verify application details:
   - **App Name:** `Aboard`
   - **User support email:** `<your-support-email>`
   - **App domain:**
     - Homepage URL: `https://alpha-board-app.vercel.app` (or custom domain)
     - Privacy Policy URL: `https://alpha-board-app.vercel.app/privacy`
     - Terms of Service URL: `https://alpha-board-app.vercel.app/terms`
   - **Authorized domains:** Add `vercel.app` (or your verified domain from Google Search Console).
3. Under **Data Access (Scopes)**, confirm only the following non-sensitive scopes are requested:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.file` (access only to files created or opened by Aboard)
4. Under **Publishing status**, click **"Publish App"** to move from **Testing** to **In Production**.
   > *Note:* Because `drive.file` is non-sensitive, only basic brand verification is required. In Production mode, refresh tokens do not expire after 7 days and user access is unrestricted.

### Step 2.3: OAuth 2.0 Web Client Credentials
1. Go to **APIs & Services → Credentials**.
2. Edit the existing OAuth 2.0 Client ID (**`791651476865-vvdeqhfn5tn9vie6gif05di83etol9jr.apps.googleusercontent.com`**).
3. Under **Authorized JavaScript origins**, ensure:
   - `https://alpha-board-app.vercel.app` (and custom domain if configured)
   - `http://localhost:3000`
4. Under **Authorized redirect URIs**, ensure:
   - `https://fmlpkcbpoziwkjuxuyaf.supabase.co/auth/v1/callback` (Supabase Google Sign-In)
   - `https://fmlpkcbpoziwkjuxuyaf.supabase.co/functions/v1/drive-callback` (Drive Connect OAuth callback)
5. Save changes.

### Step 2.4: Google Picker API Key Restrictions
1. Under **APIs & Services → Credentials**, edit your Picker API key.
2. Set **Application restrictions** to **Websites (HTTP referrers)**:
   - `https://alpha-board-app.vercel.app/*`
   - `http://localhost:3000/*`
3. Set **API restrictions** to **Restrict key**:
   - Select only **Google Picker API**.
4. Save changes.

---

## 3. Supabase Production Settings

### Step 3.1: URL Configuration
1. Open the Supabase Dashboard for project `fmlpkcbpoziwkjuxuyaf`.
2. Go to **Authentication → URL Configuration**.
3. Set **Site URL** to: `https://alpha-board-app.vercel.app` (or custom domain).
4. In **Redirect URLs**, add:
   - `https://alpha-board-app.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`

### Step 3.2: Edge Function Secrets
Ensure the production Edge Function secrets reflect the live domain:
```bash
supabase secrets set APP_URL="https://alpha-board-app.vercel.app" APP_ORIGINS="https://alpha-board-app.vercel.app,http://localhost:3000"
```

---

## 4. Final Manual Testing Checklist on Real Devices

Verify each user flow across the supported targets:
- **Desktop:** Chrome (macOS/Windows/Linux), Firefox, Safari (macOS).
- **Mobile / Tablet:** iOS Safari (iPhone / iPad), Android Chrome.

### Flow 1: Authentication & User Isolation
- [ ] Sign up / Sign in with Google OAuth popup.
- [ ] Sign up / Sign in with email and password.
- [ ] Session restore on page refresh (no unexpected sign-out).
- [ ] "Sign Out on Shared Computer" completely clears local IndexedDB (`aboard:<userId>`).
- [ ] Verify user isolation: User A cannot see User B's projects or tokens.

### Flow 2: Whiteboard Module (Excalidraw)
- [ ] Freehand drawing, rectangle, ellipse, arrows, and text rendering.
- [ ] Canvas panning and zooming via touch gestures and mouse wheel.
- [ ] Strict Mode double-mount resilience: no duplicated listeners or toolbar flicker.
- [ ] Self-hosted fonts render correctly without fetching external Google Fonts.

### Flow 3: Circuit Simulator Module (CircuitJS1 Fork)
- [ ] Load default schematic; run and pause simulation.
- [ ] Probe circuit nodes with oscilloscope traces.
- [ ] Custom circuit toolbar operates all actions (`runCommand`).
- [ ] "Advanced menu" toggle loads native menus and preserves circuit state.

### Flow 4: PDF Module (EmbedPDF & cantoo/pdf-lib)
- [ ] Open a multi-page PDF document.
- [ ] Create annotations: text highlight, freehand ink, and free text.
- [ ] Page operations: Insert page, Move page up/down, Delete page.
- [ ] Download annotated PDF: verify annotations render in third-party viewers (Acrobat/Preview).

### Flow 5: Workspace Shell & Layout Engine
- [ ] Switch between Whiteboard, Circuit, and PDF tabs.
- [ ] Toggle Split View (50/50); drag splitter to resize panes.
- [ ] Modules maintain state during split/tab changes (DOM preserved via `visibility:hidden`).
- [ ] Refresh browser: active tab and split layout restore correctly.

### Flow 6: Cross-Tool Integration Actions
- [ ] **Circuit → Board:** Insert circuit schematic as SVG onto Whiteboard.
- [ ] **PDF → Board:** Insert current PDF page capture onto Whiteboard.
- [ ] **Board → PDF:** Append Whiteboard drawing as a new page into the active PDF.
- [ ] **PDF → Note:** Insert selected PDF text onto Whiteboard with navigable `alpha://` backlink.

### Flow 7: Local Storage & IndexedDB (Offline Persistence)
- [ ] Create a local project; make edits across tools; reload page.
- [ ] Project contents restore silently from Dexie without browser permission prompts.

### Flow 8: Google Drive Mode & Outbox Synchronization
- [ ] Connect Google Drive via the Settings / Launcher modal.
- [ ] Create a project in Google Drive mode; verify folder and file creation in Google Drive.
- [ ] Edit project: verify status shows "Saved" via background SaveQueue.
- [ ] Open an existing project from Google Drive using the Google Picker dialog.
- [ ] Disconnect Google Drive: verify local copies remain intact.

### Flow 9: Unified `.alpha` Export & Import
- [ ] Export project to `.alpha` file on Device A.
- [ ] Verify file extension remains `.alpha` on iOS Safari and Android downloads.
- [ ] Transfer `.alpha` file to Device B; import project into fresh browser session.
- [ ] Verify SHA-256 integrity validation and identical restoration of all panes.

### Flow 10: Legal Pages & Account Deletion
- [ ] Visit `/privacy`, `/terms`, and `/licenses`: verify clean bilingual rendering.
- [ ] Settings → Danger Zone: open "Delete Account" modal.
- [ ] Type "DELETE" and confirm: verify user account, Supabase rows, and local database are purged while Drive files remain safe.

