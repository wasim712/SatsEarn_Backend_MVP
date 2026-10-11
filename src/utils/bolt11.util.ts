// Minimal BOLT11 (Lightning invoice) decoder: checks the bech32 checksum and reads the
// network, amount, timestamp, expiry and payment hash. It does not verify the node signature;
// the admin's wallet does that when paying.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const SIGNATURE_WORDS = 104; // 65-byte recoverable signature
const DEFAULT_EXPIRY_SECONDS = 3600;
const TAG_PAYMENT_HASH = CHARSET.indexOf('p');
const TAG_EXPIRY = CHARSET.indexOf('x');

export type Bolt11Network = 'mainnet' | 'testnet' | 'signet' | 'regtest';

export type DecodedBolt11 = {
  network: Bolt11Network;
  amountMsat: bigint | null; // null = amountless invoice
  timestamp: number; // seconds since epoch
  expirySeconds: number;
  expiresAt: Date;
  paymentHash: string | null; // hex
};

const NETWORK_PREFIXES: Array<[string, Bolt11Network]> = [
  ['bcrt', 'regtest'],
  ['bc', 'mainnet'],
  ['tbs', 'signet'],
  ['tb', 'testnet'],
];

// msat per unit of each amount multiplier (1 BTC = 10^11 msat)
const MULTIPLIER_MSAT: Record<string, { numerator: bigint; denominator: bigint }> = {
  '': { numerator: 100_000_000_000n, denominator: 1n },
  m: { numerator: 100_000_000n, denominator: 1n },
  u: { numerator: 100_000n, denominator: 1n },
  n: { numerator: 100n, denominator: 1n },
  p: { numerator: 1n, denominator: 10n },
};

function polymod(values: number[]) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let bit = 0; bit < 5; bit += 1) {
      if ((top >>> bit) & 1) checksum ^= GENERATOR[bit];
    }
  }
  return checksum;
}

function expandHrp(hrp: string) {
  const high = [...hrp].map((char) => char.charCodeAt(0) >> 5);
  const low = [...hrp].map((char) => char.charCodeAt(0) & 31);
  return [...high, 0, ...low];
}

function decodeBech32(input: string) {
  if (input !== input.toLowerCase() && input !== input.toUpperCase()) {
    throw new Error('Invoice mixes upper and lower case.');
  }

  const value = input.toLowerCase();
  const separator = value.lastIndexOf('1');
  if (separator < 1 || separator + 7 > value.length) {
    throw new Error('Invoice is not valid bech32.');
  }

  const hrp = value.slice(0, separator);
  const words = [...value.slice(separator + 1)].map((char) => {
    const word = CHARSET.indexOf(char);
    if (word === -1) throw new Error('Invoice contains an invalid character.');
    return word;
  });

  if (polymod([...expandHrp(hrp), ...words]) !== 1) {
    throw new Error('Invoice checksum is invalid (typo or truncated).');
  }

  return { hrp, words: words.slice(0, -6) };
}

function wordsToInt(words: number[]) {
  return words.reduce((total, word) => total * 32 + word, 0);
}

function wordsToHex(words: number[], byteLength: number) {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const word of words) {
    accumulator = (accumulator << 5) | word;
    bits += 5;
    while (bits >= 8 && bytes.length < byteLength) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
    accumulator &= (1 << bits) - 1;
  }
  return Buffer.from(bytes).toString('hex');
}

function parseHrp(hrp: string) {
  if (!hrp.startsWith('ln')) throw new Error('Not a Lightning invoice.');

  const rest = hrp.slice(2);
  const match = NETWORK_PREFIXES.find(([prefix]) => rest.startsWith(prefix));
  if (!match) throw new Error('Unknown Lightning network in invoice.');

  const [prefix, network] = match;
  const amountPart = rest.slice(prefix.length);
  if (!amountPart) return { network, amountMsat: null };

  const amountMatch = /^(\d+)([munp]?)$/.exec(amountPart);
  if (!amountMatch || amountMatch[1].startsWith('0')) throw new Error('Invoice amount is malformed.');

  const { numerator, denominator } = MULTIPLIER_MSAT[amountMatch[2]];
  const scaled = BigInt(amountMatch[1]) * numerator;
  if (scaled % denominator !== 0n) throw new Error('Invoice amount is malformed.');

  return { network, amountMsat: scaled / denominator };
}

export function decodeBolt11(invoice: string): DecodedBolt11 {
  const trimmed = invoice.trim().replace(/^lightning:/i, '');
  const { hrp, words } = decodeBech32(trimmed);
  const { network, amountMsat } = parseHrp(hrp);

  if (words.length < 7 + SIGNATURE_WORDS) throw new Error('Invoice is too short.');

  const timestamp = wordsToInt(words.slice(0, 7));
  const tagged = words.slice(7, words.length - SIGNATURE_WORDS);

  let expirySeconds = DEFAULT_EXPIRY_SECONDS;
  let paymentHash: string | null = null;

  for (let index = 0; index + 3 <= tagged.length;) {
    const tag = tagged[index];
    const length = tagged[index + 1] * 32 + tagged[index + 2];
    const data = tagged.slice(index + 3, index + 3 + length);
    if (data.length !== length) throw new Error('Invoice field is truncated.');

    if (tag === TAG_PAYMENT_HASH && length === 52) paymentHash = wordsToHex(data, 32);
    if (tag === TAG_EXPIRY) expirySeconds = wordsToInt(data);

    index += 3 + length;
  }

  return {
    network,
    amountMsat,
    timestamp,
    expirySeconds,
    expiresAt: new Date((timestamp + expirySeconds) * 1000),
    paymentHash,
  };
}
