/**
 * Offline self-checks for the security helpers (no database, no network).
 * Run: npx ts-node scripts/security-selfcheck.ts
 */
import assert from 'assert';
import crypto from 'crypto';
import { decodeBolt11 } from '../src/utils/bolt11.util';

let failures = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error: any) {
    failures += 1;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

// --- BOLT11: vectors from the BOLT #11 specification ---
check('bolt11: $5 coffee invoice (2500u, 60s expiry)', () => {
  const decoded = decodeBolt11(
    'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp',
  );
  assert.strictEqual(decoded.network, 'mainnet');
  assert.strictEqual(decoded.amountMsat, 250_000_000n);
  assert.strictEqual(decoded.timestamp, 1496314658);
  assert.strictEqual(decoded.expirySeconds, 60);
  assert.strictEqual(decoded.paymentHash, '0001020304050607080900010203040506070809000102030405060708090102');
});

check('bolt11: rejects a one-character typo', () => {
  assert.throws(() => decodeBolt11(
    'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srq',
  ), /checksum/);
});

check('bolt11: rejects non-invoices', () => {
  assert.throws(() => decodeBolt11('lnbc-this-is-not-an-invoice'));
  assert.throws(() => decodeBolt11('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'));
});

// --- Field encryption: new GCM format and legacy CBC rows ---
check('crypto: GCM round trip, legacy CBC readable via LEGACY_FIELD_ENCRYPTION_KEYS', () => {
  const oldKey = 'old-key-'.padEnd(40, 'x');
  const newKey = 'new-key-'.padEnd(40, 'y');

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', crypto.createHash('sha256').update(oldKey).digest(), iv);
  const legacyValue = `enc:${iv.toString('hex')}:${Buffer.concat([cipher.update('203.0.113.7', 'utf8'), cipher.final()]).toString('hex')}`;

  process.env.FIELD_ENCRYPTION_KEY = newKey;
  process.env.LEGACY_FIELD_ENCRYPTION_KEYS = oldKey;
  // Loaded after the env is set; the helpers read keys at call time.
  const { CryptoUtil } = require('../src/utils/crypto.util');

  const encrypted = CryptoUtil.encrypt('lnbc1example');
  assert.ok(encrypted.startsWith('enc2:'));
  assert.strictEqual(CryptoUtil.decrypt(encrypted), 'lnbc1example');
  assert.strictEqual(CryptoUtil.needsReencryption(encrypted), false);

  assert.strictEqual(CryptoUtil.decrypt(legacyValue), '203.0.113.7');
  assert.strictEqual(CryptoUtil.needsReencryption(legacyValue), true);
  const reencrypted = CryptoUtil.reencrypt(legacyValue);
  assert.ok(reencrypted.startsWith('enc2:'));
  assert.strictEqual(CryptoUtil.decrypt(reencrypted), '203.0.113.7');

  const tampered = `${encrypted.slice(0, -2)}${encrypted.endsWith('00') ? '11' : '00'}`;
  assert.strictEqual(CryptoUtil.decrypt(tampered), null);

  assert.strictEqual(CryptoUtil.safeEqual(CryptoUtil.hmac('otp:RESET:a@b.c:123456'), CryptoUtil.hmac('otp:RESET:a@b.c:123456')), true);
  assert.strictEqual(CryptoUtil.safeEqual(CryptoUtil.hmac('otp:RESET:a@b.c:123456'), CryptoUtil.hmac('otp:SIGNUP:a@b.c:123456')), false);
});

check('transport: never derived from JWT_SECRET', () => {
  process.env.JWT_SECRET = 'jwt-'.padEnd(40, 'z');
  delete process.env.TRANSPORT_OBFUSCATION_KEY;
  const { CryptoUtil } = require('../src/utils/crypto.util');

  const payload = CryptoUtil.encryptTransport('{"a":1}');
  const [, ivHex, dataHex] = payload.split(':');
  const jwtKey = crypto.createHash('sha256').update(process.env.JWT_SECRET!).digest();
  assert.throws(() => {
    const decipher = crypto.createDecipheriv('aes-256-cbc', jwtKey, Buffer.from(ivHex, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    if (plain !== '{"a":1}') throw new Error('garbage');
  });
  assert.strictEqual(CryptoUtil.decryptTransport(payload), '{"a":1}');
});

check('blog html: strips script, handlers and javascript: URLs, keeps formatting', () => {
  const { sanitizeBlogHtml } = require('../src/utils/html-sanitize.util');
  const dirty = '<h2 style="text-align:center;position:fixed">Hi</h2><p><b>bold</b> <a href="javascript:alert(1)">x</a>'
    + '<a href="https://satsearn.app">ok</a></p><img src="x" onerror="alert(1)"><script>alert(1)</script>'
    + '<iframe src="https://evil.example"></iframe><font color="#ff0000">red</font>';
  const clean: string = sanitizeBlogHtml(dirty);

  assert.ok(!/script|onerror|javascript:|iframe|position/i.test(clean), clean);
  assert.ok(clean.includes('<b>bold</b>'));
  assert.ok(clean.includes('text-align:center'));
  assert.ok(clean.includes('href="https://satsearn.app"'));
  assert.ok(clean.includes('rel="noopener noreferrer nofollow"'));
  assert.ok(clean.includes('<font color="#ff0000">red</font>'));
});

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll security self-checks passed');
