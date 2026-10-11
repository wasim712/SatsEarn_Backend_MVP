/**
 * Re-encrypts stored PII/payment fields with the current FIELD_ENCRYPTION_KEY (AES-256-GCM).
 *
 * Needed once after rotating keys: rows written with the old key (the old JWT_SECRET) stay
 * readable only while that key is listed in LEGACY_FIELD_ENCRYPTION_KEYS.
 *
 *   npm run reencrypt:fields            # dry run: counts what would change
 *   npm run reencrypt:fields -- --apply # writes the changes
 *
 * When a run with --apply reports 0 remaining and 0 failures, remove LEGACY_FIELD_ENCRYPTION_KEYS.
 */
import { prisma } from '../src/db/prisma.client';
import { CryptoUtil } from '../src/utils/crypto.util';

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 500;

const USER_FIELDS = [
  'phone',
  'registrationIp',
  'lastIpAddress',
  'twitterHandle',
  'instagramHandle',
  'telegramHandle',
  'discordHandle',
] as const;

const WITHDRAWAL_FIELDS = ['lightningInvoice', 'paymentProof'] as const;

type Stats = { scanned: number; fieldsToUpdate: number; failures: number };

function planUpdates<T extends Record<string, unknown>>(record: T, fields: readonly string[], label: string, stats: Stats) {
  const updates: Record<string, string | null> = {};

  for (const field of fields) {
    const value = record[field] as string | null | undefined;
    if (!CryptoUtil.needsReencryption(value)) continue;

    try {
      updates[field] = CryptoUtil.reencrypt(value);
      stats.fieldsToUpdate += 1;
    } catch {
      stats.failures += 1;
      console.error(`  cannot decrypt ${label}.${field} (id ${record.id}) with any configured key`);
    }
  }

  return updates;
}

async function reencryptUsers() {
  const stats: Stats = { scanned: 0, fieldsToUpdate: 0, failures: 0 };
  let cursor: string | undefined;

  for (;;) {
    const users = await prisma.user.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        otpCode: true,
        otpPurpose: true,
        phone: true,
        registrationIp: true,
        lastIpAddress: true,
        twitterHandle: true,
        instagramHandle: true,
        telegramHandle: true,
        discordHandle: true,
      },
    });
    if (users.length === 0) break;

    for (const user of users) {
      stats.scanned += 1;
      const updates: Record<string, string | null | Date> = planUpdates(user, USER_FIELDS, 'User', stats);

      // Codes from before purpose-bound hashing were encrypted; they expire in 15 minutes anyway.
      if (!user.otpPurpose && user.otpCode?.startsWith('enc')) {
        Object.assign(updates, { otpCode: null, otpExpiresAt: null });
        stats.fieldsToUpdate += 1;
      }

      if (APPLY && Object.keys(updates).length > 0) {
        await prisma.user.update({ where: { id: user.id }, data: updates });
      }
    }

    cursor = users[users.length - 1].id;
  }

  return stats;
}

async function reencryptWithdrawals() {
  const stats: Stats = { scanned: 0, fieldsToUpdate: 0, failures: 0 };
  let cursor: string | undefined;

  for (;;) {
    const withdrawals = await prisma.withdrawal.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, lightningInvoice: true, paymentProof: true },
    });
    if (withdrawals.length === 0) break;

    for (const withdrawal of withdrawals) {
      stats.scanned += 1;
      const updates = planUpdates(withdrawal, WITHDRAWAL_FIELDS, 'Withdrawal', stats);

      if (APPLY && Object.keys(updates).length > 0) {
        await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: updates as any });
      }
    }

    cursor = withdrawals[withdrawals.length - 1].id;
  }

  return stats;
}

async function main() {
  console.log(APPLY ? 'Re-encrypting fields (APPLY)…' : 'Dry run (pass --apply to write)…');

  const users = await reencryptUsers();
  const withdrawals = await reencryptWithdrawals();

  console.log(`Users:       scanned ${users.scanned}, fields ${APPLY ? 'updated' : 'to update'} ${users.fieldsToUpdate}, failures ${users.failures}`);
  console.log(`Withdrawals: scanned ${withdrawals.scanned}, fields ${APPLY ? 'updated' : 'to update'} ${withdrawals.fieldsToUpdate}, failures ${withdrawals.failures}`);

  if (users.failures + withdrawals.failures > 0) {
    console.log('Some values could not be decrypted. Add the key that wrote them to LEGACY_FIELD_ENCRYPTION_KEYS and run again.');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('Re-encryption failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
