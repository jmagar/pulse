import { z } from "zod";

const BLACKLISTED_WEBHOOK_HEADERS = ["x-firecrawl-signature"];

export const webhookSchema = z.preprocess(
  x => (typeof x === "string" ? { url: x } : x),
  z
    .object({
      url: z.string().url(),
      headers: z.record(z.string(), z.string()).default({}),
      metadata: z.record(z.string(), z.string()).default({}),
      events: z
        .array(z.enum(["completed", "failed", "page", "started"]))
        .default(["completed", "failed", "page", "started"]),
    })
    .strict(
      "Unrecognized key in webhook object. Review the API documentation for webhook configuration changes.",
    )
    .refine(
      obj => {
        const blacklistedLower = BLACKLISTED_WEBHOOK_HEADERS.map(h =>
          h.toLowerCase(),
        );
        return !Object.keys(obj.headers).some(key =>
          blacklistedLower.includes(key.toLowerCase()),
        );
      },
      `The following headers are not allowed: ${BLACKLISTED_WEBHOOK_HEADERS.join(", ")}`,
    ),
);
