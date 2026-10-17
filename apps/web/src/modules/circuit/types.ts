/**
 * Types for the Circuit module and CircuitJS1 API interface.
 * Implements docs/specs/modules.md §7.2 and Spike S2 findings.
 */

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
  getCircuitAsSVG(): void; // async → triggers onsvgrendered(sim, svg)
  exportCircuit(): string;
  importCircuit(text: string, subcircuitsOnly?: boolean): void;
  onupdate?: ((sim: CircuitJS1Api) => void) | null;
  ontimestep?: ((sim: CircuitJS1Api) => void) | null;
  onanalyze?: ((sim: CircuitJS1Api) => void) | null;
  onsvgrendered?: ((sim: CircuitJS1Api, svg: string) => void) | null;
  runCommand?(menu: string, item: string): void; // fork patch 3
  getCircuitAsPNG?(): string; // fork patch 3
}

export interface CircuitWindow extends Window {
  CircuitJS1?: CircuitJS1Api;
  oncircuitjsloaded?: () => void;
}

export type CircuitEventName = "update" | "timestep" | "analyze";
export type CircuitEventListener = (sim: CircuitJS1Api) => void;
export type CircuitSvgListener = (sim: CircuitJS1Api, svg: string) => void;

export interface CircuitUrlOptions {
  theme?: "light" | "dark";
  lang?: "ar" | "en";
  hideMenu?: boolean;
  hideSidebar?: boolean;
  hideInfoBox?: boolean;
  running?: boolean;
  editable?: boolean;
  positiveColor?: string;
  negativeColor?: string;
  selectColor?: string;
  currentColor?: string;
}
