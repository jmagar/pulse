export interface TokenRecord {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: Date;
  scopes: string[];
  idToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TokenRecordUpdate = Partial<
  Omit<TokenRecord, "userId" | "createdAt">
>;

export interface TokenStore {
  save(record: TokenRecord): Promise<void>;
  get(userId: string): Promise<TokenRecord | null>;
  delete(userId: string): Promise<void>;
  refresh(
    userId: string,
    updates: TokenRecordUpdate,
  ): Promise<TokenRecord | null>;
}

export interface SerializedTokenRecord {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: string;
  scopes: string[];
  idToken?: string;
  createdAt: string;
  updatedAt: string;
}

export function serializeRecord(record: TokenRecord): SerializedTokenRecord {
  return {
    userId: record.userId,
    sessionId: record.sessionId,
    accessToken: record.accessToken,
    refreshToken: record.refreshToken,
    tokenType: record.tokenType,
    expiresAt: record.expiresAt.toISOString(),
    scopes: record.scopes,
    idToken: record.idToken,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function deserializeRecord(payload: SerializedTokenRecord): TokenRecord {
  return {
    userId: payload.userId,
    sessionId: payload.sessionId,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    tokenType: payload.tokenType,
    expiresAt: new Date(payload.expiresAt),
    scopes: payload.scopes,
    idToken: payload.idToken,
    createdAt: new Date(payload.createdAt),
    updatedAt: new Date(payload.updatedAt),
  };
}
