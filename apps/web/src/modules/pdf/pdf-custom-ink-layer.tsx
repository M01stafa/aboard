"use client";

import React, { useRef, useState, useCallback, useMemo } from "react";

export interface CustomInkPoint {
  x: number;
  y: number;
}

export interface CustomInkStroke {
  id: string;
  points: CustomInkPoint[];
  color: string;
  width: number;
  opacity: number;
}

export function pointsToSvgPath(points: CustomInkPoint[]): string {
  if (!points || points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    d += ` Q ${p1.x} ${p1.y}, ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export interface PdfCustomInkLayerProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  isActive: boolean;
  strokes: CustomInkStroke[];
  onAddStroke: (pageIndex: number, stroke: CustomInkStroke) => void;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export function PdfCustomInkLayer({
  pageIndex,
  pageWidth,
  pageHeight,
  isActive,
  strokes,
  onAddStroke,
  strokeColor = "#E44234",
  strokeWidth = 2.5,
  strokeOpacity = 1,
}: PdfCustomInkLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentStroke, setCurrentStroke] = useState<CustomInkStroke | null>(null);
  const isDrawingRef = useRef(false);

  const getCoordinates = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): CustomInkPoint | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const scaleX = pageWidth / rect.width;
      const scaleY = pageHeight / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [pageWidth, pageHeight]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isActive || e.button !== 0) return;
      const pt = getCoordinates(e);
      if (!pt) return;

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture fallback if not supported
      }

      isDrawingRef.current = true;
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setCurrentStroke({
        id,
        points: [pt],
        color: strokeColor,
        width: strokeWidth,
        opacity: strokeOpacity,
      });
    },
    [isActive, getCoordinates, strokeColor, strokeWidth, strokeOpacity]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current) return;
      const pt = getCoordinates(e);
      if (!pt) return;

      setCurrentStroke((prev) => {
        if (!prev) return null;
        const lastPt = prev.points[prev.points.length - 1];
        if (lastPt) {
          const dx = pt.x - lastPt.x;
          const dy = pt.y - lastPt.y;
          if (dx * dx + dy * dy < 0.25) return prev;
        }
        return {
          ...prev,
          points: [...prev.points, pt],
        };
      });
    },
    [getCoordinates]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Safe release
      }

      if (currentStroke && currentStroke.points.length > 0) {
        onAddStroke(pageIndex, currentStroke);
      }
      setCurrentStroke(null);
    },
    [currentStroke, onAddStroke, pageIndex]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
        setCurrentStroke(null);
      }
    },
    []
  );

  const renderedStrokes = useMemo(() => {
    return strokes.map((s) => (
      <path
        key={s.id}
        d={pointsToSvgPath(s.points)}
        fill="none"
        stroke={s.color}
        strokeWidth={s.width}
        strokeOpacity={s.opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: "none" }}
      />
    ));
  }, [strokes]);

  return (
    <svg
      ref={svgRef}
      data-testid={`pdf-custom-ink-layer-${pageIndex + 1}`}
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: isActive ? "auto" : "none",
        cursor: isActive ? "crosshair" : "default",
        zIndex: 15,
        overflow: "visible",
        touchAction: isActive ? "none" : "auto",
        direction: "ltr",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {renderedStrokes}
      {currentStroke && (
        <path
          d={pointsToSvgPath(currentStroke.points)}
          fill="none"
          stroke={currentStroke.color}
          strokeWidth={currentStroke.width}
          strokeOpacity={currentStroke.opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}

/**
 * Composites custom ink strokes onto an existing rendered page Blob (e.g. for "Send to Whiteboard").
 */
export async function compositeCustomStrokesOnBlob(
  blob: Blob,
  strokes: CustomInkStroke[],
  targetWidth: number,
  targetHeight: number,
  pageWidth?: number,
  pageHeight?: number
): Promise<Blob> {
  if (typeof window === "undefined" || !strokes || strokes.length === 0) return blob;
  const pWidth = pageWidth || targetWidth;
  const pHeight = pageHeight || targetHeight;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const scaleX = targetWidth / pWidth;
      const scaleY = targetHeight / pHeight;

      for (const stroke of strokes) {
        if (!stroke.points || stroke.points.length === 0) continue;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = (stroke.width || 2) * scaleX;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = stroke.opacity ?? 1;

        if (stroke.points.length === 1) {
          ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
          ctx.lineTo(stroke.points[0].x * scaleX + 0.1, stroke.points[0].y * scaleY + 0.1);
        } else {
          ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
          for (let i = 1; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i];
            const p2 = stroke.points[i + 1];
            const midX = ((p1.x + p2.x) / 2) * scaleX;
            const midY = ((p1.y + p2.y) / 2) * scaleY;
            ctx.quadraticCurveTo(p1.x * scaleX, p1.y * scaleY, midX, midY);
          }
          const last = stroke.points[stroke.points.length - 1];
          ctx.lineTo(last.x * scaleX, last.y * scaleY);
        }
        ctx.stroke();
      }

      canvas.toBlob(
        (b) => resolve(b || blob),
        blob.type || "image/webp",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}
