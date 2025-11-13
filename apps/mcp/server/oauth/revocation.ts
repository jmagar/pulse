import { logAuditEvent } from "./audit-logger.js";
import type { TokenManager } from "./token-manager.js";

export async function revokeTokens(options: {
  tokenManager: TokenManager;
  googleClient: ReturnType<typeof import("./google-client.js").createGoogleOAuthClient>;
  userId: string;
  accessToken?: string;
  refreshToken?: string;
}): Promise<void> {
  const { tokenManager, googleClient, userId } = options;
  const record = await tokenManager.get(userId);
  if (!record) {
    return;
  }

  if (record.accessToken) {
    await googleClient.revokeToken(record.accessToken);
    await logAuditEvent({
      type: "token_revoke",
      userId,
      eventData: { token: "access" },
    });
  }

  if (record.refreshToken) {
    await googleClient.revokeToken(record.refreshToken);
    await logAuditEvent({
      type: "token_revoke",
      userId,
      eventData: { token: "refresh" },
    });
  }

  await tokenManager.delete(userId);
}
