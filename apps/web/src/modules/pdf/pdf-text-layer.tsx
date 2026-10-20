"use client";

import React, { useEffect, useState } from "react";
import { useRegistry, useDocumentState } from "@embedpdf/core/react";
import type { PdfTextRun, PdfPageTextRuns, PdfPageGeometry, PdfAlphaColor } from "@embedpdf/models";

export interface PdfTextLayerProps {
  documentId: string;
  pageIndex: number;
  isAnnotating?: boolean;
}

interface GeometryRun {
  glyphs?: Array<{ char?: string }>;
  rect: { origin: { x: number; y: number }; size: { width: number; height: number } };
  font?: {
    name: string;
    familyName: string;
    weight: number;
    italic: boolean;
    monospaced: boolean;
    embedded: boolean;
  };
  fontSize?: number;
  charStart?: number;
}

const DEFAULT_TRANSPARENT_COLOR: PdfAlphaColor = {
  red: 0,
  green: 0,
  blue: 0,
  alpha: 0,
};

/**
 * Renders a transparent, selectable text layer over the PDF page.
 * Provides a DOM container with `data-text-layer="true"` and positioned
 * text runs, enabling native browser text selection, copy-paste,
 * and cross-tool integration while keeping PDFium's visual canvas underneath.
 */
export function PdfTextLayer({
  documentId,
  pageIndex,
  isAnnotating = false,
}: PdfTextLayerProps) {
  const { registry } = useRegistry();
  const docState = useDocumentState(documentId);
  const [runs, setRuns] = useState<PdfTextRun[]>([]);
  const scale = docState?.scale ?? 1;

  useEffect(() => {
    if (!registry || !docState?.document) return;
    const doc = docState.document;
    const engine = registry.getEngine();
    const page = doc.pages?.[pageIndex];
    if (!page) return;

    let cancelled = false;

    if (typeof engine.getPageTextRuns === "function") {
      const task = engine.getPageTextRuns(doc, page);
      task.wait(
        (pageRuns: PdfPageTextRuns) => {
          if (!cancelled && pageRuns?.runs) {
            setRuns(pageRuns.runs);
          }
        },
        () => {
          // Fallback to getPageGeometry if getPageTextRuns task rejects
          if (typeof engine.getPageGeometry === "function") {
            const geoTask = engine.getPageGeometry(doc, page);
            geoTask.wait(
              (geo: PdfPageGeometry) => {
                if (!cancelled && geo?.runs) {
                  const rawRuns = geo.runs as unknown as GeometryRun[];
                  const mappedRuns: PdfTextRun[] = rawRuns.map((r) => ({
                    text: r.glyphs?.map((g) => g.char || "").join("") || "",
                    rect: r.rect,
                    font: r.font || {
                      name: "sans-serif",
                      familyName: "sans-serif",
                      weight: 400,
                      italic: false,
                      monospaced: false,
                      embedded: false,
                    },
                    fontSize: r.fontSize || r.rect?.size?.height || 12,
                    color: DEFAULT_TRANSPARENT_COLOR,
                    charIndex: r.charStart ?? 0,
                    charCount: r.glyphs?.length || 0,
                  }));
                  setRuns(mappedRuns);
                }
              },
              () => {}
            );
          }
        }
      );
    }

    return () => {
      cancelled = true;
    };
  }, [registry, docState?.document, pageIndex]);

  return (
    <div
      className="pdf-text-layer"
      data-text-layer="true"
      data-page-index={pageIndex}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: isAnnotating ? "none" : "auto",
        userSelect: isAnnotating ? "none" : "text",
        zIndex: 2,
        lineHeight: 1,
      }}
    >
      {runs.map((run, idx) => (
        <span
          key={idx}
          data-char-index={run.charIndex}
          style={{
            position: "absolute",
            left: `${run.rect.origin.x * scale}px`,
            top: `${run.rect.origin.y * scale}px`,
            width: `${run.rect.size.width * scale}px`,
            height: `${run.rect.size.height * scale}px`,
            fontSize: `${(run.fontSize || run.rect.size.height) * scale}px`,
            color: "transparent",
            whiteSpace: "pre",
            transformOrigin: "0 0",
            cursor: "text",
          }}
        >
          {run.text}
        </span>
      ))}
    </div>
  );
}
