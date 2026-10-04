import { describe, expect, it } from "vitest";
import {
  accountKey,
  accountLimit,
  afterFailure,
  clientAddress,
  isLocked,
  type ThrottleState,
} from "./throttle-policy";

const start = new Date("2026-10-04T12:00:00Z");
const minutes = (n: number) => new Date(start.getTime() + n * 60_000);

function failTimes(times: Date[]): ThrottleState | null {
  return times.reduce<ThrottleState | null>(
    (state, now) => afterFailure(state, now, accountLimit),
    null,
  );
}

describe("afterFailure", () => {
  it("locks after five failures inside the window, for fifteen minutes", () => {
    const four = failTimes([0, 1, 2, 3].map(minutes));
    expect(isLocked(four, minutes(3))).toBe(false);
    const five = afterFailure(four, minutes(4), accountLimit);
    expect(five.failures).toBe(5);
    expect(five.lockedUntil).toEqual(minutes(19));
    expect(isLocked(five, minutes(18))).toBe(true);
    expect(isLocked(five, minutes(19))).toBe(false);
  });

  it("starts counting again once the window has passed", () => {
    const state = failTimes([0, 1, 2, 3, 16].map(minutes));
    expect(state?.failures).toBe(1);
    expect(isLocked(state, minutes(16))).toBe(false);
  });

  it("keeps an existing lock when a new window starts during it", () => {
    const locked = failTimes([0, 1, 2, 3, 4].map(minutes));
    // Attempts while locked are refused before this runs, but stay safe if they arrive.
    const later = afterFailure(locked, minutes(15), accountLimit);
    expect(later.lockedUntil).toEqual(minutes(19));
  });
});

describe("keys and addresses", () => {
  it("normalizes usernames so case changes don't get extra attempts", () => {
    expect(accountKey("Hume", " Admin ")).toBe("user:hume:admin");
  });

  it("reads the first forwarded address", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientAddress(headers)).toBe("203.0.113.7");
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBeNull();
  });
});
