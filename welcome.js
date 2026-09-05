/* CloudHenry welcome screen, shown the moment someone joins.
 *
 * Their airport, the five cheapest fares out of it today from the live
 * feed, how many destinations members can see, and one button for the
 * 40 day trial. Used by the homepage box (home-join.js) and the airport
 * pages (join.js), so it lives in one place.
 *
 *   window.CH_WELCOME.render(container, { code:"MAN", email, signedIn, slug })
 *
 * signedIn true: the trial button opens Ghost's plan chooser directly.
 * signedIn false: Ghost will not start a checkout for someone not signed
 * in, so the screen says a sign-in link has been emailed and that the
 * trial is one tap away after it.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";
  var CDN = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/";
  var NAMES = { MAN:"Manchester", BHX:"Birmingham", LBA:"Leeds Bradford", STN:"London Stansted", LTN:"London Luton",
                BRS:"Bristol", NCL:"Newcastle", GLA:"Glasgow", EDI:"Edinburgh", LGW:"London Gatwick", LPL:"Liverpool", BFS:"Belfast" };
  var UK = { LON:1, MAN:1, BHX:1, LBA:1, STN:1, LTN:1, BRS:1, NCL:1, GLA:1, EDI:1, LGW:1, LPL:1, BFS:1, CWL:1, ABZ:1, INV:1, SOU:1, EXT:1, NQY:1, LDY:1, ILY:1, KOI:1 };
  var DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function stamp() { var d = new Date(); return d.getUTCFullYear() + ("0" + (d.getUTCMonth() + 1)).slice(-2) + ("0" + d.getUTCDate()).slice(-2) + (d.getUTCHours() < 12 ? "-am" : "-pm"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
  function fmt(iso) { var d = new Date(iso + "T00:00:00Z"); return isNaN(d) ? iso : DAYS[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]; }

  function css() {
    if (document.getElementById("ch-welcome-css")) return;
    var st = document.createElement("style");
    st.id = "ch-welcome-css";
    st.textContent =
      ".chw,.chw.ch-reveal{max-width:440px;margin:0 auto;text-align:center;color:#fff;opacity:1!important;transform:none!important}" +
      ".chw-pill{display:inline-block;background:#F5C242;color:#12384F;font-weight:800;font-size:11px;letter-spacing:.16em;text-transform:uppercase;padding:6px 14px;border-radius:999px}" +
      ".chw h3{margin:10px 0 6px;font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-.03em;color:#fff}" +
      ".chw-sub{font-size:14px;color:#D7EDFA;margin:0 auto 14px;max-width:36ch;line-height:1.45}" +
      ".chw-card{background:#fff;border-radius:16px;padding:6px 6px 4px;color:#0E3550;text-align:left;box-shadow:0 10px 24px rgba(11,85,140,.22)}" +
      ".chw-row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:9px 10px;border-bottom:1px solid rgba(14,53,80,.12)}" +
      ".chw-row:last-child{border-bottom:0}" +
      ".chw-row img{width:28px;height:21px;border-radius:3px;display:block}" +
      ".chw-row .n{font-weight:700;font-size:14.5px;min-width:0}.chw-row .n small{display:block;font-weight:500;color:#46607A;font-size:11.5px}" +
      ".chw-row .p{font-weight:800;font-size:17px;text-align:right;font-variant-numeric:tabular-nums}.chw-row .p small{display:block;font-weight:600;color:#7A90A5;font-size:10.5px;text-decoration:line-through}" +
      ".chw-more{font-size:13.5px;color:#D7EDFA;margin:14px auto 12px;max-width:36ch;line-height:1.45}.chw-more b{color:#FFE9AE}" +
      ".chw-btn{display:inline-block;background:#F5C242;color:#12384F;border-radius:999px;padding:13px 24px;font-weight:800;font-size:15px;text-decoration:none!important;box-shadow:0 2px 6px rgba(14,53,80,.16)}" +
      ".chw-tiny{font-size:12.5px;color:#D7EDFA;margin:10px auto 0;max-width:38ch;line-height:1.45}.chw-tiny b{color:#FFE9AE}" +
      ".chw-loading{font-size:13px;color:#D7EDFA;padding:14px 0}";
    document.head.appendChild(st);
  }

  function flagCode(p) {
    var f = p && p[2]; if (!f || f.length < 4) return "";
    var a = f.codePointAt(0), b = f.codePointAt(2);
    if (a < 0x1F1E6 || a > 0x1F1FF) return "";
    return (String.fromCharCode(65 + (a - 0x1F1E6)) + String.fromCharCode(65 + (b - 0x1F1E6))).toLowerCase();
  }

  function places(next) {
    if (window.CH_PLACES) return next(window.CH_PLACES);
    var s = document.createElement("script");
    s.src = CDN + "places.js?v=" + stamp();
    s.onload = function () { next(window.CH_PLACES || {}); };
    s.onerror = function () { next({}); };
    document.head.appendChild(s);
  }

  // Five cheapest one-way fares out of the airport, one per destination,
  // from today's feed. The per-airport file is the full picture; the
  // slim homepage file is the fallback.
  function fares(code, next) {
    var today = new Date().toISOString().slice(0, 10);
    function pick(list) {
      var best = {}, count = {};
      (list || []).forEach(function (f) {
        if (f.origin !== code || UK[f.destination]) return;
        count[f.destination] = 1;
        (f.options || []).forEach(function (o) {
          if (!o.p || !o.d || o.d < today || o.r) return;
          if (!best[f.destination] || o.p < best[f.destination].p) best[f.destination] = { dest: f.destination, p: o.p, d: o.d, typ: f.typical || 0 };
        });
      });
      var rows = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.p - b.p; }).slice(0, 5);
      return { rows: rows, destinations: Object.keys(count).length };
    }
    fetch(CDN + "fares-" + code + ".json?v=" + stamp()).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.fares) return next(pick(j.fares));
        return fetch(CDN + "fares.json?v=" + stamp()).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (s) { next(pick(s && s.fares)); });
      }).catch(function () { next({ rows: [], destinations: 0 }); });
  }

  function render(el, opts) {
    css();
    var code = opts.code, city = NAMES[code] || "your airport";
    el.className = (el.className || "").replace(/\bch-hj-done\b|\bch-join\b/g, "").trim() + " chw";
    el.innerHTML = '<span class="chw-pill">You\'re in</span><h3>Welcome, ' + esc(city) + '.</h3><div class="chw-loading">Finding today\'s cheapest fares out of ' + esc(city) + '</div>';

    places(function (P) {
      fares(code, function (data) {
        var rows = data.rows.map(function (r) {
          var p = P[r.dest] || [r.dest, "", ""], fc = flagCode(p);
          return '<div class="chw-row">' +
            (fc ? '<img alt="" loading="lazy" src="https://flagcdn.com/w40/' + fc + '.png">' : '<span></span>') +
            '<span class="n">' + esc(p[0]) + '<small>' + esc(fmt(r.d)) + ' · one way</small></span>' +
            '<span class="p">£' + r.p + (r.typ && r.typ > r.p * 1.15 ? '<small>usually £' + r.typ + '</small>' : '') + '</span></div>';
        }).join("");

        var html = '<span class="chw-pill">You\'re in</span><h3>Welcome, ' + esc(city) + '.</h3>';
        if (rows) {
          html += '<p class="chw-sub">The five cheapest fares out of ' + esc(city) + ' right now, found this morning.</p>' +
                  '<div class="chw-card">' + rows + '</div>' +
                  '<p class="chw-more">That\'s 5 of <b>' + data.destinations + ' destinations</b> from ' + esc(city) + ' today. Members see every one, get the full list each Monday, and book any fare in one tap.</p>';
        } else {
          html += '<p class="chw-sub">Your first ' + esc(city) + ' email lands on Monday. Members get every fare we find and book any of them in one tap.</p>';
        }
        if (opts.signedIn) {
          html += '<a class="chw-btn" href="#/portal/account/plans">Try 40 days free &rarr;</a>' +
                  '<p class="chw-tiny">Then £2.99 a month. Cancel any time, no contract.</p>';
        } else {
          html += '<p class="chw-tiny"><b>Want all of them?</b> We have emailed a sign-in link to ' + esc(opts.email || "you") + '. Tap it and you are one press from 40 days free, then £2.99 a month. Cancel any time, no contract.</p>';
        }
        html += '<p class="chw-tiny">Not now? Your first ' + esc(city) + ' email lands on Monday.</p>';
        el.innerHTML = html;
      });
    });
  }

  window.CH_WELCOME = { render: render, NAMES: NAMES };
})();
