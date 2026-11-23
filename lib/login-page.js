// Sign-in page served by the gate (functions/_middleware.js) to anyone without a verified session.
// Self-contained: inline styles and script, Arabic first with an English switch.

export function loginPage() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0b">
<meta name="robots" content="noindex">
<title>Baqer Sniper · تسجيل الدخول</title>
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=El+Messiri:wght@600;700&family=DM+Mono:wght@500&display=swap">
<style>
:root{--bg:#0a0a0b;--card:rgba(30,27,22,.66);--line:rgba(212,175,106,.22);--gold:#d4af6a;--hi:#f6dc9c;--lo:#a37c36;--ivory:#f4efe6;--muted:#a39b8d;--down:#e5484d;--up:#3fb68b}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ivory);font-family:Tajawal,system-ui,sans-serif}
body{min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;overflow-x:hidden}
body::before{content:"";position:fixed;inset:-20%;background:radial-gradient(40% 35% at 70% 20%,rgba(212,175,106,.18),transparent 70%),radial-gradient(35% 30% at 20% 80%,rgba(163,124,54,.14),transparent 70%);filter:blur(10px);z-index:-1;animation:drift 18s ease-in-out infinite alternate}
@keyframes drift{to{transform:translate3d(3%,-2%,0) scale(1.05)}}
.wrap{width:100%;max-width:400px;text-align:center}
.ph{width:104px;height:104px;margin:0 auto 18px;border-radius:50%;padding:3px;background:conic-gradient(from 0deg,var(--hi),var(--lo),var(--hi),var(--lo),var(--hi));animation:spin 9s linear infinite}
.ph img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;border:3px solid var(--bg);animation:spin 9s linear infinite reverse}
@keyframes spin{to{transform:rotate(360deg)}}
.brand{font:700 13px "DM Mono",monospace;letter-spacing:.4em;color:var(--gold)}
h1{font-family:"El Messiri",Tajawal,serif;font-size:28px;margin:8px 0 6px;font-weight:700}
.sub{color:var(--muted);font-size:14px;margin:0 0 22px;line-height:1.7}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);text-align:start;box-shadow:0 20px 60px rgba(0,0,0,.45)}
label{display:block;font-size:12.5px;color:var(--muted);margin:0 0 6px}
input{width:100%;font:inherit;font-size:16px;color:var(--ivory);background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.1);border-radius:13px;padding:13px 14px;outline:none;margin-bottom:14px}
input:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(212,175,106,.18)}
input.code{font:600 28px "DM Mono",monospace;letter-spacing:.5em;text-align:center;direction:ltr;padding-inline-start:calc(14px + .5em)}
button{width:100%;font:800 16px Tajawal,sans-serif;border:0;border-radius:14px;padding:14px;cursor:pointer;color:#1a1408;background:linear-gradient(135deg,var(--hi),var(--gold) 45%,var(--lo));position:relative;overflow:hidden}
button:disabled{opacity:.6;cursor:wait}
.link{background:none;color:var(--gold);font-weight:600;font-size:13.5px;padding:10px;margin-top:6px}
.msg{min-height:20px;font-size:13px;margin:10px 0 0;text-align:center;color:var(--muted)}
.msg.err{color:var(--down)} .msg.ok{color:var(--up)}
.sent{font-size:13.5px;color:var(--muted);margin:0 0 14px;line-height:1.7}
.sent b{color:var(--hi);direction:ltr;unicode-bidi:embed}
.hi{font-family:"El Messiri",serif;font-size:26px;color:var(--hi);text-align:center;margin:6px 0}
.lang{position:fixed;top:14px;inset-inline-end:14px;width:auto;padding:7px 12px;font-size:12px;background:rgba(255,255,255,.06);color:var(--ivory);border:1px solid var(--line)}
.foot{color:#6d665b;font-size:11.5px;margin-top:18px}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
</head>
<body>
<button class="lang" id="lang" type="button">English</button>
<main class="wrap">
  <div class="ph"><img src="/assets/me.jpg" alt="" onerror="this.parentNode.hidden=true"></div>
  <div class="brand">BAQER SNIPER</div>
  <h1 data-t="title">تسجيل الدخول</h1>
  <p class="sub" data-t="sub">أدخل اسمك وبريدك، وسنرسل لك رمزاً من 6 أرقام لتأكيد الإيميل.</p>

  <form class="card" id="f1" autocomplete="on" novalidate>
    <label for="name" data-t="name">الاسم</label>
    <input id="name" name="name" autocomplete="name" maxlength="40" required>
    <label for="email" data-t="email">البريد الإلكتروني</label>
    <input id="email" name="email" type="email" inputmode="email" autocomplete="email" dir="ltr" required>
    <button id="b1" type="submit" data-t="send">أرسل الرمز</button>
    <p class="msg" id="m1" role="status"></p>
  </form>

  <form class="card" id="f2" hidden novalidate>
    <p class="sent"><span data-t="sentTo">أرسلنا الرمز إلى</span> <b id="to"></b></p>
    <label for="code" data-t="code">رمز التأكيد</label>
    <input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" required>
    <button id="b2" type="submit" data-t="verify">تأكيد ودخول</button>
    <button class="link" id="again" type="button" data-t="again">تغيير البريد أو إعادة الإرسال</button>
    <p class="msg" id="m2" role="status"></p>
  </form>

  <div class="card" id="f3" hidden>
    <div class="hi" id="hi"></div>
    <p class="msg ok" data-t="opening">تم تأكيد الإيميل، جارٍ فتح التطبيق...</p>
  </div>
  <p class="foot" data-t="foot">تحليل تعليمي، ليس نصيحة مالية.</p>
</main>
<script>
(function () {
  var T = {
    ar: { title: "تسجيل الدخول", sub: "أدخل اسمك وبريدك، وسنرسل لك رمزاً من 6 أرقام لتأكيد الإيميل.", name: "الاسم", email: "البريد الإلكتروني",
      send: "أرسل الرمز", sentTo: "أرسلنا الرمز إلى", code: "رمز التأكيد", verify: "تأكيد ودخول", again: "تغيير البريد أو إعادة الإرسال",
      opening: "تم تأكيد الإيميل، جارٍ فتح التطبيق...", foot: "تحليل تعليمي، ليس نصيحة مالية.", hello: "مرحبا ", sending: "جارٍ الإرسال...", checking: "جارٍ التحقق...",
      e_bad_email: "البريد غير صحيح.", e_bad_name: "اكتب اسمك.", e_not_allowed: "هذا البريد غير مسموح له بالدخول.", e_too_many: "محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة.",
      e_mail_failed: "تعذّر إرسال الإيميل الآن.", e_setup: "الدخول غير مُعدّ بعد على الخادم.", e_expired: "انتهت صلاحية الرمز، اطلب رمزاً جديداً.", e_bad_code: "الرمز 6 أرقام.",
      e_wrong_code: "الرمز غير صحيح. المحاولات المتبقية: ", e_net: "تعذّر الاتصال، تحقق من الإنترنت.", check: "تحقق من صندوق الوارد والبريد غير المرغوب." },
    en: { title: "Sign in", sub: "Enter your name and email and we will send you a 6-digit code to verify it.", name: "Name", email: "Email",
      send: "Send code", sentTo: "We sent the code to", code: "Verification code", verify: "Verify and enter", again: "Change email or resend",
      opening: "Email verified, opening the app...", foot: "Educational analysis, not financial advice.", hello: "Welcome ", sending: "Sending...", checking: "Checking...",
      e_bad_email: "That email does not look right.", e_bad_name: "Please enter your name.", e_not_allowed: "This email is not allowed to sign in.", e_too_many: "Too many attempts. Wait a little and try again.",
      e_mail_failed: "The email could not be sent right now.", e_setup: "Sign-in is not set up on the server yet.", e_expired: "The code expired. Ask for a new one.", e_bad_code: "The code has 6 digits.",
      e_wrong_code: "Wrong code. Attempts left: ", e_net: "Connection failed. Check your internet.", check: "Check your inbox and spam folder." }
  };
  var lang = "ar";
  try { lang = localStorage.getItem("baqerLang") === "\\"en\\"" ? "en" : "ar"; } catch (e) {}
  function t(k) { return T[lang][k] || k; }
  function $(id) { return document.getElementById(id); }
  function apply() {
    document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-t]").forEach(function (e) { e.textContent = t(e.getAttribute("data-t")); });
    $("lang").textContent = lang === "ar" ? "English" : "العربية";
  }
  $("lang").addEventListener("click", function () { lang = lang === "ar" ? "en" : "ar"; try { localStorage.setItem("baqerLang", JSON.stringify(lang)); } catch (e) {} apply(); });
  function say(id, text, cls) { var m = $(id); m.textContent = text || ""; m.className = "msg" + (cls ? " " + cls : ""); }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._ok = r.ok; return j; }); });
  }
  function errText(j) { var k = "e_" + (j && j.error); return T[lang][k] ? t(k) + (j.error === "wrong_code" ? j.left : "") : t("e_net"); }
  try { var last = JSON.parse(localStorage.getItem("baqerUser") || "null"); if (last) { $("name").value = last.name || ""; $("email").value = last.email || ""; } } catch (e) {}
  $("f1").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var name = $("name").value.trim(), email = $("email").value.trim();
    if (!name) return say("m1", t("e_bad_name"), "err");
    if (!/^[^\\s@]+@[^\\s@]+\\.[a-z]{2,}$/i.test(email)) return say("m1", t("e_bad_email"), "err");
    $("b1").disabled = true; say("m1", t("sending"));
    post("/api/auth/start", { name: name, email: email }).then(function (j) {
      $("b1").disabled = false;
      if (!j._ok) return say("m1", errText(j), "err");
      say("m1", "");
      $("to").textContent = email; $("f1").hidden = true; $("f2").hidden = false; say("m2", t("check"));
      setTimeout(function () { $("code").focus(); }, 50);
    }).catch(function () { $("b1").disabled = false; say("m1", t("e_net"), "err"); });
  });
  $("code").addEventListener("input", function () {
    this.value = this.value.replace(/\\D/g, "").slice(0, 6);
    if (this.value.length === 6) $("f2").requestSubmit ? $("f2").requestSubmit() : $("b2").click();
  });
  $("f2").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var code = $("code").value.replace(/\\D/g, "");
    if (code.length !== 6) return say("m2", t("e_bad_code"), "err");
    if ($("b2").disabled) return;
    $("b2").disabled = true; say("m2", t("checking"));
    post("/api/auth/verify", { code: code }).then(function (j) {
      $("b2").disabled = false;
      if (!j._ok) { $("code").value = ""; return say("m2", errText(j), "err"); }
      try { localStorage.setItem("baqerUser", JSON.stringify({ name: j.name, email: j.email, owner: !!j.owner, verified: true })); } catch (e) {}
      $("f2").hidden = true; $("f3").hidden = false; $("hi").textContent = t("hello") + j.name;
      setTimeout(function () { location.replace(location.pathname === "/" ? "/" : location.href); }, 1200);
    }).catch(function () { $("b2").disabled = false; say("m2", t("e_net"), "err"); });
  });
  $("again").addEventListener("click", function () { $("f2").hidden = true; $("f1").hidden = false; $("code").value = ""; say("m2", ""); });
  apply();
})();
</script>
</body>
</html>`;
}

export function setupPage() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Baqer Sniper</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4efe6;font-family:Tahoma,Arial,sans-serif;padding:16px;text-align:center}
b{color:#d4af6a;letter-spacing:.3em;font-size:13px}p{color:#a39b8d;line-height:1.8;max-width:420px}code{color:#f6dc9c}</style></head>
<body><div><b>BAQER SNIPER</b><h1>التطبيق مغلق مؤقتاً</h1><p>الدخول بتأكيد الإيميل يحتاج إعداداً على الخادم: أضف <code>AUTH_SECRET</code> و<code>RESEND_API_KEY</code> و<code>MAIL_FROM</code> في إعدادات Cloudflare Pages ثم أعد النشر.</p>
<p>Sign-in is not configured yet. Add AUTH_SECRET, RESEND_API_KEY and MAIL_FROM in Cloudflare Pages settings, then redeploy.</p></div></body></html>`;
}
