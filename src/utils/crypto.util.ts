import crypto from 'crypto';

// Field encryption at rest.
//   enc2:<iv>:<tag>:<ciphertext>  AES-256-GCM (authenticated) — all new writes
//   enc:<iv>:<ciphertext>         AES-256-CBC (legacy, read-only)
const LEGACY_PREFIX = 'enc:';
const GCM_PREFIX = 'enc2:';
const CBC_IV_LENGTH = 16;
const GCM_IV_LENGTH = 12;

// Request/response obfuscation is NOT a security boundary (the key ships to every browser),
// so it must never reuse a real secret such as JWT_SECRET or FIELD_ENCRYPTION_KEY.
const PUBLIC_TRANSPORT_KEY = 'satsearn-transport-key';

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function splitSecrets(value?: string): string[] {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function getFieldEncryptionKey(): Buffer {
  const secret = process.env.FIELD_ENCRYPTION_KEY;

  if (!secret || secret.length < 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be set (32+ characters) for field encryption.');
  }

  return deriveKey(secret);
}

// Keys that may have encrypted existing rows: the current key plus any old keys listed in
// LEGACY_FIELD_ENCRYPTION_KEYS (comma-separated) during a rotation. Legacy CBC rows were
// written with an old key, so those try the old keys first.
function getFieldDecryptionKeys(legacyFirst: boolean): Buffer[] {
  const current = process.env.FIELD_ENCRYPTION_KEY;
  const legacy = splitSecrets(process.env.LEGACY_FIELD_ENCRYPTION_KEYS);
  const secrets = (legacyFirst ? [...legacy, current] : [current, ...legacy])
    .filter((value): value is string => Boolean(value && value.length >= 16));

  return Array.from(new Set(secrets)).map(deriveKey);
}

// CBC has no integrity check, so a wrong key can occasionally "decrypt" to garbage.
function looksLikeText(value: string) {
  return !value.includes('�') && !/[\u0000-\u0008\u000E-\u001F]/.test(value);
}

function getTransportEncryptionKey(): Buffer {
  return deriveKey(process.env.TRANSPORT_OBFUSCATION_KEY || PUBLIC_TRANSPORT_KEY);
}

function getTransportDecryptionKeys(): Buffer[] {
  const secrets = [
    process.env.TRANSPORT_OBFUSCATION_KEY,
    PUBLIC_TRANSPORT_KEY,
  ].filter((value): value is string => Boolean(value && value.length >= 16));

  return Array.from(new Set(secrets)).map(deriveKey);
}

function encryptCbc(value: string, key: Buffer) {
  const iv = crypto.randomBytes(CBC_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${LEGACY_PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptCbc(value: string, key: Buffer) {
  const payload = value.slice(LEGACY_PREFIX.length);
  const [ivHex, encryptedHex] = payload.split(':');

  if (!ivHex || !encryptedHex) {
    return value;
  }

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function encryptGcm(value: string, key: Buffer) {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GCM_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptGcm(value: string, key: Buffer) {
  const [ivHex, tagHex, encryptedHex] = value.slice(GCM_PREFIX.length).split(':');

  if (!ivHex || !tagHex || encryptedHex === undefined) {
    throw new Error('Malformed encrypted value.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function isEncrypted(value: string) {
  return value.startsWith(GCM_PREFIX) || value.startsWith(LEGACY_PREFIX);
}

export class CryptoUtil {
  static encrypt(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (isEncrypted(value)) {
      return value;
    }

    return encryptGcm(value, getFieldEncryptionKey());
  }

  static decrypt(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!isEncrypted(value)) {
      return value;
    }

    const isGcm = value.startsWith(GCM_PREFIX);

    for (const key of getFieldDecryptionKeys(!isGcm)) {
      try {
        if (isGcm) return decryptGcm(value, key);

        const plainText = decryptCbc(value, key);
        if (looksLikeText(plainText)) return plainText;
      } catch {
        continue;
      }
    }

    console.error('[CryptoUtil] Could not decrypt a stored field with any configured key. '
      + 'If keys were rotated, add the old key to LEGACY_FIELD_ENCRYPTION_KEYS.');
    return null;
  }

  // True when a stored value is still in the legacy format or was written with a legacy key.
  static needsReencryption(value?: string | null): boolean {
    if (!value || !isEncrypted(value)) return false;
    if (value.startsWith(LEGACY_PREFIX)) return true;

    try {
      decryptGcm(value, getFieldEncryptionKey());
      return false;
    } catch {
      return true;
    }
  }

  static reencrypt(value?: string | null): string | null {
    if (!value || !isEncrypted(value)) return value ?? null;

    const plainText = this.decrypt(value);
    if (plainText === null) {
      throw new Error('Value cannot be decrypted with the configured keys.');
    }

    return encryptGcm(plainText, getFieldEncryptionKey());
  }

  // Keyed one-way hash for short secrets such as OTP codes. The key stops offline guessing
  // of a 6-digit code if the database leaks.
  static hmac(value: string): string {
    return crypto.createHmac('sha256', getFieldEncryptionKey()).update(value).digest('hex');
  }

  static safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  static encryptTransport(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (value.startsWith(LEGACY_PREFIX)) {
      return value;
    }

    return encryptCbc(value, getTransportEncryptionKey());
  }

  static decryptTransport(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!value.startsWith(LEGACY_PREFIX)) {
      return value;
    }

    for (const key of getTransportDecryptionKeys()) {
      try {
        return decryptCbc(value, key);
      } catch {
        continue;
      }
    }

    throw new Error('Unable to decrypt transport payload with known keys.');
  }

  static mask(value?: string | null, visibleChars = 4): string | null {
    const plainText = this.decrypt(value);

    if (!plainText) {
      return null;
    }

    if (plainText.length <= visibleChars) {
      return '*'.repeat(plainText.length);
    }

    const hiddenLength = Math.max(plainText.length - visibleChars, 0);
    return `${'*'.repeat(hiddenLength)}${plainText.slice(-visibleChars)}`;
  }
}
