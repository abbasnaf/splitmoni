export type SplitMethod = "equal" | "unequal" | "percentage" | "shares";
export const EXPENSE_CATEGORIES = ["other", "groceries", "dining", "transport", "lodging", "entertainment", "utilities", "shopping"] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface User {
  id: string;
  name: string;
  email: string;
  defaultCurrency: string;
  emailVerifiedAt?: string | null;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  createdBy: string;
  members: string[];
  archivedAt?: string | null;
  hasLedgerActivity?: boolean;
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  description: string;
  amount: number;
  paidBy: string;
  date: string;
  splitType: SplitMethod;
  splits: Record<string, number>;
  category?: ExpenseCategory;
  merchant?: string;
  location?: string;
}

export interface Balance {
  userId: string;
  amount: number;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
}

export interface SettlementRecord extends Settlement {
  id: string;
  groupId: string;
  status: "confirmed" | "pending";
  date: string;
}

export function formatMoney(amount: number, currency = "INR") {
  const fractionDigits = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(amount / 100);
}

function distributeProportionally(total: number, memberIds: string[], weights: number[]) {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const results = Object.fromEntries(memberIds.map((id) => [id, 0]));
  if (totalWeight <= 0) return results;

  const portions = memberIds.map((id, index) => {
    const rawAmount = (total * weights[index]) / totalWeight;
    const wholeAmount = Math.floor(rawAmount);
    results[id] = wholeAmount;
    return { id, remainder: rawAmount - wholeAmount, index };
  });

  const remainingMinorUnits = total - Object.values(results).reduce((sum, value) => sum + value, 0);
  portions
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .slice(0, remainingMinorUnits)
    .forEach(({ id }) => { results[id] += 1; });

  return results;
}

export function calculateSplitAmounts(
  expense: Pick<Expense, "amount" | "splitType" | "splits">,
  memberIds: string[],
): Record<string, number> {
  const total = expense.amount;
  const results: Record<string, number> = {};

  memberIds.forEach((memberId) => {
    results[memberId] = 0;
  });

  if (memberIds.length === 0) {
    return results;
  }

  if (expense.splitType === "equal") {
    const perPerson = Math.floor(total / memberIds.length);
    const remainder = total - perPerson * memberIds.length;

    memberIds.forEach((memberId, index) => {
      results[memberId] = perPerson + (index < remainder ? 1 : 0);
    });

    return results;
  }

  if (expense.splitType === "unequal") {
    memberIds.forEach((memberId) => {
      results[memberId] = expense.splits[memberId] ?? 0;
    });

    return results;
  }

  if (expense.splitType === "percentage") {
    const weights = memberIds.map((memberId) => Math.max(0, expense.splits[memberId] ?? 0));
    const percentageTotal = weights.reduce((sum, value) => sum + value, 0);
    if (Math.abs(percentageTotal - 100) <= 0.001) {
      return distributeProportionally(total, memberIds, weights);
    }
    memberIds.forEach((memberId, index) => {
      results[memberId] = Math.round((total * weights[index]) / 100);
    });
    return results;
  }

  const totalShares = memberIds.reduce(
    (sum, memberId) => sum + (expense.splits[memberId] ?? 0),
    0,
  );

  if (totalShares === 0) return results;
  const weights = memberIds.map((memberId) => Math.max(0, expense.splits[memberId] ?? 0));
  return distributeProportionally(total, memberIds, weights);
}

export function calculateGroupBalances(
  group: Pick<Group, "members">,
  expenses: Expense[],
  settlements: SettlementRecord[] = [],
): Balance[] {
  const balances = new Map<string, number>();

  group.members.forEach((memberId) => balances.set(memberId, 0));

  expenses.forEach((expense) => {
    const splits = calculateSplitAmounts(expense, group.members);

    group.members.forEach((memberId) => {
      const share = splits[memberId] ?? 0;
      const current = balances.get(memberId) ?? 0;
      const delta = memberId === expense.paidBy ? expense.amount - share : -share;
      balances.set(memberId, current + delta);
    });
  });

  settlements
    .filter((settlement) => settlement.status === "confirmed")
    .forEach((settlement) => {
      if (!balances.has(settlement.from) || !balances.has(settlement.to)) return;
      balances.set(settlement.from, (balances.get(settlement.from) ?? 0) + settlement.amount);
      balances.set(settlement.to, (balances.get(settlement.to) ?? 0) - settlement.amount);
    });

  return Array.from(balances.entries()).map(([userId, amount]) => ({
    userId,
    amount,
  }));
}

export function simplifyDebts(balances: Balance[]): Settlement[] {
  const creditors = balances
    .filter((balance) => Number.isFinite(balance.amount) && balance.amount > 0)
    .map((balance) => ({ ...balance }))
    .sort((left, right) => right.amount - left.amount || left.userId.localeCompare(right.userId));

  const debtors = balances
    .filter((balance) => Number.isFinite(balance.amount) && balance.amount < 0)
    .map((balance) => ({ ...balance }))
    .sort((left, right) => left.amount - right.amount || left.userId.localeCompare(right.userId));

  const settlements: Settlement[] = [];

  if (creditors.length === 0 || debtors.length === 0) {
    return settlements;
  }

  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(-debtor.amount, creditor.amount);

    if (amount <= 0) {
      debtorIndex += 1;
      creditorIndex += 1;
      continue;
    }

    settlements.push({
      from: debtor.userId,
      to: creditor.userId,
      amount,
    });

    debtor.amount += amount;
    creditor.amount -= amount;

    if (debtor.amount === 0) {
      debtorIndex += 1;
    }

    if (creditor.amount === 0) {
      creditorIndex += 1;
    }
  }

  return settlements;
}

export function getUserById(users: User[], userId: string) {
  return users.find((user) => user.id === userId);
}

export function getNetBalanceForUser(balances: Balance[], userId: string) {
  return balances.find((balance) => balance.userId === userId)?.amount ?? 0;
}
