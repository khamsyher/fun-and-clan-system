import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVITE_ALPHABET,
  INVITE_LENGTH,
  canRemind,
  canSwapRound,
  isCompleteOrder,
  isTodayOrLater,
  makeInviteCode,
  normalizeInviteCode,
  potFor,
  shuffled,
} from "./savings-rules";

test("makeInviteCode uses only unambiguous characters", () => {
  for (let i = 0; i < 200; i++) {
    const code = makeInviteCode();
    assert.equal(code.length, INVITE_LENGTH);
    for (const ch of code) assert.ok(INVITE_ALPHABET.includes(ch), ch);
  }
});

test("makeInviteCode is driven by the random source", () => {
  assert.equal(makeInviteCode(() => 0), "AAAAAA");
  assert.equal(makeInviteCode(() => 0.9999), "999999");
});

test("normalizeInviteCode accepts what people type", () => {
  assert.equal(normalizeInviteCode(" ab3-k7m "), "AB3K7M");
  assert.equal(normalizeInviteCode("ab3 k7m"), "AB3K7M");
  assert.equal(normalizeInviteCode("AB3K7"), null); // too short
  assert.equal(normalizeInviteCode("AB3K7O"), null); // O is not in the alphabet
  assert.equal(normalizeInviteCode(""), null);
});

test("potFor: the receiver does not pay themself", () => {
  assert.equal(potFor(100_000, 10), 900_000);
  assert.equal(potFor(100_000, 2), 100_000);
});

test("isCompleteOrder needs 1..n with no gaps or repeats", () => {
  assert.equal(isCompleteOrder([2, 1, 3]), true);
  assert.equal(isCompleteOrder([1]), false); // a group needs two people
  assert.equal(isCompleteOrder([1, 1]), false);
  assert.equal(isCompleteOrder([1, 3]), false);
  assert.equal(isCompleteOrder([1, null]), false);
  assert.equal(isCompleteOrder([0, 1]), false);
});

test("shuffled keeps every item and leaves the input alone", () => {
  const input = ["a", "b", "c", "d"];
  const out = shuffled(input, () => 0);
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, ["a", "b", "c", "d"]);
  assert.deepEqual(out, ["b", "c", "d", "a"]);
});

test("canRemind allows one reminder a day", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  assert.equal(canRemind(null, now), true);
  assert.equal(canRemind(new Date("2026-10-15T01:00:00Z"), now), false);
  assert.equal(canRemind(new Date("2026-10-14T12:00:00Z"), now), true);
});

test("isTodayOrLater", () => {
  assert.equal(isTodayOrLater("2026-10-15", "2026-10-15"), true);
  assert.equal(isTodayOrLater("2026-10-16", "2026-10-15"), true);
  assert.equal(isTodayOrLater("2026-10-14", "2026-10-15"), false);
  assert.equal(isTodayOrLater("2026-02-30", "2026-01-01"), false); // not a real date
  assert.equal(isTodayOrLater("15/10/2026", "2026-01-01"), false);
  assert.equal(isTodayOrLater("2032-01-01", "2026-10-15"), false); // more than 5 years ahead
});

test("canSwapRound: only someone who has not received any money yet", () => {
  assert.equal(canSwapRound("upcoming", []), true);
  assert.equal(canSwapRound("collecting", ["unpaid", "unpaid"]), true); // nobody has paid them yet
  assert.equal(canSwapRound("collecting", ["unpaid", "pending"]), false); // a slip is on its way
  assert.equal(canSwapRound("collecting", ["confirmed", "unpaid"]), false);
  assert.equal(canSwapRound("collecting", ["rejected"]), false); // money may have been sent
  assert.equal(canSwapRound("done", []), false);
});
