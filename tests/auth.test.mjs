// Run with: node tests/auth.test.mjs   (needs Node 20+)
import assert from "assert";
import * as start from "../functions/api/auth/start.js";
import * as verify from "../functions/api/auth/verify.js";
import * as me from "../functions/api/auth/me.js";
import * as mw from "../functions/_middleware.js";
import { sign } from "../lib/auth.js";

const kv = new Map();
const env = { AUTH_SECRET: "test-secret-0123456789", RESEND_API_KEY: "re_test", MAIL_FROM: "Baqer <a@b.co>", OWNER_EMAIL: "owner@x.com",
  AUTH_KV: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
let sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); };
const H = (cookie) => cookie ? { cookie, "content-type": "application/json" } : { "content-type": "application/json" };
const post = (path, body, cookie) => new Request("https://app.test" + path, { method: "POST", headers: H(cookie), body: JSON.stringify(body) });
const cookiesOf = res => res.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => !c.endsWith("=")).join("; ");

// 1) gate: no session -> login page / 401 JSON; public auth endpoints pass through
const next = async () => new Response("<html>APP</html>", { headers: { "content-type": "text/html" } });
let r = await mw.onRequest({ request: new Request("https://app.test/"), env, next });
assert.strictEqual(r.status, 401); assert.ok((await r.text()).includes("/api/auth/start"), "login page served");
r = await mw.onRequest({ request: new Request("https://app.test/app.js"), env, next });
assert.ok(!(await r.text()).includes("APP"), "scripts are gated");
r = await mw.onRequest({ request: new Request("https://app.test/api/candles?symbol=XAUUSD"), env, next });
assert.strictEqual(r.status, 401);
r = await mw.onRequest({ request: new Request("https://app.test/api/auth/me"), env, next });
assert.strictEqual(await r.text(), "<html>APP</html>", "auth api is public");
r = await mw.onRequest({ request: new Request("https://app.test/"), env: {}, next });
assert.strictEqual(r.status, 503, "fails closed when AUTH_SECRET missing");

// 2) start: validation
assert.strictEqual((await start.onRequestPost({ request: post("/api/auth/start", { name: "A", email: "bad" }), env })).status, 400);
assert.strictEqual((await start.onRequestPost({ request: post("/api/auth/start", { name: "", email: "a@b.co" }), env })).status, 400);
assert.strictEqual((await start.onRequestPost({ request: post("/api/auth/start", { name: "A", email: "a@b.co" }), env: Object.assign({}, env, { ALLOWED_EMAILS: "z@z.co" }) })).status, 403);

// 3) start -> email with code -> verify
sent = [];
r = await start.onRequestPost({ request: post("/api/auth/start", { name: "Mohammed <b>", email: "  Mo@Example.com " }), env });
assert.strictEqual(r.status, 200);
assert.strictEqual(sent.length, 1); assert.deepStrictEqual(sent[0].body.to, ["mo@example.com"]);
const code = /(\d{6})/.exec(sent[0].body.subject)[1];
const pending = cookiesOf(r);
assert.ok(pending.startsWith("bs_p="));
assert.ok(!r.headers.getSetCookie()[0].includes(code), "code is not in the cookie");
// wrong code
r = await verify.onRequestPost({ request: post("/api/auth/verify", { code: code === "000000" ? "111111" : "000000" }, pending), env });
assert.strictEqual(r.status, 400); assert.strictEqual((await r.json()).error, "wrong_code");
// right code
r = await verify.onRequestPost({ request: post("/api/auth/verify", { code }, pending), env });
assert.strictEqual(r.status, 200);
const j = await r.json(); assert.strictEqual(j.name, "Mohammed b"); assert.strictEqual(j.owner, false);
const session = cookiesOf(r); assert.ok(session.startsWith("bs_s="));
// session opens the gate and /me
r = await mw.onRequest({ request: new Request("https://app.test/", { headers: { cookie: session } }), env, next });
assert.strictEqual(await r.text(), "<html>APP</html>");
assert.ok(r.headers.get("cache-control").includes("no-store"));
r = await me.onRequest({ request: new Request("https://app.test/api/auth/me", { headers: { cookie: session } }), env });
assert.strictEqual((await r.json()).email, "mo@example.com");
// removed from ALLOWED_EMAILS -> session no longer works
r = await me.onRequest({ request: new Request("https://app.test/api/auth/me", { headers: { cookie: session } }), env: Object.assign({}, env, { ALLOWED_EMAILS: "z@z.co" }) });
assert.strictEqual(r.status, 401);

// 4) brute force: 5 attempts max per code
sent = [];
r = await start.onRequestPost({ request: post("/api/auth/start", { name: "B", email: "b@b.co" }), env });
const p2 = cookiesOf(r), code2 = /(\d{6})/.exec(sent[0].body.subject)[1], wrong = code2 === "123456" ? "654321" : "123456";
for (let i = 0; i < 5; i++) assert.strictEqual((await verify.onRequestPost({ request: post("/api/auth/verify", { code: wrong }, p2), env })).status, 400);
r = await verify.onRequestPost({ request: post("/api/auth/verify", { code: code2 }, p2), env });
assert.strictEqual(r.status, 429, "locked after 5 wrong attempts, even with the right code");

// 5) forged / expired cookies are rejected
const forged = session.slice(0, -3) + "abc";
assert.strictEqual((await me.onRequest({ request: new Request("https://x/api/auth/me", { headers: { cookie: forged } }), env })).status, 401);
const old = await sign(env.AUTH_SECRET, { k: "s", e: "mo@example.com", n: "M", x: Date.now() - 1 });
assert.strictEqual((await me.onRequest({ request: new Request("https://x/api/auth/me", { headers: { cookie: "bs_s=" + old } }), env })).status, 401);
const pendingAsSession = pending.replace("bs_p=", "bs_s=");
assert.strictEqual((await me.onRequest({ request: new Request("https://x/api/auth/me", { headers: { cookie: pendingAsSession } }), env })).status, 401, "a pending cookie is not a session");

// 6) send limit: 5 per hour per email
for (let i = 0; i < 4; i++) await start.onRequestPost({ request: post("/api/auth/start", { name: "C", email: "c@c.co" }), env });
assert.strictEqual((await start.onRequestPost({ request: post("/api/auth/start", { name: "C", email: "c@c.co" }), env })).status, 200);
assert.strictEqual((await start.onRequestPost({ request: post("/api/auth/start", { name: "C", email: "c@c.co" }), env })).status, 429);

// 7) owner flag
sent = [];
r = await start.onRequestPost({ request: post("/api/auth/start", { name: "Owner", email: "owner@x.com" }), env });
r = await verify.onRequestPost({ request: post("/api/auth/verify", { code: /(\d{6})/.exec(sent[0].body.subject)[1] }, cookiesOf(r)), env });
assert.strictEqual((await r.json()).owner, true);
console.log("auth tests passed");
