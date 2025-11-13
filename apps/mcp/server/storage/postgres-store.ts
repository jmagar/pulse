import type { Pool } from "pg";

import {
  deserializeRecord,
  serializeRecord,
  type TokenRecord,
  type TokenStore,
  type TokenRecordUpdate,
} from "./token-store.js";

interface DbTokenRow {
  user_id: string;
  session_id: string;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_at: Date | string;
  scopes: string[];
  id_token?: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function rowToRecord(row: DbTokenRow): TokenRecord {
  return {
    userId: row.user_id,
    sessionId: row.session_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    tokenType: row.token_type,
    expiresAt: new Date(row.expires_at),
    scopes: row.scopes,
    idToken: row.id_token ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const UPSERT_SQL = `
INSERT INTO oauth_tokens (
  user_id,
  session_id,
  access_token,
  refresh_token,
  token_type,
  expires_at,
  scopes,
  id_token,
  created_at,
  updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
ON CONFLICT (user_id) DO UPDATE SET
  session_id = EXCLUDED.session_id,
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  token_type = EXCLUDED.token_type,
  expires_at = EXCLUDED.expires_at,
  scopes = EXCLUDED.scopes,
  id_token = EXCLUDED.id_token,
  updated_at = EXCLUDED.updated_at
RETURNING *;
`;

const SELECT_SQL = `
SELECT
  user_id,
  session_id,
  access_token,
  refresh_token,
  token_type,
  expires_at,
  scopes,
  id_token,
  created_at,
  updated_at
FROM oauth_tokens
WHERE user_id = $1;
`;

const DELETE_SQL = `
DELETE FROM oauth_tokens
WHERE user_id = $1;
`;

export function createPostgresTokenStore(pool: Pool): TokenStore {
  async function save(record: TokenRecord): Promise<void> {
    const serialized = serializeRecord(record);
    await pool.query(UPSERT_SQL, [
      serialized.userId,
      serialized.sessionId,
      serialized.accessToken,
      serialized.refreshToken ?? null,
      serialized.tokenType,
      serialized.expiresAt,
      serialized.scopes,
      serialized.idToken ?? null,
      serialized.createdAt,
      serialized.updatedAt,
    ]);
  }

  async function get(userId: string): Promise<TokenRecord | null> {
    const result = await pool.query(SELECT_SQL, [userId]);
    if (result.rowCount === 0) {
      return null;
    }
    return rowToRecord(result.rows[0] as DbTokenRow);
  }

  async function deleteRecord(userId: string): Promise<void> {
    await pool.query(DELETE_SQL, [userId]);
  }

  async function refresh(
    userId: string,
    updates: TokenRecordUpdate,
  ): Promise<TokenRecord | null> {
    const current = await get(userId);
    if (!current) {
      return null;
    }
    const updated: TokenRecord = {
      ...current,
      ...updates,
      expiresAt: updates.expiresAt ?? current.expiresAt,
      scopes: updates.scopes ?? current.scopes,
      updatedAt: updates.updatedAt ?? new Date(),
    };
    await save(updated);
    return updated;
  }

  return {
    save,
    get,
    delete: deleteRecord,
    refresh,
  };
}
