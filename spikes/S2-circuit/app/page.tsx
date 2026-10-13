"use client";

import { useEffect, useRef, useState } from "react";

export interface CircuitJS1Api {
  setSimRunning(run: boolean): void;
  isRunning(): boolean;
  getTime(): number;
  getTimeStep(): number;
  setTimeStep(dt: number): void;
  getMaxTimeStep(): number;
  setMaxTimeStep(dt: number): void;
  getNodeVoltage(labelName: string): number;
  setExtVoltage(name: string, v: number): void;
  getElements(): unknown[];
  getCircuitAsSVG(): void;
  exportCircuit(): string;
  importCircuit(text: string, subcircuitsOnly?: boolean): void;
  onupdate?: (sim: CircuitJS1Api) => void;
  ontimestep?: (sim: CircuitJS1Api) => void;
  onanalyze?: (sim: CircuitJS1Api) => void;
  onsvgrendered?: (sim: CircuitJS1Api, svg: string) => void;
}

interface TestResults {
  attached: boolean;
  attachMethod: string;
  survivedDoubleMount: boolean;
  exportCircuitPassed: boolean;
  importCircuitPassed: boolean;
  svgDelivered: boolean;
  serviceWorkerDetected: boolean;
  circuitTextSample: string;
  svgSample: string;
  allDone: boolean;
  errors: string[];
}

let globalMountCounter = 0;

export default function CircuitSpikePage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mountCount, setMountCount] = useState(0);
  const [api, setApi] = useState<CircuitJS1Api | null>(null);
  const [results, setResults] = useState<TestResults>({
    attached: false,
    attachMethod: "pending",
    survivedDoubleMount: false,
    exportCircuitPassed: false,
    importCircuitPassed: false,
    svgDelivered: false,
    serviceWorkerDetected: false,
    circuitTextSample: "",
    svgSample: "",
    allDone: false,
    errors: [],
  });

  useEffect(() => {
    globalMountCounter += 1;
    const currentMount = globalMountCounter;
    setMountCount(currentMount);

    let isDisposed = false;

    function attach(simApi: CircuitJS1Api, method: string) {
      if (isDisposed) return;
      setApi(simApi);
      setResults((prev) => ({
        ...prev,
        attached: true,
        attachMethod: method,
        survivedDoubleMount: currentMount >= 2,
      }));
    }

    const iframe = iframeRef.current;
    if (!iframe) return;

    function handleIframeLoad() {
      try {
        const win = iframe?.contentWindow as (Window & {
          CircuitJS1?: CircuitJS1Api;
          oncircuitjsloaded?: () => void;
        }) | null;

        if (!win) return;

        // Immediate check
        if (win.CircuitJS1) {
          attach(win.CircuitJS1, "immediate");
        } else {
          // Hook check
          win.oncircuitjsloaded = () => {
            if (win.CircuitJS1) {
              attach(win.CircuitJS1, "oncircuitjsloaded hook");
            }
          };
        }
      } catch (err: unknown) {
        setResults((prev) => ({
          ...prev,
          errors: [...prev.errors, `Attach error: ${String(err)}`],
        }));
      }
    }

    if (iframe.contentDocument?.readyState === "complete") {
      handleIframeLoad();
    }
    iframe.addEventListener("load", handleIframeLoad);

    return () => {
      isDisposed = true;
      iframe.removeEventListener("load", handleIframeLoad);
    };
  }, []);

  async function runVerificationSuite(sim: CircuitJS1Api) {
    const errs: string[] = [];
    let exported = "";
    let exportOk = false;
    let importOk = false;
    let svgOk = false;
    let svgResult = "";
    let swDetected = false;

    try {
      // 1. exportCircuit()
      exported = sim.exportCircuit();
      if (typeof exported === "string" && exported.length > 0 && exported.startsWith("$")) {
        exportOk = true;
      } else {
        errs.push(`exportCircuit returned invalid format: ${exported.slice(0, 50)}`);
      }

      // 2. importCircuit() round-trip test
      if (exportOk) {
        sim.importCircuit(exported, false);
        const reExported = sim.exportCircuit();
        if (reExported.trim() === exported.trim()) {
          importOk = true;
        } else {
          errs.push("importCircuit roundtrip mismatch between original and re-exported text");
        }
      }

      // 3. getCircuitAsSVG() test
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          errs.push("getCircuitAsSVG timed out after 5s");
          resolve();
        }, 5000);

        sim.onsvgrendered = (_sim, svg) => {
          clearTimeout(timeout);
          if (typeof svg === "string" && svg.includes("<svg") && svg.includes("</svg>")) {
            svgOk = true;
            svgResult = svg;
          } else {
            errs.push("onsvgrendered received invalid SVG string");
          }
          resolve();
        };

        sim.getCircuitAsSVG();
      });

      // 4. Check stock Service Worker registration in iframe
      try {
        const iframeWin = iframeRef.current?.contentWindow;
        if (iframeWin && "serviceWorker" in iframeWin.navigator) {
          const regs = await iframeWin.navigator.serviceWorker.getRegistrations();
          swDetected = regs.length > 0;
        }
      } catch (swErr) {
        console.warn("Service worker check note:", swErr);
      }
    } catch (e: unknown) {
      errs.push(`Execution error: ${String(e)}`);
    }

    const updated: TestResults = {
      attached: true,
      attachMethod: results.attachMethod,
      survivedDoubleMount: globalMountCounter >= 2,
      exportCircuitPassed: exportOk,
      importCircuitPassed: importOk,
      svgDelivered: svgOk,
      serviceWorkerDetected: swDetected,
      circuitTextSample: exported.slice(0, 150),
      svgSample: svgResult.slice(0, 150),
      allDone: true,
      errors: errs,
    };

    setResults(updated);
    if (typeof window !== "undefined") {
      (window as unknown as { __SPIKE_TEST_RESULTS__: TestResults }).__SPIKE_TEST_RESULTS__ = updated;
    }
  }

  useEffect(() => {
    if (api && !results.allDone) {
      runVerificationSuite(api);
    }
  }, [api]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ padding: "16px", backgroundColor: "#0f172a", color: "#f8fafc" }}>
        <h1 style={{ margin: "0 0 8px 0", fontSize: "20px" }}>Aboard Spike S2 — CircuitJS1 Integration</h1>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "14px" }}>
          <div>Mount count: <strong>{mountCount}</strong></div>
          <div>Attached: <strong>{results.attached ? `Yes (${results.attachMethod})` : "No"}</strong></div>
          <div>Strict Mode Double-Mount: <strong>{results.survivedDoubleMount ? "Survived (Passed)" : "Pending"}</strong></div>
          <div>Export Circuit: <strong>{results.exportCircuitPassed ? "Passed" : "Pending"}</strong></div>
          <div>Import Round-Trip: <strong>{results.importCircuitPassed ? "Passed" : "Pending"}</strong></div>
          <div>SVG Delivered: <strong>{results.svgDelivered ? "Passed" : "Pending"}</strong></div>
          <div>Stock Service Worker: <strong>{results.serviceWorkerDetected ? "Detected (Must be removed in fork)" : "Checked"}</strong></div>
        </div>
      </header>

      {results.errors.length > 0 && (
        <div style={{ backgroundColor: "#fee2e2", color: "#b91c1c", padding: "8px 16px" }}>
          <strong>Errors:</strong>
          <ul>
            {results.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, height: "100%" }}>
          <iframe
            ref={iframeRef}
            id="circuit-iframe"
            title="CircuitJS1 Frame"
            src="/circuit/circuitjs.html?hideMenu=false&running=true"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>

        <div style={{ width: "360px", padding: "16px", backgroundColor: "#f1f5f9", overflowY: "auto", borderLeft: "1px solid #cbd5e1" }}>
          <h2 style={{ fontSize: "16px", marginTop: 0 }}>Spike Verification Data</h2>
          <button
            onClick={() => api && runVerificationSuite(api)}
            style={{ padding: "8px 16px", backgroundColor: "#2563eb", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", marginBottom: "16px" }}
          >
            Re-run Verification
          </button>

          <div style={{ marginBottom: "16px" }}>
            <strong>Circuit Text Header:</strong>
            <pre style={{ background: "#e2e8f0", padding: "8px", fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {results.circuitTextSample || "Waiting for export..."}
            </pre>
          </div>

          <div>
            <strong>SVG Output Preview:</strong>
            <pre style={{ background: "#e2e8f0", padding: "8px", fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {results.svgSample || "Waiting for SVG..."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
