import type { Expense, Group, User } from "@/lib/split-engine";

export const users: User[] = [
  { id: "amanat", name: "Amanat", email: "amanat@example.com", defaultCurrency: "INR" },
  { id: "rahul", name: "Rahul", email: "rahul@example.com", defaultCurrency: "INR" },
  { id: "wasique", name: "Wasique", email: "wasique@example.com", defaultCurrency: "INR" },
  { id: "arjun", name: "Arjun", email: "arjun@example.com", defaultCurrency: "INR" },
];

export const groups: Group[] = [
  {
    id: "goa-trip-2026",
    name: "Goa Trip 2026",
    currency: "INR",
    createdBy: "amanat",
    members: ["amanat", "rahul", "wasique", "arjun"],
  },
];

export const expenses: Expense[] = [
  {
    id: "expense-hotel",
    groupId: "goa-trip-2026",
    title: "Hotel Stay",
    description: "Beachfront hotel for 3 nights",
    amount: 300000,
    paidBy: "amanat",
    date: "2026-11-05",
    splitType: "equal",
    splits: {},
  },
  {
    id: "expense-dinner",
    groupId: "goa-trip-2026",
    title: "Dinner",
    description: "Dinner at a local restaurant",
    amount: 200000,
    paidBy: "rahul",
    date: "2026-11-05",
    splitType: "unequal",
    splits: {
      amanat: 100000,
      rahul: 50000,
      wasique: 30000,
      arjun: 20000,
    },
  },
  {
    id: "expense-fuel",
    groupId: "goa-trip-2026",
    title: "Fuel",
    description: "Fuel for the rented scooter",
    amount: 100000,
    paidBy: "wasique",
    date: "2026-11-06",
    splitType: "percentage",
    splits: {
      amanat: 25,
      rahul: 25,
      wasique: 30,
      arjun: 20,
    },
  },
  {
    id: "expense-snacks",
    groupId: "goa-trip-2026",
    title: "Snacks",
    description: "Late-night snacks and coffee",
    amount: 120000,
    paidBy: "arjun",
    date: "2026-11-07",
    splitType: "shares",
    splits: {
      amanat: 2,
      rahul: 1,
      wasique: 2,
      arjun: 1,
    },
  },
];

export const activeGroup = groups[0];
