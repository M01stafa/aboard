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

export function getStrokeBounds(stroke: CustomInkStroke): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!stroke.points || stroke.points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
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
  const pad = Math.max(4, (stroke.width || 2) / 2 + 4);
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(8, maxX - minX + pad * 2),
    height: Math.max(8, maxY - minY + pad * 2),
  };
}

export function getAbsoluteStrokeBounds(stroke: CustomInkStroke): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const b = getStrokeBounds(stroke);
  const off = getStrokeOffset(stroke);
  return {
    x: b.x + off.x,
    y: b.y + off.y,
    width: b.width,
    height: b.height,
  };
}

export function scaleStrokePoints(
  points: CustomInkPoint[],
  strokeBounds: { x: number; y: number; width: number; height: number },
  newRect: { origin: { x: number; y: number }; size: { width: number; height: number } },
  transform?: CustomInkTransform
): CustomInkPoint[] {
  if (!points || points.length === 0) return [];
  const ox = transform?.x ?? 0;
  const oy = transform?.y ?? 0;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const ax = p.x + ox;
    const ay = p.y + oy;
    if (ax < minX) minX = ax;
    if (ay < minY) minY = ay;
    if (ax > maxX) maxX = ax;
    if (ay > maxY) maxY = ay;
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  const padLeft = Math.max(0, minX - strokeBounds.x);
  const padTop = Math.max(0, minY - strokeBounds.y);
  const padRight = Math.max(0, strokeBounds.x + strokeBounds.width - maxX);
  const padBottom = Math.max(0, strokeBounds.y + strokeBounds.height - maxY);

  const targetMinX = newRect.origin.x + padLeft;
  const targetMinY = newRect.origin.y + padTop;
  const targetMaxX = Math.max(targetMinX, newRect.origin.x + newRect.size.width - padRight);
  const targetMaxY = Math.max(targetMinY, newRect.origin.y + newRect.size.height - padBottom);

  const targetSpanX = targetMaxX - targetMinX;
  const targetSpanY = targetMaxY - targetMinY;

  return points.map((p) => {
    const ax = p.x + ox;
    const ay = p.y + oy;
    const u = (ax - minX) / spanX;
    const v = (ay - minY) / spanY;
    return {
      x: Math.round((targetMinX + u * targetSpanX) * 100) / 100,
      y: Math.round((targetMinY + v * targetSpanY) * 100) / 100,
    };
  });
}

export function rectsIntersect(
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    r2.x > r1.x + r1.width ||
    r2.x + r2.width < r1.x ||
    r2.y > r1.y + r1.height ||
    r2.y + r2.height < r1.y
  );
}

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotationScopeLike {
  getAnnotations?: (options?: { pageIndex?: number }) => Array<{
    object: {
      id: string;
      pageIndex: number;
      type: number;
      rect?: {
        origin: { x: number; y: number };
        size: { width: number; height: number };
      };
    };
  }>;
  setSelection?: (ids: string[]) => void;
  selectAnnotation?: (pageIndex: number, id: string) => void;
  deselectAnnotation?: () => void;
  getSelectedAnnotationIds?: () => string[];
}

export type CustomObjectType = "stroke" | "stamp" | "text";

export type ResizeHandlePosition = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export function getHandleCursor(pos: ResizeHandlePosition): string {
  switch (pos) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
  }
}

export function computeResizedRect(
  startRect: { x: number; y: number; width: number; height: number },
  handle: ResizeHandlePosition,
  dx: number,
  dy: number,
  lockAspectRatio: boolean = false
): { x: number; y: number; width: number; height: number } {
  const minW = 20;
  const minH = 15;
  const aspectRatio = startRect.width / Math.max(1, startRect.height);
  const minAspectW = Math.max(minW, minH * aspectRatio);

  if (lockAspectRatio) {
    switch (handle) {
      case "se": {
        // Dragging bottom-right: anchor is top-left (startRect.x, startRect.y)
        const effDx = Math.abs(dx) > Math.abs(dy * aspectRatio) ? dx : dy * aspectRatio;
        const newW = Math.max(minAspectW, startRect.width + effDx);
        const newH = newW / aspectRatio;
        return { x: startRect.x, y: startRect.y, width: newW, height: newH };
      }
      case "sw": {
        // Dragging bottom-left: anchor is top-right (startRect.x + startRect.width, startRect.y)
        const effChange = Math.abs(-dx) > Math.abs(dy * aspectRatio) ? -dx : dy * aspectRatio;
        const newW = Math.max(minAspectW, startRect.width + effChange);
        const newH = newW / aspectRatio;
        return { x: startRect.x + (startRect.width - newW), y: startRect.y, width: newW, height: newH };
      }
      case "ne": {
        // Dragging top-right: anchor is bottom-left (startRect.x, startRect.y + startRect.height)
        const effChange = Math.abs(dx) > Math.abs(-dy * aspectRatio) ? dx : -dy * aspectRatio;
        const newW = Math.max(minAspectW, startRect.width + effChange);
        const newH = newW / aspectRatio;
        return { x: startRect.x, y: startRect.y + (startRect.height - newH), width: newW, height: newH };
      }
      case "nw": {
        // Dragging top-left: anchor is bottom-right (startRect.x + startRect.width, startRect.y + startRect.height)
        const effChange = Math.abs(-dx) > Math.abs(-dy * aspectRatio) ? -dx : -dy * aspectRatio;
        const newW = Math.max(minAspectW, startRect.width + effChange);
        const newH = newW / aspectRatio;
        return {
          x: startRect.x + (startRect.width - newW),
          y: startRect.y + (startRect.height - newH),
          width: newW,
          height: newH,
        };
      }
      case "e": {
        const newW = Math.max(minAspectW, startRect.width + dx);
        const newH = newW / aspectRatio;
        return { x: startRect.x, y: startRect.y + (startRect.height - newH) / 2, width: newW, height: newH };
      }
      case "w": {
        const newW = Math.max(minAspectW, startRect.width - dx);
        const newH = newW / aspectRatio;
        return {
          x: startRect.x + (startRect.width - newW),
          y: startRect.y + (startRect.height - newH) / 2,
          width: newW,
          height: newH,
        };
      }
      case "s": {
        const newH = Math.max(minH, startRect.height + dy);
        const newW = newH * aspectRatio;
        return { x: startRect.x + (startRect.width - newW) / 2, y: startRect.y, width: newW, height: newH };
      }
      case "n": {
        const newH = Math.max(minH, startRect.height - dy);
        const newW = newH * aspectRatio;
        return {
          x: startRect.x + (startRect.width - newW) / 2,
          y: startRect.y + (startRect.height - newH),
          width: newW,
          height: newH,
        };
      }
    }
  }

  let { x, y, width, height } = startRect;
  switch (handle) {
    case "se":
      // Top-left anchor is fixed
      width = Math.max(minW, startRect.width + dx);
      height = Math.max(minH, startRect.height + dy);
      break;
    case "s":
      height = Math.max(minH, startRect.height + dy);
      break;
    case "e":
      width = Math.max(minW, startRect.width + dx);
      break;
    case "ne":
      // Bottom-left anchor is fixed
      width = Math.max(minW, startRect.width + dx);
      height = Math.max(minH, startRect.height - dy);
      y = startRect.y + (startRect.height - height);
      break;
    case "n":
      height = Math.max(minH, startRect.height - dy);
      y = startRect.y + (startRect.height - height);
      break;
    case "nw":
      // Bottom-right anchor is fixed
      width = Math.max(minW, startRect.width - dx);
      height = Math.max(minH, startRect.height - dy);
      x = startRect.x + (startRect.width - width);
      y = startRect.y + (startRect.height - height);
      break;
    case "w":
      width = Math.max(minW, startRect.width - dx);
      x = startRect.x + (startRect.width - width);
      break;
    case "sw":
      // Top-right anchor is fixed
      width = Math.max(minW, startRect.width - dx);
      height = Math.max(minH, startRect.height + dy);
      x = startRect.x + (startRect.width - width);
      break;
  }

  return { x, y, width, height };
}

export interface CustomAnnotationObject {
  id: string;
  type: CustomObjectType;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  transform?: CustomInkTransform;
}

export interface PdfCustomInkLayerProps {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  /** Draw tool active: the layer captures pointer input and draws. */
  isActive: boolean;
  /** Select tool active: strokes can be clicked and dragged, and marquee selection is enabled. */
  isSelectMode?: boolean;
  /** Stamp tool active: clicking the page captures coordinates and triggers image picker. */
  isStampMode?: boolean;
  onStampClick?: (pageIndex: number, pt: CustomInkPoint) => void;
  strokes: CustomInkStroke[];
  selectedStrokeIds?: string[];
  onSelectStrokes?: (strokeIds: string[]) => void;
  onAddStroke: (pageIndex: number, stroke: CustomInkStroke) => void;
  onMoveStroke?: (pageIndex: number, strokeId: string, transform: CustomInkTransform) => void;
  onMoveStrokes?: (
    pageIndex: number,
    moves: Array<{ strokeId: string; transform: CustomInkTransform }>
  ) => void;
  /** Objects (stamps, text) on this page */
  objects?: CustomAnnotationObject[];
  onMoveObject?: (
    pageIndex: number,
    id: string,
    newOrigin: { x: number; y: number },
    type: CustomObjectType
  ) => void;
  onResizeObject?: (
    pageIndex: number,
    id: string,
    newRect: { origin: { x: number; y: number }; size: { width: number; height: number } },
    type: CustomObjectType
  ) => void;
  annotationScope?: AnnotationScopeLike | null;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

type Interaction =
  | { kind: "draw"; stroke: CustomInkStroke }
  | {
      kind: "drag";
      anchorId: string;
      start: CustomInkPoint;
      bases: Record<string, CustomInkTransform>;
      currentOffsets: Record<string, CustomInkTransform>;
    }
  | {
      kind: "resize";
      objectId: string;
      handle: ResizeHandlePosition;
      startPoint: CustomInkPoint;
      startRect: { x: number; y: number; width: number; height: number };
      currentRect: { x: number; y: number; width: number; height: number };
      objectType: CustomObjectType;
    }
  | {
      kind: "marquee";
      start: CustomInkPoint;
      current: CustomInkPoint;
    };

export function PdfCustomInkLayer({
  pageIndex,
  pageWidth,
  pageHeight,
  isActive,
  isSelectMode = false,
  isStampMode = false,
  onStampClick,
  strokes,
  selectedStrokeIds = [],
  onSelectStrokes,
  onAddStroke,
  onMoveStroke,
  onMoveStrokes,
  objects,
  onMoveObject,
  onResizeObject,
  annotationScope,
  strokeColor = "#E44234",
  strokeWidth = 2.5,
  strokeOpacity = 1,
}: PdfCustomInkLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentStroke, setCurrentStroke] = useState<CustomInkStroke | null>(null);
  const [dragOffsets, setDragOffsets] = useState<Record<string, CustomInkTransform>>({});
  const [resizeRects, setResizeRects] = useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const interactionRef = useRef<Interaction | null>(null);

  const pageObjects = useMemo<CustomAnnotationObject[]>(() => {
    if (objects && objects.length > 0) return objects;
    if (!annotationScope?.getAnnotations) return [];
    const annos = annotationScope.getAnnotations({ pageIndex }) || [];
    const res: CustomAnnotationObject[] = [];
    for (const a of annos) {
      const o = a?.object;
      if (!o || !o.rect) continue;
      const type: CustomObjectType | null =
        o.type === 13 ? "stamp" : o.type === 3 || o.type === 1 ? "text" : null;
      if (type) {
        res.push({
          id: o.id,
          type,
          pageIndex: o.pageIndex ?? pageIndex,
          x: o.rect.origin.x,
          y: o.rect.origin.y,
          width: o.rect.size.width,
          height: o.rect.size.height,
          transform: { x: 0, y: 0 },
        });
      }
    }
    return res;
  }, [objects, annotationScope, pageIndex]);

  // Latest props for native listeners
  const propsRef = useRef({
    pageIndex,
    pageWidth,
    pageHeight,
    isActive,
    isSelectMode,
    isStampMode,
    onStampClick,
    strokes,
    selectedStrokeIds,
    onSelectStrokes,
    onAddStroke,
    onMoveStroke,
    onMoveStrokes,
    objects: pageObjects,
    onMoveObject,
    onResizeObject,
    annotationScope,
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
      isStampMode,
      onStampClick,
      strokes,
      selectedStrokeIds,
      onSelectStrokes,
      onAddStroke,
      onMoveStroke,
      onMoveStrokes,
      objects: pageObjects,
      onMoveObject,
      onResizeObject,
      annotationScope,
      strokeColor,
      strokeWidth,
      strokeOpacity,
    };
  });

  // Native listeners: attach directly to SVG to prevent text selection and handle 1:1 drawing + marquee
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

      // 1. Stamp mode: click on page to place a stamp image at (x, y)
      if (p.isStampMode) {
        e.preventDefault();
        e.stopPropagation();
        const pt = toPagePoint(e.clientX, e.clientY);
        if (!pt) return;
        p.onStampClick?.(p.pageIndex, pt);
        return;
      }

      // 2. Draw mode
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

      // 2. Select mode: object click, drag, or marquee drag
      if (p.isSelectMode) {
        const pt = toPagePoint(e.clientX, e.clientY);
        if (!pt) return;

        const target = e.target as Element | null;
        const handleEl = target?.closest?.("[data-resize-handle]");
        const handlePos = handleEl?.getAttribute("data-resize-handle") as ResizeHandlePosition | null;
        const handleObjId = handleEl?.getAttribute("data-object-id");

        if (handlePos && handleObjId) {
          // User clicked on a resize handle!
          e.preventDefault();
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          capture(e.pointerId);

          const stroke = p.strokes.find((s) => s.id === handleObjId);
          if (stroke) {
            const absBounds = getAbsoluteStrokeBounds(stroke);
            interactionRef.current = {
              kind: "resize",
              objectId: handleObjId,
              handle: handlePos,
              startPoint: pt,
              startRect: { x: absBounds.x, y: absBounds.y, width: absBounds.width, height: absBounds.height },
              currentRect: { x: absBounds.x, y: absBounds.y, width: absBounds.width, height: absBounds.height },
              objectType: "stroke",
            };
            setResizeRects({
              [handleObjId]: { x: absBounds.x, y: absBounds.y, width: absBounds.width, height: absBounds.height },
            });
            return;
          }

          const obj =
            (p.objects || []).find((o) => o.id === handleObjId) ||
            (() => {
              const annos = p.annotationScope?.getAnnotations?.({ pageIndex: p.pageIndex }) || [];
              const ta = annos.find((a) => a.object.id === handleObjId);
              if (ta?.object?.rect) {
                return {
                  id: ta.object.id,
                  type: (ta.object.type === 13 ? "stamp" : "text") as CustomObjectType,
                  pageIndex: p.pageIndex,
                  x: ta.object.rect.origin.x,
                  y: ta.object.rect.origin.y,
                  width: ta.object.rect.size.width,
                  height: ta.object.rect.size.height,
                };
              }
              return null;
            })();

          if (obj) {
            interactionRef.current = {
              kind: "resize",
              objectId: handleObjId,
              handle: handlePos,
              startPoint: pt,
              startRect: { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
              currentRect: { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
              objectType: obj.type,
            };
            setResizeRects({
              [handleObjId]: { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
            });
            return;
          }
        }

        const strokeEl = target?.closest?.("[data-ink-stroke-id]");
        const strokeId = strokeEl?.getAttribute("data-ink-stroke-id");

        const objEl = target?.closest?.("[data-object-id]");
        const objId = objEl?.getAttribute("data-object-id");

        const targetId = strokeId || objId;
        const isStroke = !!strokeId;

        if (targetId) {
          // User clicked on a custom ink stroke or a stamp/text object
          e.preventDefault();
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          capture(e.pointerId);
          const currentSelected = new Set(p.selectedStrokeIds || []);
          let activeSelected = Array.from(currentSelected);

          if (!currentSelected.has(targetId)) {
            activeSelected = [targetId];
            p.onSelectStrokes?.([targetId]);
            if (isStroke) {
              p.annotationScope?.deselectAnnotation?.();
            } else {
              p.annotationScope?.selectAnnotation?.(p.pageIndex, targetId);
            }
          }

          // Prepare drag bases for all currently selected items
          const bases: Record<string, CustomInkTransform> = {};
          for (const sid of activeSelected) {
            const st = p.strokes.find((s) => s.id === sid);
            if (st) {
              bases[sid] = getStrokeOffset(st);
            } else {
              const obj = (p.objects || []).find((o) => o.id === sid);
              bases[sid] = obj?.transform ?? { x: 0, y: 0 };
            }
          }
          if (!bases[targetId]) {
            const st = p.strokes.find((s) => s.id === targetId);
            if (st) {
              bases[targetId] = getStrokeOffset(st);
            } else {
              const obj = (p.objects || []).find((o) => o.id === targetId);
              bases[targetId] = obj?.transform ?? { x: 0, y: 0 };
            }
          }

          interactionRef.current = {
            kind: "drag",
            anchorId: targetId,
            start: pt,
            bases,
            currentOffsets: { ...bases },
          };
          setDragOffsets({ ...bases });
          return;
        }

        // Pointer is NOT on a custom stroke or registered object: check if clicked on an EmbedPDF annotation directly
        const pageAnnos = p.annotationScope?.getAnnotations?.({ pageIndex: p.pageIndex }) || [];
        const clickedAnno = pageAnnos.find((ta) => {
          const r = ta?.object?.rect;
          if (!r) return false;
          return (
            pt.x >= r.origin.x &&
            pt.x <= r.origin.x + r.size.width &&
            pt.y >= r.origin.y &&
            pt.y <= r.origin.y + r.size.height
          );
        });

        if (clickedAnno) {
          const annoId = clickedAnno.object.id;
          e.preventDefault();
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          capture(e.pointerId);
          p.onSelectStrokes?.([annoId]);
          p.annotationScope?.selectAnnotation?.(p.pageIndex, annoId);

          const bases: Record<string, CustomInkTransform> = { [annoId]: { x: 0, y: 0 } };
          interactionRef.current = {
            kind: "drag",
            anchorId: annoId,
            start: pt,
            bases,
            currentOffsets: { ...bases },
          };
          setDragOffsets({ ...bases });
          return;
        }

        // Check if pointer is directly over a text element (span in text layer)
        const isOverText = (() => {
          if (typeof document === "undefined") return false;
          if (document.elementsFromPoint) {
            const els = document.elementsFromPoint(e.clientX, e.clientY);
            for (const el of els) {
              if (el.tagName === "SPAN" && el.closest('[data-text-layer="true"]')) return true;
              if (el.hasAttribute("data-char-index") || el.closest("[data-char-index]")) return true;
              if (el.closest('.embed-pdf-text-layer, [data-testid="pdf-text-layer"]')) return true;
            }
          }
          const spans = svg.parentElement?.querySelectorAll<HTMLElement>('[data-text-layer="true"] span');
          if (spans && spans.length > 0) {
            for (let i = 0; i < spans.length; i++) {
              const rect = spans[i].getBoundingClientRect();
              if (
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
              ) {
                return true;
              }
            }
          }
          return false;
        })();

        if (isOverText) {
          // Allow text selection to propagate to PagePointerProvider / text layer
          return;
        }

        // Pointer is on empty space: start Marquee Selection!
        e.preventDefault();
        e.stopPropagation();
        window.getSelection()?.removeAllRanges();
        capture(e.pointerId);
        interactionRef.current = {
          kind: "marquee",
          start: pt,
          current: pt,
        };
        setMarquee({ x: pt.x, y: pt.y, width: 0, height: 0 });
      }
    };

    const handleMove = (e: PointerEvent) => {
      const it = interactionRef.current;
      if (!it) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = toPagePoint(e.clientX, e.clientY);
      if (!pt) return;
      const p = propsRef.current;

      if (it.kind === "draw") {
        const last = it.stroke.points[it.stroke.points.length - 1];
        const dx = pt.x - last.x;
        const dy = pt.y - last.y;
        if (dx * dx + dy * dy < 0.25) return;
        it.stroke = { ...it.stroke, points: [...it.stroke.points, pt] };
        setCurrentStroke(it.stroke);
      } else if (it.kind === "drag") {
        const dx = pt.x - it.start.x;
        const dy = pt.y - it.start.y;
        const nextOffsets: Record<string, CustomInkTransform> = {};
        for (const [id, base] of Object.entries(it.bases)) {
          nextOffsets[id] = { x: base.x + dx, y: base.y + dy };
        }
        it.currentOffsets = nextOffsets;
        setDragOffsets(nextOffsets);

        // Real-time visual transform on underlying AnnotationLayer DOM elements
        const docScale = svg.getBoundingClientRect().width / p.pageWidth;
        for (const [id, offset] of Object.entries(nextOffsets)) {
          const annoEl = document.querySelector(`[data-annotation-id="${id}"]`) as HTMLElement | null;
          if (annoEl) {
            const containerEl =
              (annoEl.closest("[data-no-interaction] > div") as HTMLElement | null) ||
              (annoEl.parentElement as HTMLElement | null);
            if (containerEl) {
              containerEl.style.transform = `translate(${offset.x * docScale}px, ${offset.y * docScale}px)`;
              containerEl.style.transition = "none";
            }
          }
        }
      } else if (it.kind === "resize") {
        const dx = pt.x - it.startPoint.x;
        const dy = pt.y - it.startPoint.y;
        const lockAspect = it.objectType === "stamp" || (e.shiftKey && it.objectType === "stroke");
        const newRect = computeResizedRect(it.startRect, it.handle, dx, dy, lockAspect);
        it.currentRect = newRect;
        setResizeRects({ [it.objectId]: newRect });

        // Real-time visual transform on underlying AnnotationLayer DOM elements
        const docScale = svg.getBoundingClientRect().width / p.pageWidth;
        const annoEl = document.querySelector(`[data-annotation-id="${it.objectId}"]`) as HTMLElement | null;
        if (annoEl) {
          const containerEl =
            (annoEl.closest("[data-no-interaction] > div") as HTMLElement | null) ||
            (annoEl.parentElement as HTMLElement | null);
          if (containerEl) {
            const scaleX = it.startRect.width > 0 ? newRect.width / it.startRect.width : 1;
            const scaleY = it.startRect.height > 0 ? newRect.height / it.startRect.height : 1;
            const dxOrigin = (newRect.x - it.startRect.x) * docScale;
            const dyOrigin = (newRect.y - it.startRect.y) * docScale;
            containerEl.style.transformOrigin = "top left";
            containerEl.style.transform = `translate(${dxOrigin}px, ${dyOrigin}px) scale(${scaleX}, ${scaleY})`;
            containerEl.style.transition = "none";
          }
        }
      } else if (it.kind === "marquee") {
        it.current = pt;
        const mx = Math.min(it.start.x, pt.x);
        const my = Math.min(it.start.y, pt.y);
        const mw = Math.abs(pt.x - it.start.x);
        const mh = Math.abs(pt.y - it.start.y);
        const box: MarqueeRect = { x: mx, y: my, width: mw, height: mh };
        setMarquee(box);

        if (mw > 2 || mh > 2) {
          // Find intersecting custom strokes
          const intersectingStrokeIds = p.strokes
            .filter((s) => rectsIntersect(box, getAbsoluteStrokeBounds(s)))
            .map((s) => s.id);

          // Find intersecting objects (stamps, text)
          const intersectingObjectIds = (p.objects || [])
            .filter((o) =>
              rectsIntersect(box, {
                x: o.x,
                y: o.y,
                width: o.width,
                height: o.height,
              })
            )
            .map((o) => o.id);

          p.onSelectStrokes?.([...intersectingStrokeIds, ...intersectingObjectIds]);

          // Find intersecting EmbedPDF annotations (stamps, text, etc.)
          const pageAnnos = p.annotationScope?.getAnnotations?.({ pageIndex: p.pageIndex }) || [];
          const intersectingAnnoIds = pageAnnos
            .filter((ta) => {
              const r = ta?.object?.rect;
              if (!r) return false;
              return rectsIntersect(box, {
                x: r.origin.x,
                y: r.origin.y,
                width: r.size.width,
                height: r.size.height,
              });
            })
            .map((ta) => ta.object.id);
          p.annotationScope?.setSelection?.(Array.from(new Set([...intersectingObjectIds, ...intersectingAnnoIds])));
        }
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
      } else if (it.kind === "drag") {
        // Reset temporary DOM element transforms
        for (const id of Object.keys(it.bases)) {
          const annoEl = document.querySelector(`[data-annotation-id="${id}"]`) as HTMLElement | null;
          if (annoEl) {
            const containerEl =
              (annoEl.closest("[data-no-interaction] > div") as HTMLElement | null) ||
              (annoEl.parentElement as HTMLElement | null);
            if (containerEl) {
              containerEl.style.transform = "";
              containerEl.style.transition = "";
            }
          }
        }

        if (commit) {
          const strokeMoves: Array<{ strokeId: string; transform: CustomInkTransform }> = [];
          for (const [id, cur] of Object.entries(it.currentOffsets)) {
            const base = it.bases[id] || { x: 0, y: 0 };
            if (Math.abs(cur.x - base.x) > 0.5 || Math.abs(cur.y - base.y) > 0.5) {
              const isStroke = p.strokes.some((s) => s.id === id);
              if (isStroke) {
                strokeMoves.push({ strokeId: id, transform: cur });
              } else {
                // Object move (stamp or text)
                const obj = (p.objects || []).find((o) => o.id === id) || (() => {
                  const annos = p.annotationScope?.getAnnotations?.({ pageIndex: p.pageIndex }) || [];
                  const ta = annos.find((a) => a.object.id === id);
                  if (ta?.object?.rect) {
                    return {
                      id: ta.object.id,
                      type: (ta.object.type === 13 ? "stamp" : "text") as CustomObjectType,
                      pageIndex: p.pageIndex,
                      x: ta.object.rect.origin.x,
                      y: ta.object.rect.origin.y,
                      width: ta.object.rect.size.width,
                      height: ta.object.rect.size.height,
                    };
                  }
                  return null;
                })();

                if (obj && p.onMoveObject) {
                  const dx = cur.x - base.x;
                  const dy = cur.y - base.y;
                  const newX = Math.round((obj.x + dx) * 100) / 100;
                  const newY = Math.round((obj.y + dy) * 100) / 100;
                  const maxX = Math.max(0, p.pageWidth - obj.width);
                  const maxY = Math.max(0, p.pageHeight - obj.height);
                  const clampedX = Math.max(0, Math.min(maxX, newX));
                  const clampedY = Math.max(0, Math.min(maxY, newY));
                  p.onMoveObject(p.pageIndex, id, { x: clampedX, y: clampedY }, obj.type);
                }
              }
            }
          }
          if (strokeMoves.length > 0) {
            if (p.onMoveStrokes) {
              p.onMoveStrokes(p.pageIndex, strokeMoves);
            } else if (p.onMoveStroke && strokeMoves[0]) {
              p.onMoveStroke(p.pageIndex, strokeMoves[0].strokeId, strokeMoves[0].transform);
            }
          }
        }
        setDragOffsets({});
      } else if (it.kind === "resize") {
        // Reset temporary DOM element styles
        const annoEl = document.querySelector(`[data-annotation-id="${it.objectId}"]`) as HTMLElement | null;
        if (annoEl) {
          const containerEl =
            (annoEl.closest("[data-no-interaction] > div") as HTMLElement | null) ||
            (annoEl.parentElement as HTMLElement | null);
          if (containerEl) {
            containerEl.style.transform = "";
            containerEl.style.transformOrigin = "";
            containerEl.style.transition = "";
          }
        }

        if (commit) {
          const pt = toPagePoint(e.clientX, e.clientY);
          const lockAspect = it.objectType === "stamp" || (e.shiftKey && it.objectType === "stroke");
          const finalRect = pt
            ? computeResizedRect(it.startRect, it.handle, pt.x - it.startPoint.x, pt.y - it.startPoint.y, lockAspect)
            : it.currentRect;

          if (
            Math.abs(finalRect.width - it.startRect.width) > 1 ||
            Math.abs(finalRect.height - it.startRect.height) > 1
          ) {
            p.onResizeObject?.(
              p.pageIndex,
              it.objectId,
              {
                origin: {
                  x: Math.round(finalRect.x * 100) / 100,
                  y: Math.round(finalRect.y * 100) / 100,
                },
                size: {
                  width: Math.round(finalRect.width * 100) / 100,
                  height: Math.round(finalRect.height * 100) / 100,
                },
              },
              it.objectType
            );
          }
        }
        setResizeRects({});
      } else if (it.kind === "marquee") {
        const mx = Math.min(it.start.x, it.current.x);
        const my = Math.min(it.start.y, it.current.y);
        const mw = Math.abs(it.current.x - it.start.x);
        const mh = Math.abs(it.current.y - it.start.y);

        if (mw <= 3 && mh <= 3) {
          // Just a single click on empty space: deselect everything
          p.onSelectStrokes?.([]);
          p.annotationScope?.deselectAnnotation?.();
        }
        setMarquee(null);
      }
    };

    const handleUp = (e: PointerEvent) => finish(e, true);
    const handleCancel = (e: PointerEvent) => finish(e, false);

    // Prevent native selection on mouse down
    const handleMouseDown = (e: MouseEvent) => {
      const p = propsRef.current;
      if (p.isActive) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const blockWhenBusy = (e: Event) => {
      if (propsRef.current.isActive) {
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

  const selectedSet = useMemo(() => new Set(selectedStrokeIds), [selectedStrokeIds]);

  const renderedStrokes = useMemo(
    () =>
      strokes.map((s) => {
        const resizeRect = resizeRects[s.id];
        const offset = resizeRect ? { x: 0, y: 0 } : (dragOffsets[s.id] ?? getStrokeOffset(s));
        const isSelected = isSelectMode && selectedSet.has(s.id);
        const bounds = getStrokeBounds(s);
        const handleSize = 8;

        const curX = resizeRect ? resizeRect.x : bounds.x + offset.x;
        const curY = resizeRect ? resizeRect.y : bounds.y + offset.y;
        const curW = resizeRect ? resizeRect.width : bounds.width;
        const curH = resizeRect ? resizeRect.height : bounds.height;

        let strokeTransform: string | undefined = undefined;
        let outerTransform: string | undefined = undefined;
        if (resizeRect) {
          const scaleX = bounds.width > 0 ? resizeRect.width / bounds.width : 1;
          const scaleY = bounds.height > 0 ? resizeRect.height / bounds.height : 1;
          const dx = resizeRect.x - scaleX * bounds.x;
          const dy = resizeRect.y - scaleY * bounds.y;
          strokeTransform = `translate(${dx}, ${dy}) scale(${scaleX}, ${scaleY})`;
        } else if (offset.x !== 0 || offset.y !== 0) {
          outerTransform = `translate(${offset.x}, ${offset.y})`;
        }

        const handles: Array<{ pos: ResizeHandlePosition; hx: number; hy: number }> = [
          { pos: "nw", hx: curX, hy: curY },
          { pos: "n", hx: curX + curW / 2, hy: curY },
          { pos: "ne", hx: curX + curW, hy: curY },
          { pos: "e", hx: curX + curW, hy: curY + curH / 2 },
          { pos: "se", hx: curX + curW, hy: curY + curH },
          { pos: "s", hx: curX + curW / 2, hy: curY + curH },
          { pos: "sw", hx: curX, hy: curY + curH },
          { pos: "w", hx: curX, hy: curY + curH / 2 },
        ];

        return (
          <g
            key={s.id}
            data-ink-stroke-id={s.id}
            data-testid="pdf-custom-ink-stroke"
            transform={outerTransform}
          >
            {/* The stroke geometry with drag/resize transform */}
            <g transform={strokeTransform}>
              <rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                fill="transparent"
                style={{
                  pointerEvents: isSelectMode ? "all" : "none",
                  cursor: isSelectMode ? "move" : "default",
                  touchAction: "none",
                }}
              />
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
            </g>

            {/* Selection Bounding Box & 8 Resize Handles */}
            {isSelected && (
              <g data-testid="pdf-custom-ink-bbox">
                <rect
                  x={curX}
                  y={curY}
                  width={curW}
                  height={curH}
                  fill="rgba(11, 122, 214, 0.04)"
                  stroke="var(--accent-text, #0b7ad6)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    pointerEvents: isSelectMode ? "all" : "none",
                    cursor: isSelectMode ? "move" : "default",
                    touchAction: "none",
                  }}
                />
                {handles.map(({ pos, hx, hy }) => (
                  <rect
                    key={pos}
                    data-resize-handle={pos}
                    data-object-id={s.id}
                    data-object-type="stroke"
                    data-testid={`pdf-ink-resize-handle-${pos}`}
                    x={hx - handleSize / 2}
                    y={hy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="var(--bg-surface, #ffffff)"
                    stroke="var(--accent-text, #0b7ad6)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      cursor: getHandleCursor(pos),
                      pointerEvents: isSelectMode ? "all" : "none",
                      touchAction: "none",
                    }}
                  />
                ))}
              </g>
            )}
          </g>
        );
      }),
    [strokes, dragOffsets, resizeRects, isSelectMode, selectedSet]
  );

  const renderedObjects = useMemo(
    () =>
      pageObjects.map((obj) => {
        const resizeRect = resizeRects[obj.id];
        const offset = resizeRect ? { x: 0, y: 0 } : (dragOffsets[obj.id] ?? obj.transform ?? { x: 0, y: 0 });
        const isSelected = isSelectMode && selectedSet.has(obj.id);
        const curX = resizeRect ? resizeRect.x : obj.x;
        const curY = resizeRect ? resizeRect.y : obj.y;
        const curW = resizeRect ? resizeRect.width : obj.width;
        const curH = resizeRect ? resizeRect.height : obj.height;
        const handleSize = 8;

        const handles: Array<{ pos: ResizeHandlePosition; hx: number; hy: number }> = [
          { pos: "nw", hx: curX, hy: curY },
          { pos: "n", hx: curX + curW / 2, hy: curY },
          { pos: "ne", hx: curX + curW, hy: curY },
          { pos: "e", hx: curX + curW, hy: curY + curH / 2 },
          { pos: "se", hx: curX + curW, hy: curY + curH },
          { pos: "s", hx: curX + curW / 2, hy: curY + curH },
          { pos: "sw", hx: curX, hy: curY + curH },
          { pos: "w", hx: curX, hy: curY + curH / 2 },
        ];

        return (
          <g
            key={obj.id}
            data-object-id={obj.id}
            data-object-type={obj.type}
            data-testid={`pdf-${obj.type}-object`}
            transform={offset.x !== 0 || offset.y !== 0 ? `translate(${offset.x}, ${offset.y})` : undefined}
          >
            <rect
              x={curX}
              y={curY}
              width={curW}
              height={curH}
              fill="transparent"
              style={{
                pointerEvents: isSelectMode ? "all" : "none",
                cursor: isSelectMode ? "move" : "default",
                touchAction: "none",
              }}
            />
            {isSelected && (
              <g data-testid={`pdf-${obj.type}-bbox`}>
                <rect
                  x={curX}
                  y={curY}
                  width={curW}
                  height={curH}
                  fill="rgba(11, 122, 214, 0.04)"
                  stroke="var(--accent-text, #0b7ad6)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: "none" }}
                />
                {handles.map(({ pos, hx, hy }) => (
                  <rect
                    key={pos}
                    data-resize-handle={pos}
                    data-object-id={obj.id}
                    data-object-type={obj.type}
                    data-testid={`pdf-${obj.type}-resize-handle-${pos}`}
                    x={hx - handleSize / 2}
                    y={hy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="var(--bg-surface, #ffffff)"
                    stroke="var(--accent-text, #0b7ad6)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      cursor: getHandleCursor(pos),
                      pointerEvents: isSelectMode ? "all" : "none",
                      touchAction: "none",
                    }}
                  />
                ))}
              </g>
            )}
          </g>
        );
      }),
    [pageObjects, dragOffsets, resizeRects, isSelectMode, selectedSet]
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
        pointerEvents: isActive || isSelectMode || isStampMode ? "auto" : "none",
        cursor: isActive || isStampMode ? "crosshair" : "default",
        zIndex: 15,
        overflow: "visible",
        touchAction: isActive || isSelectMode || isStampMode ? "none" : "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
        direction: "ltr",
      }}
    >
      {renderedStrokes}
      {renderedObjects}
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
      {marquee && (marquee.width > 2 || marquee.height > 2) && (
        <g data-testid="pdf-marquee-selection" style={{ pointerEvents: "none" }}>
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.width}
            height={marquee.height}
            fill="rgba(11, 122, 214, 0.08)"
            stroke="#0b7ad6"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            vectorEffect="non-scaling-stroke"
          />
          {[
            [marquee.x, marquee.y],
            [marquee.x + marquee.width, marquee.y],
            [marquee.x, marquee.y + marquee.height],
            [marquee.x + marquee.width, marquee.y + marquee.height],
          ].map(([hx, hy], i) => (
            <rect
              key={i}
              x={hx - 4}
              y={hy - 4}
              width={8}
              height={8}
              fill="#ffffff"
              stroke="#0b7ad6"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
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
