"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export interface CustomInkPoint {
  x: number;
  y: number;
}

export interface CustomInkTransform {
  x: number;
  y: number;
}

export interface CustomInkStroke {
  id: string;
  points: CustomInkPoint[];
  color: string;
  width: number;
  opacity: number;
  /** Translation applied to the stroke in page units (set when the stroke is moved). */
  transform?: CustomInkTransform;
}

export function getStrokeOffset(stroke: CustomInkStroke): CustomInkTransform {
  return stroke.transform ?? { x: 0, y: 0 };
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

function getStrokeBounds(stroke: CustomInkStroke) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = (stroke.width || 2) / 2 + 4;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export interface PdfCustomInkLayerProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  /** Draw tool active: the layer captures pointer input and draws. */
  isActive: boolean;
  /** Select tool active: strokes can be clicked and dragged. */
  isSelectMode?: boolean;
  strokes: CustomInkStroke[];
  onAddStroke: (pageIndex: number, stroke: CustomInkStroke) => void;
  onMoveStroke?: (pageIndex: number, strokeId: string, transform: CustomInkTransform) => void;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

type Interaction =
  | { kind: "draw"; stroke: CustomInkStroke }
  | {
      kind: "drag";
      id: string;
      start: CustomInkPoint;
      base: CustomInkTransform;
      current: CustomInkTransform;
    };

export function PdfCustomInkLayer({
  pageIndex,
  pageWidth,
  pageHeight,
  isActive,
  isSelectMode = false,
  strokes,
  onAddStroke,
  onMoveStroke,
  strokeColor = "#E44234",
  strokeWidth = 2.5,
  strokeOpacity = 1,
}: PdfCustomInkLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentStroke, setCurrentStroke] = useState<CustomInkStroke | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const interactionRef = useRef<Interaction | null>(null);

  // Latest props for the native listeners below (kept in a ref so listeners attach once).
  const propsRef = useRef({
    pageIndex,
    pageWidth,
    pageHeight,
    isActive,
    isSelectMode,
    strokes,
    onAddStroke,
    onMoveStroke,
    strokeColor,
    strokeWidth,
    strokeOpacity,
  });
  useEffect(() => {
    propsRef.current = {
      pageIndex,
      pageWidth,
      pageHeight,
      isActive,
      isSelectMode,
      strokes,
      onAddStroke,
      onMoveStroke,
      strokeColor,
      strokeWidth,
      strokeOpacity,
    };
  });

  // Native listeners: EmbedPDF attaches native listeners on the page element, so a React
  // synthetic stopPropagation cannot keep the text layer from reacting. These run on the SVG
  // itself and stop the event before it bubbles to the page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const toPagePoint = (clientX: number, clientY: number): CustomInkPoint | null => {
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const p = propsRef.current;
      return {
        x: (clientX - rect.left) * (p.pageWidth / rect.width),
        y: (clientY - rect.top) * (p.pageHeight / rect.height),
      };
    };

    const capture = (id: number) => {
      try {
        svg.setPointerCapture(id);
      } catch {
        // Pointer capture is optional
      }
    };
    const release = (id: number) => {
      try {
        svg.releasePointerCapture(id);
      } catch {
        // Safe release
      }
    };

    const handleDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = propsRef.current;
      if (p.isActive) {
        e.preventDefault();
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        const pt = toPagePoint(e.clientX, e.clientY);
        if (!pt) return;
        capture(e.pointerId);
        const id =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const stroke: CustomInkStroke = {
          id,
          points: [pt],
          color: p.strokeColor,
          width: p.strokeWidth,
          opacity: p.strokeOpacity,
        };
        interactionRef.current = { kind: "draw", stroke };
        setCurrentStroke(stroke);
        return;
      }
      if (p.isSelectMode) {
        const target = e.target as Element | null;
        const strokeEl = target?.closest?.("[data-ink-stroke-id]");
        const id = strokeEl?.getAttribute("data-ink-stroke-id");
        if (!id) return;
        const stroke = p.strokes.find((s) => s.id === id);
        const pt = toPagePoint(e.clientX, e.clientY);
        if (!stroke || !pt) return;
        e.preventDefault();
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        capture(e.pointerId);
        const base = getStrokeOffset(stroke);
        interactionRef.current = { kind: "drag", id, start: pt, base, current: base };
        setSelectedId(id);
        setDrag({ id, x: base.x, y: base.y });
      }
    };

    const handleMove = (e: PointerEvent) => {
      const it = interactionRef.current;
      if (!it) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = toPagePoint(e.clientX, e.clientY);
      if (!pt) return;
      if (it.kind === "draw") {
        const last = it.stroke.points[it.stroke.points.length - 1];
        const dx = pt.x - last.x;
        const dy = pt.y - last.y;
        if (dx * dx + dy * dy < 0.25) return;
        it.stroke = { ...it.stroke, points: [...it.stroke.points, pt] };
        setCurrentStroke(it.stroke);
      } else {
        const next = {
          x: it.base.x + (pt.x - it.start.x),
          y: it.base.y + (pt.y - it.start.y),
        };
        it.current = next;
        setDrag({ id: it.id, x: next.x, y: next.y });
      }
    };

    const finish = (e: PointerEvent, commit: boolean) => {
      const it = interactionRef.current;
      if (!it) return;
      interactionRef.current = null;
      e.stopPropagation();
      release(e.pointerId);
      const p = propsRef.current;
      if (it.kind === "draw") {
        if (commit && it.stroke.points.length > 0) {
          p.onAddStroke(p.pageIndex, it.stroke);
        }
        setCurrentStroke(null);
      } else {
        const moved =
          Math.abs(it.current.x - it.base.x) > 0.5 || Math.abs(it.current.y - it.base.y) > 0.5;
        if (commit && moved) {
          p.onMoveStroke?.(p.pageIndex, it.id, it.current);
        }
        setDrag(null);
      }
    };

    const handleUp = (e: PointerEvent) => finish(e, true);
    const handleCancel = (e: PointerEvent) => finish(e, false);

    // Legacy mouse events must not reach the page either (they start native text selection).
    const handleMouseDown = (e: MouseEvent) => {
      const p = propsRef.current;
      const target = e.target as Element | null;
      if (p.isActive || (p.isSelectMode && target?.closest?.("[data-ink-stroke-id]"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const blockWhenBusy = (e: Event) => {
      if (propsRef.current.isActive || interactionRef.current) {
        e.preventDefault();
      }
    };

    svg.addEventListener("pointerdown", handleDown);
    svg.addEventListener("pointermove", handleMove);
    svg.addEventListener("pointerup", handleUp);
    svg.addEventListener("pointercancel", handleCancel);
    svg.addEventListener("mousedown", handleMouseDown);
    svg.addEventListener("selectstart", blockWhenBusy);
    svg.addEventListener("dragstart", blockWhenBusy);
    return () => {
      svg.removeEventListener("pointerdown", handleDown);
      svg.removeEventListener("pointermove", handleMove);
      svg.removeEventListener("pointerup", handleUp);
      svg.removeEventListener("pointercancel", handleCancel);
      svg.removeEventListener("mousedown", handleMouseDown);
      svg.removeEventListener("selectstart", blockWhenBusy);
      svg.removeEventListener("dragstart", blockWhenBusy);
    };
  }, []);

  // Deselect when pressing anywhere that is not a stroke
  useEffect(() => {
    if (!selectedId) return;
    const onDocDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest?.("[data-ink-stroke-id]")) {
        setSelectedId(null);
      }
    };
    document.addEventListener("pointerdown", onDocDown, true);
    return () => document.removeEventListener("pointerdown", onDocDown, true);
  }, [selectedId]);

  const renderedStrokes = useMemo(
    () =>
      strokes.map((s) => {
        const offset =
          drag && drag.id === s.id ? { x: drag.x, y: drag.y } : getStrokeOffset(s);
        const isSelected = isSelectMode && selectedId === s.id;
        const bounds = isSelected ? getStrokeBounds(s) : null;
        const handleSize = 8;
        return (
          <g
            key={s.id}
            data-ink-stroke-id={s.id}
            data-testid="pdf-custom-ink-stroke"
            transform={`translate(${offset.x}, ${offset.y})`}
          >
            <path
              d={pointsToSvgPath(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              strokeOpacity={s.opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
            <polyline
              points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(s.width, 16)}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                pointerEvents: isSelectMode ? "stroke" : "none",
                cursor: isSelectMode ? "move" : "default",
                touchAction: "none",
              }}
            />
            {bounds && (
              <g style={{ pointerEvents: "none" }} data-testid="pdf-custom-ink-bbox">
                <rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                  fill="none"
                  stroke="#0b7ad6"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {[
                  [bounds.x, bounds.y],
                  [bounds.x + bounds.width, bounds.y],
                  [bounds.x, bounds.y + bounds.height],
                  [bounds.x + bounds.width, bounds.y + bounds.height],
                ].map(([hx, hy], i) => (
                  <rect
                    key={i}
                    x={hx - handleSize / 2}
                    y={hy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#ffffff"
                    stroke="#0b7ad6"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
          </g>
        );
      }),
    [strokes, drag, isSelectMode, selectedId]
  );

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
        userSelect: "none",
        WebkitUserSelect: "none",
        direction: "ltr",
      }}
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
        const off = getStrokeOffset(stroke);
        const pts = stroke.points.map((p) => ({ x: p.x + off.x, y: p.y + off.y }));
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = (stroke.width || 2) * scaleX;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = stroke.opacity ?? 1;

        if (pts.length === 1) {
          ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
          ctx.lineTo(pts[0].x * scaleX + 0.1, pts[0].y * scaleY + 0.1);
        } else {
          ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
          for (let i = 1; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const midX = ((p1.x + p2.x) / 2) * scaleX;
            const midY = ((p1.y + p2.y) / 2) * scaleY;
            ctx.quadraticCurveTo(p1.x * scaleX, p1.y * scaleY, midX, midY);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last.x * scaleX, last.y * scaleY);
        }
        ctx.stroke();
      }

      canvas.toBlob((b) => resolve(b || blob), blob.type || "image/webp", 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}
