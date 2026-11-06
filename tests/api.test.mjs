/*
 * API tests: exercise the production build over HTTP against a throwaway
 * database (authentication, access control, group membership, expense
 * validation, transactional rollback, settlement confirmation).
 *
 * Requires a prior production build (`npm run build`). Starts `npm start`
 * on 127.0.0.1:3121 with SPLITMONI_DB_PATH pointed at a temp file and
 * stops it afterwards (by PID only).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const PORT = 3121;
const BASE = `http://127.0.0.1:${PORT}`;
const DB_PATH = join(tmpdir(), "opencode", "splitmoni-api-test.sqlite");
const PASSWORD = "test-password-1";

let server;
let db;

function dbReset() {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });
}

async function request(method, path, { body, cookie } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = response.headers.get("set-cookie");
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return {
    status: response.status,
    payload,
    cookie: setCookie ? setCookie.split(";")[0] : undefined,
  };
}

async function register(name, email) {
  const { status, payload, cookie } = await request("POST", "/api/auth", {
    body: { action: "register", name, email, password: PASSWORD },
  });
  assert.equal(status, 200, `register ${email}: ${JSON.stringify(payload)}`);
  return { id: payload.user.id, cookie };
}

before(async () => {
  dbReset();
  const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    env: { ...process.env, SPLITMONI_DB_PATH: DB_PATH },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const response = await fetch(BASE + "/api/auth");
      if (response.status === 401) break;
    } catch {
      // not up yet
    }
    if (server.exitCode !== null) {
      throw new Error(`Server exited early with code ${server.exitCode}:\n${output.slice(-3000)}`);
    }
    if (Date.now() > deadline) throw new Error(`Server did not become ready:\n${output.slice(-3000)}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  db = new DatabaseSync(DB_PATH);
});

after(async () => {
  db?.close();
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  dbReset();
});

describe("API tests", () => {
  let alice;
  let bob;
  let carolCookie;
  let groupId;

  it("rejects unauthenticated state access", async () => {
    const { status, payload } = await request("GET", "/api/state");
    assert.equal(status, 401);
    assert.match(payload.error, /Sign in/);
  });

  it("registers and logs in accounts", async () => {
    alice = await register("Alice", "alice@api.test");
    bob = await register("Bob", "bob@api.test");

    const login = await request("POST", "/api/auth", {
      body: { action: "login", email: "alice@api.test", password: PASSWORD },
    });
    assert.equal(login.status, 200);
    assert.equal(login.payload.user.id, alice.id);
    alice.cookie = login.cookie;

    const wrongPassword = await request("POST", "/api/auth", {
      body: { action: "login", email: "alice@api.test", password: "nope-nope-nope" },
    });
    assert.equal(wrongPassword.status, 400);
  });

  it("creates a group and adds a member by direct fixture insert", async () => {
    const created = await request("POST", "/api/groups", {
      cookie: alice.cookie,
      body: { group: { id: "api-group", name: "Api Group", currency: "USD" } },
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    groupId = created.payload.group.id;

    const state = await request("GET", "/api/state", { cookie: alice.cookie });
    assert.equal(state.status, 200);
    assert.ok(state.payload.groups.some((group) => group.id === groupId), "owner sees the group");

    db.prepare("INSERT INTO group_members(group_id,user_id,joined_at) VALUES(?,?,?)").run(
      groupId,
      bob.id,
      new Date().toISOString(),
    );

    const bobState = await request("GET", "/api/state", { cookie: bob.cookie });
    assert.ok(bobState.payload.groups.some((group) => group.id === groupId), "member sees the group");
  });

  it("validates expense payloads and persists valid expenses", async () => {
    const baseExpense = {
      id: "api-expense",
      groupId,
      title: "Dinner",
      description: "",
      amount: 9000,
      paidBy: alice.id,
      date: "2026-11-05",
      splitType: "equal",
      splits: {},
    };

    const negative = await request("POST", "/api/expenses", {
      cookie: alice.cookie,
      body: { ...baseExpense, amount: -5 },
    });
    assert.equal(negative.status, 400);
    assert.match(negative.payload.error, /positive/);

    const badDate = await request("POST", "/api/expenses", {
      cookie: alice.cookie,
      body: { ...baseExpense, date: "05/11/2026" },
    });
    assert.equal(badDate.status, 400);

    const unknownSplitter = await request("POST", "/api/expenses", {
      cookie: alice.cookie,
      body: { ...baseExpense, splitType: "unequal", splits: { [alice.id]: 4500, ghost: 4500 } },
    });
    assert.equal(unknownSplitter.status, 400);
    assert.match(unknownSplitter.payload.error, /members/);

    assert.ok(
      !db.prepare("SELECT 1 FROM expenses WHERE id=?").get("api-expense"),
      "failed validations roll back: no partial expense row persists",
    );

    const saved = await request("POST", "/api/expenses", { cookie: alice.cookie, body: baseExpense });
    assert.equal(saved.status, 201, JSON.stringify(saved.payload));
    const row = db.prepare("SELECT amount_minor AS amount FROM expenses WHERE id=?").get("api-expense");
    assert.equal(row.amount, 9000);
    const splitCount = db.prepare("SELECT COUNT(*) AS n FROM expense_splits WHERE expense_id=?").get("api-expense").n;
    assert.equal(splitCount, 2);
  });

  it("keeps non-members out of group writes", async () => {
    const outsider = await register("Carol", "carol@api.test");
    carolCookie = outsider.cookie;
    const attempt = await request("POST", "/api/expenses", {
      cookie: outsider.cookie,
      body: {
        id: "api-expense-outsider",
        groupId,
        title: "Sneaky",
        description: "",
        amount: 100,
        paidBy: outsider.id,
        date: "2026-11-05",
        splitType: "equal",
        splits: {},
      },
    });
    assert.equal(attempt.status, 400);
    assert.ok(!db.prepare("SELECT 1 FROM expenses WHERE id=?").get("api-expense-outsider"));
  });

  it("records a settlement as pending and confirms it through the recipient", async () => {
    // Alice paid 9000 equally, so Bob owes 4500.
    const recorded = await request("POST", "/api/settlements", {
      cookie: bob.cookie,
      body: { id: "api-settlement-1", groupId, from: bob.id, to: alice.id, amount: 4500 },
    });
    assert.equal(recorded.status, 201, JSON.stringify(recorded.payload));
    assert.equal(
      db.prepare("SELECT status FROM settlements WHERE id=?").get("api-settlement-1").status,
      "pending",
    );

    const duplicate = await request("POST", "/api/settlements", {
      cookie: bob.cookie,
      body: { id: "api-settlement-2", groupId, from: bob.id, to: alice.id, amount: 100 },
    });
    assert.equal(duplicate.status, 400, "a second pending repayment between the same pair is rejected");

    const payerConfirm = await request("POST", "/api/settlements/api-settlement-1/confirm", {
      cookie: bob.cookie,
    });
    assert.equal(payerConfirm.status, 400, "the payer cannot confirm their own repayment");

    const confirmed = await request("POST", "/api/settlements/api-settlement-1/confirm", {
      cookie: alice.cookie,
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.payload));
    assert.equal(
      db.prepare("SELECT status FROM settlements WHERE id=?").get("api-settlement-1").status,
      "confirmed",
    );
  });

  it("records audit history for expense and repayment changes", async () => {
    const audit = await request("GET", `/api/groups/${groupId}/audit`, { cookie: bob.cookie });
    assert.equal(audit.status, 200);
    const actions = audit.payload.events.map((event) => event.action);
    assert.ok(actions.includes("expense_created"), `actions: ${actions.join(",")}`);
    assert.ok(actions.includes("settlement_recorded"));
    assert.ok(actions.includes("settlement_confirmed"));
    const created = audit.payload.events.find((event) => event.action === "expense_created");
    assert.equal(created.actorName, "Alice");
    assert.match(created.summary, /Dinner/);

    const outsiderAudit = await request("GET", `/api/groups/${groupId}/audit`, { cookie: carolCookie });
    assert.equal(outsiderAudit.status, 400, "non-members cannot read audit history");
  });

  it("rejects cross-site mutations and allows same-site ones", async () => {
    const crossSite = await fetch(BASE + "/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://evil.example", Cookie: bob.cookie },
      body: JSON.stringify({ group: { id: "api-group-evil", name: "Evil", currency: "USD" } }),
    });
    assert.equal(crossSite.status, 403);
    assert.match(await crossSite.text(), /Cross-site/);
    assert.ok(!db.prepare("SELECT 1 FROM groups WHERE id=?").get("api-group-evil"));

    const sameSite = await fetch(BASE + "/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: bob.cookie },
      body: JSON.stringify({ group: { id: "api-group-b", name: "Bob Group", currency: "USD" } }),
    });
    assert.equal(sameSite.status, 201);
  });

  it("rate-limits credential endpoints", async () => {
    // The auth bucket allows 30 requests per 10 minutes per IP; this suite
    // already used 5, so 27 more pushes past the limit. Runs last.
    const body = { action: "login", email: "nobody@api.test", password: "wrong-password" };
    let lastStatus = 0;
    for (let i = 0; i < 27; i += 1) {
      const res = await request("POST", "/api/auth", { body });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429, "credential endpoint returns 429 after the limit");
  });

  it("signs out and invalidates the session", async () => {
    const logout = await request("DELETE", "/api/auth", { cookie: alice.cookie });
    assert.equal(logout.status, 200);
    const after = await request("GET", "/api/auth", { cookie: alice.cookie });
    assert.equal(after.status, 401);
  });
});
