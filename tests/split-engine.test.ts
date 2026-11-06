import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateGroupBalances,
  calculateSplitAmounts,
  formatMoney,
  getNetBalanceForUser,
  getUserById,
  simplifyDebts,
  type Expense,
  type SettlementRecord,
  type User,
} from "../lib/split-engine.ts";

const MEMBERS = ["a", "b", "c"];

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "e1",
    groupId: "g1",
    title: "Test",
    description: "",
    amount: 10000,
    paidBy: "a",
    date: "2026-11-01",
    splitType: "equal",
    splits: {},
    ...overrides,
  };
}

describe("calculateSplitAmounts", () => {
  it("splits equally and preserves the total", () => {
    const result = calculateSplitAmounts(expense({ amount: 9000 }), MEMBERS);
    assert.deepEqual(result, { a: 3000, b: 3000, c: 3000 });
    assert.equal(Object.values(result).reduce((s, v) => s + v, 0), 9000);
  });

  it("gives the first members the remainder units in equal splits", () => {
    const result = calculateSplitAmounts(expense({ amount: 10000 }), MEMBERS);
    assert.deepEqual(result, { a: 3334, b: 3333, c: 3333 });
    assert.equal(Object.values(result).reduce((s, v) => s + v, 0), 10000);
  });

  it("handles a single member for the full amount", () => {
    const result = calculateSplitAmounts(expense({ amount: 12345 }), ["a"]);
    assert.deepEqual(result, { a: 12345 });
  });

  it("returns an empty record for zero members", () => {
    const result = calculateSplitAmounts(expense({ amount: 100 }), []);
    assert.deepEqual(result, {});
  });

  it("handles zero and large-value amounts without drifting", () => {
    assert.deepEqual(calculateSplitAmounts(expense({ amount: 0 }), MEMBERS), { a: 0, b: 0, c: 0 });
    const large = calculateSplitAmounts(expense({ amount: 999999999 }), MEMBERS);
    assert.equal(Object.values(large).reduce((s, v) => s + v, 0), 999999999);
  });

  it("splits by exact amounts", () => {
    const result = calculateSplitAmounts(
      expense({ splitType: "unequal", splits: { a: 1000, b: 2000, c: 0 } }),
      MEMBERS,
    );
    assert.deepEqual(result, { a: 1000, b: 2000, c: 0 });
  });

  it("splits by percentage when percentages sum to 100", () => {
    const result = calculateSplitAmounts(
      expense({ amount: 10000, splitType: "percentage", splits: { a: 50, b: 30, c: 20 } }),
      MEMBERS,
    );
    assert.deepEqual(result, { a: 5000, b: 3000, c: 2000 });
  });

  it("preserves the total for percentage splits with rounding", () => {
    const result = calculateSplitAmounts(
      expense({ amount: 10001, splitType: "percentage", splits: { a: 33.333, b: 33.333, c: 33.334 } }),
      MEMBERS,
    );
    assert.equal(Object.values(result).reduce((s, v) => s + v, 0), 10001);
  });

  it("falls back to rounding when percentages do not sum to 100", () => {
    const result = calculateSplitAmounts(
      expense({ amount: 10000, splitType: "percentage", splits: { a: 50, b: 25, c: 0 } }),
      MEMBERS,
    );
    assert.deepEqual(result, { a: 5000, b: 2500, c: 0 });
  });

  it("splits by shares proportionally and preserves the total", () => {
    const result = calculateSplitAmounts(
      expense({ amount: 9000, splitType: "shares", splits: { a: 2, b: 1, c: 0 } }),
      MEMBERS,
    );
    assert.deepEqual(result, { a: 6000, b: 3000, c: 0 });
  });

  it("returns all zeros when total shares are zero", () => {
    const result = calculateSplitAmounts(
      expense({ amount: 9000, splitType: "shares", splits: {} }),
      MEMBERS,
    );
    assert.deepEqual(result, { a: 0, b: 0, c: 0 });
  });
});

describe("formatMoney", () => {
  it("formats minor units as major units with decimals", () => {
    assert.equal(formatMoney(12345, "USD"), "$123.45");
    assert.equal(formatMoney(0, "USD"), "$0");
    assert.equal(formatMoney(100, "USD"), "$1");
  });

  it("honors zero-decimal currencies", () => {
    assert.match(formatMoney(500, "JPY"), /5\s?¥?|¥5/);
  });

  it("formats large and negative amounts", () => {
    assert.equal(formatMoney(999999999, "USD"), "$99,99,999.99");
    assert.equal(formatMoney(-250, "USD"), "-$2.5");
  });
});

describe("calculateGroupBalances", () => {
  const group = { members: MEMBERS };

  it("returns zero balances with no activity", () => {
    assert.deepEqual(calculateGroupBalances(group, []), [
      { userId: "a", amount: 0 },
      { userId: "b", amount: 0 },
      { userId: "c", amount: 0 },
    ]);
  });

  it("credits the payer and debits everyone else", () => {
    const balances = calculateGroupBalances(group, [expense({ amount: 9000 })]);
    assert.deepEqual(balances, [
      { userId: "a", amount: 6000 },
      { userId: "b", amount: -3000 },
      { userId: "c", amount: -3000 },
    ]);
    assert.equal(balances.reduce((s, b) => s + b.amount, 0), 0);
  });

  it("applies only confirmed settlements", () => {
    const settlements: SettlementRecord[] = [
      { id: "s1", groupId: "g1", from: "b", to: "a", amount: 3000, status: "confirmed", date: "2026-11-02" },
      { id: "s2", groupId: "g1", from: "c", to: "a", amount: 3000, status: "pending", date: "2026-11-02" },
    ];
    const balances = calculateGroupBalances(group, [expense({ amount: 9000 })], settlements);
    assert.deepEqual(balances, [
      { userId: "a", amount: 3000 },
      { userId: "b", amount: 0 },
      { userId: "c", amount: -3000 },
    ]);
  });

  it("ignores settlements involving non-members", () => {
    const settlements: SettlementRecord[] = [
      { id: "s1", groupId: "g1", from: "x", to: "a", amount: 9999, status: "confirmed", date: "2026-11-02" },
    ];
    const balances = calculateGroupBalances(group, [], settlements);
    assert.deepEqual(balances, [
      { userId: "a", amount: 0 },
      { userId: "b", amount: 0 },
      { userId: "c", amount: 0 },
    ]);
  });
});

describe("simplifyDebts", () => {
  it("returns nothing when all balances are zero", () => {
    assert.deepEqual(simplifyDebts([{ userId: "a", amount: 0 }]), []);
  });

  it("returns nothing for a single member", () => {
    assert.deepEqual(simplifyDebts([{ userId: "a", amount: 5000 }]), []);
  });

  it("produces a minimal pairwise settlement", () => {
    const settlements = simplifyDebts([
      { userId: "a", amount: 6000 },
      { userId: "b", amount: -3000 },
      { userId: "c", amount: -3000 },
    ]);
    assert.deepEqual(settlements, [
      { from: "b", to: "a", amount: 3000 },
      { from: "c", to: "a", amount: 3000 },
    ]);
  });

  it("chains partial settlements across multiple creditors and debtors", () => {
    const settlements = simplifyDebts([
      { userId: "a", amount: 5000 },
      { userId: "b", amount: 3000 },
      { userId: "c", amount: -5000 },
      { userId: "d", amount: -3000 },
    ]);
    assert.equal(settlements.length, 2);
    assert.equal(settlements.reduce((s, x) => s + x.amount, 0), 8000);
    // Applying the suggestions zeroes every balance.
    const balances = new Map([
      ["a", 5000], ["b", 3000], ["c", -5000], ["d", -3000],
    ]);
    settlements.forEach((s) => {
      balances.set(s.from, (balances.get(s.from) ?? 0) + s.amount);
      balances.set(s.to, (balances.get(s.to) ?? 0) - s.amount);
    });
    balances.forEach((v) => assert.equal(v, 0));
  });

  it("ignores non-finite balances and handles large values", () => {
    const settlements = simplifyDebts([
      { userId: "a", amount: 999999999 },
      { userId: "b", amount: -999999999 },
      { userId: "c", amount: Number.NaN },
    ]);
    assert.deepEqual(settlements, [{ from: "b", to: "a", amount: 999999999 }]);
  });
});

describe("user helpers", () => {
  const users: User[] = [
    { id: "a", name: "Alice", email: "a@x.test", defaultCurrency: "USD" },
    { id: "b", name: "Bob", email: "b@x.test", defaultCurrency: "EUR" },
  ];

  it("finds a user by id", () => {
    assert.equal(getUserById(users, "b")?.name, "Bob");
    assert.equal(getUserById(users, "missing"), undefined);
  });

  it("returns the net balance or zero when absent", () => {
    const balances = [{ userId: "a", amount: 2500 }];
    assert.equal(getNetBalanceForUser(balances, "a"), 2500);
    assert.equal(getNetBalanceForUser(balances, "b"), 0);
  });
});
