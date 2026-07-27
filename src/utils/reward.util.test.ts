import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDailyActivityStreak } from './reward.util';

// Regression tests for daily-streak evaluation.
//
// Context: streaks are bucketed into the user's LOCAL calendar day (User.timezone),
// not UTC. Two historical bugs motivated these:
//   1. Always-UTC bucketing undercounted streaks for users east/west of UTC —
//      an IST user active at 23:55 and again at 00:05 local is on two different
//      local days but the SAME UTC day, so their streak never advanced.
//   2. Because day buckets are derived from the CURRENT stored timezone, a
//      timezone change re-interpreted past activity and could fabricate a
//      2-day gap, silently wiping an unbroken streak.
//
// Do not "simplify" the elapsed-time guard in evaluateDailyActivityStreak out of
// existence — case "timezone flip must not destroy a streak" covers it.

test('same local day: second task does not double-count', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T14:00:00Z'),
    3,
    new Date('2026-07-26T16:00:00Z'),
    'Asia/Calcutta',
  );
  assert.deepEqual(result, { nextStreak: 3, didCountToday: true, reset: false });
});

test('consecutive local days: streak increments', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T10:00:00Z'),
    5,
    new Date('2026-07-27T10:00:00Z'),
    'UTC',
  );
  assert.deepEqual(result, { nextStreak: 6, didCountToday: false, reset: false });
});

test('midnight rollover (UTC): 23:55 then 00:05 counts as 2 days', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T23:55:00Z'),
    1,
    new Date('2026-07-27T00:05:00Z'),
    'UTC',
  );
  assert.deepEqual(result, { nextStreak: 2, didCountToday: false, reset: false });
});

test('midnight rollover (IST): local 23:55 then 00:05 counts as 2 even though both are the same UTC day', () => {
  // 18:25Z and 18:35Z are both 2026-07-26 in UTC, but 07-26 and 07-27 in IST.
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T18:25:00Z'),
    1,
    new Date('2026-07-26T18:35:00Z'),
    'Asia/Calcutta',
  );
  assert.deepEqual(result, { nextStreak: 2, didCountToday: false, reset: false });
});

test('midnight rollover continues a longer run (5 -> 6)', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T18:25:00Z'),
    5,
    new Date('2026-07-26T18:35:00Z'),
    'Asia/Calcutta',
  );
  assert.equal(result.nextStreak, 6);
});

test('60 seconds across midnight still increments', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T23:59:30Z'),
    3,
    new Date('2026-07-27T00:00:30Z'),
    'UTC',
  );
  assert.equal(result.nextStreak, 4);
});

test('genuinely missed a day: streak resets', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-24T10:00:00Z'),
    5,
    new Date('2026-07-27T10:00:00Z'),
    'UTC',
  );
  assert.deepEqual(result, { nextStreak: 1, didCountToday: false, reset: true });
});

test('timezone flip must not destroy a streak when little real time has elapsed', () => {
  // Only 1.5h of wall-clock time passed. Any "2-day gap" here is an artifact of
  // re-bucketing under a different timezone, not a genuinely missed day.
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T23:30:00Z'),
    5,
    new Date('2026-07-27T01:00:00Z'),
    'Pacific/Kiritimati',
  );
  assert.equal(result.reset, false, 'a timezone re-interpretation must never reset a streak');
  assert.equal(result.nextStreak, 5, 'streak value must be preserved across a timezone flip');
});

test('no prior activity starts a fresh streak', () => {
  const result = evaluateDailyActivityStreak(null, 0, new Date('2026-07-27T10:00:00Z'), 'UTC');
  assert.deepEqual(result, { nextStreak: 1, didCountToday: false, reset: false });
});

test('clock skew (activity timestamped in the future) does not reset', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-28T10:00:00Z'),
    4,
    new Date('2026-07-27T10:00:00Z'),
    'UTC',
  );
  assert.equal(result.reset, false);
  assert.equal(result.nextStreak, 4);
});

test('invalid timezone falls back to UTC instead of throwing', () => {
  const result = evaluateDailyActivityStreak(
    new Date('2026-07-26T10:00:00Z'),
    2,
    new Date('2026-07-27T10:00:00Z'),
    'Not/AZone',
  );
  assert.equal(result.nextStreak, 3);
});
