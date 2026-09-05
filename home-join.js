/* CloudHenry homepage sign-up, one step.
 *
 * The hero picker used to send people to their airport page to type an
 * email there. Twelve thousand visitors, sixty emails. Now the email
 * field sits under the picker and the button does the whole job: Ghost
 * creates the member with the airport label and emails a link that
 * lands them, signed in, on their airport page, where the one button is
 * "Try 40 days free".
 *
 * Signed-in members do not see the box. A paying member gets the launchpad:
 * today's three cheapest fares out of their airport, the count of the rest,
 * and buttons to My CloudHenry and the search. A Freemium member gets the
 * welcome screen with the trial button.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";
  if (location.pathname.replace(/\/+$/, "") !== "") return;

  var WORKER = "https://cloudhenry.henryswalk.workers.dev";
  var JOIN_URL = WORKER + "/join";
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
      ".ch-hj-done .ch-ap-btn{display:inline-block;margin-top:10px;text-decoration:none;color:#12384F!important;font-weight:800}" +
      ".ch-ap-search,.ch-ap-search.ch-reveal{display:block;text-align:center;margin:2px auto 14px;font-size:13.5px;color:#fff!important;text-decoration:none;opacity:1!important;transform:none!important}" +
      ".ch-ap-search b{color:#FFE071;border-bottom:2px solid rgba(255,224,113,.6);padding-bottom:1px}" +
      "@media(max-width:640px){.ch-airportpick.ch-hj{grid-template-columns:1fr;max-width:420px}.ch-airportpick.ch-hj .ch-ap-btn{width:100%}}" +
      /* Member launchpad: three fare tiles, one "more" tile, two buttons. Left aligned in the desktop grid, centred once the hero stacks. */
      ".chmh,.chmh.ch-reveal{max-width:560px;margin:0;text-align:left;opacity:1!important;transform:none!important}" +
      ".chmh-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 14px}" +
      ".chmh-strip:empty{min-height:96px}" +
      ".chmh-tile{display:block;min-width:0;background:#fff;border-radius:16px;padding:12px 12px 11px;text-align:left;text-decoration:none!important;color:#0E3550;box-shadow:0 10px 24px rgba(4,45,80,.18);transition:transform .15s}" +
      ".chmh-tile:hover{transform:translateY(-2px)}" +
      ".chmh-tile img,.chmh-noflag{width:26px;height:19.5px;border-radius:3px;display:block;margin-bottom:8px;background:#E6EEF5}" +
      ".chmh-tile .c{font-weight:800;font-size:14.5px;line-height:1.15;letter-spacing:-.2px;color:#0E3550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      ".chmh-tile .d{font-size:11.5px;color:#5A7488;font-weight:600;margin-top:2px;white-space:nowrap}" +
      ".chmh-tile .p{font-size:22px;font-weight:900;letter-spacing:-.6px;margin-top:8px;line-height:1;color:#0E3550;font-variant-numeric:tabular-nums;white-space:nowrap}" +
      ".chmh-tile .p small{font-size:11px;font-weight:600;color:#7A90A5;text-decoration:line-through;margin-left:6px;letter-spacing:0}" +
      ".chmh-tile.more{background:linear-gradient(160deg,#0E6FB6,#0B4F86);color:#fff;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}" +
      ".chmh-tile.more .n{font-size:26px;font-weight:900;letter-spacing:-1px;line-height:1;color:#FFE071}" +
      ".chmh-tile.more .l{font-size:11.5px;font-weight:700;margin-top:6px;line-height:1.3;color:#fff}" +
      ".chmh-btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-start}" +
      ".chmh-btn{display:inline-block;border-radius:999px;padding:13px 24px;font-weight:800;font-size:15px;text-decoration:none!important;white-space:nowrap}" +
      ".chmh-btn.y{background:#F5C242;color:#12384F!important;box-shadow:0 8px 20px rgba(4,45,80,.3)}" +
      ".chmh-btn.g{background:#fff;color:#12384F!important;box-shadow:0 8px 20px rgba(4,45,80,.18)}" +
      ".chmh-foot{color:#12384F;font-size:13px;font-weight:600;margin:14px 0 0}" +
      ".chmh-foot a{color:#0B4F86!important;font-weight:800;text-decoration:underline;text-underline-offset:3px}" +
      "html.ch-mh .ch-sub-mobile{display:none!important}" +
      "@media(max-width:900px){.chmh{margin:0 auto;text-align:center}.chmh-btns{justify-content:center}}" +
      "@media(max-width:640px){html.ch-mh .ch-sub{display:block!important;font-size:15px!important;line-height:1.5!important;max-width:none!important;margin:0 auto 16px!important}" +
      ".chmh-strip{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.chmh-tile{padding:11px 11px 10px}.chmh-tile .p{font-size:20px}.chmh-btn{flex:1 1 100%;text-align:center}}";
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
    if (note) note.textContent = "40 days free, then £2.99 a month. Unsubscribe any time, no contract.";

    // People who arrive wanting one specific trip should see the way to
    // the search at once, not scroll looking for it.
    var go = document.createElement("a");
    go.className = "ch-ap-search";
    go.href = "/search/";
    go.innerHTML = "Looking for a specific trip? <b>Search every flight &rarr;</b>";
    (note || w).parentNode.insertBefore(go, (note || w).nextSibling);
    function pointSearch() { go.href = "/search/" + (sel.value && CODES[sel.value] ? "?from=" + CODES[sel.value] : ""); }
    sel.addEventListener("change", pointSearch); pointSearch();

    function fail(msg) { err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = "Send me deals →"; }
    function go() {
      var slug = sel.value, addr = email.value.trim();
      if (!slug) { fail("Pick your airport first."); sel.focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { fail("That email does not look right."); email.focus(); return; }
      err.hidden = true; btn.disabled = true; btn.textContent = "Sending";
      var code = CODES[slug] || "";
      try { localStorage.setItem("ch-airport", code); } catch (x) {}

      // The Worker creates the member on the spot, airport attached, so
      // they are on the list before this function returns. Ghost will not
      // start a paid checkout for someone who is not signed in, so a
      // sign-in link goes out as well; the welcome screen explains that
      // the trial is one tap away after it.
      fetch(JOIN_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr, airport: slug, source: "homepage", website: "" })
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok && j && j.ok, msg: j && j.error }; });
      }).then(function (res) {
        if (!res.ok) { fail(res.msg || "Something went wrong. Please try again."); return; }
        integrity().then(function (tok) {
          return fetch("/members/api/send-magic-link/", {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: addr, emailType: "signin", honeypot: "", autoRedirect: true, integrityToken: tok, redirect: location.origin + "/" + slug + "/?intent=trial" })
          });
        }).catch(function () {});
        var done = document.createElement("div");
        done.className = "ch-hj-done";
        w.parentNode.replaceChild(done, w);
        if (note) note.remove();
        if (window.CH_WELCOME) window.CH_WELCOME.render(done, { code: code, email: addr, signedIn: false, slug: slug });
        else done.innerHTML = "<b>You are in</b>Your first deals from " + esc(slug.replace(/^join-/, "").replace(/-/g, " ")) + " land on Monday.";
      }).catch(function () { fail("Could not reach the server. Please try again."); });
    }
  }

  // The member's airport comes from their Ghost label via the Worker, the
  // same as My CloudHenry; the picker's localStorage copy is the fallback.
  function airportOf(m) {
    var local = "";
    try { local = localStorage.getItem("ch-airport") || ""; } catch (x) {}
    if (!m || !m.uuid) return Promise.resolve(local);
    return fetch(WORKER + "/airport?uuid=" + encodeURIComponent(m.uuid))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.code) || local; })
      .catch(function () { return local; });
  }

  // A name if Ghost has one; failing that, jemma.hillyer@ gives it away and
  // is safe to use, jemmahillyer@ is not. Never the whole address.
  function firstName(m) {
    var first = String(m.firstname || m.name || "").trim().split(" ")[0];
    if (!first) {
      var parts = String(m.email || "").split("@")[0].toLowerCase().split(/[._-]/);
      var STOP = { info:1, hello:1, admin:1, contact:1, mail:1, me:1, hi:1, team:1, sales:1, office:1, enquiries:1, test:1 };
      if (parts.length >= 2 && /^[a-z]{2,12}$/.test(parts[0]) && !STOP[parts[0]]) first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    return first;
  }
  function greeting(m) {
    var h = new Date().getHours(), first = firstName(m);
    return (h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening") + (first ? ", " + esc(first) : "") + ".";
  }

  // A paying member does not need the pitch. The hero becomes their
  // launchpad: today's three cheapest fares out of their airport, how many
  // more there are, and the two places they actually go.
  function memberHero(w, m, code) {
    css();
    var W = window.CH_WELCOME, city = (W && W.NAMES[code]) || "";
    document.documentElement.classList.add("ch-mh");
    var eyebrow = (city ? city + " · " : "") + "member · next email Monday";
    var eb = document.querySelector(".ch-eyebrow"); if (eb) eb.textContent = eyebrow;
    var sub = document.querySelector(".ch-hgrid .ch-sub") || document.querySelector(".ch-sub");
    if (sub) {
      sub.dataset.chp = "1";
      sub.innerHTML = greeting(m) + (city ? " Finding today’s cheapest fares out of " + esc(city) + "." : " Set your airport in your account and today’s cheapest fares from it will sit here.");
    }
    var search = "/search/" + (code ? "?from=" + encodeURIComponent(code) : "");
    var box = document.createElement("div");
    box.className = "chmh";
    box.innerHTML = (city ? '<div class="chmh-strip"></div>' : '') +
      '<div class="chmh-btns"><a class="chmh-btn y" href="/my-cloudhenry/">Open my deals &rarr;</a><a class="chmh-btn g" href="' + search + '">Search every flight</a></div>' +
      '<p class="chmh-foot">' + (city ? 'Wrong airport? <a href="/my-cloudhenry/">Change it in your account</a>' : '<a href="/my-cloudhenry/">Set your airport &rarr;</a>') + '</p>';
    var note = w.parentNode.querySelector(".ch-ap-note");
    w.parentNode.replaceChild(box, w);
    if (note) note.remove();
    if (!city || !W || !W.fares) return;

    W.places(function (P) {
      W.fares(code, function (data) {
        var rows = data.rows.slice(0, 3);
        if (!rows.length) { if (sub) sub.innerHTML = greeting(m) + " Every fare from " + esc(city) + " is yours to book."; return; }
        if (sub) sub.innerHTML = greeting(m) + ' <span class="ch-hl">' + data.destinations + " destinations</span> from " + esc(city) + " were checked this morning. The cheapest right now:";
        var html = rows.map(function (r) {
          var p = P[r.dest] || [r.dest, "", ""], fc = W.flagCode(p);
          return '<a class="chmh-tile" href="/search/?from=' + encodeURIComponent(code) + '&to=' + encodeURIComponent(p[0]) + '">' +
            (fc ? '<img alt="" src="https://flagcdn.com/w40/' + fc + '.png">' : '<span class="chmh-noflag"></span>') +
            '<div class="c">' + esc(p[0]) + '</div><div class="d">' + esc(W.fmt(r.d)) + '</div>' +
            '<div class="p">£' + r.p + (r.typ && r.typ > r.p * 1.15 ? '<small>£' + r.typ + '</small>' : '') + '</div></a>';
        }).join("");
        var more = data.destinations - rows.length, from = data.rows[Math.min(3, data.rows.length - 1)].p;
        if (more > 0) html += '<a class="chmh-tile more" href="' + search + '"><div class="n">+' + more + '</div><div class="l">more places<br>from £' + from + '</div></a>';
        box.querySelector(".chmh-strip").innerHTML = html;
      });
    });
  }

  function memberBox(w, m, code) {
    css();
    var note = w.parentNode.querySelector(".ch-ap-note");
    var done = document.createElement("div");
    done.className = "ch-hj-done";
    done.innerHTML = "<b>You are on Freemium</b>Signed in as " + esc(m.email) + ". Every Monday's full list, and book any fare, is one step away." +
      "<br><a class=\"ch-ap-btn\" href=\"#/portal/account/plans\">Try 40 days free →</a>";
    w.parentNode.replaceChild(done, w);
    if (note) note.remove();
    // Members want the search most of all; point at it here too.
    var go = document.createElement("a");
    go.className = "ch-ap-search";
    go.href = "/search/" + (code ? "?from=" + code : "");
    go.innerHTML = "Looking for a specific trip? <b>Search every flight &rarr;</b>";
    done.parentNode.insertBefore(go, done.nextSibling);
    // A signed-in list member with a known airport gets the full welcome:
    // their fares and the trial button.
    if (code && window.CH_WELCOME) window.CH_WELCOME.render(done, { code: code, email: m.email, signedIn: true });
  }

  var done = false;
  function go() {
    if (done) return true;
    var w = document.getElementById("ch-airportpick");
    if (!w) return false;
    done = true;
    member().then(function (m) {
      if (!m) return convert(w);
      airportOf(m).then(function (code) { if (isPaid(m)) memberHero(w, m, code); else memberBox(w, m, code); });
    });
    return true;
  }
  if (!go()) {
    var tries = 0, t = setInterval(function () { if (go() || ++tries > 40) clearInterval(t); }, 150);
  }
})();
