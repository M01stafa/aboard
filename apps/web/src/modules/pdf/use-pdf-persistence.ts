import { useCallback, useEffect, useRef, useState } from "react";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { computeBlobSha256 } from "@/core/storage/sha256";
import { bus } from "@/core/bus";
import type { PdfItemPayload } from "./types";

export interface UsePdfPersistenceOptions {
  projectId: string;
  itemId: string;
  title?: string;
  projectServiceOverride?: ProjectService;
}

export interface UsePdfPersistenceResult {
  payload: PdfItemPayload | null;
  blob: Blob | null;
  isLoaded: boolean;
  hashingProgress: number | null; // 0 to 1, or null when idle
  saveLastPage: (page: number) => void;
  addPdfFile: (file: File | Blob, name?: string) => Promise<void>;
  error: string | null;
}

export function usePdfPersistence({
  projectId,
  itemId,
  title,
  projectServiceOverride,
}: UsePdfPersistenceOptions): UsePdfPersistenceResult {
  const ps = projectServiceOverride ?? defaultProjectService;
  const [payload, setPayload] = useState<PdfItemPayload | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hashingProgress, setHashingProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payloadRef = useRef<PdfItemPayload | null>(null);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);


  // Load existing PDF item and blob from ProjectService
  useEffect(() => {
    let isSubscribed = true;

    async function loadItem() {
      try {
        const raw = await ps.readItem(projectId, itemId).catch(() => "");
        if (!isSubscribed) return;

        if (raw && raw.trim().length > 0) {
          const parsed = JSON.parse(raw) as PdfItemPayload;
          if (parsed && parsed.fileKey) {
            setPayload(parsed);
            try {
              const fileBlob = await ps.getFile(projectId, parsed.fileKey);
              if (isSubscribed) {
                setBlob(fileBlob);
              }
            } catch (err) {
              if (isSubscribed) {
                console.error("[usePdfPersistence] Failed to read PDF file blob:", err);
                setError(err instanceof Error ? err.message : String(err));
              }
            }
          }
        }
      } catch (err) {
        if (isSubscribed) {
          console.error("[usePdfPersistence] Failed to load item payload:", err);
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isSubscribed) {
          setIsLoaded(true);
        }
      }
    }

    loadItem();

    const handleUpdated = (event: { itemId: string }) => {
      if (event.itemId === itemId) {
        loadItem();
      }
    };

    bus.on("pdf:item-updated", handleUpdated);

    return () => {
      isSubscribed = false;
      bus.off("pdf:item-updated", handleUpdated);
    };
  }, [ps, projectId, itemId]);

  // Save student's current page position (debounced via SaveQueue in ProjectService)
  const saveLastPage = useCallback(
    (page: number) => {
      if (page < 1) return;
      const current = payloadRef.current;
      if (!current || current.lastPage === page) return;

      const updated: PdfItemPayload = {
        ...current,
        lastPage: page,
      };
      payloadRef.current = updated;
      setPayload(updated);

      ps.savePdf(
        projectId,
        itemId,
        JSON.stringify(updated),
        updated.name ?? titleRef.current
      ).catch((err) => {
        console.error("[usePdfPersistence] Error saving page position:", err);
      });
    },
    [ps, projectId, itemId]
  );

  // Add a new PDF file from the device
  const addPdfFile = useCallback(
    async (file: File | Blob, name?: string) => {
      setError(null);
      setHashingProgress(0);
      try {
        const docName = name ?? (file instanceof File ? file.name : "document.pdf");
        const hash = await computeBlobSha256(file, (ratio) => {
          setHashingProgress(ratio);
        });

        // Store file immutable under SHA-256 hash
        await ps.putFile(
          projectId,
          file,
          { name: docName, mime: "application/pdf" },
          hash
        );

        const newPayload: PdfItemPayload = {
          type: "alpha-pdf",
          version: 1,
          fileKey: hash,
          name: docName,
          lastPage: 1,
        };

        await ps.savePdf(
          projectId,
          itemId,
          JSON.stringify(newPayload),
          docName
        );

        payloadRef.current = newPayload;
        setPayload(newPayload);
        setBlob(file);
      } catch (err) {
        console.error("[usePdfPersistence] Failed to add PDF file:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setHashingProgress(null);
      }
    },
    [ps, projectId, itemId]
  );

  return {
    payload,
    blob,
    isLoaded,
    hashingProgress,
    saveLastPage,
    addPdfFile,
    error,
  };
}
