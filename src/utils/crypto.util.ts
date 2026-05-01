import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc:';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.FIELD_ENCRYPTION_KEY || process.env.JWT_SECRET;

  if (!secret || secret.length < 16) {
    throw new Error('FIELD_ENCRYPTION_KEY or JWT_SECRET must be set for encryption.');
  }

  return crypto.createHash('sha256').update(secret).digest();
}

export class CryptoUtil {
  static encrypt(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (value.startsWith(ENCRYPTION_PREFIX)) {
      return value;
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

    return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  static decrypt(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    if (!value.startsWith(ENCRYPTION_PREFIX)) {
      return value;
    }

    const payload = value.slice(ENCRYPTION_PREFIX.length);
    const [ivHex, encryptedHex] = payload.split(':');

    if (!ivHex || !encryptedHex) {
      return value;
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      getEncryptionKey(),
      Buffer.from(ivHex, 'hex'),
    );

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
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
