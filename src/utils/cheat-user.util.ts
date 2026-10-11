// The admin "cheat user" tooling writes balances, XP and premium straight onto one account,
// bypassing the ledger. It is test-only: off unless ENABLE_CHEAT_USER=true outside production,
// and the account comes from CHEAT_USER_EMAIL rather than being hard-coded.
export function getCheatUserEmail(): string | null {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_CHEAT_USER !== 'true') {
    return null;
  }

  return process.env.CHEAT_USER_EMAIL?.trim().toLowerCase() || null;
}
