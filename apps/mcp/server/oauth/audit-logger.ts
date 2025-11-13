import { Pool } from "pg";

export type AuditEventType =
  | "login_success"
  | "login_failure"
  | "token_refresh"
  | "token_revoke"
  | "logout"
  | "csrf_block"
  | "rate_limit";

export interface AuditEvent {
  type: AuditEventType;
  userId?: string;
  success?: boolean;
  errorMessage?: string;
  ip?: string;
  userAgent?: string;
  eventData?: Record<string, unknown>;
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.MCP_DATABASE_URL });
  }
  return pool;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  if (!process.env.MCP_DATABASE_URL) {
    return;
  }
  const client = getPool();
  await client.query(
    `INSERT INTO oauth_audit_log (user_id, event_type, success, error_message, ip_address, user_agent, event_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.userId ?? null,
      event.type,
      event.success ?? true,
      event.errorMessage ?? null,
      event.ip ?? null,
      event.userAgent ?? null,
      event.eventData ?? null,
    ],
  );
}
