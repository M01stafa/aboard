import { z } from "zod";

/**
 * .alpha Container MIME type per docs/specs/alpha-format.md §12.1.
 * Stored uncompressed as the first entry in every .alpha file.
 */
export const ALPHA_MIME = "application/x-alpha-project";

/**
 * Format version: integer versioned from day one per docs/specs/alpha-format.md §12.3.
 */
export const CURRENT_FORMAT_VERSION = 1 as const;

/**
 * Safe path validator per SEC-7 and §12.5.
 * Rejects path traversal (..), absolute paths, and backslashes.
 */
export const safePathRegex = /^(?:boards\/[a-zA-Z0-9_-]+\.json|circuits\/[a-zA-Z0-9_-]+\.txt|pdfs\/[a-zA-Z0-9_-]+\.json|annotations\/[a-zA-Z0-9_-]+\.json|files\/[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+|manifest\.json|thumbnail\.png)$/;

export function isSafePath(path: string): boolean {
  if (path.includes("..") || path.startsWith("/") || path.startsWith("\\") || path.includes("\\")) {
    return false;
  }
  return safePathRegex.test(path);
}

const BaseItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  path: z.string().refine(isSafePath, { message: "Path contains invalid or unsafe characters" }),
});

export const BoardItemSchema = BaseItemSchema.extend({
  kind: z.literal("board"),
});

export const CircuitItemSchema = BaseItemSchema.extend({
  kind: z.literal("circuit"),
});

export const PdfItemSchema = BaseItemSchema.extend({
  kind: z.literal("pdf"),
  fileKey: z.string(),
  annotationsPath: z.string().refine(isSafePath, { message: "Invalid annotations path" }).optional(),
});

export const AnnotationsItemSchema = BaseItemSchema.extend({
  kind: z.literal("annotations"),
});

export const ManifestItemSchema = z.discriminatedUnion("kind", [
  BoardItemSchema,
  CircuitItemSchema,
  PdfItemSchema,
  AnnotationsItemSchema,
]);

export const ManifestFileSchema = z.object({
  key: z.string().min(1),
  path: z.string().refine(isSafePath, { message: "File path contains invalid or unsafe characters" }),
  name: z.string().optional(),
  mime: z.string(),
  size: z.number().nonnegative(),
  sha256: z.string().min(1),
});

export const ManifestLayoutSchema = z.object({
  tabs: z.array(z.string()),
  split: z.enum(["none", "vertical", "horizontal"]).optional(),
});

export const AlphaManifestSchema = z.object({
  format: z.literal("alpha-project"),
  formatVersion: z.literal(CURRENT_FORMAT_VERSION),
  app: z.object({
    name: z.literal("Aboard"),
    version: z.string(),
  }),
  exportedAt: z.string().optional(),
  project: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    subject: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  items: z.array(ManifestItemSchema),
  files: z.array(ManifestFileSchema),
  layout: ManifestLayoutSchema.optional(),
});

export type AlphaManifest = z.infer<typeof AlphaManifestSchema>;
export type ManifestItem = z.infer<typeof ManifestItemSchema>;
export type ManifestFile = z.infer<typeof ManifestFileSchema>;

/**
 * Validates untrusted manifest object or throws a ZodError.
 */
export function validateAlphaManifest(data: unknown): AlphaManifest {
  return AlphaManifestSchema.parse(data);
}
