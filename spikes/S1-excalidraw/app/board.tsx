"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw),
  { ssr: false }
);

interface BoardProps {
  visible: boolean;
  onMountStatus: (status: { mountCount: number; survivedDoubleMount: boolean }) => void;
  onApi: (api: any) => void;
}

// Global module-level counter to observe React Strict Mode double-mount
let totalMountEvents = 0;

export default function Board({ visible, onMountStatus, onApi }: BoardProps) {
  const [mountCount, setMountCount] = useState(0);
  const apiRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    totalMountEvents += 1;
    setMountCount((prev) => prev + 1);

    onMountStatus({
      mountCount: totalMountEvents,
      survivedDoubleMount: totalMountEvents >= 2,
    });

    return () => {
      // Cleanup on unmount
    };
  }, []);

  // When visibility changes to true, call api.refresh() per spec §6.2 rule 4
  useEffect(() => {
    if (visible && apiRef.current) {
      try {
        apiRef.current.refresh();
      } catch (e) {
        console.error("refresh() failed:", e);
      }
    }
  }, [visible]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
          onApi(api);
        }}
        theme="light"
        langCode="ar-SA"
        UIOptions={{
          canvasActions: {
            saveAsImage: false,
            loadScene: false,
            export: false,
          },
        }}
      />
    </div>
  );
}
