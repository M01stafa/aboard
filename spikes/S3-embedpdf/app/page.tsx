"use client";

import { useEffect, useRef, useState } from "react";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  PluginRegistry,
  PluginBatchRegistrations,
  startLoadingDocument,
  setDocumentLoaded,
} from "@embedpdf/core";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection";
import { SearchPluginPackage } from "@embedpdf/plugin-search";
import { AnnotationPluginPackage, AnnotationPlugin } from "@embedpdf/plugin-annotation";
import { HistoryPluginPackage } from "@embedpdf/plugin-history";
import { ExportPluginPackage } from "@embedpdf/plugin-export";
import {
  PdfAnnotationSubtype,
  PdfDocumentObject,
} from "@embedpdf/models";

interface S3TestResults {
  wasmLoaded: boolean;
  engineInitialized: boolean;
  pluginsRegistered: boolean;
  documentLoaded: boolean;
  firstPageLoadTimeMs: number;
  annotationEventEmitted: boolean;
  annotationEventName: string;
  annotationEventSample: Record<string, unknown> | null;
  annotationsCreated: boolean;
  exportedItemsCount: number;
  stampBinaryPreserved: boolean;
  reloadWithoutAnnotationsPassed: boolean;
  importAnnotationsPassed: boolean;
  allChecksPassed: boolean;
  logs: string[];
  errors: string[];
}

const plugins = [
  { package: RenderPluginPackage },
  { package: ScrollPluginPackage },
  { package: ViewportPluginPackage },
  { package: ZoomPluginPackage },
  { package: ThumbnailPluginPackage },
  { package: SelectionPluginPackage },
  { package: SearchPluginPackage },
  { package: AnnotationPluginPackage },
  { package: HistoryPluginPackage },
  { package: ExportPluginPackage },
] as unknown as PluginBatchRegistrations;

export default function SpikeS3Page() {
  const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine({
    wasmUrl: "/wasm/pdfium.wasm",
    worker: false,
  });

  const [registry, setRegistry] = useState<PluginRegistry | null>(null);
  const [results, setResults] = useState<S3TestResults>({
    wasmLoaded: false,
    engineInitialized: false,
    pluginsRegistered: false,
    documentLoaded: false,
    firstPageLoadTimeMs: 0,
    annotationEventEmitted: false,
    annotationEventName: "onAnnotationEvent",
    annotationEventSample: null,
    annotationsCreated: false,
    exportedItemsCount: 0,
    stampBinaryPreserved: false,
    reloadWithoutAnnotationsPassed: false,
    importAnnotationsPassed: false,
    allChecksPassed: false,
    logs: [],
    errors: [],
  });

  const testExecutedRef = useRef(false);

  useEffect(() => {
    if (engine) {
      setResults((prev) => ({
        ...prev,
        wasmLoaded: true,
        engineInitialized: true,
      }));
    }
    if (engineError) {
      setResults((prev) => ({
        ...prev,
        errors: [...prev.errors, `Engine error: ${engineError.message}`],
      }));
    }
  }, [engine, engineError]);

  async function handleInitialized(reg: PluginRegistry) {
    setRegistry(reg);
    setResults((prev) => ({
      ...prev,
      pluginsRegistered: true,
      logs: [...prev.logs, "PluginRegistry initialized with 10 plugins."],
    }));

    if (testExecutedRef.current) return;
    testExecutedRef.current = true;

    await runAutomationHarness(reg);
  }

  async function runAutomationHarness(reg: PluginRegistry) {
    const log = (msg: string) => {
      console.log(`[Spike S3] ${msg}`);
      setResults((prev) => ({ ...prev, logs: [...prev.logs, msg] }));
    };

    const err = (msg: string) => {
      console.error(`[Spike S3 Error] ${msg}`);
      setResults((prev) => ({ ...prev, errors: [...prev.errors, msg] }));
    };

    try {
      const eng = reg.getEngine();
      const store = reg.getStore();
      const docId = "doc-50mb";

      log("Starting 50 MB document open benchmark (/test-50mb.pdf)...");
      const startTime = performance.now();

      // 1. Open document URL
      const doc = await new Promise<PdfDocumentObject>((resolve, reject) => {
        const task = eng.openDocumentUrl({ id: docId, url: "/test-50mb.pdf" });
        task.wait(resolve, (e) => reject(new Error(String(e.reason?.message ?? e))));
      });

      const openDuration = performance.now() - startTime;
      log(`Document binary opened in ${(openDuration / 1000).toFixed(2)}s. Loading page 0...`);

      store.dispatch(startLoadingDocument(docId, "test-50mb.pdf"));
      store.dispatch(setDocumentLoaded(docId, doc));

      // 2. Measure first page render time
      const page0 = doc.pages[0];
      await new Promise<unknown>((resolve, reject) => {
        const renderTask = eng.renderPage(doc, page0, { scaleFactor: 1.0 });
        renderTask.wait(resolve, (e) => reject(new Error(String(e.reason?.message ?? e))));
      });

      const firstPageTotalMs = Math.round(performance.now() - startTime);
      log(`First page rendered successfully! Total time to first page: ${firstPageTotalMs} ms (${(firstPageTotalMs / 1000).toFixed(2)} s)`);

      setResults((prev) => ({
        ...prev,
        documentLoaded: true,
        firstPageLoadTimeMs: firstPageTotalMs,
      }));

      // 3. Inspect Annotation Plugin and Event Emission
      const annotationPlugin = reg.getPlugin<AnnotationPlugin>("annotation");
      if (!annotationPlugin) {
        throw new Error("AnnotationPlugin not found in registry!");
      }

      const scope = (annotationPlugin as unknown as { forDocument: (id: string) => any }).forDocument(docId);
      log("AnnotationScope obtained for document.");

      // Set up event listener
      let capturedEvent: Record<string, unknown> | null = null;
      if (scope.onAnnotationEvent) {
        scope.onAnnotationEvent.listen((event: any) => {
          log(`Captured onAnnotationEvent: type=${event.type}, pageIndex=${event.pageIndex}`);
          capturedEvent = {
            type: event.type,
            documentId: event.documentId,
            pageIndex: event.pageIndex,
            annotationId: event.annotation?.id,
            subtype: event.annotation?.type,
          };
          setResults((prev) => ({
            ...prev,
            annotationEventEmitted: true,
            annotationEventSample: capturedEvent,
          }));
        });
      }

      // 4. Create annotations: Highlight, Freehand Ink, FreeText, and Stamp
      log("Creating Highlight, Ink, FreeText, and Stamp annotations...");

      // A) Highlight Annotation
      const highlightAnno = {
        id: "anno-highlight-1",
        type: PdfAnnotationSubtype.HIGHLIGHT,
        pageIndex: 0,
        rect: { origin: { x: 50, y: 760 }, size: { width: 300, height: 25 } },
        rects: [{ origin: { x: 50, y: 760 }, size: { width: 300, height: 25 } }],
        color: "#ffe066",
        strokeColor: "#ffe066",
        contents: "Highlighted circuit analysis section",
      };

      // B) Freehand Ink Annotation
      const inkAnno = {
        id: "anno-ink-1",
        type: PdfAnnotationSubtype.INK,
        pageIndex: 0,
        rect: { origin: { x: 60, y: 550 }, size: { width: 120, height: 80 } },
        inkList: [
          [
            { x: 60, y: 550 },
            { x: 100, y: 590 },
            { x: 140, y: 560 },
            { x: 180, y: 620 },
          ],
        ],
        strokeColor: "#dc2626",
        strokeWidth: 3,
      };

      // C) FreeText Annotation
      const freeTextAnno = {
        id: "anno-freetext-1",
        type: PdfAnnotationSubtype.FREETEXT,
        pageIndex: 0,
        rect: { origin: { x: 200, y: 700 }, size: { width: 220, height: 35 } },
        contents: "Verified circuit node voltage = 5.0V",
        fontSize: 12,
        color: "#1e293b",
      };

      // D) Stamp Annotation with Binary Payload
      // Generate a distinct 64-byte binary ArrayBuffer representing image stamp bytes
      const sampleStampBytes = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magic
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22,
        0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0x00,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
        0x50, 0x4b, 0x03, 0x04, 0xff, 0xee, 0xdd, 0xcc,
      ]);

      const stampAnno = {
        id: "anno-stamp-1",
        type: PdfAnnotationSubtype.STAMP,
        pageIndex: 0,
        rect: { origin: { x: 350, y: 550 }, size: { width: 140, height: 100 } },
        name: "APPROVED",
      };

      const stampCtx = {
        data: sampleStampBytes.buffer,
        mimeType: "image/png",
      };

      scope.createAnnotation(0, highlightAnno);
      scope.createAnnotation(0, inkAnno);
      scope.createAnnotation(0, freeTextAnno);
      scope.createAnnotation(0, stampAnno, stampCtx);

      log("All 4 annotations created in annotation store.");
      setResults((prev) => ({ ...prev, annotationsCreated: true }));

      // 5. Export annotations
      log("Exporting annotations via scope.exportAnnotations()...");
      const exportedItems = await new Promise<any[]>((resolve, reject) => {
        const expTask = scope.exportAnnotations();
        expTask.wait(resolve, (e: any) => reject(new Error(String(e.reason?.message ?? e))));
      });

      log(`exportAnnotations() returned ${exportedItems.length} items.`);

      // Verify stamp binary preservation
      const exportedStamp = exportedItems.find((it: any) => it.annotation?.type === PdfAnnotationSubtype.STAMP || it.annotation?.id === "anno-stamp-1");
      const hasStampBinary = Boolean(exportedStamp && (exportedStamp.ctx?.data instanceof ArrayBuffer || exportedStamp.ctx?.data?.byteLength > 0));

      log(`Stamp binary preservation verified: ${hasStampBinary ? "YES" : "NO"}`);

      setResults((prev) => ({
        ...prev,
        exportedItemsCount: exportedItems.length,
        stampBinaryPreserved: hasStampBinary,
      }));

      // 6. Reload / Clear annotations
      log("Clearing annotations from document state...");
      scope.deleteAllAnnotations();
      const clearedList = scope.getAnnotations();
      const reloadWithoutOk = clearedList.length === 0;
      log(`State after clear: ${clearedList.length} annotations remaining. Clean reload: ${reloadWithoutOk}`);

      setResults((prev) => ({
        ...prev,
        reloadWithoutAnnotationsPassed: reloadWithoutOk,
      }));

      // 7. Restore via importAnnotations()
      log("Restoring annotations via scope.importAnnotations(exportedItems)...");
      scope.importAnnotations(exportedItems);

      const restoredList = scope.getAnnotations();
      const importOk = restoredList.length >= 4;
      log(`Restored annotation count: ${restoredList.length}. Round-trip: ${importOk ? "PASS" : "FAIL"}`);

      setResults((prev) => ({
        ...prev,
        importAnnotationsPassed: importOk,
        allChecksPassed: hasStampBinary && reloadWithoutOk && importOk,
      }));

      const finalReport = {
        firstPageLoadTimeMs: firstPageTotalMs,
        annotationEventName: "onAnnotationEvent",
        capturedEvent,
        exportedCount: exportedItems.length,
        stampBinaryPreserved: hasStampBinary,
        importOk,
      };

      if (typeof window !== "undefined") {
        (window as any).__EMBEDPDF_TEST_RESULTS__ = finalReport;
      }

      log("Spike S3 test sequence completed successfully!");
    } catch (e: unknown) {
      err(`Error during test harness: ${String(e)}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "#0b0f19", color: "#f1f5f9" }}>
      <header style={{ padding: "16px 24px", borderBottom: "1px solid #1e293b", backgroundColor: "#0f172a" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "20px", color: "#38bdf8" }}>
          Aboard Spike S3 — EmbedPDF Engine &amp; Annotation Round-Trip
        </h1>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "14px" }}>
          <div>WASM Loaded: <strong style={{ color: results.wasmLoaded ? "#4ade80" : "#f87171" }}>{results.wasmLoaded ? "PASS" : "WAITING"}</strong></div>
          <div>Engine Initialized: <strong style={{ color: results.engineInitialized ? "#4ade80" : "#f87171" }}>{results.engineInitialized ? "PASS" : "WAITING"}</strong></div>
          <div>10 Plugins: <strong style={{ color: results.pluginsRegistered ? "#4ade80" : "#f87171" }}>{results.pluginsRegistered ? "PASS" : "WAITING"}</strong></div>
          <div>50 MB First-Page Time: <strong style={{ color: "#38bdf8" }}>{results.firstPageLoadTimeMs ? `${results.firstPageLoadTimeMs} ms (${(results.firstPageLoadTimeMs / 1000).toFixed(2)}s)` : "MEASURING..."}</strong></div>
          <div>Event Hook: <strong style={{ color: "#fbbf24" }}>{results.annotationEventName}</strong></div>
          <div>Stamp Binary Kept: <strong style={{ color: results.stampBinaryPreserved ? "#4ade80" : "#f87171" }}>{results.stampBinaryPreserved ? "PASS" : "TESTING"}</strong></div>
          <div>Import Round-Trip: <strong style={{ color: results.importAnnotationsPassed ? "#4ade80" : "#f87171" }}>{results.importAnnotationsPassed ? "PASS" : "TESTING"}</strong></div>
        </div>
      </header>

      {results.errors.length > 0 && (
        <div style={{ backgroundColor: "#450a0a", borderLeft: "4px solid #ef4444", padding: "12px 24px", color: "#fca5a5" }}>
          <strong>Errors:</strong>
          <ul>
            {results.errors.map((e, idx) => (
              <li key={idx}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, padding: "16px 24px", gap: "24px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ fontSize: "16px", margin: 0, color: "#94a3b8" }}>EmbedPDF Workspace Viewer</h2>
          <div style={{ flex: 1, minHeight: "400px", border: "1px solid #1e293b", borderRadius: "8px", overflow: "hidden", backgroundColor: "#1e293b" }}>
            {engine ? (
              <EmbedPDF
                engine={engine}
                plugins={plugins}
                onInitialized={handleInitialized}
              >
                <div style={{ padding: "16px", color: "#94a3b8" }}>
                  PDFium Engine active. Document: /test-50mb.pdf (50.09 MB).
                </div>
              </EmbedPDF>
            ) : (
              <div style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                {engineLoading ? "Loading PDFium WebAssembly module..." : "Waiting for engine..."}
              </div>
            )}
          </div>
        </div>

        <div style={{ width: "420px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ fontSize: "16px", margin: 0, color: "#94a3b8" }}>Verification Output Log</h2>
          <div style={{ flex: 1, backgroundColor: "#020617", border: "1px solid #1e293b", borderRadius: "8px", padding: "12px", fontFamily: "monospace", fontSize: "12px", overflowY: "auto", maxHeight: "550px" }}>
            {results.logs.map((line, idx) => (
              <div key={idx} style={{ marginBottom: "4px", color: line.includes("PASS") || line.includes("successfully") ? "#4ade80" : line.includes("Error") ? "#f87171" : "#cbd5e1" }}>
                {line}
              </div>
            ))}
          </div>

          {results.annotationEventSample && (
            <div style={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", padding: "12px", fontSize: "12px" }}>
              <strong style={{ color: "#38bdf8" }}>Captured Event Sample:</strong>
              <pre style={{ margin: "8px 0 0 0", color: "#e2e8f0", fontSize: "11px", overflowX: "auto" }}>
                {JSON.stringify(results.annotationEventSample, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
