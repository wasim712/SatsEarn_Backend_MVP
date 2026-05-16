import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:';
const IV_LENGTH = 16;

function getFieldEncryptionKey(): Buffer {
  const secret = process.env.FIELD_ENCRYPTION_KEY || process.env.JWT_SECRET;

  if (!secret || secret.length < 16) {
    throw new Error('FIELD_ENCRYPTION_KEY or JWT_SECRET must be set for encryption.');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

function getTransportEncryptionKey(): Buffer {
  const secret = process.env.TRANSPORT_OBFUSCATION_KEY || process.env.JWT_SECRET;

  if (!secret || secret.length < 16) {
    throw new Error('TRANSPORT_OBFUSCATION_KEY or JWT_SECRET must be set for obfuscation.');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

function getTransportDecryptionKeys(): Buffer[] {
  const secrets = [
    process.env.TRANSPORT_OBFUSCATION_KEY,
    process.env.FIELD_ENCRYPTION_KEY,
    process.env.JWT_SECRET,
    'satsearn-transport-key',
  ].filter((value): value is string => Boolean(value && value.length >= 16));

  const uniqueSecrets = Array.from(new Set(secrets));
  return uniqueSecrets.map((secret) => crypto.createHash('sha256').update(secret).digest());
}

function encryptWithKey(value: string, key: Buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptWithKey(value: string, key: Buffer) {
  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const [ivHex, encryptedHex] = payload.split(':');

  if (!ivHex || !encryptedHex) {
    return value;
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    key,
    Buffer.from(ivHex, 'hex'),
  );

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export class CryptoUtil {
  static encrypt(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (value.startsWith(ENCRYPTION_PREFIX)) {
      return value;
    }

    return encryptWithKey(value, getFieldEncryptionKey());
  }

  static decrypt(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!value.startsWith(ENCRYPTION_PREFIX)) {
      return value;
    }

    return decryptWithKey(value, getFieldEncryptionKey());
  }

  static encryptTransport(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (value.startsWith(ENCRYPTION_PREFIX)) {
      return value;
    }

    return encryptWithKey(value, getTransportEncryptionKey());
  }

  static decryptTransport(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!value.startsWith(ENCRYPTION_PREFIX)) {
      return value;
    }

    const keys = getTransportDecryptionKeys();

    for (const key of keys) {
      try {
        return decryptWithKey(value, key);
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
