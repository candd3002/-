// Run with: node tests/app-api.test.mjs   (owner panel API + maintenance gate)
import assert from "assert";
import * as state from "../functions/api/app/state.js";
import * as config from "../functions/api/app/config.js";
import * as signal from "../functions/api/app/signal.js";
import * as members from "../functions/api/app/members.js";
import * as mw from "../functions/_middleware.js";
import { sign } from "../lib/auth.js";
import { addMember } from "../lib/app-store.js";

const kv = new Map();
const env = { AUTH_SECRET: "s".repeat(24), OWNER_EMAIL: "owner@x.com", AUTH_KV: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
const sess = async email => "bs_s=" + await sign(env.AUTH_SECRET, { k: "s", e: email, n: "N", x: Date.now() + 864e5 });
const owner = await sess("owner@x.com"), user = await sess("u@x.com");
const req = (path, cookie, body) => new Request("https://x" + path, body ? { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { cookie } });

// state: any verified user; not signed in -> 401
assert.strictEqual((await state.onRequest({ request: req("/api/app/state", ""), env })).status, 401);
let j = await (await state.onRequest({ request: req("/api/app/state", user), env })).json();
assert.strictEqual(j.me.owner, false); assert.deepStrictEqual(j.sigs, []); assert.strictEqual(j.kv, true);

// config: owner only, fields cleaned
assert.strictEqual((await config.onRequestPost({ request: req("/api/app/config", user, { banner: "x" }), env })).status, 403);
j = await (await config.onRequestPost({ request: req("/api/app/config", owner, { banner: "مرحبا", bannerOn: 1, channel: "javascript:alert(1)", evil: "x", bio: "a".repeat(900) }), env })).json();
assert.strictEqual(j.cfg.banner, "مرحبا"); assert.strictEqual(j.cfg.bannerOn, true); assert.strictEqual(j.cfg.channel, ""); assert.ok(!("evil" in j.cfg)); assert.strictEqual(j.cfg.bio.length, 600);

// signals: owner only, validated
assert.strictEqual((await signal.onRequestPost({ request: req("/api/app/signal", user, { op: "add", asset: "XAU", sell: true, entry: 1, sl: 2 }), env })).status, 403);
assert.strictEqual((await signal.onRequestPost({ request: req("/api/app/signal", owner, { op: "add", asset: "XAU", sell: true, entry: 10, sl: 5 }), env })).status, 400, "sell stop must be above entry");
assert.strictEqual((await signal.onRequestPost({ request: req("/api/app/signal", owner, { op: "add", asset: "DOGE", sell: true, entry: 10, sl: 12 }), env })).status, 400);
j = await (await signal.onRequestPost({ request: req("/api/app/signal", owner, { op: "add", asset: "XAU", sell: true, entry: 2400, sl: 2410, tp1: 2390, note: "n" }), env })).json();
const id = j.sigs[0].id; assert.ok(id);
j = await (await signal.onRequestPost({ request: req("/api/app/signal", owner, { op: "toggle", id }), env })).json();
assert.strictEqual(j.sigs[0].active, false);
j = await (await signal.onRequestPost({ request: req("/api/app/signal", owner, { op: "delete", id }), env })).json();
assert.strictEqual(j.sigs.length, 0);

// members: owner only
await addMember(env, "u@x.com", "U"); await addMember(env, "u@x.com", "U2");
assert.strictEqual((await members.onRequest({ request: req("/api/app/members", user), env })).status, 403);
j = await (await members.onRequest({ request: req("/api/app/members", owner), env })).json();
assert.strictEqual(j.members.length, 1); assert.strictEqual(j.members[0].name, "U2");

// maintenance: users blocked, owner passes
await config.onRequestPost({ request: req("/api/app/config", owner, { maintenance: true, maintenanceMsg: "<b>soon</b>" }), env });
const next = async () => new Response("APP", { headers: { "content-type": "text/html" } });
await new Promise(r => setTimeout(r, 10));
let r = await mw.onRequest({ request: req("/", user), env, next });
// the flag may be cached for 30 s from an earlier read; no earlier read happened in this process
assert.strictEqual(r.status, 503); const t = await r.text(); assert.ok(t.includes("قيد التحديث") && !t.includes("<b>soon"));
r = await mw.onRequest({ request: req("/", owner), env, next });
assert.strictEqual(await r.text(), "APP");
console.log("app api tests passed");
