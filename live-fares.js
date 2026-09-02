/* CloudHenry live fares.
 *
 * Until now only the search page read the daily feed. The homepage
 * teaser and the twelve join pages each carried their own list of fares
 * typed into Ghost by hand, and the homepage list had not moved since
 * 30 August. So the busiest pages on the site were quoting prices that
 * were days old while the search page was current.
 *
 * This points those blocks at the same fares.json the search uses, so
 * every price on the site moves together each morning.
 *
 * If the feed cannot be reached, whatever Ghost rendered is left exactly
 * as it is. Yesterday's real price beats an empty box.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";

  var CDN  = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/";
  var DATA = CDN + "fares.json";

  // jsDelivr tells the browser to cache for seven days, so without a
  // daily stamp a returning visitor would keep last week's file and the
  // whole point of a daily refresh would be lost.
  function dataUrl() {
    var d = new Date();
    return DATA + "?v=" + d.getUTCFullYear() +
           ("0" + (d.getUTCMonth() + 1)).slice(-2) +
           ("0" + d.getUTCDate()).slice(-2);
  }

  // Short enough for the homepage teaser, which is one line at 12px.
  // The three London airports are named individually: "London" three
  // times over would tell a Gatwick reader nothing.
  var ORIGIN_NAME = {
    MAN:"Manchester", BHX:"Birmingham", LBA:"Leeds", STN:"Stansted",
    LTN:"Luton", BRS:"Bristol", NCL:"Newcastle", GLA:"Glasgow",
    EDI:"Edinburgh", LGW:"Gatwick", LPL:"Liverpool", BFS:"Belfast"
  };

  var JOIN_ORIGIN = {
    "manchester":"MAN", "birmingham":"BHX", "leeds":"LBA",
    "leeds-bradford":"LBA", "london-stansted":"STN", "stansted":"STN",
    "london-luton":"LTN", "luton":"LTN", "bristol":"BRS",
    "newcastle":"NCL", "glasgow":"GLA", "edinburgh":"EDI",
    "london-gatwick":"LGW", "gatwick":"LGW", "liverpool":"LPL",
    "belfast":"BFS"
  };

  // A hop to another UK airport is a real saving but it undersells a site
  // about getting away, so the teasers skip domestic routes.
  var UK = { LON:1, MAN:1, BHX:1, LBA:1, STN:1, LTN:1, BRS:1, NCL:1,
             GLA:1, EDI:1, LGW:1, LPL:1, BFS:1, CWL:1, ILY:1, KOI:1,
             ABZ:1, INV:1, SOU:1, EXT:1, NQY:1, LDY:1 };

  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var SUBDIVISION = { "Scotland":"gb-sct", "England":"gb-eng", "Wales":"gb-wls", "N. Ireland":"gb-nir" };

  function places() { return window.CH_PLACES || null; }

  function fmt(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return "";
    return parseInt(p[2], 10) + " " + MON[parseInt(p[1], 10) - 1];
  }

  function daysFromToday(iso) {
    var t = Date.parse(String(iso).slice(0, 10) + "T00:00:00Z");
    if (isNaN(t)) return 1e9;
    var now = new Date();
    var today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((t - today) / 86400000);
  }

  // Windows ships no flag emoji, so the site uses flagcdn images. The UK
  // nations need subdivision codes rather than the union flag.
  function flagCode(p) {
    if (!p) return "";
    if (SUBDIVISION[p[1]]) return SUBDIVISION[p[1]];
    var f = p[2];
    if (!f || f.length < 4) return "";
    var a = f.codePointAt(0), b = f.codePointAt(2);
    if (a < 0x1F1E6 || a > 0x1F1FF) return "";
    return (String.fromCharCode(65 + (a - 0x1F1E6)) + String.fromCharCode(65 + (b - 0x1F1E6))).toLowerCase();
  }

  /* ---- turning the feed into candidate rows -------------------------- */

  // One entry per bookable date, with the route's own average worked out
  // separately for one-way and return. Comparing a return fare against a
  // one-way average is what once produced a struck-through price lower
  // than the price beside it.
  function expand(route) {
    var opts = (route.options && route.options.length) ? route.options : null;
    var rows = [];
    if (!opts) {
      if (route.price && route.departure && daysFromToday(route.departure) >= 0) {
        rows.push({ dep: String(route.departure).slice(0,10),
                    ret: route.ret ? String(route.ret).slice(0,10) : "",
                    price: route.price });
      }
    } else {
      opts.forEach(function (o) {
        if (!o.p || o.p <= 0 || !o.d) return;
        if (daysFromToday(o.d) < 0) return;                 // already gone
        rows.push({ dep: String(o.d).slice(0,10), ret: o.r ? String(o.r).slice(0,10) : "", price: o.p });
      });
    }

    var ow = [], rt = [];
    rows.forEach(function (r) { (r.ret ? rt : ow).push(r.price); });
    function mean(a) {
      if (!a.length) return 0;
      var s = 0;
      a.forEach(function (v) { s += v; });
      return Math.round(s / a.length);
    }
    var owAvg = mean(ow), rtAvg = mean(rt);

    rows.forEach(function (r) {
      r.origin = route.origin;
      r.dest   = route.destination;
      r.avg    = r.ret ? rtAvg : owAvg;
    });
    return rows;
  }

  // Cheapest per destination, so one popular city cannot fill the block.
  function bestPerDestination(rows) {
    var best = {};
    rows.forEach(function (r) {
      var k = r.dest;
      if (!best[k] || r.price < best[k].price) best[k] = r;
    });
    return Object.keys(best).map(function (k) { return best[k]; })
      .sort(function (a, b) { return a.price - b.price; });
  }

  // Spread the picks across airports. Six fares all from Manchester would
  // read as a Manchester site to the eleven other cities.
  function spread(rows, want) {
    var out = [], used = {}, cap = 1;
    while (out.length < want && cap <= 4) {
      rows.forEach(function (r) {
        if (out.length >= want) return;
        if (out.indexOf(r) > -1) return;
        var n = used[r.origin] || 0;
        if (n >= cap) return;
        used[r.origin] = n + 1;
        out.push(r);
      });
      cap++;
    }
    // Top up in price order. Without this a page showing one airport
    // could never fill more than four rows, because the cap only ever
    // reaches four and every row shares an origin.
    rows.forEach(function (r) {
      if (out.length < want && out.indexOf(r) === -1) out.push(r);
    });
    return out.sort(function (a, b) { return a.price - b.price; });
  }

  function candidates(fares, opts) {
    var all = [];
    fares.forEach(function (f) {
      if (opts.origin && f.origin !== opts.origin) return;
      if (UK[f.destination]) return;
      if (places() && !places()[f.destination]) return;   // no name, looks broken
      expand(f).forEach(function (r) {
        if (opts.within && daysFromToday(r.dep) > opts.within) return;
        if (opts.returns === true && !r.ret) return;
        if (opts.returns === false && r.ret) return;
        all.push(r);
      });
    });
    return all;
  }

  // Only strike a price out when the saving is real and worth reading.
  function avgText(r) {
    if (!r.avg || r.avg <= r.price) return "";
    if (r.avg < r.price * 1.15) return "";
    return "£" + r.avg;
  }

  /* ---- homepage ------------------------------------------------------ */

  // Ghost renders this block from a script in the footer, and that script
  // rebuilds it several times during load. Rather than fight it, paint
  // over the finished rows and repaint whenever it rebuilds them.
  function paintHomepage(fares) {
    var cols = document.querySelectorAll(".ch-dbox .ch-col");
    if (cols.length < 2) return false;

    var ow = spread(bestPerDestination(candidates(fares, { returns:false, within:60 })), 6);

    // Keep the two columns showing twelve different cities. The same
    // place once as a one-way and again as a return wastes a row.
    var taken = {};
    ow.forEach(function (r) { taken[r.dest] = true; });
    var rtPool = bestPerDestination(candidates(fares, { returns:true, within:75 }))
                   .filter(function (r) { return !taken[r.dest]; });
    var rt = spread(rtPool, 6);
    if (ow.length < 3 || rt.length < 3) return false;   // do not gut the page

    function paint(col, rows, isReturn) {
      var cells = col.querySelectorAll(".ch-d2");
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (i >= rows.length) { c.style.display = "none"; continue; }
        c.style.display = "";
        var r = rows[i];
        var p = places() ? places()[r.dest] : null;
        var routeEl = c.querySelector(".ch-d2-route");
        var metaEl  = c.querySelector(".ch-d2-meta");
        var priceEl = c.querySelector(".ch-d2-price");
        var avgEl   = c.querySelector(".ch-d2-avg");
        var label = (ORIGIN_NAME[r.origin] || r.origin) + " → " + (p ? p[0] : r.dest);
        if (routeEl) routeEl.textContent = label;
        if (metaEl) {
          metaEl.textContent = (isReturn ? "return · " : "one-way · ") +
                               fmt(r.dep) + (isReturn && r.ret ? "–" + fmt(r.ret) : "");
        }
        if (priceEl) priceEl.textContent = "£" + r.price;
        if (avgEl) {
          var a = avgText(r);
          avgEl.textContent = a ? "avg " + a : "";
          avgEl.style.display = a ? "" : "none";
        }
      }
    }
    paint(cols[0], ow, false);
    paint(cols[1], rt, true);
    return true;
  }

  /* ---- join pages ---------------------------------------------------- */

  function paintJoin(fares, origin) {
    var rows = document.querySelectorAll(".ch-fare-row");
    if (!rows.length) return false;

    var picks = spread(bestPerDestination(candidates(fares, { origin: origin, within: 90 })), rows.length);
    if (picks.length < 2) return false;

    // Take the airport's name off the page rather than deciding it here,
    // so "Leeds Bradford" stays "Leeds Bradford" and each join page keeps
    // the wording it was written with.
    var from = ORIGIN_NAME[origin] || origin;
    var firstRoute = rows[0].querySelector("div");
    if (firstRoute && firstRoute.textContent.indexOf("→") > -1) {
      var existing = firstRoute.textContent.split("→")[0].trim();
      if (existing) from = existing;
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (i >= picks.length) { row.style.display = "none"; continue; }
      row.style.display = "";
      var r = picks[i];
      var p = places() ? places()[r.dest] : null;

      // The row is: an optional "Cheapest" badge, the route, then a
      // column holding the price and the struck-through average.
      var kids = row.children, routeEl = null, priceCol = null;
      for (var k = 0; k < kids.length; k++) {
        var el = kids[k];
        if (el.tagName === "SPAN") continue;              // the badge
        if (!routeEl) routeEl = el; else priceCol = el;
      }
      if (routeEl) {
        var code = flagCode(p);
        var img = code
          ? '<img src="https://flagcdn.com/w40/' + code + '.png" width="18" height="13" alt="" ' +
            'style="display:inline-block;vertical-align:-2px;border-radius:2px;margin-right:5px;' +
            'box-shadow:0 0 0 1px rgba(11,52,80,.12)">'
          : "";
        routeEl.innerHTML = from + " → " + img + (p ? p[0] : r.dest);
      }
      if (priceCol) {
        var priceEl = priceCol.querySelector("div");
        var avgEl   = priceCol.querySelector("span");
        if (priceEl) priceEl.textContent = "£" + r.price;
        if (avgEl) {
          var at = avgText(r);
          avgEl.textContent = at ? "avg " + at : "";
          avgEl.style.display = at ? "" : "none";
        }
      }
    }
    return true;
  }

  /* ---- run ----------------------------------------------------------- */

  var path = location.pathname.replace(/\/+$/, "").toLowerCase();
  var isHome = (path === "" || path === "/");
  var joinMatch = path.match(/^\/join-(.+)$/);
  var origin = joinMatch ? JOIN_ORIGIN[joinMatch[1]] : null;
  if (!isHome && !origin) return;

  function needPlaces(next) {
    if (places()) { next(); return; }
    var s = document.createElement("script");
    s.src = CDN + "places.js";
    s.onload = next;
    s.onerror = next;                 // names fall back to the airport code
    document.head.appendChild(s);
  }

  function start(fares) {
    var busy = false, runs = 0;

    function paint() {
      if (busy || runs > 40) return;      // a runaway repaint would hang the tab
      busy = true;
      runs++;
      try {
        if (isHome) paintHomepage(fares); else paintJoin(fares, origin);
      } catch (e) { /* never take the page down over a teaser */ }
      busy = false;
    }

    paint();

    // Ghost's own script rebuilds the homepage rows at 400ms, 1200ms and
    // 2500ms after load, which would put the old prices back. Repaint
    // whenever it does.
    //
    // Watch only the direct children of the box. That is where the whole
    // block is swapped out, and it is the one level painting does not
    // touch: writing textContent into a row replaces a text node, which
    // a subtree watcher would read as a change and repaint forever.
    var box = document.querySelector(".ch-dbox");
    var mo = null;
    if (box && window.MutationObserver) {
      try {
        mo = new MutationObserver(paint);
        mo.observe(box, { childList: true });
      } catch (e) { /* older browser, the timers below still cover it */ }
    }

    [300, 800, 1500, 2800, 4000].forEach(function (t) { setTimeout(paint, t); });
    setTimeout(function () { if (mo) mo.disconnect(); }, 15000);
  }

  fetch(dataUrl(), { cache: "default" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || !j.fares || !j.fares.length) return;
      needPlaces(function () { start(j.fares); });
    })
    .catch(function () { /* leave whatever Ghost rendered */ });
})();
