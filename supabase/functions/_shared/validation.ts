import { z } from "npm:zod@3";

export const connectBodySchema = z
  .object({
    returnTo: z.string().max(200).optional(),
  })
  .strict();

export const linkTokenBodySchema = z
  .object({
    refresh_token: z.string().min(20).max(1024),
  })
  .strict();

export const callbackQuerySchema = z.object({
  state: z.string().min(10).max(512),
  code: z.string().min(1).max(2048).optional(),
  error: z.string().max(256).optional(),
});
