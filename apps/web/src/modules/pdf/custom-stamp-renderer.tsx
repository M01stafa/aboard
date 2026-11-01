"use client";

import React, { useEffect, useState } from "react";
import { createRenderer, useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { PdfAnnotationSubtype } from "@embedpdf/models";

// In-memory cache mapping stamp annotation ID -> blob/data URL for instant, flicker-free rendering
export const stampBlobUrlCache = new Map<string, string>();

function EngineStampImage({
  documentId,
  pageIndex,
  annotation,
  scaleFactor,
  unrotated,
}: {
  documentId: string;
  pageIndex: number;
  annotation: Record<string, unknown>;
  scaleFactor: number;
  unrotated: boolean;
}) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!annotationCapability) return;
    const scope = annotationCapability.forDocument(documentId);
    const task = scope.renderAnnotation({
      pageIndex,
      annotation: annotation as any,
      options: {
        scaleFactor,
        dpr: typeof window !== "undefined" ? window.devicePixelRatio : 1,
        unrotated,
      },
    });

    let currentUrl: string | null = null;
    task.wait(
      (blob: Blob) => {
        currentUrl = URL.createObjectURL(blob);
        setImageUrl(currentUrl);
      },
      () => {}
    );

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [annotationCapability, documentId, pageIndex, annotation, scaleFactor, unrotated]);

  if (!imageUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-testid={`stamp-image-${String(annotation.id ?? "")}`}
      src={imageUrl}
      alt="stamp"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        pointerEvents: "none",
        userSelect: "none",
        display: "block",
      }}
    />
  );
}

export const customStampRenderer = createRenderer({
  id: "stamp",
  matches: (a) => a.type === PdfAnnotationSubtype.STAMP,
  matchesPreview: (p) => p.type === PdfAnnotationSubtype.STAMP,
  render: ({ annotation, isSelected, documentId, pageIndex, scale, onClick }) => {
    const cachedUrl = stampBlobUrlCache.get(annotation.object.id);
    const unrotated = !!annotation.object.rotation && !!annotation.object.unrotatedRect;

    return (
      <div
        data-testid={`stamp-container-${annotation.object.id}`}
        data-annotation-id={annotation.object.id}
        data-annotation-type={annotation.object.type}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          zIndex: 2,
          pointerEvents: !onClick ? "none" : isSelected ? "none" : "auto",
          cursor: onClick ? "pointer" : "default",
        }}
        onPointerDown={onClick}
      >
        {cachedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid={`stamp-image-${annotation.object.id}`}
            src={cachedUrl}
            alt="stamp"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              pointerEvents: "none",
              userSelect: "none",
              display: "block",
            }}
          />
        ) : (
          <EngineStampImage
            documentId={documentId}
            pageIndex={pageIndex}
            annotation={{ ...annotation.object, id: annotation.object.id }}
            scaleFactor={scale}
            unrotated={unrotated}
          />
        )}
      </div>
    );
  },
  renderPreview: ({ data }) => {
    const rotationDeg = (4 - (((data as { pageRotation?: number })?.pageRotation) || 0)) % 4 * 90;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={(data as { ghostUrl?: string })?.ghostUrl}
        style={{
          width: "100%",
          height: "100%",
          opacity: 0.6,
          objectFit: "contain",
          pointerEvents: "none",
          transform: rotationDeg ? `rotate(${rotationDeg}deg)` : undefined,
        }}
        alt=""
      />
    );
  },
  useAppearanceStream: false,
  interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: true },
});
