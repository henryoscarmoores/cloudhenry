/* CloudHenry join flow, on the twelve /join-<airport>/ pages.
 *
 * Nobody can join without an airport, because joining now starts here
 * and the airport is the page. Two steps:
 *
 *   1. Email. Ghost creates the member straight away, carrying the
 *      airport as a label (loc-manchester and so on, the labels Henry
 *      already sends by). Ghost emails a sign-in link that brings them
 *      back to this page.
 *   2. Back here, signed in: start the 40-day free trial of the paid tier
 *      through Ghost's own checkout. The label stays on the member.
 *
 * Someone already paid sees a link to their member area instead.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";

  var m = location.pathname.match(/^\/join-([a-z-]+)\/?$/);
  if (!m) return;
  var slug = m[1];
  var NAMES = {
    "manchester":"Manchester", "birmingham":"Birmingham", "leeds":"Leeds Bradford", "leeds-bradford":"Leeds Bradford",
    "london-stansted":"London Stansted", "london-luton":"London Luton", "bristol":"Bristol", "newcastle":"Newcastle",
    "glasgow":"Glasgow", "edinburgh":"Edinburgh", "london-gatwick":"London Gatwick", "liverpool":"Liverpool", "belfast":"Belfast"
  };
  var CODES = { "manchester":"MAN", "birmingham":"BHX", "leeds":"LBA", "leeds-bradford":"LBA", "london-stansted":"STN",
                "london-luton":"LTN", "bristol":"BRS", "newcastle":"NCL", "glasgow":"GLA", "edinburgh":"EDI",
                "london-gatwick":"LGW", "liverpool":"LPL", "belfast":"BFS" };
  var city = NAMES[slug];
  if (!city) return;
  var label = "loc-" + (slug === "leeds-bradford" ? "leeds" : slug);
  var code = CODES[slug];

  // Remember the airport on this device, for the member area.
  try { localStorage.setItem("ch-airport", code); } catch (e) {}
  document.cookie = "ch_airport=" + code + "; path=/; max-age=31536000; SameSite=Lax";

  function css() {
    if (document.getElementById("ch-join-css")) return;
    var st = document.createElement("style");
    st.id = "ch-join-css";
    st.textContent =
      /* The site's scroll-reveal script tags new elements and never gets round to revealing them */
      ".ch-join,.ch-join.ch-reveal{display:grid;gap:10px;justify-items:center;text-align:center;margin:6px auto 0;max-width:420px;opacity:1!important;transform:none!important}" +
      ".ch-join-row{display:flex;gap:8px;width:100%}" +
      ".ch-join input{flex:1 1 auto;min-width:0;font:inherit;font-size:15px;font-weight:600;color:#0E3550;background:#fff;border:1px solid rgba(14,53,80,.16);border-radius:999px;padding:13px 16px;box-shadow:0 2px 8px rgba(14,53,80,.12)}" +
      ".ch-join input:focus{outline:none;border-color:#0E6FB6;box-shadow:0 0 0 4px rgba(14,111,182,.25)}" +
      ".ch-join button,.ch-join .ch-join-cta{flex:0 0 auto;border:0;border-radius:999px;background:#F5C242;color:#16324A;font:inherit;font-weight:800;font-size:15px;padding:13px 22px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 6px rgba(14,53,80,.16);text-decoration:none;display:inline-block}" +
      ".ch-join button[disabled]{opacity:.6;cursor:wait}" +
      ".ch-join small{font-size:12.5px;color:inherit;opacity:.85}" +
      ".ch-join .ch-join-note{font-size:14px;line-height:1.45;max-width:38ch}" +
      ".ch-join .ch-join-err{color:#FFD9A8;font-weight:700;font-size:13.5px}" +
      "@media(max-width:480px){.ch-join-row{flex-direction:column}.ch-join button{width:100%}}";
    document.head.appendChild(st);
  }

  function member() {
    return fetch("/members/api/member/", { credentials: "include" })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .catch(function () { return null; });
  }
  // Ghost refuses a magic-link request that does not carry a fresh
  // integrity token ("The request could not be understood"). Portal
  // fetches one before every send; so do we.
  function integrity() {
    return fetch("/members/api/integrity-token/", { credentials: "include" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .catch(function () { return ""; });
  }
  function isPaid(mm) {
    if (!mm) return false;
    if (mm.status === "paid" || mm.status === "comped") return true;
    return !!(mm.subscriptions && mm.subscriptions.some(function (s) { return s.status === "active" || s.status === "trialing"; }));
  }

  function build(cta, mm) {
    css();
    var box = document.createElement("div");
    box.className = "ch-join";
    var params = {};
    (location.search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
    });

    if (mm && isPaid(mm)) {
      box.innerHTML = '<a class="ch-join-cta" href="/my-cloudhenry/">You are a member. Open My CloudHenry &rarr;</a>' +
                      '<small>Signed in as ' + escapeHtml(mm.email) + '</small>';
    } else if (mm) {
      box.innerHTML = '<a class="ch-join-cta" href="#/portal/account/plans">Try 40 days free &rarr;</a>' +
                      '<div class="ch-join-note">Card taken now, nothing charged for 40 days. Then £2.99 a month, cancel any time. Your ' + city + ' email starts on Monday.</div>' +
                      '<small>Signed in as ' + escapeHtml(mm.email) + '</small>';
    } else {
      box.innerHTML =
        '<form class="ch-join-row" novalidate>' +
          '<input type="email" name="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address" value="' + escapeHtml(params.email || "") + '">' +
          '<button type="submit">Join from ' + city + ' &rarr;</button>' +
        '</form>' +
        '<div class="ch-join-note">Step 1 of 2. We email you a link, you come back here and start your 40 days free.</div>' +
        '<div class="ch-join-err" hidden></div>';
      var form = box.querySelector("form"), input = box.querySelector("input"), btn = box.querySelector("button"), err = box.querySelector(".ch-join-err");
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var email = input.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "That email does not look right."; err.hidden = false; input.focus(); return; }
        err.hidden = true; btn.disabled = true; btn.textContent = "Sending";
        // Visit history for Ghost's attribution, and a label naming this
        // box, so homepage and airport-page sign-ups can be compared.
        var history = [];
        try { history = JSON.parse(sessionStorage.getItem("ghost-history") || "[]"); } catch (x) {}
        integrity().then(function (tok) {
          return fetch("/members/api/send-magic-link/", {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email, emailType: "signup", labels: [label, "via-airport-page"], name: "", honeypot: "", autoRedirect: true, integrityToken: tok, urlHistory: history, redirect: location.origin + location.pathname })
          });
        }).then(function (r) {
          if (r.ok) {
            box.innerHTML = '<div class="ch-join-note"><b>Check your inbox.</b> We have sent a link to ' + escapeHtml(email) +
              '. Tap it and you land back here, signed in and ready to start your 40 days free.</div>' +
              '<small>Nothing arrived? Check spam, or <a href="' + location.pathname + '">try again</a>.</small>';
          } else {
            return r.text().then(function (t) {
              var msg = "Something went wrong. Please try again.";
              try { var j = JSON.parse(t); if (j.errors && j.errors[0] && j.errors[0].message) msg = j.errors[0].message; } catch (x) {}
              err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = "Join from " + city + " →";
            });
          }
        }).catch(function () { err.textContent = "Could not reach the server. Please try again."; err.hidden = false; btn.disabled = false; btn.textContent = "Join from " + city + " →"; });
      });
    }
    cta.parentNode.replaceChild(box, cta);
  }

  function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }

  var done = false;
  function go() {
    if (done) return true;
    // The header carries a Subscribe link too; the one to replace is the
    // button in the page itself.
    var all = document.querySelectorAll('a[href="#/portal/signup"], a[href$="#/portal/signup"]');
    var cta = null;
    for (var i = 0; i < all.length; i++) {
      if (!all[i].closest("header, .gh-head, nav, footer, .gh-foot")) { cta = all[i]; break; }
    }
    if (!cta) return false;
    done = true;
    member().then(function (mm) { build(cta, mm); });
    return true;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  setTimeout(go, 1200);
})();
