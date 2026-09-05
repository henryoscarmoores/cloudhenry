/* CloudHenry homepage sign-up, one step.
 *
 * The hero picker used to send people to their airport page to type an
 * email there. Twelve thousand visitors, sixty emails. Now the email
 * field sits under the picker and the button does the whole job: Ghost
 * creates the member with the airport label and emails a link that
 * lands them, signed in, on their airport page, where the one button is
 * "Try 40 days free".
 *
 * Signed-in members do not see the box: a free member gets the trial
 * button, a paying member a link to My CloudHenry.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "") return;

  var CODES = { "join-manchester":"MAN", "join-birmingham":"BHX", "join-leeds":"LBA", "join-london-stansted":"STN",
                "join-london-luton":"LTN", "join-bristol":"BRS", "join-newcastle":"NCL", "join-glasgow":"GLA",
                "join-edinburgh":"EDI", "join-london-gatwick":"LGW", "join-liverpool":"LPL", "join-belfast":"BFS" };

  function css() {
    if (document.getElementById("ch-hj-css")) return;
    var st = document.createElement("style");
    st.id = "ch-hj-css";
    st.textContent =
      ".ch-airportpick.ch-hj{display:grid;grid-template-columns:minmax(0,200px) minmax(0,1fr) auto;gap:8px;max-width:640px;align-items:center;opacity:1!important;transform:none!important}" +
      ".ch-airportpick.ch-hj .ch-ap-select{width:100%}" +
      ".ch-hj-email{min-width:0;width:100%;border:none;border-radius:999px;background:rgba(255,255,255,.92);color:#12384F;font-size:14.5px;font-weight:600;padding:12px 16px;outline:none;font-family:inherit;box-shadow:0 8px 20px rgba(4,45,80,.18)}" +
      ".ch-hj-email::placeholder{color:#8FA7B8;font-weight:600}" +
      ".ch-hj-email:focus{box-shadow:0 0 0 4px rgba(255,255,255,.45),0 8px 20px rgba(4,45,80,.18)}" +
      ".ch-hj-err{grid-column:1/-1;color:#FFD9A8;font-weight:700;font-size:13px;text-align:center;margin:0}" +
      ".ch-hj-done{max-width:420px;margin:0 auto 12px;padding:14px 18px;border-radius:16px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);color:#fff;text-align:center;font-size:14.5px;line-height:1.5;opacity:1!important;transform:none!important}" +
      ".ch-hj-done b{display:block;font-size:17px;margin-bottom:4px}" +
      ".ch-hj-done a{color:#FFE9AE;font-weight:700}" +
      ".ch-hj-done .ch-ap-btn{display:inline-block;margin-top:10px;text-decoration:none}" +
      "@media(max-width:640px){.ch-airportpick.ch-hj{grid-template-columns:1fr;max-width:420px}.ch-airportpick.ch-hj .ch-ap-btn{width:100%}}";
    document.head.appendChild(st);
  }

  function member() {
    return fetch("/members/api/member/", { credentials: "include" })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .catch(function () { return null; });
  }
  function isPaid(m) {
    return !!m && (m.status === "paid" || m.status === "comped" ||
      !!(m.subscriptions && m.subscriptions.some(function (s) { return s.status === "active" || s.status === "trialing"; })));
  }
  function integrity() {
    return fetch("/members/api/integrity-token/", { credentials: "include" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .catch(function () { return ""; });
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }

  function convert(w) {
    var sel = w.querySelector(".ch-ap-select"), btn = w.querySelector(".ch-ap-btn");
    if (!sel || !btn) return;
    css();
    w.classList.add("ch-hj");

    var email = document.createElement("input");
    email.type = "email"; email.className = "ch-hj-email"; email.name = "email";
    email.placeholder = "you@example.com"; email.autocomplete = "email"; email.setAttribute("aria-label", "Email address");
    w.insertBefore(email, btn);

    var err = document.createElement("p"); err.className = "ch-hj-err"; err.hidden = true; w.appendChild(err);

    // The picker used to enable the button only once an airport was chosen
    // and then leave the page. Take the button over: it now needs both
    // fields and submits from here.
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn); btn = fresh;
    btn.disabled = false; btn.textContent = "Send me deals →";
    sel.addEventListener("change", function () { err.hidden = true; });
    email.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); go(); });

    var note = w.parentNode.querySelector(".ch-ap-note");
    if (note) note.textContent = "Unsubscribe any time.";

    function fail(msg) { err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = "Send me deals →"; }
    function go() {
      var slug = sel.value, addr = email.value.trim();
      if (!slug) { fail("Pick your airport first."); sel.focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { fail("That email does not look right."); email.focus(); return; }
      err.hidden = true; btn.disabled = true; btn.textContent = "Sending";
      var label = "loc-" + slug.replace(/^join-/, "");
      try { localStorage.setItem("ch-airport", CODES[slug] || ""); } catch (x) {}
      integrity().then(function (tok) {
        return fetch("/members/api/send-magic-link/", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: addr, emailType: "signup", labels: [label], name: "", honeypot: "", autoRedirect: true, integrityToken: tok, redirect: location.origin + "/" + slug + "/" })
        });
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) {
          var msg = "Something went wrong. Please try again.";
          try { var j = JSON.parse(t); if (j.errors && j.errors[0] && j.errors[0].message) msg = j.errors[0].message; } catch (x) {}
          fail(msg);
        });
        var done = document.createElement("div");
        done.className = "ch-hj-done";
        done.innerHTML = "<b>Check your inbox</b>We have sent a link to " + esc(addr) + ". Tap it and your first deals are on the way." +
          "<br><small>Nothing arrived? Check spam, or <a href=\"/\">try again</a>.</small>";
        w.parentNode.replaceChild(done, w);
        if (note) note.remove();
      }).catch(function () { fail("Could not reach the server. Please try again."); });
    }
  }

  function memberBox(w, m) {
    css();
    var note = w.parentNode.querySelector(".ch-ap-note");
    var done = document.createElement("div");
    done.className = "ch-hj-done";
    if (isPaid(m)) {
      done.innerHTML = "<b>You are a member</b>Every fare on the site is yours to book." +
        "<br><a class=\"ch-ap-btn\" href=\"/my-cloudhenry/\">Open My CloudHenry →</a>";
    } else {
      done.innerHTML = "<b>You are on the list</b>Signed in as " + esc(m.email) + ". Every Monday's full list, and book any fare, is one step away." +
        "<br><a class=\"ch-ap-btn\" href=\"#/portal/account/plans\">Try 40 days free →</a>";
    }
    w.parentNode.replaceChild(done, w);
    if (note) note.remove();
  }

  var done = false;
  function go() {
    if (done) return true;
    var w = document.getElementById("ch-airportpick");
    if (!w) return false;
    done = true;
    member().then(function (m) { if (m) memberBox(w, m); else convert(w); });
    return true;
  }
  if (!go()) {
    var tries = 0, t = setInterval(function () { if (go() || ++tries > 40) clearInterval(t); }, 150);
  }
})();
