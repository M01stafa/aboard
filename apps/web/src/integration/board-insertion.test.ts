import { describe, it, expect, vi } from "vitest";
import {
  parseSvgDimensions,
  insertImageIntoBoard,
  insertCircuitSvgIntoBoard,
  insertTextNoteIntoBoard,
} from "./board-insertion";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ProjectService } from "@/core/storage";

describe("board-insertion", () => {
  describe("parseSvgDimensions", () => {
    it("parses width and height attributes in px or numeric", () => {
      const svg = `<svg width="640px" height="480px" xmlns="http://www.w3.org/2000/svg"></svg>`;
      const dim = parseSvgDimensions(svg);
      expect(dim).toEqual({ width: 640, height: 480 });
    });

    it("parses viewBox if width and height are absent", () => {
      const svg = `<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg>`;
      const dim = parseSvgDimensions(svg);
      expect(dim).toEqual({ width: 1200, height: 800 });
    });

    it("falls back to default 800x600 if attributes are absent or invalid", () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;
      const dim = parseSvgDimensions(svg);
      expect(dim).toEqual({ width: 800, height: 600 });
    });
  });

  describe("insertImageIntoBoard", () => {
    it("persists file via ProjectService.putFile and inserts locked image element into Excalidraw scene", async () => {
      const mockBlob = new Blob(["fake-image-bytes"], { type: "image/webp" });
      const mockPutFile = vi.fn().mockResolvedValue({ key: "mock-sha256-key" });

      const mockProjectService = {
        putFile: mockPutFile,
      } as unknown as ProjectService;

      const mockAddFiles = vi.fn();
      const mockUpdateScene = vi.fn();
      const mockScrollToContent = vi.fn();

      const mockApi: ExcalidrawImperativeAPI = {
        addFiles: mockAddFiles,
        getSceneElements: vi.fn().mockReturnValue([]),
        updateScene: mockUpdateScene,
        scrollToContent: mockScrollToContent,
        getAppState: vi.fn(),
        getFiles: vi.fn(),
        refresh: vi.fn(),
      } as unknown as ExcalidrawImperativeAPI;

      const fileId = await insertImageIntoBoard({
        projectId: "proj-1",
        tabId: "tab-board",
        blob: mockBlob,
        mimeType: "image/webp",
        width: 1000,
        height: 750,
        locked: true,
        projectServiceOverride: mockProjectService,
        apiOverride: mockApi,
      });

      // 1. Content-addressed storage (SHA-256)
      expect(mockPutFile).toHaveBeenCalledTimes(1);
      expect(mockPutFile).toHaveBeenCalledWith(
        "proj-1",
        mockBlob,
        expect.objectContaining({ mime: "image/webp" }),
        fileId
      );

      // 2. File registered with Excalidraw API
      expect(mockAddFiles).toHaveBeenCalledTimes(1);
      const addedFiles = mockAddFiles.mock.calls[0][0];
      expect(addedFiles[0].id).toBe(fileId);
      expect(addedFiles[0].mimeType).toBe("image/webp");
      expect(addedFiles[0].dataURL).toContain("data:image/webp;base64,");

      // 3. Scene updated with locked image element
      expect(mockUpdateScene).toHaveBeenCalledTimes(1);
      const scenePayload = mockUpdateScene.mock.calls[0][0];
      expect(scenePayload.elements).toHaveLength(1);
      const el = scenePayload.elements[0];
      expect(el.type).toBe("image");
      expect(el.fileId).toBe(fileId);
      expect(el.locked).toBe(true);
      expect(el.width).toBe(1000);
      expect(el.height).toBe(750);

      // 4. View scrolled to content
      expect(mockScrollToContent).toHaveBeenCalledWith(el, { fitToContent: true });
    });
  });

  describe("insertCircuitSvgIntoBoard", () => {
    it("converts SVG to binary image Blob without DOM inlining (SEC-7) and inserts into board", async () => {
      const sampleSvg = `<svg width="500" height="400" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" /></svg>`;
      const mockPutFile = vi.fn().mockResolvedValue({ key: "svg-sha" });

      const mockProjectService = {
        putFile: mockPutFile,
      } as unknown as ProjectService;

      const mockAddFiles = vi.fn();
      const mockUpdateScene = vi.fn();
      const mockScrollToContent = vi.fn();

      const mockApi: ExcalidrawImperativeAPI = {
        addFiles: mockAddFiles,
        getSceneElements: vi.fn().mockReturnValue([]),
        updateScene: mockUpdateScene,
        scrollToContent: mockScrollToContent,
        getAppState: vi.fn(),
        getFiles: vi.fn(),
        refresh: vi.fn(),
      } as unknown as ExcalidrawImperativeAPI;

      const fileId = await insertCircuitSvgIntoBoard({
        projectId: "proj-1",
        tabId: "tab-board",
        svg: sampleSvg,
        projectServiceOverride: mockProjectService,
        apiOverride: mockApi,
      });

      expect(fileId).toBeDefined();
      expect(mockPutFile).toHaveBeenCalledWith(
        "proj-1",
        expect.any(Blob),
        expect.objectContaining({ mime: "image/svg+xml" }),
        fileId
      );

      // Verify blob type
      const passedBlob = mockPutFile.mock.calls[0][1] as Blob;
      expect(passedBlob.type).toBe("image/svg+xml");

      // Verify dimensions extracted from SVG
      const scenePayload = mockUpdateScene.mock.calls[0][0];
      const el = scenePayload.elements[0];
      expect(el.width).toBe(500);
      expect(el.height).toBe(400);
      expect(el.locked).toBe(false);
    });
  });

  describe("insertTextNoteIntoBoard", () => {
    it("inserts text element with alpha:// link and updates scene", async () => {
      const mockUpdateScene = vi.fn();
      const mockScrollToContent = vi.fn();

      const mockApi: ExcalidrawImperativeAPI = {
        getSceneElements: vi.fn().mockReturnValue([]),
        updateScene: mockUpdateScene,
        scrollToContent: mockScrollToContent,
        getAppState: vi.fn(),
        getFiles: vi.fn(),
        refresh: vi.fn(),
        addFiles: vi.fn(),
      } as unknown as ExcalidrawImperativeAPI;

      const elementId = await insertTextNoteIntoBoard({
        projectId: "proj-1",
        tabId: "tab-board",
        text: "Important excerpt from textbook",
        link: "alpha://pdf/doc-item-1#page=5",
        apiOverride: mockApi,
      });

      expect(elementId).toBeDefined();
      expect(mockUpdateScene).toHaveBeenCalledTimes(1);
      const scenePayload = mockUpdateScene.mock.calls[0][0];
      expect(scenePayload.elements).toHaveLength(1);
      const el = scenePayload.elements[0];
      expect(el.type).toBe("text");
      expect(el.text).toBe("Important excerpt from textbook");
      expect(el.link).toBe("alpha://pdf/doc-item-1#page=5");
      expect(mockScrollToContent).toHaveBeenCalledWith(el, { fitToContent: true });
    });
  });
});
