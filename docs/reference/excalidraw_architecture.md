# Comprehensive Architectural and Technical Specification of Excalidraw

## 1. Executive Summary & Product Philosophy

**Excalidraw** is an open-source, client-first virtual collaborative whiteboard designed for sketching hand-drawn-like diagrams, wireframes, architectures, and notes.

* **Repository:** [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)
* **Core Philosophy:** Minimalist UX, local-first data ownership, zero-friction drawing, deterministic rendering across platforms, and end-to-end encrypted (E2EE) real-time collaboration.
* **Licensing:** MIT License (with specific components under MIT/GPL/CC as documented in the repo).

---

## 2. Explicit Languages & Technology Stack

Unlike traditional desktop ports, Excalidraw is built natively for the modern web ecosystem using modern JavaScript/TypeScript toolchains.

```
+---------------------------------------------------------------------------------------+
|                                    Excalidraw Stack                                   |
|                                                                                       |
|   Languages:      TypeScript (~95%), HTML5, Modern CSS                                |
|   Core Framework: React (Fiber reconciliation, Hooks, Portal rendering)               |
|   Rendering:      HTML5 Canvas 2D Context + rough.js (Generative Hand-Drawn Paths)    |
|   Font/Text:      Native Canvas Font Metrics + Browser HarfBuzz / FontFace APIs       |
|   Realtime/Sync:  WebSockets / WebRTC + End-to-End Encryption (SubtleCrypto)          |
|   State/Storage:  IndexedDB (localforage) + React Custom Context/Store Architecture   |
|   Package System: Monorepo managed with Yarn / NPM Workspaces + Vite                  |
+---------------------------------------------------------------------------------------+
```

### 2.1. Programming Languages

#### 1. TypeScript (Strict Mode)
* **Role:** The entire application logic, math algorithms, geometric calculations, canvas draw calls, and UI components are authored in TypeScript.
* **Why TypeScript?** Excalidraw relies on complex mathematical coordinate transformations (matrices, 2D vectors, cubic Bézier math) and heterogeneous element schemas (`ExcalidrawElement` discriminated unions). TypeScript prevents runtime shape mismatches and guarantees typing across canvas operations.

#### 2. HTML5 (HyperText Markup Language)
* **Role:** Canvas viewport hosting, input element traps, and modal containers.
* **Canvas Focus Trap:** Excalidraw mounts a dual-canvas layered structure (interactive canvas and static render canvas) alongside an invisible contenteditable/textarea overlay used strictly for capturing text editing sessions.

#### 3. CSS3 & CSS Variables
* **Role:** Responsive overlays, sidebars, context menus, toolbars, and dynamic theme switching (Dark/Light mode via CSS custom properties).

---

## 3. Explicit Third-Party Libraries, Frameworks & Tooling

Excalidraw maintains fine control over its bundle size, choosing targeted utility libraries rather than heavy generic suites.

### 3.1. Core Rendering & Graphics Libraries

#### 1. `rough.js` (The Heart of the Hand-Drawn Aesthetic)
* **What it is:** A lightweight 2D graphics library authored by Preet Shihn that renders shapes with a hand-drawn, sketchy, or textured finish.
* **How it is used:** Excalidraw wraps `rough.js` (`RoughCanvas` and `RoughGenerator`). When an element like a rectangle, ellipse, or polygon is drawn, Excalidraw passes path and coordinate data to `rough.js`. Rough.js applies controlled pseudo-random Gaussian path variations, multiple stroke passes (sketch lines), and custom hatch/cross-hatch/zigzag fills.

#### 2. HTML5 Canvas 2D Context (`CanvasRenderingContext2D`)
* **How it is used:** All elements are rasterized directly onto an HTML5 `<canvas>` using native 2D context methods (`save()`, `restore()`, `transform()`, `arc()`, `bezierCurveTo()`, `clip()`). 
* **Layering Strategy:** Excalidraw uses a multi-canvas approach:
  * **Static Canvas:** Renders committed scene elements.
  * **Interactive/Overlay Canvas:** Renders live bounding boxes, drag handles, lasso selection rectangles, laser pointers, and real-time remote user cursors to avoid invalidating the static scene buffer on every mouse move.

#### 3. `bezier-js` / `perfect-freehand`
* **What it is:** Specialized geometric calculation libraries.
* **How it is used:** 
  * `perfect-freehand` creates pressure-sensitive, smooth vector brush strokes for freehand lines/drawings based on stylus input and pointer velocity.
  * Bézier math libraries are used to evaluate points along curved connectors and calculate collision boundaries.

### 3.2. Framework, State & UI Utilities

#### 1. React (v18+)
* **Role:** Drives the application shell, toolbar state, menu dialogs, layer panels, and user input hooks.
* **Usage:** While UI chrome uses standard React component hierarchies, the high-performance canvas loop runs outside React's re-render cycle via imperative animation loops (`requestAnimationFrame`) to prevent virtual DOM overhead during 60–120 FPS panning and drawing.

#### 2. `nanoid`
* **Role:** Cryptographically secure, compact, URL-friendly unique ID generator.
* **Usage:** Assigns immutable identifiers to every `ExcalidrawElement` (`id: string`), scene revision, and collaboration session.

#### 3. `jotai` / Custom Reactive Store
* **Role:** Lightweight atomic state management used in modern iterations of the Excalidraw repository to manage transient canvas states (e.g., zoom, scroll position, active tool, dragging state) without triggering full-tree React reconciliations.

#### 4. `browser-fs-access`
* **Role:** File System Access API abstraction.
* **Usage:** Enables native file picking, saving, and direct file overwrite workflows on supported browsers (Chromium), with transparent fallbacks to traditional `<input type="file">` and anchor downloads on Safari and Firefox.

### 3.3. Security & Real-Time Sync Libraries

#### 1. Web Cryptography API (`window.crypto.subtle`)
* **Role:** Native browser cryptographic engine.
* **How it is used:** Handles End-to-End Encryption (E2EE) for room links. The room key is appended to the URL fragment (`#room=...,key=...`). URL fragments are never sent to HTTP servers. Messages (draw updates, deletions) are encrypted via **AES-GCM (128/256-bit)** using keys derived from this secret fragment before being broadcast over WebSockets.

#### 2. `socket.io-client` / WebSocket Protocol
* **Role:** Transport layer for real-time peer coordination.
* **Usage:** Carries encrypted array buffers between connected clients via a relay backend (`excalidraw-room`). The server merely acts as a dumb routing switch, relaying encrypted payloads without knowing scene contents.

---

## 4. Architectural Anatomy of the Codebase

The monorepo structure cleanly separates the core drawing engine package (`@excalidraw/excalidraw`) from the web application wrapper and server-side utilities.

```
packages/excalidraw/
├── actions/                  # Command actions (delete, duplicate, align, z-index, group)
├── components/               # React UI elements (Toolbars, ColorPickers, LayerPanels)
├── data/                     # Serialization, JSON encoding, image export (SVG/PNG), clipboard
│   ├── encode.ts             # Compression and export packaging
│   ├── restore.ts            # Schema migration and net-load sanitation
│   └── transform.ts          # Normalization of element trees
│
├── element/                  # Core domain logic for canvas primitives
│   ├── typeChecks.ts         # Type guards for element discriminated unions
│   ├── linearElementEditor.ts# Interactive vector curve & connector vertex editing
│   ├── mutateElement.ts      # Immutable-like mutation tracking and version bumping
│   ├── newElement.ts         # Element instantiation factory functions
│   └── resizeElements.ts     # Boundary scaling, aspect-ratio locking, matrix mapping
│
├── scene/                    # Canvas pipeline, spatial partitioning, viewport coordinate math
│   ├── Scene.ts              # Master element collection manager & spatial registry
│   ├── zoom.ts               # Pinch-to-zoom, wheel-zoom, and world-space transforms
│   ├── selection.ts          # Hit testing, bounding box collision, and lasso logic
│   └── export.ts             # SVG and Canvas offline rasterization builders
│
├── renderer/                 # Pure rendering engines
│   ├── renderScene.ts        # Double-buffer canvas dispatcher and batch painter
│   └── renderElement.ts      # Rough.js primitive converter and shape rasterizer
│
└── types.ts                  # Central TypeScript definitions (ExcalidrawElement, AppState)
```

---

## 5. The Element Data Model (`ExcalidrawElement`)

In Excalidraw, all whiteboard items—rectangles, lines, text, embedded images, arrows—are modeled as immutable, serializable JSON objects that conform to the `ExcalidrawElement` base interface.

```typescript
export interface ExcalidrawGenericElement {
  id: string;                         // Unique identifier (nanoid)
  x: number;                          // Top-left X coordinate in Scene (world) space
  y: number;                          // Top-left Y coordinate in Scene (world) space
  width: number;                      // Bounding width
  height: number;                     // Bounding height
  angle: number;                      // Rotation angle in radians (0 to 2*PI)
  strokeColor: string;                // Hex or CSS color string
  backgroundColor: string;            // Fill color
  fillStyle: "hachure" | "cross-hatch" | "solid" | "zigzag";
  strokeWidth: number;                // Line thickness
  strokeStyle: "solid" | "dashed" | "dotted";
  roughness: number;                  // Rough.js randomness parameter (0 = clean, 2+ = sketchy)
  opacity: number;                    // 0 to 100
  groupIds: readonly string[];        // Array of grouped entity IDs
  strokeSharpness: "round" | "sharp";
  seed: number;                       // Fixed PRNG seed for deterministic Rough.js strokes
  version: number;                    // Incremented on every mutation (Conflict Resolution)
  versionNonce: number;               // Random nonce preventing sync collision ties
  isDeleted: boolean;                 // Soft deletion flag for tombstone sync
  updated: number;                    // Epoch timestamp of last mutation
}
```

### Determinism via `seed`
A major engineering challenge with hand-drawn engines is that randomized paths look completely different if recalculated on every frame. Excalidraw solves this by generating and storing a pseudo-random `seed: number` for each element upon creation. When `rough.js` renders the element, it initializes its generator with this specific seed, guaranteeing that the exact same jitter and sketchy contours render identically across all user devices.

---

## 6. Rendering Pipeline & Coordinate Spaces

Excalidraw separates space into two distinct coordinate systems:

```
[Screen Space (Browser Window / Pointer Events)]
                    │
      - scrollX / - scrollY  (Pan Offset)
      / zoom                 (Scale Factor)
                    ▼
[Scene Space (Infinite Virtual Canvas Coordinates)]
```

### 6.1. The Render Loop (`renderScene.ts`)

```
+-------------------------------------------------------------+
|                 Animation Frame Trigger                     |
|                 (requestAnimationFrame)                     |
+------------------------------┬------------------------------+
                               │
                               ▼
+-------------------------------------------------------------+
|               Matrix Transformation Setup                   |
|   ctx.setTransform(window.devicePixelRatio, 0, 0,           |
|                    window.devicePixelRatio, 0, 0);          |
|   ctx.translate(appState.scrollX, appState.scrollY);        |
|   ctx.scale(appState.zoom.value, appState.zoom.value);      |
+------------------------------┬------------------------------+
                               │
                               ▼
+-------------------------------------------------------------+
|                  Viewport Frustum Culling                   |
|  Filter out elements outside the visible viewport box       |
+------------------------------┬------------------------------+
                               │
                               ▼
+-------------------------------------------------------------+
|                      Z-Order Painting                       |
|   For each visible element:                                 |
|     1. Apply element local rotation (ctx.rotate(angle))     |
|     2. Retrieve cached Rough.js path from ShapeCache        |
|     3. Execute ctx.stroke(path) / ctx.fill(path)            |
+-------------------------------------------------------------+
```

### 6.2. Caching Strategy (`ShapeCache`)
Generating `rough.js` shapes requires significant trigonometry and path generation. To maintain 60+ FPS, Excalidraw caches the generated rough paths in an internal `WeakMap`/`Map` (`ShapeCache`). As long as an element's geometric properties (`x`, `y`, `width`, `height`, `roughness`, `strokeWidth`, `seed`) remain unchanged, the cached shape is painted directly to the canvas without recalculating paths.

---

## 7. Real-Time Collaboration & Synchronization Engine

Excalidraw uses a decentralized, state-based synchronization model designed to work seamlessly with end-to-end encryption.

```
Client A (Local Mutation)
   │
   ├─► Increment element.version
   ├─► Generate element.versionNonce
   ├─► Encrypt payload via AES-GCM (SubtleCrypto)
   │
   ▼
WebSocket Relay Server (Encrypted Blob Relay)
   │
   ▼
Client B (Remote Receiver)
   │
   ├─► Decrypt payload via URL hash key
   ├─► Run Reconcile / Conflict Resolution Algorithm
   └─► Trigger selective re-render
```

### 7.1. Conflict Resolution (Last-Write-Wins with Nonce)
Because Excalidraw avoids a central authority or heavyweight Operational Transformation (OT) server, conflicts between simultaneous edits on the same element are resolved deterministically using the `reconcileElements` algorithm:

```typescript
// Conflict resolution heuristic
function resolveConflict(localEl: ExcalidrawElement, remoteEl: ExcalidrawElement): ExcalidrawElement {
  if (remoteEl.version > localEl.version) {
    return remoteEl;
  }
  if (remoteEl.version < localEl.version) {
    return localEl;
  }
  // Versions are equal: tie-break using versionNonce
  if (remoteEl.versionNonce > localEl.versionNonce) {
    return remoteEl;
  }
  return localEl;
}
```

### 7.2. Tombstone Pattern for Deletions
Elements are never immediately purged from memory during an active session. If an element is deleted, its `isDeleted` flag is marked `true`, and its `version` is incremented. This "tombstone" is broadcast to all peers, preventing a race condition where a stale update could resurrect a deleted item.

---

## 8. Export & Interoperability Architecture

Excalidraw supports rich, loss-less exports across formats:

* **PNG Export:** Elements are drawn to an off-screen canvas at high `devicePixelRatio` (1x, 2x, 3x) and converted to a blob using `canvas.toBlob()`.
* **SVG Export:** Replaces canvas rasterization with pure SVG DOM elements (`<path>`, `<rect>`, `<text>`), making the sketch infinitely scalable.
* **Embedded Scene Metadata:** When saving as PNG or SVG, Excalidraw embeds the raw schematic JSON into the file:
  * In **PNG**: Encoded inside a custom uncompressed text chunk (`tEXt` or `zTXt`).
  * In **SVG**: Injected within an XML `<metadata>` block.
  * **Result:** Dragging an exported Excalidraw PNG/SVG back into the browser reloads the fully editable drawing tree.

---

## 9. Developer Guide: Embedding and Extending Excalidraw

Excalidraw can be integrated directly into any React application via its published NPM package:

### 1. Installation

```bash
npm install @excalidraw/excalidraw
# or
yarn add @excalidraw/excalidraw
```

### 2. Basic React Integration Example

```tsx
import React, { useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import { AppState, BinaryFiles } from "@excalidraw/excalidraw/types/types";

export default function WhiteboardApp() {
  const [elements, setElements] = useState<readonly NonDeletedExcalidrawElement[]>([]);
  const [appState, setAppState] = useState<Partial<AppState>>({
    viewBackgroundColor: "#f8f9fa",
    currentItemFontFamily: 1, // Virgil (Hand-drawn font)
  });

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <Excalidraw
        initialData={{
          elements: elements,
          appState: appState,
          scrollToContent: true,
        }}
        onChange={(updatedElements, updatedAppState, files: BinaryFiles) => {
          setElements(updatedElements);
          setAppState(updatedAppState);
        }}
        UIOptions={{
          canvasActions: {
            saveToActiveFile: true,
            loadScene: true,
            export: { saveFileToDisk: true },
          },
        }}
      />
    </div>
  );
}
```

### 3. Local Development of the Core Engine

To build and run the complete repository locally:

```bash
# Clone the repository
git clone https://github.com/excalidraw/excalidraw.git
cd excalidraw

# Install workspace dependencies via Yarn
yarn

# Start the development server
yarn start
```

The web application will launch at `http://localhost:3000`.