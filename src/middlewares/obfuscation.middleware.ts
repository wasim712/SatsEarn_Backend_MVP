import { NextFunction, Request, Response } from 'express';
import { CryptoUtil } from '../utils/crypto.util';

function isApiRequest(req: Request) {
  return req.path.startsWith('/api/');
}

function isAuthRequest(req: Request) {
  return req.path.startsWith('/api/auth/');
}

function isRawPublicRequest(req: Request) {
  return req.path.startsWith('/api/public/announcements/active');
}

function shouldDecryptRequest(req: Request) {
  if (isAuthRequest(req) || isRawPublicRequest(req)) {
    return false;
  }

  return isApiRequest(req) && (req.headers['x-obfuscated'] === '1' || req.headers['x-obfuscated-multipart'] === '1');
}

function shouldEncryptResponse(req: Request) {
  if (isAuthRequest(req) || isRawPublicRequest(req)) {
    return false;
  }

  return isApiRequest(req) && (req.headers['x-obfuscated-response'] === '1' || req.headers['x-obfuscated'] === '1' || req.headers['x-obfuscated-multipart'] === '1');
}

export function decryptObfuscatedJson(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!shouldDecryptRequest(req)) return next();

    const body = req.body as { payload?: string } | undefined;
    if (!body || typeof body !== 'object' || typeof body.payload !== 'string') {
      return next();
    }

    let decrypted: string | null;

    try {
      decrypted = CryptoUtil.decryptTransport(body.payload);
    } catch {
      return next({ statusCode: 400, name: 'BadRequest', message: 'Invalid obfuscated request payload.' });
    }

    if (!decrypted) {
      req.body = {};
      return next();
    }

    try {
      req.body = JSON.parse(decrypted);
    } catch {
      req.body = { value: decrypted };
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export function decryptObfuscatedMultipart(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.headers['x-obfuscated-multipart'] !== '1') return next();

    const encryptedPayload = req.body?.__payload;
    if (!encryptedPayload || typeof encryptedPayload !== 'string') return next();

    let decrypted: string | null;

    try {
      decrypted = CryptoUtil.decryptTransport(encryptedPayload);
    } catch {
      return next({ statusCode: 400, name: 'BadRequest', message: 'Invalid obfuscated multipart payload.' });
    }

    if (!decrypted) {
      delete req.body.__payload;
      return next();
    }

    const parsed = JSON.parse(decrypted) as Record<string, unknown>;
    delete req.body.__payload;
    req.body = {
      ...req.body,
      ...parsed,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

export function encryptObfuscatedResponse(req: Request, res: Response, next: NextFunction) {
  if (!shouldEncryptResponse(req)) return next();

  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    const serialized = JSON.stringify(body ?? {});
    const payload = CryptoUtil.encryptTransport(serialized);
    return originalJson({ payload });
  }) as Response['json'];

  return next();
}
