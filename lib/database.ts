import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { expenses as seedExpenses, groups as seedGroups, users as seedUsers } from "@/lib/mock-data";
import { calculateGroupBalances, calculateSplitAmounts, EXPENSE_CATEGORIES, type Expense, type Group, type SettlementRecord, type User } from "@/lib/split-engine";

export type RecordedSettlement = SettlementRecord;
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired" | "revoked";

export type GroupInvitation = {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  status: InvitationStatus;
  invitedAt: string;
  expiresAt: string | null;
};

const file = process.env.SPLITMONI_DB_PATH ?? join(process.cwd(), ".data", "splitmoni.sqlite");
mkdirSync(dirname(file), { recursive: true });
const db = new DatabaseSync(file, { timeout: 5000 });
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, default_currency TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS accounts (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, archived_at TEXT);
  CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL, PRIMARY KEY(group_id, user_id));
  CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', invited_at TEXT NOT NULL, token_hash TEXT, expires_at TEXT, accepted_by TEXT REFERENCES users(id), responded_at TEXT, created_by TEXT REFERENCES users(id), UNIQUE(group_id, email));
  CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), paid_by TEXT NOT NULL REFERENCES users(id), occurred_at TEXT NOT NULL, split_type TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'other', merchant TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE IF NOT EXISTS expense_splits (expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), value REAL NOT NULL CHECK(value >= 0), PRIMARY KEY(expense_id, user_id));
  CREATE TABLE IF NOT EXISTS expense_comments (id TEXT PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE, author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS recurring_expenses (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), source_expense_id TEXT NOT NULL UNIQUE REFERENCES expenses(id), template_json TEXT NOT NULL, frequency TEXT NOT NULL CHECK(frequency IN ('day','week','month')), interval INTEGER NOT NULL CHECK(interval BETWEEN 1 AND 12), next_run TEXT NOT NULL, paused_at TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS recurring_occurrences (recurring_id TEXT NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE, scheduled_date TEXT NOT NULL, expense_id TEXT NOT NULL UNIQUE REFERENCES expenses(id), PRIMARY KEY(recurring_id,scheduled_date));
  CREATE TABLE IF NOT EXISTS expense_attachments (id TEXT PRIMARY KEY, expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, content_hash TEXT NOT NULL, data BLOB NOT NULL, uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, UNIQUE(expense_id,content_hash));
  CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), paid_by TEXT NOT NULL REFERENCES users(id), paid_to TEXT NOT NULL REFERENCES users(id), amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), status TEXT NOT NULL DEFAULT 'confirmed', occurred_at TEXT NOT NULL, CHECK(paid_by != paid_to));
  CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), subject_type TEXT NOT NULL, subject_id TEXT NOT NULL, action TEXT NOT NULL, actor_id TEXT, summary TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS email_verifications (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK(purpose IN ('change','verify')), email TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
`);
const expenseColumns = db.prepare("PRAGMA table_info(expenses)").all() as Array<{ name: string }>;
if (!expenseColumns.some((column) => column.name === "status")) db.exec("ALTER TABLE expenses ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
if (!expenseColumns.some((column) => column.name === "category")) db.exec("ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'other'");
if (!expenseColumns.some((column) => column.name === "merchant")) db.exec("ALTER TABLE expenses ADD COLUMN merchant TEXT NOT NULL DEFAULT ''");
if (!expenseColumns.some((column) => column.name === "location")) db.exec("ALTER TABLE expenses ADD COLUMN location TEXT NOT NULL DEFAULT ''");
const groupColumns = db.prepare("PRAGMA table_info(groups)").all() as Array<{ name: string }>;
if (!groupColumns.some((column) => column.name === "archived_at")) db.exec("ALTER TABLE groups ADD COLUMN archived_at TEXT");
const recurringColumns = db.prepare("PRAGMA table_info(recurring_expenses)").all() as Array<{ name: string }>;
if (!recurringColumns.some((column) => column.name === "source_expense_id")) {
  db.exec("ALTER TABLE recurring_expenses ADD COLUMN source_expense_id TEXT REFERENCES expenses(id)");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS recurring_expenses_source_expense_id ON recurring_expenses(source_expense_id) WHERE source_expense_id IS NOT NULL");
}
const invitationColumns = db.prepare("PRAGMA table_info(invitations)").all() as Array<{ name: string }>;
if (!invitationColumns.some((column) => column.name === "token_hash")) db.exec("ALTER TABLE invitations ADD COLUMN token_hash TEXT");
if (!invitationColumns.some((column) => column.name === "expires_at")) db.exec("ALTER TABLE invitations ADD COLUMN expires_at TEXT");
if (!invitationColumns.some((column) => column.name === "accepted_by")) db.exec("ALTER TABLE invitations ADD COLUMN accepted_by TEXT REFERENCES users(id)");
if (!invitationColumns.some((column) => column.name === "responded_at")) db.exec("ALTER TABLE invitations ADD COLUMN responded_at TEXT");
if (!invitationColumns.some((column) => column.name === "created_by")) db.exec("ALTER TABLE invitations ADD COLUMN created_by TEXT REFERENCES users(id)");

function transact<T>(action: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function recordAudit(
  groupId: string,
  subjectType: string,
  subjectId: string,
  action: string,
  actorId: string | null,
  summary: string,
) {
  db.prepare(
    "INSERT INTO audit_events(id,group_id,subject_type,subject_id,action,actor_id,summary,created_at) VALUES(?,?,?,?,?,?,?,?)",
  ).run(`audit-${randomBytes(8).toString("hex")}`, groupId, subjectType, subjectId, action, actorId, summary, new Date().toISOString());
}

/*
 * Demo data is opt-in: production onboarding goes through sign-up. Set
 * SPLITMONI_DEMO_ENABLED=1 to restore the seeded demo users and credentials on
 * a fresh database.
 */
const demoDataEnabled = ["1", "true", "yes"].includes((process.env.SPLITMONI_DEMO_ENABLED ?? "").trim().toLowerCase());

function seed() {
  if (!demoDataEnabled) return;
  const count = Number((db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count);
  if (count > 0) return;
  transact(() => {
    const addUser = db.prepare("INSERT INTO users(id,name,email,default_currency) VALUES(?,?,?,?)");
    seedUsers.forEach((user) => addUser.run(user.id, user.name, user.email, user.defaultCurrency));
    const addGroup = db.prepare("INSERT INTO groups(id,name,currency,created_by,created_at) VALUES(?,?,?,?,?)");
    const addMember = db.prepare("INSERT INTO group_members(group_id,user_id,joined_at) VALUES(?,?,?)");
    seedGroups.forEach((group) => {
      addGroup.run(group.id, group.name, group.currency, group.createdBy, new Date().toISOString());
      group.members.forEach((userId) => addMember.run(group.id, userId, new Date().toISOString()));
    });
    const addExpense = db.prepare("INSERT INTO expenses(id,group_id,title,description,amount_minor,paid_by,occurred_at,split_type,created_at) VALUES(?,?,?,?,?,?,?,?,?)");
    const addSplit = db.prepare("INSERT INTO expense_splits(expense_id,user_id,value) VALUES(?,?,?)");
    seedExpenses.forEach((expense) => {
      addExpense.run(expense.id, expense.groupId, expense.title, expense.description, expense.amount, expense.paidBy, expense.date, expense.splitType, new Date().toISOString());
      const group = seedGroups.find((item) => item.id === expense.groupId)!;
      const values = expense.splitType === "equal"
        ? calculateSplitAmounts(expense, group.members)
        : expense.splits;
      group.members.forEach((userId) => addSplit.run(expense.id, userId, values[userId] ?? 0));
    });
  });
}

seed();

if (demoDataEnabled) {
  const demoAccount = db.prepare("SELECT user_id FROM accounts WHERE user_id='amanat'").get();
  if (!demoAccount) {
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync("password123", salt, 64).toString("hex");
    db.prepare("INSERT OR IGNORE INTO accounts(user_id,salt,password_hash,created_at) VALUES('amanat',?,?,?)").run(salt, passwordHash, new Date().toISOString());
  }
}

db.prepare("DELETE FROM password_resets WHERE expires_at<=?").run(new Date().toISOString());
db.prepare("DELETE FROM email_verifications WHERE expires_at<=?").run(new Date().toISOString());
db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(new Date().toISOString());

const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === "email_verified_at")) db.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT");

function userById(userId: string): User | null {
  return (db.prepare("SELECT id,name,email,default_currency AS defaultCurrency,email_verified_at AS emailVerifiedAt FROM users WHERE id=?").get(userId) as unknown as User | undefined) ?? null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/*
 * Intl.NumberFormat only verifies that a currency code is well formed, so a
 * fictional code like "XYZ" formats without error. Where the runtime exposes
 * the actual ISO 4217 list, validate against it.
 */
function isSupportedCurrencyCode(currency: string) {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("currency");
  if (supported) return supported.includes(currency);
  try {
    return /^[A-Z]{3}$/.test(currency) && !new Intl.NumberFormat("en", { style: "currency", currency }).format(1).startsWith(currency);
  } catch {
    return false;
  }
}

export function createAccount(input: { name: string; email: string; password: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2 || name.length > 80) throw new Error("Enter a name between 2 and 80 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.password.length < 8 || input.password.length > 128) throw new Error("Password must be 8 to 128 characters.");
  const id = `user-${randomBytes(12).toString("hex")}`;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(input.password, salt, 64).toString("hex");
  try {
    transact(() => {
      db.prepare("INSERT INTO users(id,name,email,default_currency) VALUES(?,?,?,'INR')").run(id, name, email);
      db.prepare("INSERT INTO accounts(user_id,salt,password_hash,created_at) VALUES(?,?,?,?)").run(id, salt, passwordHash, new Date().toISOString());
    });
  } catch {
    throw new Error("An account with that email already exists.");
  }
  return userById(id)!;
}

export function authenticateAccount(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  const row = db.prepare("SELECT users.id,accounts.salt,accounts.password_hash AS passwordHash FROM users JOIN accounts ON accounts.user_id=users.id WHERE users.email=?").get(email) as unknown as { id: string; salt: string; passwordHash: string } | undefined;
  if (!row || password.length > 128) throw new Error("Email or password is incorrect.");
  const candidate = scryptSync(password, row.salt, 64);
  const expected = Buffer.from(row.passwordHash, "hex");
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) throw new Error("Email or password is incorrect.");
  return userById(row.id)!;
}

export function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(hashToken(token), userId, expiresAt, new Date().toISOString());
  return { token, expiresAt };
}

export function findSessionUser(token: string) {
  const hash = hashToken(token);
  const row = db.prepare("SELECT user_id AS userId,expires_at AS expiresAt FROM sessions WHERE token_hash=?").get(hash) as unknown as { userId: string; expiresAt: string } | undefined;
  if (!row) return null;
  if (row.expiresAt <= new Date().toISOString()) {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hash);
    return null;
  }
  return userById(row.userId);
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token_hash=?").run(hashToken(token));
}

export function updateUserProfile(userId: string, input: { name?: string; defaultCurrency?: string }) {
  const current = userById(userId);
  if (!current) throw new Error("Account not found.");
  const name = input.name === undefined ? current.name : input.name.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Enter a name between 2 and 80 characters.");
  const defaultCurrency = input.defaultCurrency === undefined ? current.defaultCurrency : input.defaultCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(defaultCurrency) || !isSupportedCurrencyCode(defaultCurrency)) throw new Error("Choose a supported currency.");
  db.prepare("UPDATE users SET name=?,default_currency=? WHERE id=?").run(name, defaultCurrency, userId);
  return userById(userId)!;
}

function assertAccountPassword(userId: string, passwordInput: string, failureMessage: string) {
  const account = db.prepare("SELECT salt,password_hash AS passwordHash FROM accounts WHERE user_id=?").get(userId) as { salt: string; passwordHash: string } | undefined;
  if (!account) throw new Error("Account not found.");
  if (passwordInput.length > 128) throw new Error(failureMessage);
  const candidate = scryptSync(passwordInput, account.salt, 64);
  const expected = Buffer.from(account.passwordHash, "hex");
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) throw new Error(failureMessage);
}

export function changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionToken?: string) {
  assertAccountPassword(userId, currentPassword, "Your current password is incorrect.");
  if (newPassword.length < 8 || newPassword.length > 128) throw new Error("New password must be 8 to 128 characters.");
  if (newPassword === currentPassword) throw new Error("Choose a new password that is different from your current password.");
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(newPassword, salt, 64).toString("hex");
  transact(() => {
    db.prepare("UPDATE accounts SET salt=?,password_hash=? WHERE user_id=?").run(salt, passwordHash, userId);
    if (keepSessionToken) {
      db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash!=?").run(userId, hashToken(keepSessionToken));
    } else {
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
    }
  });
}

/*
 * Password reset links expire after one hour and are single-use; only the
 * SHA-256 hash of the token is stored, matching invitation token handling.
 */
export function createPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const account = db.prepare("SELECT users.id FROM users JOIN accounts ON accounts.user_id=users.id WHERE lower(users.email)=?").get(email) as { id: string } | undefined;
  if (!account) return null;
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  transact(() => {
    db.prepare("DELETE FROM password_resets WHERE user_id=? OR expires_at<=?").run(account.id, now.toISOString());
    db.prepare("INSERT INTO password_resets(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(hashToken(token), account.id, new Date(now.getTime() + 60 * 60 * 1000).toISOString(), now.toISOString());
  });
  return token;
}

export function resetPassword(token: string, newPassword: string) {
  if (newPassword.length < 8 || newPassword.length > 128) throw new Error("Password must be 8 to 128 characters.");
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  transact(() => {
    const reset = db.prepare("SELECT user_id AS userId FROM password_resets WHERE token_hash=? AND expires_at>?").get(tokenHash, now) as { userId: string } | undefined;
    if (!reset) throw new Error("This password reset link is invalid or has expired. Request a new reset link.");
    db.prepare("DELETE FROM password_resets WHERE token_hash=?").run(tokenHash);
    db.prepare("DELETE FROM password_resets WHERE user_id=?").run(reset.userId);
    const salt = randomBytes(16).toString("hex");
    const passwordHash = scryptSync(newPassword, salt, 64).toString("hex");
    db.prepare("UPDATE accounts SET salt=?,password_hash=? WHERE user_id=?").run(salt, passwordHash, reset.userId);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(reset.userId);
  });
}

/*
 * Email links expire after one hour and are single-use; only the SHA-256 hash
 * of the token is stored. Purpose "verify" confirms the address currently on
 * the account; purpose "change" confirms a pending new address.
 */
function createEmailVerification(userId: string, purpose: "change" | "verify", email: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  transact(() => {
    db.prepare("DELETE FROM email_verifications WHERE user_id=? AND purpose=?").run(userId, purpose);
    db.prepare("INSERT INTO email_verifications(token_hash,user_id,purpose,email,expires_at,created_at) VALUES(?,?,?,?,?,?)").run(hashToken(token), userId, purpose, email, new Date(now.getTime() + 60 * 60 * 1000).toISOString(), now.toISOString());
  });
  return token;
}

export function requestEmailVerification(userId: string) {
  const user = userById(userId);
  if (!user) throw new Error("Account not found.");
  if (user.emailVerifiedAt) throw new Error("This email address is already verified.");
  const email = user.email.toLowerCase();
  return { email, token: createEmailVerification(userId, "verify", email) };
}

export function requestEmailChange(userId: string, currentPassword: string, newEmailInput: string) {
  assertAccountPassword(userId, currentPassword, "Your password is incorrect.");
  const email = newEmailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  const user = userById(userId);
  if (!user) throw new Error("Account not found.");
  if (user.email.toLowerCase() === email) throw new Error("That is already your email address.");
  if (db.prepare("SELECT 1 FROM users WHERE lower(email)=?").get(email)) throw new Error("That email address is already in use by another account.");
  return { email, token: createEmailVerification(userId, "change", email) };
}

export function confirmEmailToken(token: string) {
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  return transact(() => {
    const row = db.prepare("SELECT user_id AS userId,purpose,email FROM email_verifications WHERE token_hash=? AND expires_at>?").get(tokenHash, now) as { userId: string; purpose: "change" | "verify"; email: string } | undefined;
    if (!row) throw new Error("This email link is invalid or has expired. Request a new link from account settings.");
    db.prepare("DELETE FROM email_verifications WHERE token_hash=?").run(tokenHash);
    db.prepare("DELETE FROM email_verifications WHERE user_id=? AND purpose=?").run(row.userId, row.purpose);
    if (row.purpose === "verify") {
      const user = db.prepare("SELECT lower(email) AS email FROM users WHERE id=?").get(row.userId) as { email: string } | undefined;
      if (!user || user.email !== row.email) throw new Error("Your email address changed since this link was requested. Request a new verification link.");
      db.prepare("UPDATE users SET email_verified_at=? WHERE id=?").run(now, row.userId);
      return "Your email address is now verified.";
    }
    if (db.prepare("SELECT 1 FROM users WHERE lower(email)=? AND id!=?").get(row.email, row.userId)) {
      throw new Error("That email address has been claimed by another account. Start the email change again in account settings.");
    }
    db.prepare("UPDATE users SET email=?,email_verified_at=? WHERE id=?").run(row.email, now, row.userId);
    return "Your email address has been updated and verified.";
  });
}

/*
 * Account deletion policy:
 *  1. Requires re-authentication with the current password.
 *  2. Groups the user owns alone are deleted entirely, ledger records included -
 *     nobody else depended on that history.
 *  3. Groups the user owns with other members are handed to the longest-standing
 *     remaining member before access is removed.
 *  4. Memberships without ledger activity are removed; memberships inside group
 *     history are kept so past splits and balances stay reconcilable.
 *  5. Login data (accounts, sessions, pending tokens) is removed, and pending
 *     invitations addressed to the account are revoked.
 *  6. The retained identity row is anonymized to a "Deleted account" placeholder
 *     with an unreachable email so expenses, splits, and repayments that mention
 *     it keep resolving. Shared financial history therefore never disappears.
 */
export function deleteAccount(userId: string, currentPassword: string) {
  assertAccountPassword(userId, currentPassword, "Your password is incorrect.");
  transact(() => {
    const user = userById(userId);
    if (!user) throw new Error("Account not found.");
    const memberships = db.prepare(`
      SELECT groups.id AS groupId, groups.created_by AS createdBy
      FROM groups JOIN group_members ON group_members.group_id=groups.id
      WHERE group_members.user_id=?
    `).all(userId) as Array<{ groupId: string; createdBy: string }>;

    const hasLedgerActivity = (groupId: string) =>
      Boolean(db.prepare(`
        SELECT 1 FROM expenses WHERE group_id=?
        UNION ALL SELECT 1 FROM settlements WHERE group_id=?
        LIMIT 1
      `).get(groupId, groupId));

    const deleteGroupCompletely = (groupId: string) => {
      db.prepare("DELETE FROM audit_events WHERE group_id=?").run(groupId);
      db.prepare("DELETE FROM recurring_expenses WHERE group_id=?").run(groupId);
      db.prepare("DELETE FROM settlements WHERE group_id=?").run(groupId);
      db.prepare("DELETE FROM invitations WHERE group_id=?").run(groupId);
      db.prepare("DELETE FROM expenses WHERE group_id=?").run(groupId);
      db.prepare("DELETE FROM group_members WHERE group_id=?").run(groupId);
      db.prepare("DELETE FROM groups WHERE id=?").run(groupId);
    };

    for (const membership of memberships) {
      if (membership.createdBy === userId) {
        const remainingOwners = db.prepare("SELECT user_id AS userId FROM group_members WHERE group_id=? AND user_id!=? ORDER BY joined_at,user_id LIMIT 1").all(membership.groupId, userId) as Array<{ userId: string }>;
        if (remainingOwners.length === 0) {
          deleteGroupCompletely(membership.groupId);
          continue;
        }
        db.prepare("UPDATE groups SET created_by=? WHERE id=?").run(remainingOwners[0].userId, membership.groupId);
      }
      if (!hasLedgerActivity(membership.groupId)) {
        db.prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?").run(membership.groupId, userId);
      }
    }

    db.prepare("DELETE FROM invitations WHERE status='pending' AND lower(email)=?").run(user.email.toLowerCase());
    db.prepare("UPDATE invitations SET created_by=NULL WHERE created_by=?").run(userId);
    db.prepare("UPDATE invitations SET accepted_by=NULL WHERE accepted_by=?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM password_resets WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM email_verifications WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM accounts WHERE user_id=?").run(userId);
    const tombstoneEmail = `deleted-${randomBytes(8).toString("hex")}@accounts.splitmoni.invalid`;
    db.prepare("UPDATE users SET name='Deleted account', email=?, email_verified_at=NULL WHERE id=?").run(tombstoneEmail, userId);
  });
}

export function readAppState(currentUserId: string) {
  const currentUser = userById(currentUserId);
  if (!currentUser) throw new Error("Account not found.");
  const groupRows = db.prepare(`
    SELECT groups.id,groups.name,groups.currency,groups.created_by AS createdBy,groups.archived_at AS archivedAt,
      CASE WHEN EXISTS(SELECT 1 FROM expenses WHERE expenses.group_id=groups.id)
        OR EXISTS(SELECT 1 FROM settlements WHERE settlements.group_id=groups.id)
        THEN 1 ELSE 0 END AS hasLedgerActivity
    FROM groups JOIN group_members ON group_members.group_id=groups.id
    WHERE group_members.user_id=? ORDER BY groups.created_at DESC
  `).all(currentUserId) as Array<Omit<Group, "members" | "hasLedgerActivity"> & { hasLedgerActivity: number }>;
  const groups: Group[] = groupRows.map((group) => ({
    ...group,
    hasLedgerActivity: Boolean(group.hasLedgerActivity),
    members: (db.prepare("SELECT user_id FROM group_members WHERE group_id=? ORDER BY joined_at").all(group.id) as Array<{ user_id: string }>).map((row) => row.user_id),
  }));
  const memberIds = new Set(groups.flatMap((group) => group.members));
  memberIds.add(currentUserId);
  const users = Array.from(memberIds, (id) => userById(id)).filter((user): user is User => Boolean(user));
  const groupIds = groups.map((group) => group.id);
  const placeholders = groupIds.length ? groupIds.map(() => "?").join(",") : "NULL";
  const expenseRows = db.prepare(`SELECT id,group_id AS groupId,title,description,amount_minor AS amount,paid_by AS paidBy,occurred_at AS date,split_type AS splitType,category,merchant,location FROM expenses WHERE status='active' AND group_id IN (${placeholders}) ORDER BY occurred_at DESC,created_at DESC`).all(...groupIds) as Array<Omit<Expense, "splits">>;
  const expenses: Expense[] = expenseRows.map((expense) => ({
    ...expense,
    splits: Object.fromEntries((db.prepare("SELECT user_id,value FROM expense_splits WHERE expense_id=?").all(expense.id) as Array<{ user_id: string; value: number }>).map((row) => [row.user_id, row.value])),
  }));
  const settlements = db.prepare(`SELECT id,group_id AS groupId,paid_by AS 'from',paid_to AS 'to',amount_minor AS amount,status,occurred_at AS date FROM settlements WHERE group_id IN (${placeholders}) ORDER BY occurred_at DESC`).all(...groupIds) as unknown as RecordedSettlement[];
  const ownedGroupIds = groups.filter((group) => group.createdBy === currentUserId).map((group) => group.id);
  const invitePlaceholders = ownedGroupIds.length ? ownedGroupIds.map(() => "?").join(",") : "NULL";
  const inviteRows = db.prepare(`SELECT id,group_id AS groupId,email,CASE WHEN status='pending' AND expires_at IS NOT NULL AND expires_at<=? THEN 'expired' ELSE status END AS status,invited_at AS invitedAt,expires_at AS expiresAt FROM invitations WHERE group_id IN (${invitePlaceholders}) ORDER BY invited_at DESC`).all(new Date().toISOString(), ...ownedGroupIds) as Array<{ id: string; groupId: string; email: string; status: InvitationStatus; invitedAt: string; expiresAt: string | null }>;
  const invites: Record<string, typeof inviteRows> = {};
  inviteRows.forEach((invite) => (invites[invite.groupId] ??= []).push(invite));
  return { currentUser, users, groups, expenses, settlements, invites: Object.fromEntries(Object.entries(invites).map(([key, value]) => [key, value ?? []])) };
}

export function createGroup(input: { group: Pick<Group, "id" | "name" | "currency" | "members"> }, currentUserId: string) {
  const group = input.group;
  if (!group.members.includes(currentUserId) || group.members.length !== 1 || group.members[0] !== currentUserId) throw new Error("A new group must start with the signed-in account as its only member.");
  if (!/^[a-z0-9-]{1,120}$/.test(group.id)) throw new Error("Group identifier is invalid.");
  if (!group.name.trim() || group.name.trim().length > 80 || !group.currency || !/^[A-Z]{3}$/.test(group.currency)) throw new Error("Enter a group name and a valid three-letter currency.");
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: group.currency });
  } catch {
    throw new Error("Choose a supported currency.");
  }
  transact(() => {
    db.prepare("INSERT INTO groups(id,name,currency,created_by,created_at) VALUES(?,?,?,?,?)").run(group.id, group.name.trim(), group.currency, currentUserId, new Date().toISOString());
    db.prepare("INSERT INTO group_members(group_id,user_id,joined_at) VALUES(?,?,?)").run(group.id, currentUserId, new Date().toISOString());
  });
}

function assertGroupOwner(groupId: string, currentUserId: string, allowArchived = false) {
  const group = db.prepare("SELECT created_by AS createdBy,archived_at AS archivedAt FROM groups WHERE id=?").get(groupId) as { createdBy: string; archivedAt: string | null } | undefined;
  if (!group) throw new Error("Group not found.");
  if (group.createdBy !== currentUserId) throw new Error("Only the group owner can manage group membership.");
  if (group.archivedAt && !allowArchived) throw new Error("This group is archived.");
  return group;
}

function invitationRows(groupId: string) {
  return db.prepare("SELECT id,group_id AS groupId,email,CASE WHEN status='pending' AND expires_at IS NOT NULL AND expires_at<=? THEN 'expired' ELSE status END AS status,invited_at AS invitedAt,expires_at AS expiresAt FROM invitations WHERE group_id=? ORDER BY invited_at DESC").all(new Date().toISOString(), groupId) as Array<Omit<GroupInviteRow, "tokenHash" | "createdBy">>;
}

type GroupInviteRow = {
  id: string;
  groupId: string;
  email: string;
  status: InvitationStatus;
  invitedAt: string;
  expiresAt: string | null;
  tokenHash: string | null;
  createdBy: string | null;
};

function makeInvitation(groupId: string, email: string, currentUserId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const invitedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const existing = db.prepare("SELECT id FROM invitations WHERE group_id=? AND email=?").get(groupId, email) as { id: string } | undefined;
  const id = existing?.id ?? `invite-${randomBytes(16).toString("hex")}`;
  db.prepare(`
    INSERT INTO invitations(id,group_id,email,status,invited_at,token_hash,expires_at,accepted_by,responded_at,created_by)
    VALUES(?,?,?,'pending',?,?,?,NULL,NULL,?)
    ON CONFLICT(group_id,email) DO UPDATE SET
      status='pending',invited_at=excluded.invited_at,token_hash=excluded.token_hash,
      expires_at=excluded.expires_at,accepted_by=NULL,responded_at=NULL,created_by=excluded.created_by
  `).run(id, groupId, email, invitedAt, hashToken(token), expiresAt, currentUserId);
  return { id, email, token };
}

export function addInvitations(groupId: string, emails: string[], currentUserId: string) {
  assertGroupOwner(groupId, currentUserId);
  if (emails.length === 0 || emails.length > 20) throw new Error("Invite between 1 and 20 people at a time.");
  const normalized = [...new Set(emails.map((email) => email.trim().toLowerCase()))];
  if (normalized.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error("Enter valid email addresses for all invitees.");
  const group = db.prepare("SELECT name FROM groups WHERE id=?").get(groupId) as { name: string };
  const currentUser = userById(currentUserId)!;
  if (normalized.includes(currentUser.email.toLowerCase())) throw new Error("You are already a member of this group.");
  if (normalized.some((email) => db.prepare("SELECT 1 FROM group_members JOIN users ON users.id=group_members.user_id WHERE group_members.group_id=? AND lower(users.email)=?").get(groupId, email))) {
    throw new Error("One or more invitees are already group members.");
  }
  const deliveries = transact(() => normalized.map((email) => makeInvitation(groupId, email, currentUserId)));
  return { groupName: group.name, invites: invitationRows(groupId), deliveries };
}

export function resendInvitation(groupId: string, invitationId: string, currentUserId: string) {
  assertGroupOwner(groupId, currentUserId);
  const row = db.prepare("SELECT email,CASE WHEN status='pending' AND expires_at<=? THEN 'expired' ELSE status END AS status FROM invitations WHERE id=? AND group_id=?").get(new Date().toISOString(), invitationId, groupId) as { email: string; status: InvitationStatus } | undefined;
  if (!row || !["pending", "expired"].includes(row.status)) throw new Error("Only pending or expired invitations can be resent.");
  const group = db.prepare("SELECT name FROM groups WHERE id=?").get(groupId) as { name: string };
  const delivery = transact(() => makeInvitation(groupId, row.email, currentUserId));
  return { groupName: group.name, invite: { id: delivery.id, groupId, email: delivery.email, status: "pending" as const, invitedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }, delivery };
}

export function revokeInvitation(groupId: string, invitationId: string, currentUserId: string) {
  assertGroupOwner(groupId, currentUserId);
  const result = db.prepare("UPDATE invitations SET status='revoked',token_hash=NULL,responded_at=? WHERE id=? AND group_id=? AND status='pending' AND (expires_at IS NULL OR expires_at>?)").run(new Date().toISOString(), invitationId, groupId, new Date().toISOString());
  if (result.changes === 0) throw new Error("This invitation is no longer pending.");
  return invitationRows(groupId);
}

export function getInvitation(token: string): (GroupInvitation & { archived: boolean }) | null {
  const row = db.prepare(`
    SELECT invitations.id,invitations.group_id AS groupId,groups.name AS groupName,invitations.email,
      CASE WHEN invitations.status='pending' AND invitations.expires_at<=? THEN 'expired' ELSE invitations.status END AS status,
      invitations.invited_at AS invitedAt,invitations.expires_at AS expiresAt,groups.archived_at AS archivedAt
    FROM invitations JOIN groups ON groups.id=invitations.group_id WHERE invitations.token_hash=?
  `).get(new Date().toISOString(), hashToken(token)) as (GroupInvitation & { archivedAt: string | null }) | undefined;
  return row ? { ...row, archived: Boolean(row.archivedAt) } : null;
}

export function respondToInvitation(token: string, currentUserId: string, action: "accept" | "decline") {
  const invite = getInvitation(token);
  if (!invite || invite.status !== "pending" || invite.archived) throw new Error("This invitation is no longer available.");
  const user = userById(currentUserId);
  if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) throw new Error("Sign in with the email address this invitation was sent to.");
  if (action === "accept") {
    transact(() => {
      const current = getInvitation(token);
      if (!current || current.status !== "pending" || current.archived) throw new Error("This invitation is no longer available.");
      db.prepare("INSERT OR IGNORE INTO group_members(group_id,user_id,joined_at) VALUES(?,?,?)").run(invite.groupId, currentUserId, new Date().toISOString());
      const result = db.prepare("UPDATE invitations SET status='accepted',accepted_by=?,responded_at=?,token_hash=NULL WHERE id=? AND status='pending' AND expires_at>?").run(currentUserId, new Date().toISOString(), invite.id, new Date().toISOString());
      if (result.changes === 0) throw new Error("This invitation has expired or was already used.");
    });
  } else {
    const result = db.prepare("UPDATE invitations SET status='declined',responded_at=?,token_hash=NULL WHERE id=? AND status='pending' AND expires_at>?").run(new Date().toISOString(), invite.id, new Date().toISOString());
    if (result.changes === 0) throw new Error("This invitation has expired or was already used.");
  }
  return invite.groupId;
}

export function updateGroup(groupId: string, currentUserId: string, input: { name?: string; currency?: string; transferTo?: string; archive?: boolean }) {
  assertGroupOwner(groupId, currentUserId, input.archive === false);
  if (input.archive !== undefined) {
    transact(() => {
      db.prepare("UPDATE groups SET archived_at=? WHERE id=?").run(input.archive ? new Date().toISOString() : null, groupId);
      if (input.archive) {
        db.prepare("UPDATE invitations SET status='revoked',token_hash=NULL,responded_at=? WHERE group_id=? AND status='pending'").run(new Date().toISOString(), groupId);
      }
    });
    return;
  }
  const current = db.prepare("SELECT name,currency FROM groups WHERE id=?").get(groupId) as { name: string; currency: string };
  const name = input.name === undefined ? current.name : input.name.trim();
  const currency = input.currency === undefined ? current.currency : input.currency.toUpperCase();
  if (!name || name.length > 80) throw new Error("Group name must be between 1 and 80 characters.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Choose a valid three-letter currency.");
  try {
    new Intl.NumberFormat("en", { style: "currency", currency });
  } catch {
    throw new Error("Choose a supported currency.");
  }
  if (currency !== current.currency) {
    const hasLedger = db.prepare("SELECT 1 FROM expenses WHERE group_id=? UNION ALL SELECT 1 FROM settlements WHERE group_id=? LIMIT 1").get(groupId, groupId);
    if (hasLedger) throw new Error("Currency cannot be changed after expenses or repayments have been recorded.");
  }
  if (input.transferTo !== undefined) {
    if (input.transferTo === currentUserId || !db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(groupId, input.transferTo)) {
      throw new Error("Choose another active group member to become the owner.");
    }
    db.prepare("UPDATE groups SET name=?,currency=?,created_by=? WHERE id=?").run(name, currency, input.transferTo, groupId);
    return;
  }
  db.prepare("UPDATE groups SET name=?,currency=? WHERE id=?").run(name, currency, groupId);
}

export function removeGroupMember(groupId: string, memberId: string, currentUserId: string) {
  assertGroupOwner(groupId, currentUserId);
  if (memberId === currentUserId) throw new Error("Transfer group ownership before leaving the group.");
  const memberExists = db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(groupId, memberId);
  if (!memberExists) throw new Error("This person is not an active group member.");
  const hasLedger = db.prepare(`
    SELECT 1 FROM expenses WHERE group_id=?
    UNION ALL SELECT 1 FROM settlements WHERE group_id=?
    LIMIT 1
  `).get(groupId, groupId);
  if (hasLedger) throw new Error("Members cannot be removed after ledger activity because historical splits must remain intact. Archive the group instead.");
  db.prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?").run(groupId, memberId);
}

export function listGroupInvitations(groupId: string, currentUserId: string) {
  assertGroupOwner(groupId, currentUserId);
  return invitationRows(groupId);
}

/*
 * TODO: move invitation token generation and email delivery through a durable
 * outbox before running multiple server instances.
 */

export function saveExpense(expense: Expense, currentUserId: string) {
  const state = readAppState(currentUserId);
  const group = state.groups.find((item) => item.id === expense.groupId);
  if (!group) throw new Error("Group not found.");
  if (group.archivedAt) throw new Error("This group is archived and cannot be changed.");
  const existing = db.prepare("SELECT group_id AS groupId FROM expenses WHERE id=? AND status='active'").get(expense.id) as { groupId: string } | undefined;
  if (existing && existing.groupId !== expense.groupId) throw new Error("An expense cannot be moved to another group.");
  if (!expense.title.trim() || expense.title.trim().length > 80) throw new Error("Expense name must be between 1 and 80 characters.");
  const category = expense.category ?? "other";
  const merchant = expense.merchant?.trim() ?? "";
  const location = expense.location?.trim() ?? "";
  if (!EXPENSE_CATEGORIES.includes(category) || merchant.length > 100 || location.length > 120) throw new Error("Choose a supported category and keep merchant and location within their character limits.");
  if (!group.members.includes(expense.paidBy)) throw new Error("The payer must be a member of the group.");
  if (!Number.isSafeInteger(expense.amount) || expense.amount <= 0) throw new Error("Amount must be a positive number of minor currency units.");
  if (!["equal", "unequal", "percentage", "shares"].includes(expense.splitType)) throw new Error("Choose a supported split method.");
  const values = expense.splitType === "equal" ? {} : expense.splits;
  if (!expense.date || !/^\d{4}-\d{2}-\d{2}$/.test(expense.date) || Number.isNaN(Date.parse(`${expense.date}T00:00:00Z`))) throw new Error("Choose a valid expense date.");
  if (Object.keys(values).some((id) => !group.members.includes(id)) || Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Split values must be nonnegative and belong to group members.");
  if (expense.splitType === "unequal" && group.members.reduce((sum, id) => sum + (values[id] ?? 0), 0) !== expense.amount) throw new Error("Exact splits must add up to the expense total.");
  if (expense.splitType === "percentage" && Math.abs(group.members.reduce((sum, id) => sum + (values[id] ?? 0), 0) - 100) > 0.001) throw new Error("Percentages must add up to 100.");
  if (expense.splitType === "shares" && group.members.reduce((sum, id) => sum + (values[id] ?? 0), 0) <= 0) throw new Error("At least one share is required.");
  const calculated = calculateSplitAmounts({ ...expense, splits: values }, group.members);
  if (Object.values(calculated).reduce((sum, value) => sum + value, 0) !== expense.amount) throw new Error("Expense splits must reconcile to the total.");
  const isUpdate = Boolean(existing);
  transact(() => {
    db.prepare("INSERT INTO expenses(id,group_id,title,description,amount_minor,paid_by,occurred_at,split_type,category,merchant,location,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,amount_minor=excluded.amount_minor,paid_by=excluded.paid_by,occurred_at=excluded.occurred_at,split_type=excluded.split_type,category=excluded.category,merchant=excluded.merchant,location=excluded.location").run(expense.id, expense.groupId, expense.title.trim(), expense.description.trim(), expense.amount, expense.paidBy, expense.date, expense.splitType, category, merchant, location, new Date().toISOString());
    db.prepare("DELETE FROM expense_splits WHERE expense_id=?").run(expense.id);
    const addSplit = db.prepare("INSERT INTO expense_splits(expense_id,user_id,value) VALUES(?,?,?)");
    group.members.forEach((userId) => addSplit.run(expense.id, userId, values[userId] ?? 0));
    recordAudit(
      expense.groupId,
      "expense",
      expense.id,
      isUpdate ? "expense_updated" : "expense_created",
      currentUserId,
      `${isUpdate ? "Edited" : "Added"} expense: ${expense.title.trim()}`,
    );
  });
}

type ExpenseAttachmentMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
  canDelete: boolean;
};

function assertExpenseMember(expenseId: string, currentUserId: string, allowArchived = false) {
  const row = db.prepare(`
    SELECT expenses.group_id AS groupId,groups.created_by AS ownerId,groups.archived_at AS archivedAt
    FROM expenses JOIN groups ON groups.id=expenses.group_id
    JOIN group_members ON group_members.group_id=groups.id
    WHERE expenses.id=? AND expenses.status='active' AND group_members.user_id=?
  `).get(expenseId, currentUserId) as { groupId: string; ownerId: string; archivedAt: string | null } | undefined;
  if (!row) throw new Error("Expense not found or you do not have access.");
  if (row.archivedAt && !allowArchived) throw new Error("This group is archived and cannot be changed.");
  return row;
}

export function assertExpenseAttachmentUploadAccess(expenseId: string, currentUserId: string) {
  assertExpenseMember(expenseId, currentUserId);
}

export type ExpenseComment = {
  id: string;
  expenseId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
};

export function listExpenseComments(expenseId: string, currentUserId: string): ExpenseComment[] {
  const { ownerId } = assertExpenseMember(expenseId, currentUserId, true);
  return db.prepare(`
    SELECT c.id,c.expense_id AS expenseId,c.author_id AS authorId,u.name AS authorName,
      c.body,c.created_at AS createdAt,c.updated_at AS updatedAt
    FROM expense_comments c JOIN users u ON u.id=c.author_id
    WHERE c.expense_id=? ORDER BY c.created_at,c.id
  `).all(expenseId).map((row) => {
    const comment = row as Omit<ExpenseComment, "canManage">;
    return { ...comment, canManage: comment.authorId === currentUserId || ownerId === currentUserId };
  });
}

export function createExpenseComment(expenseId: string, currentUserId: string, body: string) {
  assertExpenseMember(expenseId, currentUserId);
  const normalized = body.trim();
  if (!normalized || normalized.length > 2000) throw new Error("Comments must be between 1 and 2,000 characters.");
  const now = new Date().toISOString();
  const id = `comment-${randomBytes(16).toString("hex")}`;
  db.prepare("INSERT INTO expense_comments(id,expense_id,author_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run(id, expenseId, currentUserId, normalized, now, now);
  return listExpenseComments(expenseId, currentUserId).find((comment) => comment.id === id)!;
}

export function updateExpenseComment(expenseId: string, commentId: string, currentUserId: string, body: string) {
  const expense = assertExpenseMember(expenseId, currentUserId);
  const comment = db.prepare("SELECT author_id AS authorId FROM expense_comments WHERE id=? AND expense_id=?")
    .get(commentId, expenseId) as { authorId: string } | undefined;
  if (!comment) throw new Error("Comment not found.");
  if (comment.authorId !== currentUserId && expense.ownerId !== currentUserId) throw new Error("Only the comment author or group owner can edit this comment.");
  const normalized = body.trim();
  if (!normalized || normalized.length > 2000) throw new Error("Comments must be between 1 and 2,000 characters.");
  db.prepare("UPDATE expense_comments SET body=?,updated_at=? WHERE id=? AND expense_id=?")
    .run(normalized, new Date().toISOString(), commentId, expenseId);
  return listExpenseComments(expenseId, currentUserId).find((item) => item.id === commentId)!;
}

export function deleteExpenseComment(expenseId: string, commentId: string, currentUserId: string) {
  const expense = assertExpenseMember(expenseId, currentUserId);
  const comment = db.prepare("SELECT author_id AS authorId FROM expense_comments WHERE id=? AND expense_id=?")
    .get(commentId, expenseId) as { authorId: string } | undefined;
  if (!comment) throw new Error("Comment not found.");
  if (comment.authorId !== currentUserId && expense.ownerId !== currentUserId) throw new Error("Only the comment author or group owner can delete this comment.");
  db.prepare("DELETE FROM expense_comments WHERE id=? AND expense_id=?").run(commentId, expenseId);
}

export type RecurringExpense = {
  id: string;
  groupId: string;
  title: string;
  frequency: "day" | "week" | "month";
  interval: number;
  nextRun: string;
  pausedAt: string | null;
};

function advanceRecurringDate(value: string, frequency: RecurringExpense["frequency"], interval: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (frequency === "day") date.setUTCDate(date.getUTCDate() + interval);
  if (frequency === "week") date.setUTCDate(date.getUTCDate() + interval * 7);
  if (frequency === "month") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + interval);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

export function createRecurringExpense(
  id: string,
  groupId: string,
  expenseId: string,
  currentUserId: string,
  frequency: RecurringExpense["frequency"],
  interval: number,
) {
  const access = assertExpenseMember(expenseId, currentUserId);
  if (access.groupId !== groupId) throw new Error("Expense does not belong to this group.");
  if (!["day", "week", "month"].includes(frequency) || !Number.isInteger(interval) || interval < 1 || interval > 12) {
    throw new Error("Choose a supported recurrence schedule.");
  }
  const existing = db.prepare("SELECT created_by AS createdBy,source_expense_id AS sourceExpenseId FROM recurring_expenses WHERE id=?").get(id) as { createdBy: string; sourceExpenseId: string | null } | undefined;
  if (existing) {
    if (existing.createdBy !== currentUserId || existing.sourceExpenseId !== expenseId) throw new Error("Recurring expense already exists.");
    return;
  }
  const existingSource = db.prepare("SELECT created_by AS createdBy FROM recurring_expenses WHERE source_expense_id=?").get(expenseId) as { createdBy: string } | undefined;
  if (existingSource) {
    if (existingSource.createdBy === currentUserId) return;
    throw new Error("This expense already has a recurring schedule.");
  }
  const row = db.prepare(`
    SELECT id,group_id AS groupId,title,description,amount_minor AS amount,paid_by AS paidBy,
      occurred_at AS date,split_type AS splitType,category,merchant,location
    FROM expenses WHERE id=? AND status='active'
  `).get(expenseId) as Omit<Expense, "splits"> | undefined;
  if (!row || row.groupId !== access.groupId) throw new Error("Expense not found.");
  const splits = Object.fromEntries(
    (db.prepare("SELECT user_id AS userId,value FROM expense_splits WHERE expense_id=?").all(expenseId) as Array<{ userId: string; value: number }>)
      .map((split) => [split.userId, split.value]),
  );
  const template = { ...row, splits } satisfies Expense;
  const now = new Date().toISOString();
  const idempotentRuleId = id.slice(0, 100);
  if (!idempotentRuleId) throw new Error("Recurring expense identifier is invalid.");
  db.prepare("INSERT INTO recurring_expenses(id,group_id,source_expense_id,template_json,frequency,interval,next_run,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .run(idempotentRuleId, access.groupId, expenseId, JSON.stringify(template), frequency, interval, advanceRecurringDate(row.date, frequency, interval), currentUserId, now);
}

function generateDueRecurringExpenses(groupId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const dueRules = db.prepare("SELECT id FROM recurring_expenses WHERE group_id=? AND paused_at IS NULL AND next_run<=? ORDER BY next_run,id")
    .all(groupId, today) as Array<{ id: string }>;
  for (const { id } of dueRules) {
    transact(() => {
      const rule = db.prepare(`
        SELECT id,group_id AS groupId,template_json AS templateJson,frequency,interval,next_run AS nextRun
        FROM recurring_expenses WHERE id=? AND group_id=? AND paused_at IS NULL
      `).get(id, groupId) as (Omit<RecurringExpense, "title" | "pausedAt"> & { templateJson: string }) | undefined;
      if (!rule || rule.nextRun > today) return;
      let nextRun = rule.nextRun;
      if (nextRun === today) {
        const template = JSON.parse(rule.templateJson) as Expense;
        const expenseId = `rec-${rule.id}-${nextRun}`;
        const groupMembers = db.prepare("SELECT user_id AS userId FROM group_members WHERE group_id=? ORDER BY joined_at,user_id")
          .all(groupId) as Array<{ userId: string }>;
        const memberIds = groupMembers.map((member) => member.userId);
        const generated: Expense = { ...template, id: expenseId, date: nextRun };
        const values = generated.splitType === "equal"
          ? calculateSplitAmounts(generated, memberIds)
          : generated.splits;
        db.prepare(`
          INSERT OR IGNORE INTO expenses(id,group_id,title,description,amount_minor,paid_by,occurred_at,split_type,category,merchant,location,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(expenseId, groupId, generated.title, generated.description, generated.amount, generated.paidBy, nextRun, generated.splitType, generated.category ?? "other", generated.merchant ?? "", generated.location ?? "", new Date().toISOString());
        const insertSplit = db.prepare("INSERT OR IGNORE INTO expense_splits(expense_id,user_id,value) VALUES(?,?,?)");
        memberIds.forEach((memberId) => insertSplit.run(expenseId, memberId, values[memberId] ?? 0));
        db.prepare("INSERT OR IGNORE INTO recurring_occurrences(recurring_id,scheduled_date,expense_id) VALUES(?,?,?)").run(rule.id, nextRun, expenseId);
      }
      do {
        nextRun = advanceRecurringDate(nextRun, rule.frequency, rule.interval);
      } while (nextRun <= today);
      db.prepare("UPDATE recurring_expenses SET next_run=? WHERE id=?").run(nextRun, rule.id);
    });
  }
}

export function listRecurringExpenses(groupId: string, currentUserId: string): RecurringExpense[] {
  const state = readAppState(currentUserId);
  const group = state.groups.find((item) => item.id === groupId);
  if (!group) throw new Error("Group not found or you do not have access.");
  if (!group.archivedAt) generateDueRecurringExpenses(groupId);
  return (db.prepare(`
    SELECT id,group_id AS groupId,frequency,interval,next_run AS nextRun,paused_at AS pausedAt,template_json AS templateJson
    FROM recurring_expenses WHERE group_id=? ORDER BY paused_at,next_run,id
  `).all(groupId) as Array<Omit<RecurringExpense, "title"> & { templateJson: string }>).map(({ templateJson, ...rule }) => ({
    ...rule,
    title: (JSON.parse(templateJson) as Expense).title,
  }));
}

export function generateDueRecurringExpensesForUser(currentUserId: string) {
  const state = readAppState(currentUserId);
  state.groups.filter((group) => !group.archivedAt).forEach((group) => {
    generateDueRecurringExpenses(group.id);
  });
}

export function setRecurringExpensePaused(id: string, currentUserId: string, paused: boolean) {
  const rule = db.prepare(`
    SELECT r.group_id AS groupId,r.created_by AS createdBy,g.created_by AS ownerId,g.archived_at AS archivedAt
    FROM recurring_expenses r JOIN groups g ON g.id=r.group_id
    JOIN group_members m ON m.group_id=r.group_id
    WHERE r.id=? AND m.user_id=?
  `).get(id, currentUserId) as { groupId: string; createdBy: string; ownerId: string; archivedAt: string | null } | undefined;
  if (!rule) throw new Error("Recurring expense not found or you do not have access.");
  if (rule.archivedAt) throw new Error("This group is archived and cannot be changed.");
  if (rule.createdBy !== currentUserId && rule.ownerId !== currentUserId) throw new Error("Only the schedule creator or group owner can pause or resume this expense.");
  db.prepare("UPDATE recurring_expenses SET paused_at=? WHERE id=?").run(paused ? new Date().toISOString() : null, id);
}

export function listExpenseAttachments(expenseId: string, currentUserId: string): ExpenseAttachmentMetadata[] {
  const expense = assertExpenseMember(expenseId, currentUserId, true);
  return db.prepare(`
    SELECT id,name,mime_type AS mimeType,size,created_at AS createdAt,uploaded_by AS uploadedBy
    FROM expense_attachments WHERE expense_id=? ORDER BY created_at,id
  `).all(expenseId).map((row) => {
    const attachment = row as Omit<ExpenseAttachmentMetadata, "canDelete">;
    return { ...attachment, canDelete: attachment.uploadedBy === currentUserId || expense.ownerId === currentUserId };
  });
}

export function addExpenseAttachments(
  expenseId: string,
  currentUserId: string,
  attachments: Array<{ name: string; mimeType: string; data: Uint8Array }>,
) {
  assertExpenseMember(expenseId, currentUserId);
  if (!attachments.length || attachments.length > 5) throw new Error("Add between 1 and 5 receipt files at a time.");
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  const normalized = attachments.map((attachment) => ({
    ...attachment,
    name: attachment.name.trim(),
    size: attachment.data.byteLength,
    contentHash: createHash("sha256").update(attachment.data).digest("hex"),
  }));
  if (normalized.some((item) => !item.name || item.name.length > 180 || !allowedTypes.has(item.mimeType) || item.size <= 0 || item.size > 5 * 1024 * 1024)) {
    throw new Error("Receipts must be JPEG, PNG, WebP, or PDF files no larger than 5 MB each.");
  }
  if (normalized.reduce((total, item) => total + item.size, 0) > 20 * 1024 * 1024) {
    throw new Error("The total upload size cannot exceed 20 MB.");
  }
  const existingHashes = new Set((db.prepare("SELECT content_hash AS contentHash FROM expense_attachments WHERE expense_id=?").all(expenseId) as Array<{ contentHash: string }>).map((row) => row.contentHash));
  const uniqueNew = normalized.filter((item, index) =>
    !existingHashes.has(item.contentHash) &&
    normalized.findIndex((candidate) => candidate.contentHash === item.contentHash) === index,
  );
  if (existingHashes.size + uniqueNew.length > 5) throw new Error("An expense can have up to 5 receipt files.");

  transact(() => {
    const insert = db.prepare(`
      INSERT INTO expense_attachments(id,expense_id,name,mime_type,size,content_hash,data,uploaded_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(expense_id,content_hash) DO NOTHING
    `);
    for (const item of normalized) {
      insert.run(`receipt-${randomBytes(16).toString("hex")}`, expenseId, item.name, item.mimeType, item.size, item.contentHash, item.data, currentUserId, new Date().toISOString());
    }
  });
  return listExpenseAttachments(expenseId, currentUserId);
}

export function getExpenseAttachment(expenseId: string, attachmentId: string, currentUserId: string) {
  assertExpenseMember(expenseId, currentUserId, true);
  return db.prepare(`
    SELECT id,name,mime_type AS mimeType,size,data
    FROM expense_attachments WHERE id=? AND expense_id=?
  `).get(attachmentId, expenseId) as { id: string; name: string; mimeType: string; size: number; data: Uint8Array } | undefined;
}

export function removeExpenseAttachment(expenseId: string, attachmentId: string, currentUserId: string) {
  const expense = assertExpenseMember(expenseId, currentUserId);
  const attachment = db.prepare("SELECT uploaded_by AS uploadedBy FROM expense_attachments WHERE id=? AND expense_id=?").get(attachmentId, expenseId) as { uploadedBy: string } | undefined;
  if (!attachment) throw new Error("Receipt not found.");
  if (attachment.uploadedBy !== currentUserId && expense.ownerId !== currentUserId) {
    throw new Error("Only the person who uploaded this receipt or the group owner can remove it.");
  }
  db.prepare("DELETE FROM expense_attachments WHERE id=? AND expense_id=?").run(attachmentId, expenseId);
  return listExpenseAttachments(expenseId, currentUserId);
}

export function deleteExpense(id: string, currentUserId: string) {
  const expense = db.prepare(`
    SELECT expenses.group_id AS groupId, expenses.title AS title, groups.archived_at AS archivedAt
    FROM expenses JOIN groups ON groups.id=expenses.group_id
    JOIN group_members ON group_members.group_id=groups.id
    WHERE expenses.id=? AND group_members.user_id=? AND expenses.status='active'
  `).get(id, currentUserId) as { groupId: string; title: string; archivedAt: string | null } | undefined;
  if (!expense) throw new Error("Expense not found or you do not have access.");
  if (expense.archivedAt) throw new Error("This group is archived and cannot be changed.");
  transact(() => {
    db.prepare("DELETE FROM expense_attachments WHERE expense_id=?").run(id);
    db.prepare("UPDATE expenses SET status='deleted' WHERE id=? AND status='active'").run(id);
    recordAudit(expense.groupId, "expense", id, "expense_deleted", currentUserId, `Deleted expense: ${expense.title}`);
  });
}

export function recordSettlement(input: Omit<RecordedSettlement, "status" | "date">, currentUserId: string) {
  const group = readAppState(currentUserId).groups.find((item) => item.id === input.groupId);
  if (!group || !group.members.includes(input.from) || !group.members.includes(input.to)) throw new Error("Both people must be members of the group.");
  if (group.archivedAt) throw new Error("This group is archived and cannot be changed.");
  if (input.from !== currentUserId) throw new Error("Only the person who paid can report this repayment.");
  if (input.from === input.to || !Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error("Enter a valid positive repayment between two different people.");
  const state = readAppState(currentUserId);
  if (state.settlements.some((item) => item.status === "pending" && item.from === input.from && item.to === input.to && item.groupId === input.groupId)) throw new Error("A repayment between these members is already waiting for confirmation.");
  const groupSettlements = state.settlements
    .filter((item) => item.groupId === input.groupId)
    .map((item) => item.status === "pending" ? { ...item, status: "confirmed" as const } : item);
  const currentBalances = calculateGroupBalances(group, state.expenses.filter((item) => item.groupId === input.groupId), groupSettlements);
  const payerBalance = currentBalances.find((balance) => balance.userId === input.from)?.amount ?? 0;
  const recipientBalance = currentBalances.find((balance) => balance.userId === input.to)?.amount ?? 0;
  if (payerBalance >= 0 || recipientBalance <= 0) throw new Error("Choose someone you currently owe money to.");
  const available = Math.min(-payerBalance, recipientBalance);
  if (input.amount > available) throw new Error("The repayment cannot exceed the amount currently owed to this member.");
  db.prepare("INSERT INTO settlements(id,group_id,paid_by,paid_to,amount_minor,status,occurred_at) VALUES(?,?,?,?,?,'pending',?)").run(input.id, input.groupId, input.from, input.to, input.amount, new Date().toISOString());
  recordAudit(input.groupId, "settlement", input.id, "settlement_recorded", currentUserId, `Recorded a repayment of ${input.amount} minor units`);
}

export function confirmSettlement(id: string, currentUserId: string) {
  const row = db.prepare(`
    SELECT group_id AS groupId, amount_minor AS amount FROM settlements WHERE id=? AND paid_to=? AND status='pending'
    AND group_id IN (SELECT groups.id FROM groups JOIN group_members ON group_members.group_id=groups.id WHERE group_members.user_id=? AND groups.archived_at IS NULL)
  `).get(id, currentUserId, currentUserId) as { groupId: string; amount: number } | undefined;
  const result = db.prepare("UPDATE settlements SET status='confirmed' WHERE id=? AND paid_to=? AND status='pending' AND group_id IN (SELECT groups.id FROM groups JOIN group_members ON group_members.group_id=groups.id WHERE group_members.user_id=? AND groups.archived_at IS NULL)").run(id, currentUserId, currentUserId);
  if (result.changes === 0) throw new Error("This repayment is unavailable to confirm.");
  if (row) recordAudit(row.groupId, "settlement", id, "settlement_confirmed", currentUserId, `Confirmed a repayment of ${row.amount} minor units`);
}

export type AuditEvent = {
  id: string;
  subjectType: string;
  subjectId: string;
  action: string;
  actorName: string;
  summary: string;
  createdAt: string;
};

export function listAuditEvents(groupId: string, currentUserId: string): AuditEvent[] {
  const group = readAppState(currentUserId).groups.find((item) => item.id === groupId);
  if (!group) throw new Error("Group not found or you do not have access.");
  return db.prepare(`
    SELECT audit_events.id AS id, audit_events.subject_type AS subjectType, audit_events.subject_id AS subjectId,
      audit_events.action AS action, audit_events.summary AS summary, audit_events.created_at AS createdAt,
      users.name AS actorName
    FROM audit_events LEFT JOIN users ON users.id=audit_events.actor_id
    WHERE audit_events.group_id=? ORDER BY audit_events.created_at DESC, audit_events.id DESC LIMIT 200
  `).all(groupId) as unknown as AuditEvent[];
}
