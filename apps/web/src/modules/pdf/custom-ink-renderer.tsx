"use client";

import React, { useMemo } from "react";
import { createRenderer } from "@embedpdf/plugin-annotation/react";
import { PdfAnnotationSubtype, PdfBlendMode, blendModeToCss } from "@embedpdf/models";
import type { PdfInkAnnoObject } from "@embedpdf/models";

const MIN_HIT_AREA_SCREEN_PX = 20;

interface CustomInkProps extends PdfInkAnnoObject {
  isSelected?: boolean;
  scale: number;
  onClick?: (e: React.PointerEvent) => void;
  appearanceActive?: boolean;
}

export function CustomInk({
  isSelected,
  strokeColor,
  opacity = 1,
  strokeWidth = 2,
  inkList,
  rect,
  scale,
  onClick,
  appearanceActive = false,
}: CustomInkProps) {
  const resolvedColor = strokeColor ?? "#E44234";

  const paths = useMemo(() => {
    if (!inkList || !Array.isArray(inkList)) return [];
    return inkList.map(({ points }) => {
      let d = "";
      points.forEach(({ x, y }, i) => {
        const lx = x - rect.origin.x;
        const ly = y - rect.origin.y;
        d += (i === 0 ? "M" : "L") + lx + " " + ly + " ";
      });
      return d.trim();
    });
  }, [inkList, rect]);

  const width = rect.size.width * scale;
  const height = rect.size.height * scale;
  const hitStrokeWidth = Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale);

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 2,
        overflow: "visible",
      }}
      width={width}
      height={height}
      viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
    >
      {paths.map((d, i) => (
        <path
          key={`hit-${i}`}
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={hitStrokeWidth}
          onPointerDown={onClick}
          style={{
            cursor: isSelected ? "move" : onClick ? "pointer" : "default",
            pointerEvents: !onClick ? "none" : isSelected ? "none" : "visibleStroke",
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }}
        />
      ))}
      {!appearanceActive &&
        paths.map((d, i) => (
          <path
            key={`stroke-${i}`}
            d={d}
            fill="none"
            stroke={resolvedColor}
            strokeWidth={strokeWidth}
            strokeOpacity={opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
    </svg>
  );
}

export const customInkRenderer = createRenderer({
  id: "ink",
  matches: (a) => a.type === PdfAnnotationSubtype.INK,
  matchesPreview: (p) => p.type === PdfAnnotationSubtype.INK,
  render: ({ currentObject, isSelected, scale, onClick, appearanceActive }) => (
    <CustomInk
      {...(currentObject as PdfInkAnnoObject)}
      isSelected={isSelected}
      scale={scale}
      onClick={onClick}
      appearanceActive={appearanceActive}
    />
  ),
  renderPreview: ({ data, scale }) => (
    <CustomInk
      {...(data as PdfInkAnnoObject)}
      isSelected={false}
      scale={scale}
    />
  ),
  previewContainerStyle: ({ data }) => ({
    mixBlendMode: blendModeToCss(
      (data as unknown as { blendMode?: PdfBlendMode })?.blendMode ?? PdfBlendMode.Normal
    ),
  }),
  interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
});
