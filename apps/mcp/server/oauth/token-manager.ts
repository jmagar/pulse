import { decrypt, encrypt } from "./crypto.js";
import type {
  TokenRecord,
  TokenStore,
  TokenRecordUpdate,
} from "../storage/token-store.js";

export interface TokenManagerOptions {
  store: TokenStore;
  encryptionKey: string;
}

function wrapValue(value: string, secret: string): string {
  const payload = encrypt(value, secret);
  return `enc:${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

function unwrapValue(value: string, secret: string): string {
  if (!value.startsWith("enc:")) {
    return value;
  }
  const payload = JSON.parse(
    Buffer.from(value.slice(4), "base64").toString("utf8"),
  );
  return decrypt(payload, secret);
}

function encryptRecord(
  record: TokenRecord,
  secret: string,
): TokenRecord {
  return {
    ...record,
    accessToken: wrapValue(record.accessToken, secret),
    refreshToken: record.refreshToken
      ? wrapValue(record.refreshToken, secret)
      : undefined,
    idToken: record.idToken
      ? wrapValue(record.idToken, secret)
      : undefined,
  };
}

function decryptRecord(
  record: TokenRecord,
  secret: string,
): TokenRecord {
  return {
    ...record,
    accessToken: unwrapValue(record.accessToken, secret),
    refreshToken: record.refreshToken
      ? unwrapValue(record.refreshToken, secret)
      : undefined,
    idToken: record.idToken ? unwrapValue(record.idToken, secret) : undefined,
  };
}

export type TokenManager = ReturnType<typeof createTokenManager>;

export function createTokenManager(options: TokenManagerOptions) {
  const { store, encryptionKey } = options;

  async function save(record: TokenRecord): Promise<void> {
    await store.save(encryptRecord(record, encryptionKey));
  }

  async function get(userId: string): Promise<TokenRecord | null> {
    const record = await store.get(userId);
    if (!record) {
      return null;
    }
    return decryptRecord(record, encryptionKey);
  }

  async function deleteRecord(userId: string): Promise<void> {
    await store.delete(userId);
  }

  async function refresh(
    userId: string,
    updates: TokenRecordUpdate,
  ): Promise<TokenRecord | null> {
    const encryptedUpdates: TokenRecordUpdate = { ...updates };
    if (updates.accessToken) {
      encryptedUpdates.accessToken = wrapValue(
        updates.accessToken,
        encryptionKey,
      );
    }
    if (updates.refreshToken) {
      encryptedUpdates.refreshToken = wrapValue(
        updates.refreshToken,
        encryptionKey,
      );
    }
    const refreshed = await store.refresh(userId, encryptedUpdates);
    if (!refreshed) {
      return null;
    }
    return decryptRecord(refreshed, encryptionKey);
  }

  return {
    save,
    get,
    delete: deleteRecord,
    refresh,
  };
}
