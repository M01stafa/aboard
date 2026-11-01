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
  annotationScope,
  strokeColor = "#E44234",
  strokeWidth = 2.5,
  strokeOpacity = 1,
}: PdfCustomInkLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentStroke, setCurrentStroke] = useState<CustomInkStroke | null>(null);
  const [dragOffsets, setDragOffsets] = useState<Record<string, CustomInkTransform>>({});
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
                x: o.x + (it.currentOffsets[o.id]?.x ?? 0),
                y: o.y + (it.currentOffsets[o.id]?.y ?? 0),
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
                  p.onMoveObject(p.pageIndex, id, { x: newX, y: newY }, obj.type);
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
        const offset = dragOffsets[s.id] ?? getStrokeOffset(s);
        const isSelected = isSelectMode && selectedSet.has(s.id);
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
                  fill="rgba(11, 122, 214, 0.04)"
                  stroke="var(--accent-text, #0b7ad6)"
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
                    stroke="var(--accent-text, #0b7ad6)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
          </g>
        );
      }),
    [strokes, dragOffsets, isSelectMode, selectedSet]
  );

  const renderedObjects = useMemo(
    () =>
      pageObjects.map((obj) => {
        const offset = dragOffsets[obj.id] ?? obj.transform ?? { x: 0, y: 0 };
        const isSelected = isSelectMode && selectedSet.has(obj.id);
        const handleSize = 8;
        return (
          <g
            key={obj.id}
            data-object-id={obj.id}
            data-object-type={obj.type}
            data-testid={`pdf-${obj.type}-object`}
            transform={`translate(${offset.x}, ${offset.y})`}
          >
            <rect
              x={obj.x}
              y={obj.y}
              width={obj.width}
              height={obj.height}
              fill="transparent"
              style={{
                pointerEvents: isSelectMode ? "all" : "none",
                cursor: isSelectMode ? "move" : "default",
                touchAction: "none",
              }}
            />
            {isSelected && (
              <g style={{ pointerEvents: "none" }} data-testid={`pdf-${obj.type}-bbox`}>
                <rect
                  x={obj.x}
                  y={obj.y}
                  width={obj.width}
                  height={obj.height}
                  fill="rgba(11, 122, 214, 0.04)"
                  stroke="var(--accent-text, #0b7ad6)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {[
                  [obj.x, obj.y],
                  [obj.x + obj.width, obj.y],
                  [obj.x, obj.y + obj.height],
                  [obj.x + obj.width, obj.y + obj.height],
                ].map(([hx, hy], i) => (
                  <rect
                    key={i}
                    x={hx - handleSize / 2}
                    y={hy - handleSize / 2}
                    width={handleSize}
                    height={handleSize}
                    fill="#ffffff"
                    stroke="var(--accent-text, #0b7ad6)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}
          </g>
        );
      }),
    [pageObjects, dragOffsets, isSelectMode, selectedSet]
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
