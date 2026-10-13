"use client";

import React, { useState, useEffect, useRef } from "react";
import Board from "./board";

export default function SpikePage() {
  const [visible, setVisible] = useState(true);
  const [mountInfo, setMountInfo] = useState({ mountCount: 0, survivedDoubleMount: false });
  const [apiReady, setApiReady] = useState(false);
  const [appStateStatus, setAppStateStatus] = useState<string>("waiting for api...");
  const [refreshStatus, setRefreshStatus] = useState<string>("not tested");
  const [cdnRequests, setCdnRequests] = useState<string[]>([]);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    // Intercept fetch & font face loads to detect any external CDN request
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]);
      if (url.includes("unpkg.com") || url.includes("excalidraw.com") || url.includes("googleapis.com")) {
        setCdnRequests((prev) => [...prev, url]);
      }
      return originalFetch.apply(window, args);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const handleApi = (api: any) => {
    apiRef.current = api;
    setApiReady(true);
    try {
      const state = api.getAppState();
      const keys = ["viewBackgroundColor", "gridSize", "gridModeEnabled", "zoom", "scrollX", "scrollY"];
      const missing = keys.filter((k) => !(k in state));
      if (missing.length === 0) {
        setAppStateStatus("All 6 persisted keys verified present in appState");
      } else {
        setAppStateStatus(`Missing keys: ${missing.join(", ")}`);
      }
    } catch (e: any) {
      setAppStateStatus(`Error getting appState: ${e.message}`);
    }
  };

  const handleToggleVisibility = () => {
    const next = !visible;
    setVisible(next);
  };

  const handleTestRefresh = () => {
    if (!apiRef.current) {
      setRefreshStatus("API not ready");
      return;
    }
    try {
      apiRef.current.refresh();
      setRefreshStatus("refresh() succeeded without errors");
    } catch (e: any) {
      setRefreshStatus(`refresh() error: ${e.message}`);
    }
  };

  return (
    <div className="spike-container">
      <header className="spike-toolbar">
        <strong>Spike S1: Excalidraw</strong>
        <span id="mount-status">
          Mounts: {mountInfo.mountCount} (Strict Mode: {mountInfo.mountCount >= 2 ? "PASS (double mounted)" : "Mount 1"})
        </span>
        <button id="toggle-visibility-btn" onClick={handleToggleVisibility}>
          Visibility: {visible ? "VISIBLE" : "HIDDEN"}
        </button>
        <button id="test-refresh-btn" onClick={handleTestRefresh}>
          Test refresh()
        </button>
        <span id="refresh-status">Refresh: {refreshStatus}</span>
        <span id="appstate-status">AppState: {appStateStatus}</span>
        <span id="cdn-status">
          CDN hits: {cdnRequests.length === 0 ? "NONE (PASS)" : `FAILED: ${cdnRequests.join(", ")}`}
        </span>
      </header>

      <main className="pane-wrapper">
        <div
          id="board-pane"
          className={visible ? "pane-visible" : "pane-hidden"}
          data-slot={visible ? "primary" : "hidden"}
        >
          <Board
            visible={visible}
            onMountStatus={(status) => setMountInfo(status)}
            onApi={handleApi}
          />
        </div>
      </main>
    </div>
  );
}
