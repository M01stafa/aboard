# Comprehensive Architectural and Technical Specification of Stirling-PDF

## 1. Executive Summary & Core Philosophy

**Stirling-PDF** is an open-source, enterprise-grade, locally hosted PDF processing platform. It delivers over 50 manipulation, conversion, OCR, signing, and security tools across web, desktop, and containerized environments.

* **Repositories & Sites:**
  * Official Website: [stirlingpdf.com](https://stirlingpdf.com/) / [stirling.com](https://stirling.com/)
  * GitHub Source Repository: [Stirling-Tools/Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF)
* **Core Philosophy:**
  * **Zero-Tracking Privacy:** 100% local processing; documents are never dispatched to external cloud servers or third-party analytical endpoints.
  * **Open Core Model:** Clean architectural separation between MIT-licensed core features and enterprise/proprietary extensions (SSO, audit compliance, multi-tenant billing).
  * **Multi-Channel Delivery:** Distributed simultaneously as a Dockerized web server, a native cross-platform desktop application, and a headless automation API.

---

## 2. Explicit Languages & Technology Stack

The Stirling-PDF codebase relies on a multi-language hybrid model designed for high-throughput I/O, strict type safety, and efficient native process orchestration.

```
+-----------------------------------------------------------------------------------------+
|                                Stirling-PDF Technology Stack                            |
|                                                                                         |
|   Backend & API:       Java (JDK 21/25 LTS), Spring Boot 3.x/4.x                        |
|   Frontend Client:     TypeScript, React 18, Vite, Mantine UI, Tailwind CSS             |
|   AI Engine & MCP:     Python (FastAPI, Pydantic-AI, Uv)                                |
|   Desktop Runtime:     Rust (Tauri Framework)                                           |
|   Build & Task Runner: Gradle Multi-Module Engine + Taskfile (go-task)                  |
|   External Engines:    C/C++ Native Binaries (QPDF, Tesseract OCR, LibreOffice)         |
+-----------------------------------------------------------------------------------------+
```

### 2.1. Programming Languages

#### 1. Java (JDK 21 / 25)
* **Role:** Powers the backend web server, pipeline orchestration, REST API endpoints, memory streaming buffers, and internal PDF rendering.
* **Why Java?** High-concurrency multithreading via Virtual Threads/Executors, robust stream management for large file transfers, and native integration with low-level PDF manipulation libraries (Apache PDFBox).

#### 2. TypeScript & JavaScript (ESNext)
* **Role:** Modern Single-Page Application (SPA) frontend and in-browser PDF manipulation logic.
* **Why TypeScript?** Prevents runtime schema mismatch when orchestrating dynamic tool forms, dynamic form-data validation, and browser-side file parsing.

#### 3. Python (FastAPI / Pydantic)
* **Role:** Powers the auxiliary AI Engine (`engine/`) and Model Context Protocol (MCP) bridges.
* **Why Python?** Direct access to machine learning runtimes, OCR preprocessing pipelines, and LLM orchestration frameworks used for automated semantic PDF extraction and querying.

#### 4. Rust
* **Role:** Desktop app layer (`src-tauri/`).
* **Why Rust?** Provides memory-safe OS bindings, minimal executable footprint, native OS window management, and inter-process communication without Chromium overhead.

#### 5. Shell & Batch Scripting (Bash / PowerShell)
* **Role:** Docker bootstrap scripts, entrypoint configuration wrappers, build-time font generation, and external tool verification checks.

---

## 3. Explicit Third-Party Libraries, Frameworks & Tooling

```
+-----------------------------------------------------------------------------------------+
|                                    High-Level Architecture                              |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                            Client Layer (Browser / Tauri)                       |   |
|   |   React SPA (Vite + Mantine + Tailwind)  <--->  PDF.js & PDF-Lib (Client Ops)   |   |
|   |   IndexedDB (Local File History)         <--->  i18next (40+ Locales)           |   |
|   +----------------------------------------┬----------------------------------------+   |
|                                            │ REST / Multipart Streams                   |
|                                            ▼                                            |
|   +---------------------------------------------------------------------------------+   |
|   |                    Spring Boot Backend (Multi-Module Runtime)                   |   |
|   |   - app/core: REST Controllers, Spring Security, Swagger/OpenAPI                |   |
|   |   - ProcessExecutor: Native OS Process Wrapper & Sub-shell Worker               |   |
|   |   - Native Java Engine: Apache PDFBox, BouncyCastle, OpenPDF                    |   |
|   +------------------┬─────────────────────┬──────────────────────┬-----------------+   |
|                      │                     │                      │                     |
|                      ▼                     ▼                      ▼                     |
|             +-----------------+   +------------------+   +------------------+           |
|             |  LibreOffice    |   |  Tesseract OCR   |   |      QPDF        |           |
|             | (Docx/PPTX/PDF) |   |  (Traineddata)   |   | (Linearize/Crypt)|           |
|             +-----------------+   +------------------+   +------------------+           |
+-----------------------------------------------------------------------------------------+
```

### 3.1. Backend Frameworks & Java Libraries

* **Spring Boot (3.x / 4.x):**
  * Core micro-framework managing routing (`@RestController`), dependency injection (`@Service`, `@Component`), and file uploads (`StandardServletMultipartResolver`).
* **Apache PDFBox (v3.x):**
  * The primary Java PDF library used for low-level parsing, document merging, page splitting, metadata stripping, watermarking, and structural form flattening.
* **Bouncy Castle (`bcpkix-jdk18on` / `bcprov-jdk18on`):**
  * High-security cryptographic provider used to apply digital PKCS#7 / PAdES signatures, validate X.509 certificate chains, and implement AES-256 bit document encryption.
* **OpenPDF / iText (Legacy Forks):**
  * Handles high-level programmatic document creation, HTML-to-PDF formatting, and dynamic page renumbering.
* **Tabula (`tabula-java`):**
  * Specialized extractor that analyzes PDF coordinate geometries to extract tables and tabular data into CSV/Excel formats.
* **Lombok:**
  * Eliminates Java boilerplate by generating getters, setters, equals, hashCode, and builders at compile-time.

### 3.2. Native External Processing Binaries (ProcessExecutor Layer)

When pure Java cannot perform a transformation efficiently, Stirling-PDF delegates the task through its **`ProcessExecutor`** engine to sandboxed native binaries:

* **LibreOffice (Headless / UNO API):**
  * Converts office document formats (`.docx`, `.pptx`, `.xlsx`, `.odt`, `.rtf`) into standard PDF.
* **QPDF:**
  * Structural linearizer and repairs corrupted PDF cross-reference tables (XRef). Performs high-speed content stream optimization, PDF linearization ("Fast Web View"), and PDF encryption/decryption.
* **Tesseract OCR (v5.x):**
  * Open-source optical character recognition engine. Analyzes rasterized PDF images and injects transparent, searchable text layers via language-specific `.traineddata` models.
* **Ghostscript / Poppler-utils (`pdftoppm`):**
  * High-fidelity rasterization tools used to convert vector PDF pages into WebP, PNG, or TIFF files.
* **WeasyPrint / Chromium (Headless):**
  * Renders HTML, CSS, and Markdown input files into pixel-accurate print-standard PDFs.

### 3.3. Frontend Libraries (Single Page Application)

* **React 18 & Vite:**
  * Fast bundle assembly, hot-module replacement (HMR), and declarative virtual DOM reconciliation.
* **Mantine UI (`@mantine/core`, `@mantine/hooks`):**
  * Primary component library providing accessible modals, drop zones, sliders, and navigation headers.
* **Tailwind CSS:**
  * Utility-first styling for responsive layouts, adaptive toolbars, and dynamic theme switching.
* **PDF.js (Mozilla):**
  * Renders interactive, zoomable, client-side PDF previews inside the browser without downloading files to disk.
* **pdf-lib:**
  * Client-side JavaScript PDF manipulation library used for light client-side actions (instant page rotation, reordering, and signature drawing) before sending files to the backend.
* **localforage / IndexedDB:**
  * Client-side storage layer for recent files, thumbnail cache, and session state.

---

## 4. Multi-Module Project Structure

The project uses a Gradle multi-module layout to isolate open-source components from enterprise features:

```
stirling-pdf/
├── app/
│   ├── common/                  # Shared models, exception hierarchies, utility classes
│   ├── core/                    # Open-source engine: REST endpoints, PDF services, CLI wrappers
│   │   ├── src/main/java/       # Spring Boot Application entrypoint & business logic
│   │   │   └── stirling/mail/
│   │   │       ├── controller/  # API Controllers (Merge, Split, Convert, Security)
│   │   │       ├── service/     # Processing services calling PDFBox/ProcessExecutor
│   │   │       └── model/       # Request/Response DTOs & configuration schemas
│   │   └── src/main/resources/  # application.yml, static assets, templates
│   ├── proprietary/             # Enterprise extensions (SAML2, OAuth2, Auditing, Policy Engine)
│   └── saas/                    # Multi-tenant Stripe billing, usage quotas, and license guards
├── frontend/
│   └── editor/                  # React Single-Page Application (Vite project)
│       ├── src/
│       │   ├── components/      # UI widgets, viewers, drag-and-drop dropzones
│       │   ├── hooks/           # Custom React hooks (usePdf, useIndexedDB)
│       │   ├── services/        # Axios API clients connecting to Spring endpoints
│       │   └── locales/         # i18next translation dictionaries (40+ languages)
│       ├── package.json
│       └── vite.config.ts
├── engine/                      # Python AI & MCP microservice (FastAPI runtime)
├── src-tauri/                   # Rust desktop wrapper configuration
├── build.gradle                 # Master Gradle build definitions
└── Taskfile.yml                 # Go-Task workflow orchestration recipes
```

---

## 5. End-to-End Processing Lifecycle: The ProcessExecutor Pattern

The diagram below illustrates how an operation (e.g., executing an OCR workflow on an uploaded PDF) moves through the architecture:

```
[Browser / Client UI]
         │  1. Multipart POST (/api/v1/general/ocr-pdf)
         ▼
[Spring Controller: OcrController.java]
         │  2. Read MultipartFile into Memory / Temp Directory
         ▼
[Service Layer: OcrService.java]
         │  3. Assemble command parameters (Language, Deskew, DPI)
         ▼
[ProcessExecutor.java]
         │  4. Spawn isolated sub-process via ProcessBuilder
         ▼
[External Binary: tesseract input.pdf output.pdf -l eng pdf]
         │  5. Stream stdout/stderr & monitor exit code (0 = success)
         ▼
[Post-Processing & Validation]
         │  6. Validate resulting PDF via Apache PDFBox
         ▼
[HTTP Response Stream]
         │  7. Return ResponseEntity<Resource> with Content-Disposition
         ▼
[Browser: File Download / IndexedDB Cache]
```

### Process Isolation Implementation

The `ProcessExecutor` class handles sub-process safety, timeouts, and resource monitoring:

```java
// Simplified representation of Stirling-PDF's native command execution pattern
public ProcessResult executeProcess(List<String> command, long timeoutSeconds) throws IOException, InterruptedException {
    ProcessBuilder pb = new ProcessBuilder(command);
    pb.redirectErrorStream(true);
    
    Process process = pb.start();
    
    // Capture stdout/stderr asynchronously to prevent buffer deadlocks
    String output;
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
        output = reader.lines().collect(Collectors.joining(System.lineSeparator()));
    }
    
    boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
    if (!finished) {
        process.destroyForcibly();
        throw new TimeoutException("Process exceeded allowed runtime limit.");
    }
    
    return new ProcessResult(process.exitValue(), output);
}
```

---

## 6. Security Architecture & Deployment Topology

Stirling-PDF provides an enterprise-ready security framework managed via Spring Security:

```
+---------------------------------------------------------------------------------------+
|                               Security Pipeline                                       |
|                                                                                       |
|   1. Ingress Request Filter:                                                          |
|      - Rate Limiter (Token Bucket per IP/Token)                                       |
|      - CSRF Protection (Stateless Header Tokens)                                      |
|      - File-Type Whitelist & Magic-Bytes Inspection (Rejects disguised binaries)      |
|                                                                                       |
|   2. Identity & Access:                                                               |
|      - Basic Authentication (Database / InMemory)                                     |
|      - OAuth2 / OpenID Connect (Keycloak, Authentik, Okta, Google)                    |
|      - SAML2 Enterprise Single Sign-On                                                |
|                                                                                       |
|   3. Sandboxing & Clean-up:                                                           |
|      - Temp directory isolation per request (`/tmp/stirling-pdf-UUID/`)               |
|      - Automatic lifecycle deletion hook via JVM shutdown & Post-Request Interceptors  |
+---------------------------------------------------------------------------------------+
```

### Deployment Flavors (Docker Images)

1. **`stirling-pdf:latest` (Standard Full Image):** Includes the complete Spring runtime, LibreOffice headless, Tesseract OCR with common languages, and all conversion utilities.
2. **`stirling-pdf:ultra-lite`:** Strips out LibreOffice and Tesseract. Relies solely on native Java libraries (PDFBox/OpenPDF) to operate with minimal memory footprint (~200MB RAM).
3. **`stirling-pdf:fat`:** Contains the full image plus all known Tesseract OCR language packs.

---

## 7. Developer Guide: Building & Running Locally

### Prerequisites
* **Java Development Kit:** JDK 21 or 25 installed.
* **Node.js & npm:** Node.js v20+ and npm v10+.
* **Task (go-task):** Used as the unified command runner (`task`).
* **Python (Optional):** Python 3.11+ managed via `uv` for AI engine components.

### 1. Clone the Repository
```bash
git clone https://github.com/Stirling-Tools/Stirling-PDF.git
cd Stirling-PDF
```

### 2. Install Project Dependencies
```bash
# Uses Taskfile to resolve npm packages and Python environments
task install
```

### 3. Run the Development Environment

#### Backend (Spring Boot):
```bash
# Runs the Spring Boot server with hot-reload enabled on port 8080
./gradlew :app:core:bootRun
```

#### Frontend (React SPA):
```bash
cd frontend/editor
npm install
npm run dev
# The Vite server launches at http://localhost:5173 with proxy configured to :8080
```

### 4. Build Production Container
```bash
docker build -t stirling-pdf-local -f Dockerfile .
docker run -p 8080:8080 stirling-pdf-local
```