import { z } from "zod";

export const eventTypeSchema = z.enum([
  "cta_clicked",
  "flow_started",
  "trial_started",
  "paid_converted",
  "churned",
]);

const dateInputSchema = z.union([z.string().datetime(), z.date()]);

export const trackEventSchema = z
  .object({
    event_type: eventTypeSchema,
    occurred_at: dateInputSchema,
    external_entity_id: z.string().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.event_type !== "cta_clicked" && !data.external_entity_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "external_entity_id is required for this event type.",
        path: ["external_entity_id"],
      });
    }
  });

export const stateSnapshotSchema = z
  .object({
    occurred_at: dateInputSchema,
    active_accounts: z.number().int().min(0),
    active_trials: z.number().int().min(0),
    mrr: z.number().min(0),
    lifetime_revenue: z.number().min(0),
  })
  .strict();

export const connectorConfigSchema = z
  .object({
    baseUrl: z.string().min(1),
    appId: z.string().min(1),
    appSecret: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
    maxRetries: z.number().int().min(0).max(5).optional(),
    retryBaseDelayMs: z.number().int().positive().optional(),
    fetchImpl: z.custom<typeof fetch>((value) => typeof value === "function").optional(),
    allowInsecureHttp: z.boolean().optional(),
    userAgent: z.string().min(1).optional(),
  })
  .strict();
