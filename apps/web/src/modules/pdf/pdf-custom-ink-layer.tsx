"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PdfAnnotationSubtype } from "@embedpdf/models";

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
  startRect: { x: number; y: number; width: number; height: number },
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

  const padLeft = Math.max(0, minX - startRect.x);
  const padTop = Math.max(0, minY - startRect.y);
  const padRight = Math.max(0, startRect.x + startRect.width - maxX);
  const padBottom = Math.max(0, startRect.y + startRect.height - maxY);

  const totalPadX = padLeft + padRight;
  const safePadLeft =
    totalPadX > 0 && newRect.size.width <= totalPadX + 2
      ? (padLeft / totalPadX) * Math.max(0, newRect.size.width - 2)
      : padLeft;
  const safePadRight =
    totalPadX > 0 && newRect.size.width <= totalPadX + 2
      ? (padRight / totalPadX) * Math.max(0, newRect.size.width - 2)
      : padRight;

  const totalPadY = padTop + padBottom;
  const safePadTop =
    totalPadY > 0 && newRect.size.height <= totalPadY + 2
      ? (padTop / totalPadY) * Math.max(0, newRect.size.height - 2)
      : padTop;
  const safePadBottom =
    totalPadY > 0 && newRect.size.height <= totalPadY + 2
      ? (padBottom / totalPadY) * Math.max(0, newRect.size.height - 2)
      : padBottom;

  const targetMinX = newRect.origin.x + safePadLeft;
  const targetMinY = newRect.origin.y + safePadTop;
  const targetSpanX = Math.max(0.1, newRect.size.width - safePadLeft - safePadRight);
  const targetSpanY = Math.max(0.1, newRect.size.height - safePadTop - safePadBottom);

  const origSpanX = maxX - minX;
  const origSpanY = maxY - minY;

  return points.map((p) => {
    const ax = p.x + ox;
    const ay = p.y + oy;
    const u = origSpanX <= 0.001 ? 0.5 : (ax - minX) / origSpanX;
    const v = origSpanY <= 0.001 ? 0.5 : (ay - minY) / origSpanY;
    return {
      x: Math.round((targetMinX + u * targetSpanX) * 100) / 100,
      y: Math.round((targetMinY + v * targetSpanY) * 100) / 100,
    };
  });
}

export function getMaxTextWidth(pageWidth: number, x: number): number {
  const pWidth = pageWidth > 0 ? pageWidth : 612;
  const available = pWidth - x - 24;
  return Math.min(500, Math.max(200, available));
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

/**
 * Calculates bounding boxes and checks intersection for custom ink strokes,
 * stamps, texts, and sticky notes against a marquee selection rectangle.
 */
export function findIntersectingItemIds(
  box: MarqueeRect,
  strokes: CustomInkStroke[] = [],
  objects: CustomAnnotationObject[] = []
): string[] {
  const strokeIds: string[] = [];
  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of stroke.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    const ox = stroke.transform?.x ?? 0;
    const oy = stroke.transform?.y ?? 0;
    const pad = Math.max(2, (stroke.width || 2) / 2);
    const strokeBox = {
      x: minX + ox - pad,
      y: minY + oy - pad,
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2),
    };
    if (rectsIntersect(box, strokeBox)) {
      strokeIds.push(stroke.id);
    }
  }

  const objectIds = (objects || [])
    .filter((o) => {
      // Account for var(--space-1, 8px) padding for text boxes
      const pad = o.type === "text" ? 8 : 0;
      const rawW = o.type === "text" ? Math.min(500, o.width) : o.width;
      const oBox = {
        x: o.x + (o.transform?.x ?? 0),
        y: o.y + (o.transform?.y ?? 0),
        width: Math.max(o.type === "text" ? 64 : 1, rawW + pad * 2),
        height: o.height + pad * 2,
      };
      return rectsIntersect(box, oBox);
    })
    .map((o) => o.id);

  return Array.from(new Set([...strokeIds, ...objectIds]));
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

export type CustomObjectType = "stroke" | "ink" | "stamp" | "text" | "highlight" | "sticky";

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
  lockAspectRatio: boolean = false,
  minWidth: number = 20,
  minHeight: number = 15
): { x: number; y: number; width: number; height: number } {
  const minW = Math.max(20, minWidth);
  const minH = Math.max(15, minHeight);
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
  text?: string;
  contents?: string;
  fontSize?: number;
  color?: string;
  rotation?: number;
}

/**
 * Computes a subtle deterministic rotation (-0.8deg to +0.8deg) for a sticky note
 * based on its ID (or returns the note's explicit rotation if set).
 */
export function getStickyRotation(id: string, explicitRotation?: number): number {
  if (typeof explicitRotation === "number" && !Number.isNaN(explicitRotation)) {
    return explicitRotation;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return ((Math.abs(hash) % 17) - 8) / 10;
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
  /** Sticky note tool active: clicking the page places a sticky note */
  isStickyMode?: boolean;
  onAddSticky?: (
    pageIndex: number,
    coords: { x: number; y: number; width?: number; height?: number; text?: string; color?: string; rotation?: number }
  ) => void;
  onUpdateStickyText?: (pageIndex: number, id: string, text: string) => void;
  onDeleteSticky?: (pageIndex: number, id: string) => void;
  /** Text mode active: clicking canvas creates a text box */
  isTextMode?: boolean;
  onAddText?: (
    pageIndex: number,
    coords: { x: number; y: number; width?: number; height?: number; text?: string; fontSize?: number; color?: string; id?: string }
  ) => string | void;
  onUpdateText?: (pageIndex: number, id: string, text: string) => void;
  onDeleteText?: (pageIndex: number, id: string) => void;
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
  isStickyMode = false,
  onAddSticky,
  onUpdateStickyText,
  onDeleteSticky,
  isTextMode = false,
  onAddText,
  onUpdateText,
  onDeleteText,
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
  const [liveScaledStrokes, setLiveScaledStrokes] = useState<Record<string, CustomInkPoint[]>>({});
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const editingStickyIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingStickyIdRef.current = editingStickyId;
  }, [editingStickyId]);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editingStickyId) {
      const focusEl = () => {
        if (editingTextareaRef.current) {
          editingTextareaRef.current.style.pointerEvents = "auto";
          editingTextareaRef.current.focus();
          const len = editingTextareaRef.current.value.length;
          if (typeof editingTextareaRef.current.setSelectionRange === "function") {
            editingTextareaRef.current.setSelectionRange(len, len);
          }
        }
      };
      focusEl();
      requestAnimationFrame(focusEl);
      const t1 = setTimeout(focusEl, 30);
      const t2 = setTimeout(focusEl, 100);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [editingStickyId]);

  const pageObjects = useMemo<CustomAnnotationObject[]>(() => {
    if (objects && objects.length > 0) return objects;
    if (!annotationScope?.getAnnotations) return [];
    const annos = annotationScope.getAnnotations({ pageIndex }) || [];
    const res: CustomAnnotationObject[] = [];
    for (const a of annos) {
      const o = a?.object;
      if (!o || !o.rect) continue;
      const type: CustomObjectType | null =
        o.type === PdfAnnotationSubtype.STAMP
          ? "stamp"
          : o.type === PdfAnnotationSubtype.HIGHLIGHT
          ? "highlight"
          : null;
      if (type) {
        const anyObj = o as {
          contents?: string;
          text?: string;
          fontSize?: number;
          fontColor?: string;
          color?: string;
        };
        res.push({
          id: o.id,
          type,
          pageIndex: o.pageIndex ?? pageIndex,
          x: o.rect.origin.x,
          y: o.rect.origin.y,
          width: o.rect.size.width,
          height: o.rect.size.height,
          transform: { x: 0, y: 0 },
          text: anyObj.contents ?? anyObj.text,
          contents: anyObj.contents ?? anyObj.text,
          fontSize: anyObj.fontSize,
          color: anyObj.fontColor ?? anyObj.color,
        });
      }
    }
    return res;
  }, [objects, annotationScope, pageIndex]);

  // Text boxes: edit mode is entered right after creation or via the native dblclick event only.
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const editingTextIdRef = useRef<string | null>(null);
  const [textSizes, setTextSizes] = useState<Record<string, { width: number; height: number }>>({});

  const textContentKey = useMemo(() => {
    return pageObjects
      .filter((o) => o.type === "text")
      .map((o) => `${o.id}:${o.text ?? ""}:${o.fontSize ?? 16}:${editingTextId === o.id}`)
      .join("|");
  }, [pageObjects, editingTextId]);

  // Measure rendered text so the selection box hugs the text (no resize handles for text)
  // Guarded by dependency on textContentKey and thresholding to avoid infinite re-renders.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const next: Record<string, { width: number; height: number }> = {};
    svg.querySelectorAll<HTMLElement>("[data-text-measure]").forEach((el) => {
      const id = el.getAttribute("data-text-measure");
      if (!id) return;
      const targetObj = pageObjects.find((o) => o.id === id);
      const curObjX = targetObj?.x ?? 0;
      const maxW = getMaxTextWidth(pageWidth, curObjX);
      if (el instanceof HTMLTextAreaElement) {
        el.style.height = "auto";
        const lines = (el.value || "").split("\n");
        const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
        const fontSize = parseFloat(el.style.fontSize) || 16;
        const lineH = fontSize * 1.4;
        const padBorder = 18; // var(--space-1, 8px) * 2 + 2px border
        const h = Math.max(lineH + padBorder, el.scrollHeight + 2, lines.length * lineH + padBorder);
        el.style.height = `${h}px`;
        const rawW = Math.max(64, el.offsetWidth || el.scrollWidth + 2, longest * fontSize * 0.7 + padBorder);
        const w = Math.min(maxW, rawW);
        next[id] = { width: Math.round(w), height: Math.round(h) };
      } else {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          const w = Math.min(maxW, Math.max(64, el.offsetWidth));
          const h = Math.max(16, el.offsetHeight);
          next[id] = { width: Math.round(w), height: Math.round(h) };
        }
      }
    });
    setTextSizes((prev) => {
      const nextKeys = Object.keys(next);
      const prevKeys = Object.keys(prev);
      if (nextKeys.length !== prevKeys.length) {
        return next;
      }
      const hasMeaningfulChange = nextKeys.some((k) => {
        const p = prev[k];
        const n = next[k];
        if (!p) return true;
        return Math.abs(p.width - n.width) > 2 || Math.abs(p.height - n.height) > 2;
      });
      return hasMeaningfulChange ? next : prev;
    });
  }, [textContentKey, pageWidth, pageObjects]);

  const lastClickRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });
  useEffect(() => {
    editingTextIdRef.current = editingTextId;
    if (!editingTextId) return;
    // Focus once on entering edit mode; never re-focus (and never touch the caret) while the user is typing.
    const focusOnce = () => {
      const ta = svgRef.current?.querySelector<HTMLTextAreaElement>(`[data-testid="pdf-text-input-${editingTextId}"]`);
      if (ta) {
        ta.style.height = "auto";
        const fontSize = parseFloat(ta.style.fontSize) || 16;
        const lineH = fontSize * 1.4;
        const lines = (ta.value || "").split("\n");
        const padBorder = 18;
        const curObj = pageObjects.find((o) => o.id === editingTextId);
        const curX = curObj?.x ?? 0;
        const maxTextW = getMaxTextWidth(pageWidth, curX);
        const approxCharsPerLine = Math.max(10, Math.floor(maxTextW / (fontSize * 0.6)));
        const totalEstLines = lines.reduce(
          (sum, line) => sum + Math.max(1, Math.ceil(line.length / approxCharsPerLine)),
          0
        );
        ta.style.height = `${Math.max(lineH + padBorder, ta.scrollHeight + 2, totalEstLines * lineH + padBorder)}px`;
        if (document.activeElement !== ta) {
          ta.focus();
          const len = ta.value.length;
          ta.setSelectionRange(len, len);
        }
      }
    };
    focusOnce();
    const raf = requestAnimationFrame(focusOnce);
    const t1 = setTimeout(focusOnce, 40);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTextId]);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const interactionRef = useRef<Interaction | null>(null);

  // Latest props for native listeners
  const propsRef = useRef({
    pageIndex,
    pageWidth,
    pageHeight,
    isActive,
    isSelectMode,
    isStampMode,
    onStampClick,
    isStickyMode,
    onAddSticky,
    onUpdateStickyText,
    onDeleteSticky,
    isTextMode,
    onAddText,
    onUpdateText,
    onDeleteText,
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
      isStickyMode,
      onAddSticky,
      onUpdateStickyText,
      onDeleteSticky,
      isTextMode,
      onAddText,
      onUpdateText,
      onDeleteText,
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
        x: -p.pageWidth + (clientX - rect.left) * ((3 * p.pageWidth) / rect.width),
        y: -p.pageHeight + (clientY - rect.top) * ((3 * p.pageHeight) / rect.height),
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

      // 1b. Sticky note mode: click on page to place a sticky note at (x, y)
      if (p.isStickyMode) {
        e.preventDefault();
        e.stopPropagation();
        const pt = toPagePoint(e.clientX, e.clientY);
        if (!pt) return;
        p.onAddSticky?.(p.pageIndex, {
          x: pt.x,
          y: pt.y,
          width: 200,
          height: 200,
        });
        return;
      }

      // 1c. Text mode: click on page creates one text box and enters edit mode
      if (p.isTextMode) {
        e.preventDefault();
        e.stopPropagation();
        const pt = toPagePoint(e.clientX, e.clientY);
        if (!pt) return;
        const newId = p.onAddText?.(p.pageIndex, {
          x: pt.x,
          y: pt.y,
          text: "",
          fontSize: 16,
          color: p.strokeColor || "#E44234",
        });
        if (newId) {
          editingTextIdRef.current = newId;
          setEditingTextId(newId);
        }
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

        // If clicking on sticky delete button, do not capture or start drag
        if (target?.closest?.("[data-testid='pdf-sticky-delete-btn']")) {
          return;
        }

        // While editing, pointerdown inside the textarea must reach the browser so caret/selection work
        if (target?.closest?.("textarea, input") && (editingStickyIdRef.current || editingTextIdRef.current)) {
          return;
        }

        // Clicking anywhere else exits text edit mode (blur commits / removes empty boxes)
        if (editingTextIdRef.current) {
          const activeEl = document.activeElement as HTMLElement | null;
          if (activeEl && typeof activeEl.blur === "function") activeEl.blur();
          setEditingTextId(null);
        }
        // If double clicking anywhere on a sticky note card, switch to edit mode immediately
        const stickyCardEl = target?.closest?.('[data-testid^="pdf-sticky-card-"]');
        if (stickyCardEl) {
          const sid = stickyCardEl.getAttribute("data-testid")?.replace("pdf-sticky-card-", "");
          const isDbl = Boolean(sid && e.detail >= 2);
          if (isDbl && sid) {
            e.preventDefault();
            e.stopPropagation();
            setEditingStickyId(sid);
            interactionRef.current = null;
            const ta = stickyCardEl.querySelector("textarea");
            if (ta) {
              ta.focus();
            }
            return;
          }
        }

        // If another sticky is being edited, clicking outside exits edit mode
        if (editingStickyIdRef.current) {
          const activeCard = target?.closest?.(`[data-testid="pdf-sticky-card-${editingStickyIdRef.current}"]`);
          if (!activeCard) {
            setEditingStickyId(null);
          }
        }
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
                const inferredType: CustomObjectType | null =
                  ta.object.type === PdfAnnotationSubtype.STAMP
                    ? "stamp"
                    : null;
                if (!inferredType) return null;
                return {
                  id: ta.object.id,
                  type: inferredType,
                  pageIndex: p.pageIndex,
                  x: ta.object.rect.origin.x,
                  y: ta.object.rect.origin.y,
                  width: ta.object.rect.size.width,
                  height: ta.object.rect.size.height,
                };
              }
              return null;
            })();

          if (obj && obj.type !== "highlight") {
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
        const objType = objEl?.getAttribute("data-object-type") as CustomObjectType | null;

        const targetId = strokeId || objId;
        const isStroke = !!strokeId;

        if (targetId) {
          // User clicked on a custom ink stroke or a stamp/text/highlight object
          if (objType !== "sticky") {
            e.preventDefault();
            window.getSelection()?.removeAllRanges();
          }
          e.stopPropagation();
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

          if (objType === "highlight") {
            // Highlights are strictly locked to text: selected for deletion, but dragging is disabled
            interactionRef.current = null;
            return;
          }

          // If double-clicking on a sticky note card, switch to edit mode immediately
          if (objType === "sticky" && e.detail >= 2) {
            setEditingStickyId(targetId);
            interactionRef.current = null;
            const cardEl = target?.closest?.(`[data-testid="pdf-sticky-card-${targetId}"]`);
            const ta = cardEl?.querySelector("textarea");
            if (ta) {
              ta.focus();
            }
            return;
          }

          capture(e.pointerId);

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
          const isHighlight =
            clickedAnno.object.type === PdfAnnotationSubtype.HIGHLIGHT ||
            (clickedAnno.object as { subtype?: string }).subtype === "Highlight";

          e.preventDefault();
          e.stopPropagation();
          window.getSelection()?.removeAllRanges();
          p.onSelectStrokes?.([annoId]);
          p.annotationScope?.selectAnnotation?.(p.pageIndex, annoId);

          if (isHighlight) {
            // Highlights are strictly locked to text: selected for deletion, but dragging is disabled
            interactionRef.current = null;
            return;
          }

          capture(e.pointerId);
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

        // Pointer is on canvas / text (select mode): start Marquee Selection!
        // Prevent native text selection so marquee selection takes priority across the whole document
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
        const anchorObj = (p.objects || []).find((o) => o.id === it.anchorId);
        if (anchorObj?.type === "highlight") return;
        const dx = pt.x - it.start.x;
        const dy = pt.y - it.start.y;
        const nextOffsets: Record<string, CustomInkTransform> = {};
        for (const [id, base] of Object.entries(it.bases)) {
          nextOffsets[id] = { x: base.x + dx, y: base.y + dy };
        }
        it.currentOffsets = nextOffsets;
        setDragOffsets(nextOffsets);

        // Real-time visual transform on underlying AnnotationLayer DOM elements
        const docScale = svg.getBoundingClientRect().width / (3 * p.pageWidth);
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
        const lockAspect =
          it.objectType === "stamp" ||
          it.objectType === "text" ||
          (e.shiftKey && it.objectType === "stroke");
        const newRect = computeResizedRect(it.startRect, it.handle, dx, dy, lockAspect);
        it.currentRect = newRect;
        setResizeRects({ [it.objectId]: newRect });

        if (it.objectType === "stroke") {
          const st = p.strokes.find((s) => s.id === it.objectId);
          if (st) {
            const scaled = scaleStrokePoints(
              st.points,
              it.startRect,
              { origin: { x: newRect.x, y: newRect.y }, size: { width: newRect.width, height: newRect.height } },
              st.transform
            );
            setLiveScaledStrokes({ [it.objectId]: scaled });
          }
        } else {
          // Real-time visual transform on underlying AnnotationLayer DOM elements
          const docScale = svg.getBoundingClientRect().width / (3 * p.pageWidth);
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
          const allSelectedIds = findIntersectingItemIds(box, p.strokes, p.objects);
          p.onSelectStrokes?.(allSelectedIds);

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
          const embedPdfSelected = allSelectedIds.filter((id) => pageAnnos.some((ta) => ta.object.id === id));
          p.annotationScope?.setSelection?.(Array.from(new Set([...embedPdfSelected, ...intersectingAnnoIds])));
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
          let hasMoved = false;
          for (const [id, cur] of Object.entries(it.currentOffsets)) {
            const base = it.bases[id] || { x: 0, y: 0 };
            if (Math.abs(cur.x - base.x) > 0.5 || Math.abs(cur.y - base.y) > 0.5) {
              hasMoved = true;
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
                  const minX = -p.pageWidth;
                  const maxX = 2 * p.pageWidth;
                  const minY = -p.pageHeight;
                  const maxY = 2 * p.pageHeight;
                  const clampedX = Math.max(minX, Math.min(maxX, newX));
                  const clampedY = Math.max(minY, Math.min(maxY, newY));
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

          if (!hasMoved && it.anchorId) {
            const now = Date.now();
            const lastClick = lastClickRef.current;
            if (lastClick.id === it.anchorId && now - lastClick.time < 500) {
              lastClickRef.current = { id: "", time: 0 };
              const isSticky = (p.objects || []).some((o) => o.id === it.anchorId && o.type === "sticky");
              if (isSticky) {
                setEditingStickyId(it.anchorId);
                const card = document.querySelector(`[data-testid="pdf-sticky-card-${it.anchorId}"]`);
                const ta = card?.querySelector("textarea");
                if (ta) {
                  ta.style.pointerEvents = "auto";
                  ta.focus();
                  setTimeout(() => ta.focus(), 50);
                }
              }
            } else {
              lastClickRef.current = { id: it.anchorId, time: now };
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
          const lockAspect =
          it.objectType === "stamp" ||
          it.objectType === "text" ||
          (e.shiftKey && it.objectType === "stroke");
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
        setLiveScaledStrokes({});
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
        } else {
          const box: MarqueeRect = { x: mx, y: my, width: mw, height: mh };
          const finalSelectedIds = findIntersectingItemIds(box, p.strokes, p.objects);
          p.onSelectStrokes?.(finalSelectedIds);
          const pageAnnos = p.annotationScope?.getAnnotations?.({ pageIndex: p.pageIndex }) || [];
          const intersectingAnnoIds = pageAnnos
            .filter((ta) => ta?.object?.rect && rectsIntersect(box, {
              x: ta.object.rect.origin.x,
              y: ta.object.rect.origin.y,
              width: ta.object.rect.size.width,
              height: ta.object.rect.size.height,
            }))
            .map((ta) => ta.object.id);
          const embedPdfSelected = finalSelectedIds.filter((id) => pageAnnos.some((ta) => ta.object.id === id));
          p.annotationScope?.setSelection?.(Array.from(new Set([...embedPdfSelected, ...intersectingAnnoIds])));
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

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // Pointer capture can retarget dblclick to the svg, so resolve the text box by coordinates.
      const hitEls =
        typeof document.elementsFromPoint === "function"
          ? document.elementsFromPoint(e.clientX, e.clientY)
          : [];
      const textBoxEl =
        target?.closest?.('[data-testid^="pdf-text-box-"]') ||
        hitEls.find((el) => el.getAttribute?.("data-testid")?.startsWith("pdf-text-box-")) ||
        null;
      if (textBoxEl && svg.contains(textBoxEl)) {
        const tid = textBoxEl.getAttribute("data-testid")?.replace("pdf-text-box-", "");
        if (tid) {
          e.stopPropagation();
          e.preventDefault();
          editingTextIdRef.current = tid;
          setEditingTextId(tid);
          return;
        }
      }

      const card = target?.closest?.('[data-testid^="pdf-sticky-card-"]');
      if (card) {
        const sid = card.getAttribute("data-testid")?.replace("pdf-sticky-card-", "");
        if (sid) {
          e.stopPropagation();
          setEditingStickyId(sid);
          const ta = card.querySelector("textarea");
          if (ta) {
            ta.style.pointerEvents = "auto";
            ta.focus();
            setTimeout(() => ta.focus(), 50);
          }
        }
      }
    };

    svg.addEventListener("pointerdown", handleDown);
    svg.addEventListener("pointermove", handleMove);
    svg.addEventListener("pointerup", handleUp);
    svg.addEventListener("pointercancel", handleCancel);
    svg.addEventListener("mousedown", handleMouseDown);
    svg.addEventListener("dblclick", handleDblClick);
    svg.addEventListener("selectstart", blockWhenBusy);
    svg.addEventListener("dragstart", blockWhenBusy);
    return () => {
      svg.removeEventListener("pointerdown", handleDown);
      svg.removeEventListener("pointermove", handleMove);
      svg.removeEventListener("pointerup", handleUp);
      svg.removeEventListener("pointercancel", handleCancel);
      svg.removeEventListener("mousedown", handleMouseDown);
      svg.removeEventListener("dblclick", handleDblClick);
      svg.removeEventListener("selectstart", blockWhenBusy);
      svg.removeEventListener("dragstart", blockWhenBusy);
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedStrokeIds), [selectedStrokeIds]);

  const renderedStrokes = useMemo(
    () =>
      strokes.map((s) => {
        const isSelected = isSelectMode && selectedSet.has(s.id);
        const isResizing = !!liveScaledStrokes[s.id];
        const points = liveScaledStrokes[s.id] ?? s.points;
        // When resizing, the live scaled points are already in absolute page coordinates, so offset is {0, 0}.
        // When dragging or idle, offset is dragOffsets[s.id] ?? getStrokeOffset(s).
        const offset = isResizing ? { x: 0, y: 0 } : (dragOffsets[s.id] ?? getStrokeOffset(s));
        const bounds = getStrokeBounds({ ...s, points });
        const handleSize = 8;

        // Handles are at the corners/edges of bounds inside the stroke's <g>
        const handles: Array<{ pos: ResizeHandlePosition; hx: number; hy: number }> = [
          { pos: "nw", hx: bounds.x, hy: bounds.y },
          { pos: "n", hx: bounds.x + bounds.width / 2, hy: bounds.y },
          { pos: "ne", hx: bounds.x + bounds.width, hy: bounds.y },
          { pos: "e", hx: bounds.x + bounds.width, hy: bounds.y + bounds.height / 2 },
          { pos: "se", hx: bounds.x + bounds.width, hy: bounds.y + bounds.height },
          { pos: "s", hx: bounds.x + bounds.width / 2, hy: bounds.y + bounds.height },
          { pos: "sw", hx: bounds.x, hy: bounds.y + bounds.height },
          { pos: "w", hx: bounds.x, hy: bounds.y + bounds.height / 2 },
        ];

        return (
          <g
            key={s.id}
            data-ink-stroke-id={s.id}
            data-testid="pdf-custom-ink-stroke"
            transform={offset.x !== 0 || offset.y !== 0 ? `translate(${offset.x}, ${offset.y})` : undefined}
          >
            {/* Transparent hit area */}
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
            {/* Path rendered with points */}
            <path
              d={pointsToSvgPath(points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              strokeOpacity={s.opacity}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "none" }}
            />
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
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
            {/* Selection Bounding Box & 8 Handles inside <g> */}
            {isSelected && (
              <g data-testid="pdf-custom-ink-bbox">
                <rect
                  x={bounds.x}
                  y={bounds.y}
                  width={bounds.width}
                  height={bounds.height}
                  fill="rgba(26, 99, 160, 0.04)"
                  stroke="var(--accent-text, #1A63A0)"
                  strokeWidth={1}
                  strokeOpacity={0.7}
                  strokeDasharray="4 3"
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
                    rx={1.5}
                    ry={1.5}
                    fill="var(--bg-surface, #ffffff)"
                    stroke="var(--accent-text, #1A63A0)"
                    strokeWidth={1}
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
    [strokes, dragOffsets, liveScaledStrokes, isSelectMode, selectedSet]
  );

  const renderedObjects = useMemo(
    () =>
      pageObjects.map((obj) => {
        const resizeRect = resizeRects[obj.id];
        const offset = resizeRect ? { x: 0, y: 0 } : (dragOffsets[obj.id] ?? obj.transform ?? { x: 0, y: 0 });
        const isSelected = isSelectMode && selectedSet.has(obj.id);
        const isEditingThis = obj.type === "text" && editingTextId === obj.id;
        const curX = resizeRect ? resizeRect.x : obj.x;
        const curY = resizeRect ? resizeRect.y : obj.y;
        const isArabicText = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(obj.text || "");
        const textDirection = isArabicText ? "rtl" : "ltr";
        const textAlign = isArabicText ? "right" : "left";
        const measured = obj.type === "text" ? textSizes[obj.id] : undefined;
        const textFontSize = obj.fontSize || 16;
        const textLineHeight = textFontSize * 1.4;
        const maxTextWidth = getMaxTextWidth(pageWidth, curX);
        const textLines = (obj.text || "").split("\n");
        const longestLineChars = textLines.reduce((m, l) => Math.max(m, l.length), 0);
        const approxCharsPerLine = Math.max(10, Math.floor(maxTextWidth / (textFontSize * 0.6)));
        const totalEstimatedLines = textLines.reduce(
          (sum, line) => sum + Math.max(1, Math.ceil(line.length / approxCharsPerLine)),
          0
        );
        const dynamicContentW = Math.min(
          maxTextWidth,
          Math.max(64, longestLineChars * textFontSize * 0.7)
        );
        const dynamicContentH = Math.max(
          textLineHeight,
          totalEstimatedLines * textLineHeight,
          measured?.height ?? obj.height
        );
        const curW = resizeRect
          ? resizeRect.width
          : obj.type === "text"
          ? Math.min(maxTextWidth, measured?.width ?? dynamicContentW)
          : (measured?.width ?? obj.width);
        const curH = resizeRect
          ? resizeRect.height
          : obj.type === "text"
          ? (measured?.height ?? dynamicContentH)
          : (measured?.height ?? obj.height);
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
            data-annotation-type={obj.type === "text" ? "3" : obj.type === "stamp" ? "13" : undefined}
            data-testid={`pdf-${obj.type}-object`}
            transform={offset.x !== 0 || offset.y !== 0 ? `translate(${offset.x}, ${offset.y})` : undefined}
          >
            {obj.type === "sticky" && (
              <foreignObject
                x={curX}
                y={curY}
                width={curW}
                height={curH}
                style={{
                  overflow: "visible",
                  pointerEvents: "auto",
                }}
              >
                <div
                  data-testid={`pdf-sticky-card-${obj.id}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: obj.color || "#FEF08A",
                    border: "1px solid rgba(0, 0, 0, 0.08)",
                    borderRadius: "var(--radius-md, 8px)",
                    boxShadow: "var(--shadow-2, 0 4px 12px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08))",
                    transform: `rotate(${getStickyRotation(obj.id, obj.rotation)}deg)`,
                    transformOrigin: "center center",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    boxSizing: "border-box",
                    cursor: isSelectMode && editingStickyId !== obj.id ? "move" : "default",
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingStickyId(obj.id);
                    const ta = e.currentTarget.querySelector("textarea");
                    if (ta) {
                      ta.style.pointerEvents = "auto";
                      ta.focus();
                      setTimeout(() => ta?.focus(), 50);
                    }
                  }}
                >
                  <div
                    style={{
                      height: "26px",
                      backgroundColor: "#FDE047",
                      borderTopLeftRadius: "var(--radius-md, 8px)",
                      borderTopRightRadius: "var(--radius-md, 8px)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 8px",
                      cursor: isSelectMode ? "move" : "default",
                      userSelect: "none",
                      borderBottom: "1px solid rgba(0, 0, 0, 0.08)",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                        color: "#78350F",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                        pointerEvents: "none",
                      }}
                    >
                      Note
                    </span>
                    <button
                      type="button"
                      data-testid="pdf-sticky-delete-btn"
                      aria-label="Delete note"
                      title="Delete note"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editingStickyId === obj.id) {
                          setEditingStickyId(null);
                        }
                        onDeleteSticky?.(pageIndex, obj.id);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "18px",
                        height: "18px",
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "#78350F",
                        borderRadius: "var(--radius-sm, 4px)",
                        lineHeight: 1,
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ pointerEvents: "none" }}
                        aria-hidden="true"
                      >
                        <line x1="1" y1="1" x2="9" y2="9" />
                        <line x1="9" y1="1" x2="1" y2="9" />
                      </svg>
                    </button>
                  </div>
                  <textarea
                    ref={(el) => {
                      if (editingStickyId === obj.id) {
                        editingTextareaRef.current = el;
                        if (el && document.activeElement !== el) {
                          requestAnimationFrame(() => el.focus());
                        }
                      }
                    }}
                    data-testid={`pdf-sticky-textarea-${obj.id}`}
                    dir="auto"
                    value={obj.text ?? ""}
                    placeholder="Type a note..."
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingStickyId(obj.id);
                    }}
                    onChange={(e) => {
                      onUpdateStickyText?.(pageIndex, obj.id, e.target.value);
                    }}
                    onBlur={() => {
                      setEditingStickyId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingStickyId(null);
                      }
                    }}
                    autoFocus={editingStickyId === obj.id}
                    style={{
                      flex: 1,
                      width: "100%",
                      resize: "none",
                      border: "none",
                      outline: "none",
                      backgroundColor: "transparent",
                      borderBottomLeftRadius: "var(--radius-md, 8px)",
                      borderBottomRightRadius: "var(--radius-md, 8px)",
                      padding: "8px",
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      fontSize: "13px",
                      lineHeight: "1.4",
                      color: "#78350F",
                      unicodeBidi: "plaintext",
                      textAlign: "start",
                      pointerEvents: editingStickyId === obj.id ? "auto" : "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </foreignObject>
            )}
            {obj.type === "text" && (
              <foreignObject
                x={curX}
                y={curY}
                width={isEditingThis ? Math.max(curW + 64, 160) : Math.max(curW, 64)}
                height={isEditingThis ? Math.max(curH + 48, 64) : Math.max(curH, 32)}
                style={{
                  overflow: "visible",
                  pointerEvents: isSelectMode ? "auto" : "none",
                  direction: textDirection,
                  textAlign: textAlign,
                }}
              >
                {isEditingThis ? (
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      direction: textDirection,
                      textAlign: textAlign,
                    }}
                  >
                    <textarea
                      key={`text-input-${obj.id}`}
                      ref={(el) => {
                        if (el) {
                          el.style.height = "auto";
                          const targetH = Math.max(textLineHeight + 18, el.scrollHeight + 2, totalEstimatedLines * textLineHeight + 18);
                          el.style.height = `${targetH}px`;
                        }
                      }}
                      data-testid={`pdf-text-input-${obj.id}`}
                      data-text-measure={obj.id}
                      wrap="soft"
                      rows={Math.max(1, textLines.length)}
                      spellCheck={false}
                      dir={textDirection}
                      value={obj.text ?? ""}
                      onPaste={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rawText = e.clipboardData?.getData("text/plain") ?? "";
                        if (!rawText) return;
                        const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
                        const target = e.currentTarget;
                        const start = target.selectionStart ?? target.value.length;
                        const end = target.selectionEnd ?? target.value.length;
                        const curVal = target.value ?? "";
                        const nextValue = curVal.slice(0, start) + normalized + curVal.slice(end);
                        const newCursorPos = start + normalized.length;

                        target.value = nextValue;
                        if (typeof target.setSelectionRange === "function") {
                          target.setSelectionRange(newCursorPos, newCursorPos);
                        }

                        target.style.height = "auto";
                        const lines = nextValue.split("\n");
                        const estLines = lines.reduce(
                          (sum, line) => sum + Math.max(1, Math.ceil(line.length / approxCharsPerLine)),
                          0
                        );
                        const targetH = Math.max(
                          textLineHeight + 18,
                          target.scrollHeight + 2,
                          estLines * textLineHeight + 18
                        );
                        target.style.height = `${targetH}px`;

                        onUpdateText?.(pageIndex, obj.id, nextValue);

                        if (typeof requestAnimationFrame === "function") {
                          requestAnimationFrame(() => {
                            if (document.activeElement === target && typeof target.setSelectionRange === "function") {
                              target.setSelectionRange(newCursorPos, newCursorPos);
                            }
                          });
                        }
                      }}
                      onChange={(e) => {
                        const target = e.currentTarget;
                        target.style.height = "auto";
                        const lines = target.value.split("\n");
                        const estLines = lines.reduce(
                          (sum, line) => sum + Math.max(1, Math.ceil(line.length / approxCharsPerLine)),
                          0
                        );
                        const targetH = Math.max(textLineHeight + 18, target.scrollHeight + 2, estLines * textLineHeight + 18);
                        target.style.height = `${targetH}px`;
                        onUpdateText?.(pageIndex, obj.id, e.target.value);
                      }}
                      onInput={(e) => {
                        const target = e.currentTarget;
                        target.style.height = "auto";
                        const lines = target.value.split("\n");
                        const estLines = lines.reduce(
                          (sum, line) => sum + Math.max(1, Math.ceil(line.length / approxCharsPerLine)),
                          0
                        );
                        const targetH = Math.max(textLineHeight + 18, target.scrollHeight + 2, estLines * textLineHeight + 18);
                        target.style.height = `${targetH}px`;
                        onUpdateText?.(pageIndex, obj.id, target.value);
                      }}
                      onBlur={(e) => {
                        const value = e.currentTarget.value;
                        setEditingTextId((cur) => (cur === obj.id ? null : cur));
                        if (value.trim() === "") {
                          onDeleteText?.(pageIndex, obj.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      style={{
                        display: "block",
                        width: `${Math.max(64, curW)}px`,
                        minWidth: "64px",
                        maxWidth: `${maxTextWidth}px`,
                        height: `${Math.max(textLineHeight + 18, curH)}px`,
                        minHeight: `${textLineHeight + 18}px`,
                        background: "transparent",
                        border: "1px dashed var(--accent-text, #1A63A0)",
                        borderRadius: "var(--radius-sm, 4px)",
                        padding: "var(--space-1, 8px)",
                        outline: "none",
                        color: obj.color || "#E44234",
                        fontSize: `${textFontSize}px`,
                        fontFamily: "var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
                        lineHeight: "1.4",
                        resize: "none",
                        margin: 0,
                        boxSizing: "border-box",
                        overflow: "hidden",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        direction: textDirection,
                        textAlign: textAlign,
                        userSelect: "text",
                        WebkitUserSelect: "text",
                        cursor: "text",
                        pointerEvents: "auto",
                      }}
                    />
                    <span
                      aria-hidden="true"
                      dir={textDirection}
                      style={{
                        position: "absolute",
                        visibility: "hidden",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        maxWidth: `${maxTextWidth}px`,
                        width: `${Math.max(64, curW)}px`,
                        fontSize: `${textFontSize}px`,
                        fontFamily: "var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
                        lineHeight: "1.4",
                        padding: "var(--space-1, 8px)",
                        border: "1px solid transparent",
                        boxSizing: "border-box",
                        margin: 0,
                        pointerEvents: "none",
                        top: 0,
                        left: 0,
                        direction: textDirection,
                        textAlign: textAlign,
                      }}
                    >
                      {(obj.text ?? "") + (obj.text?.endsWith("\n") ? "\u200B" : "")}
                    </span>
                  </div>
                ) : (
                  <div
                    key={`text-display-${obj.id}`}
                    data-testid={`pdf-text-box-${obj.id}`}
                    data-text-measure={obj.id}
                    data-object-id={obj.id}
                    data-object-type="text"
                    dir={textDirection}
                    style={{
                      display: "block",
                      width: "max-content",
                      minWidth: "64px",
                      maxWidth: `${maxTextWidth}px`,
                      color: obj.color || "#E44234",
                      fontSize: `${textFontSize}px`,
                      fontFamily: "var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif)",
                      lineHeight: "1.4",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                      direction: textDirection,
                      textAlign: textAlign,
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      padding: "var(--space-1, 8px)",
                      border: "1px solid transparent",
                      borderRadius: "var(--radius-sm, 4px)",
                      boxSizing: "border-box",
                      cursor: isSelectMode ? "move" : "default",
                      pointerEvents: "auto",
                    }}
                  >
                    {obj.text ?? ""}
                  </div>
                )}
              </foreignObject>
            )}
            {obj.type !== "sticky" && obj.type !== "text" && (
              <rect
                x={curX}
                y={curY}
                width={curW}
                height={curH}
                fill="transparent"
                style={{
                  pointerEvents: isSelectMode ? "all" : "none",
                  cursor: isSelectMode ? (obj.type === "highlight" ? "pointer" : "move") : "default",
                  touchAction: "none",
                }}
              />
            )}
            {isSelected && obj.type !== "highlight" && editingTextId !== obj.id && (
              <g data-testid={`pdf-${obj.type}-bbox`}>
                <rect
                  x={curX}
                  y={curY}
                  width={curW}
                  height={curH}
                  fill="rgba(26, 99, 160, 0.04)"
                  stroke="var(--accent-text, #1A63A0)"
                  strokeWidth={1}
                  strokeOpacity={0.7}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: "none" }}
                />
                {obj.type !== "text" && handles.map(({ pos, hx, hy }) => (
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
                    rx={1.5}
                    ry={1.5}
                    fill="var(--bg-surface, #ffffff)"
                    stroke="var(--accent-text, #1A63A0)"
                    strokeWidth={1}
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
    [
      pageObjects,
      dragOffsets,
      resizeRects,
      isSelectMode,
      selectedSet,
      editingStickyId,
      editingTextId,
      textSizes,
      onUpdateStickyText,
      onUpdateText,
      onDeleteText,
      onDeleteSticky,
      pageIndex,
      pageWidth,
    ]
  );

  return (
    <svg
      ref={svgRef}
      data-testid={`pdf-custom-ink-layer-${pageIndex + 1}`}
      viewBox={`-${pageWidth} -${pageHeight} ${pageWidth * 3} ${pageHeight * 3}`}
      style={{
        position: "absolute",
        left: "-100%",
        top: "-100%",
        width: "300%",
        height: "300%",
        pointerEvents: isActive || isSelectMode || isStampMode || isStickyMode || isTextMode ? "auto" : "none",
        cursor: isActive || isStampMode || isStickyMode || isTextMode ? "crosshair" : "default",
        zIndex: 15,
        overflow: "visible",
        touchAction: isActive || isSelectMode || isStampMode || isStickyMode || isTextMode ? "none" : "auto",
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
