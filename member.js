/* CloudHenry member area, "My CloudHenry".
 *
 * Runs on the /my-cloudhenry/ page. Everything it shows comes from three
 * places the browser can already reach as the signed-in member:
 *
 *   /members/api/member/      who they are, what they pay, their newsletters
 *   /tag/paid-draft/          every weekly email ever sent, as posts
 *   fares.json on the CDN     the live fares for their airport
 *
 * No backend, no key. The one thing Ghost does not know is which airport
 * a member belongs to, so the page asks once and keeps it in the
 * member's newsletters when an airport newsletter exists, or in this
 * browser otherwise.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";

  var root = document.getElementById("chm");
  if (!root) return;

  var CDN = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/";
  var AIRPORTS = [
    ["MAN","Manchester","manchester"], ["BHX","Birmingham","birmingham"], ["LBA","Leeds Bradford","leeds-bradford"],
    ["STN","London Stansted","london-stansted"], ["LTN","London Luton","london-luton"], ["BRS","Bristol","bristol"],
    ["NCL","Newcastle","newcastle"], ["GLA","Glasgow","glasgow"], ["EDI","Edinburgh","edinburgh"],
    ["LGW","London Gatwick","london-gatwick"], ["LPL","Liverpool","liverpool"], ["BFS","Belfast","belfast"]
  ];
  var UK = { LON:1, MAN:1, BHX:1, LBA:1, STN:1, LTN:1, BRS:1, NCL:1, GLA:1, EDI:1, LGW:1, LPL:1, BFS:1, CWL:1 };
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function $(sel) { return root.querySelector(sel); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }
  function fmt(iso) { var p = String(iso || "").slice(0, 10).split("-"); return p.length === 3 ? parseInt(p[2], 10) + " " + MON[parseInt(p[1], 10) - 1] : ""; }
  function fmtLong(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d) || d.getFullYear() < 2000) return "";   // Stripe's epoch placeholder is not a date anyone renews on
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function airportByCode(code) { for (var i = 0; i < AIRPORTS.length; i++) if (AIRPORTS[i][0] === code) return AIRPORTS[i]; return null; }
  function stamp() { var d = new Date(); return d.getUTCFullYear() + ("0" + (d.getUTCMonth() + 1)).slice(-2) + ("0" + d.getUTCDate()).slice(-2) + (d.getUTCHours() < 12 ? "-am" : "-pm"); }

  // ---- who is this -----------------------------------------------------
  function getMember() {
    return fetch("/members/api/member/", { credentials: "include" })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .catch(function () { return null; });
  }

  // Airport: the loc- label on the member is the truth, because that is
  // what the Monday email is sent by. Members cannot read their own
  // labels through Ghost, so the Worker looks it up. This browser's
  // remembered airport is the fallback if the Worker cannot be reached.
  var WORKER = "https://cloudhenry.henryswalk.workers.dev";
  function airportOf(m) {
    var local = "";
    try { local = localStorage.getItem("ch-airport") || ""; } catch (e) {}
    if (!m || !m.uuid) return Promise.resolve(airportByCode(local) ? local : "");
    return fetch(WORKER + "/airport?uuid=" + encodeURIComponent(m.uuid))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var code = j && j.code && airportByCode(j.code) ? j.code : "";
        if (code) { try { localStorage.setItem("ch-airport", code); } catch (e) {} return code; }
        return airportByCode(local) ? local : "";
      })
      .catch(function () { return airportByCode(local) ? local : ""; });
  }

  // Changing airport changes the label, so next Monday's email follows.
  function saveAirport(m, code) {
    try { localStorage.setItem("ch-airport", code); } catch (e) {}
    return fetch(WORKER + "/airport", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid: m.uuid, email: m.email, code: code })
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  // ---- the emails they have been sent ----------------------------------
  // The tag archive lists every weekly email as a post card. Read it as
  // the member (so paid posts resolve) and keep the ones for their airport,
  // spotted by the slug, which starts with the airport's name.
  function getEmails(code) {
    var slug = code ? airportByCode(code)[2] : "";
    var pages = [1, 2, 3].map(function (n) { return n === 1 ? "/tag/paid-draft/" : "/tag/paid-draft/page/" + n + "/"; });
    return Promise.all(pages.map(function (u) {
      return fetch(u, { credentials: "include" }).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; });
    })).then(function (htmls) {
      var out = [], seen = {};
      htmls.forEach(function (html) {
        if (!html) return;
        var doc = new DOMParser().parseFromString(html, "text/html");
        var cards = doc.querySelectorAll("article, .gh-card, .post-card");
        cards.forEach(function (c) {
          var a = c.querySelector("a[href]");
          var t = c.querySelector("h2, h3, .gh-card-title");
          var time = c.querySelector("time");
          if (!a || !t) return;
          var href = a.getAttribute("href") || "";
          var s = href.replace(/^https?:\/\/[^\/]+/, "").replace(/^\/|\/$/g, "");
          if (!s || seen[s]) return;
          seen[s] = 1;
          if (slug && s.indexOf(slug) !== 0) return;
          out.push({ href: href, title: t.textContent.trim(), date: time ? (time.getAttribute("datetime") || time.textContent.trim()) : "" });
        });
      });
      out.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      return out;
    });
  }

  // ---- live fares for their airport ----------------------------------
  function getFares(code) {
    return fetch(CDN + "fares.json?v=" + stamp(), { cache: "default" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fares) return [];
        var today = new Date().toISOString().slice(0, 10);
        var best = {};
        j.fares.forEach(function (f) {
          if (code && f.origin !== code) return;
          if (UK[f.destination]) return;
          (f.options || []).forEach(function (o) {
            if (!o.p || !o.d || o.d < today) return;
            var k = f.origin + f.destination;
            if (!best[k] || o.p < best[k].price) best[k] = { origin: f.origin, dest: f.destination, price: o.p, dep: o.d, ret: o.r || "", typical: f.typical || 0 };
          });
        });
        return Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.price - b.price; }).slice(0, 6);
      })
      .catch(function () { return []; });
  }

  function placeName(code) {
    var P = window.CH_PLACES || {};
    return P[code] ? P[code][0] : code;
  }
  function loadPlaces(next) {
    if (window.CH_PLACES) return next();
    var s = document.createElement("script");
    s.src = CDN + "places.js?v=" + stamp();
    s.onload = next; s.onerror = next;
    document.head.appendChild(s);
  }

  // ---- render ----------------------------------------------------------
  function signedOut() {
    root.innerHTML =
      '<div class="chm-card chm-gate">' +
        '<h2>This page is for members</h2>' +
        '<p>Sign in to see every email we have sent you, your airport, and this week&rsquo;s fares.</p>' +
        '<a class="chm-btn" href="/sign-in/">Sign in</a> <a class="chm-btn chm-ghost" href="/choose-city/">Try 40 days free</a>' +
      '</div>';
  }

  function membership(m) {
    var subs = (m.subscriptions || []).filter(function (s) { return s.status === "active" || s.status === "trialing" || s.status === "past_due"; });
    if (!subs.length) return { line: m.status === "comped" ? "Complimentary membership" : "On the list", paid: m.status === "paid" || m.status === "comped", since: m.created_at ? fmtLong(m.created_at) : "", next: "" };
    var s = subs[0];
    var amount = s.price && s.price.amount ? s.price.amount / 100 : 0;
    // Staff and gifted members carry a £0 subscription with no real dates.
    if (!amount || m.status === "comped") {
      return { line: "Complimentary membership", paid: true, since: s.start_date ? fmtLong(s.start_date) : "", next: "" };
    }
    var price = amount.toFixed(2).replace(/\.00$/, "") + " a " + (s.price.interval === "year" ? "year" : "month");
    var end = fmtLong(s.current_period_end);
    var trial = s.status === "trialing" && s.trial_end_at ? "Free trial until " + fmtLong(s.trial_end_at) : "";
    return {
      line: trial || ("£" + price + (end ? (s.cancel_at_period_end ? " · ends " + end : " · renews " + end) : "")),
      paid: true,
      since: s.start_date ? fmtLong(s.start_date) : "",
      next: s.current_period_end || ""
    };
  }

  function render(m, code, emails, fares) {
    var ap = code ? airportByCode(code) : null;
    // A name if Ghost has one. Failing that, an email like jemma.hillyer@
    // or tom_smith@ gives it away and is safe to use; jemmahillyer@ is
    // not, and a wrong guess is worse than none. Never the whole address.
    var first = String(m.firstname || m.name || "").trim().split(" ")[0];
    if (!first) {
      var local = String(m.email || "").split("@")[0].toLowerCase();
      var parts = local.split(/[._-]/);
      var STOP = { info:1, hello:1, admin:1, contact:1, mail:1, me:1, hi:1, team:1, sales:1, office:1, enquiries:1, test:1 };
      if (parts.length >= 2 && /^[a-z]{2,12}$/.test(parts[0]) && !STOP[parts[0]]) first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
    var ms = membership(m);
    var hour = new Date().getHours();
    var hello = (hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening") + (first ? ", " + esc(first) : "") + ".";

    var opts = AIRPORTS.map(function (a) {
      return '<option value="' + a[0] + '"' + (a[0] === code ? " selected" : "") + ">" + a[1] + " (" + a[0] + ")</option>";
    }).join("");

    var emailHtml = emails.length
      ? emails.slice(0, 12).map(function (e) {
          return '<a class="chm-mail" href="' + esc(e.href) + '"><span><b>' + esc(e.title) + '</b><small>' + esc(fmtLong(e.date) || e.date) + '</small></span><span class="chm-open">' + (ms.paid ? "Open &rarr;" : "Members only") + '</span></a>';
        }).join("")
      : '<p class="chm-empty">' + (ap ? "No emails for " + esc(ap[1]) + " yet. Your first one lands on Monday." : "Pick your airport above and your emails will show here.") + '</p>';

    var fareHtml = fares.length
      ? fares.map(function (f) {
          var link = "/search/?from=" + f.origin + "&to=" + encodeURIComponent(placeName(f.dest));
          var was = f.typical && f.typical > f.price * 1.15 ? '<s>£' + f.typical + '</s>' : "";
          return '<a class="chm-fare" href="' + link + '"><span><b>' + esc(placeName(f.dest)) + '</b><small>' + (f.ret ? "return · " + fmt(f.dep) + " to " + fmt(f.ret) : "one-way · " + fmt(f.dep)) + '</small></span><span class="chm-price">£' + f.price + was + '</span></a>';
        }).join("")
      : '<p class="chm-empty">Pick your airport to see this week&rsquo;s fares.</p>';

    root.innerHTML =
      '<div class="chm-hero">' +
        '<div class="chm-hi"><h1>' + hello + '</h1>' +
        '<p>' + (ap ? "Your airport is <b>" + esc(ap[1]) + "</b>. " : "Tell us your airport and everything on this page follows it. ") +
          (ms.paid ? "Every email we send you is kept here." : 'Members get the full list every Monday and can book any fare. <a href="#/portal/account/plans"><b>Try 40 days free &rarr;</b></a>') + '</p></div>' +
        '<label class="chm-pick"><span>Home airport</span><select id="chmAirport"><option value="">Choose your airport</option>' + opts + '</select></label>' +
      '</div>' +
      '<div class="chm-stats">' +
        '<div class="chm-stat"><small>Membership</small><b>' + esc(ms.line) + '</b></div>' +
        '<div class="chm-stat"><small>' + (ms.paid ? "Member since" : "On the list since") + '</small><b>' + esc(ms.since || "today") + '</b></div>' +
        '<div class="chm-stat"><small>' + (ms.paid ? "Emails kept for you" : "Member emails this month") + '</small><b>' + emails.length + '</b></div>' +
        '<div class="chm-stat"><small>Cheapest this week</small><b>' + (fares.length ? "£" + fares[0].price + " to " + esc(placeName(fares[0].dest)) : "pick an airport") + '</b></div>' +
      '</div>' +
      '<div class="chm-cols">' +
        '<div>' +
          '<section class="chm-card"><div class="chm-hd"><h2>' + (ms.paid ? "Your emails" : "What members got") + '</h2>' + (ap ? '<span>' + esc(ap[1]) + '</span>' : '') + '</div>' + emailHtml + '</section>' +
          '<section class="chm-card"><div class="chm-hd"><h2>Your account</h2></div>' +
            '<div class="chm-rows">' +
              '<div class="chm-row"><span>Email<small>' + esc(m.email) + '</small></span><a href="#/portal/account/profile">Change</a></div>' +
              (m.name
                ? '<div class="chm-row"><span>Name<small>' + esc(m.name) + '</small></span><a href="#/portal/account/profile">Change</a></div>'
                : '<div class="chm-row"><span>Name<small>Not set</small></span><form class="chm-name"><input type="text" name="name" maxlength="60" placeholder="Your first name" aria-label="Your name"><button type="submit">Save</button></form></div>') +
              '<div class="chm-row"><span>Membership<small>' + esc(ms.line) + '</small></span><a href="#/portal/account">Manage</a></div>' +
              '<div class="chm-row"><span>Emails<small>' + ((m.newsletters || []).length ? "On" : "Off") + '</small></span><a href="#/portal/account/newsletters">Change</a></div>' +
              '<div class="chm-row"><span>Sign out</span><a href="#/portal/signout">Sign out</a></div>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<div>' +
          '<section class="chm-card"><div class="chm-hd"><h2>This week from ' + (ap ? esc(ap[1]) : "your airport") + '</h2><a href="/search/' + (code ? "?from=" + code : "") + '">Search every fare &rarr;</a></div><div class="chm-fares">' + fareHtml + '</div>' +
            '<form class="chm-plan" action="/search/" method="get">' + (code ? '<input type="hidden" name="from" value="' + code + '">' : '') +
            '<input type="text" name="plan" maxlength="300" placeholder="Tell us what you fancy: somewhere warm in November under £60" aria-label="Plan my trip"><button type="submit">Plan it &rarr;</button></form>' +
          '</section>' +
        '</div>' +
      '</div>';

    var sel = root.querySelector("#chmAirport");
    sel.addEventListener("change", function () {
      var v = sel.value;
      if (!v) return;
      sel.disabled = true;
      saveAirport(m, v).then(function () { start(); });
    });

    // Members can set their own name here; Ghost lets a signed-in member
    // change name and newsletters through its own endpoint.
    var nameForm = root.querySelector(".chm-name");
    if (nameForm) nameForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = nameForm.querySelector("input").value.trim().slice(0, 60);
      if (!v) return;
      nameForm.querySelector("button").disabled = true;
      fetch("/members/api/member/", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: v }) })
        .then(function () { start(); }).catch(function () { start(); });
    });
  }

  function skeleton() {
    root.innerHTML = '<div class="chm-card chm-loading">Loading your CloudHenry&hellip;</div>';
  }

  function start() {
    skeleton();
    getMember().then(function (m) {
      if (!m) { signedOut(); return; }
      airportOf(m).then(function (code) {
        loadPlaces(function () {
          Promise.all([getEmails(code), getFares(code)]).then(function (res) {
            render(m, code, res[0], res[1]);
          });
        });
      });
    });
  }

  // Newsletters the site offers, so an airport choice can move the member
  // onto the matching one. Public, no key.
  fetch("/members/api/site/", { credentials: "include" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { window.__chNewsletters = (j && j.site && j.site.newsletters) || (j && j.newsletters) || []; })
    .catch(function () {})
    .then(start);
})();
