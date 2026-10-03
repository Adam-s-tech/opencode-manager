import { z } from "zod";

export const SessionPermissionModeSchema = z.enum(["ask", "auto"]);

export type SessionPermissionMode = z.infer<typeof SessionPermissionModeSchema>;

export const SetSessionPermissionModeRequestSchema = z.object({
  directory: z.string().min(1),
  mode: SessionPermissionModeSchema,
});

export type SetSessionPermissionModeRequest = z.infer<typeof SetSessionPermissionModeRequestSchema>;

export const SessionPermissionModeStateSchema = z.object({
  sessionId: z.string(),
  rootSessionId: z.string(),
  mode: SessionPermissionModeSchema,
  inherited: z.boolean(),
});

export type SessionPermissionModeState = z.infer<typeof SessionPermissionModeStateSchema>;
