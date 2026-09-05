/* CloudHenry sign-in page, /sign-in/.
 *
 * Ghost's Portal sign-in box carries its own "Sign up" link, which skips
 * choosing an airport. So the header's Sign in, and any #/portal/signin
 * link, comes here instead. Members get a sign-in link by email, the way
 * Portal does it, minus the side door.
 *
 * Someone who has not joined is pointed at /choose-city/ with their email
 * carried along, so they land on their airport page with it filled in.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";

  var root = document.getElementById("ch-signin");
  if (!root) return;

  function member() {
    return fetch("/members/api/member/", { credentials: "include" })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .catch(function () { return null; });
  }
  // Ghost refuses a magic-link request without a fresh integrity token.
  function integrity() {
    return fetch("/members/api/integrity-token/", { credentials: "include" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .catch(function () { return ""; });
  }
  function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function params() {
    var p = {};
    (location.search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      var i = kv.indexOf("="); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
    });
    return p;
  }
  function joinHref(email) { return "/choose-city/" + (email ? "?email=" + encodeURIComponent(email) : ""); }

  function render() {
    var q = params();
    root.innerHTML =
      '<div class="chs-card">' +
        '<div class="chs-mark" aria-hidden="true">&#9992;</div>' +
        '<h1>Sign in</h1>' +
        '<p class="chs-lead">Enter the email you joined with. We send you a link, no password needed.</p>' +
        '<form class="chs-form" novalidate>' +
          '<input type="email" name="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address" value="' + escapeHtml(q.email || "") + '">' +
          '<button type="submit">Email me a link</button>' +
        '</form>' +
        '<div class="chs-err" role="alert" hidden></div>' +
        '<p class="chs-alt">New to CloudHenry? <a href="' + joinHref(q.email) + '">Pick your airport to join &rarr;</a></p>' +
      '</div>';

    var form = root.querySelector("form"), input = root.querySelector("input"), btn = root.querySelector("button"), err = root.querySelector(".chs-err");
    var alt = root.querySelector(".chs-alt a");
    input.addEventListener("input", function () { alt.setAttribute("href", joinHref(input.value.trim())); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "That email does not look right."; err.hidden = false; input.focus(); return; }
      err.hidden = true; btn.disabled = true; btn.textContent = "Sending";
      integrity().then(function (tok) {
        return fetch("/members/api/send-magic-link/", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email, emailType: "signin", honeypot: "", autoRedirect: true, integrityToken: tok, redirect: location.origin + "/my-cloudhenry/" })
        });
      }).then(function (r) {
        if (r.ok) {
          root.innerHTML =
            '<div class="chs-card chs-sent">' +
              '<div class="chs-mark" aria-hidden="true">&#9993;</div>' +
              '<h1>Check your inbox</h1>' +
              '<p class="chs-lead">We have sent a sign-in link to <b>' + escapeHtml(email) + '</b>. Tap it and you land in My CloudHenry.</p>' +
              '<p class="chs-alt">Nothing arrived? Check spam, or <a href="/sign-in/?email=' + encodeURIComponent(email) + '">try again</a>.<br>' +
              'Not joined yet? That email has no account, so <a href="' + joinHref(email) + '">pick your airport to join &rarr;</a></p>' +
            '</div>';
        } else {
          return r.text().then(function (t) {
            var msg = "Something went wrong. Please try again.";
            try { var j = JSON.parse(t); if (j.errors && j.errors[0] && j.errors[0].message) msg = j.errors[0].message; } catch (x) {}
            err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = "Email me a link";
          });
        }
      }).catch(function () { err.textContent = "Could not reach the server. Please try again."; err.hidden = false; btn.disabled = false; btn.textContent = "Email me a link"; });
    });
    if (!input.value) input.focus();
  }

  member().then(function (mm) {
    if (mm) { location.replace("/my-cloudhenry/"); return; }
    render();
  });
})();
