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
           ("0" + d.getUTCDate()).slice(-2) + (d.getUTCHours() < 12 ? "-am" : "-pm");
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

  var GENERATED = "";   // when the feed was built, for the "prices correct as of" line

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
    // One-ways use the route's typical price from the API when the feed
    // has it. The search and the join page deal card do the same, so a
    // fare no longer shows two different "usual" prices on one page.
    var owAvg = route.typical || mean(ow), rtAvg = mean(rt);

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
  // The homepage box follows the airport picker above it. Nothing chosen
  // means the best from all twelve.
  var homeOrigin = "";

  function searchLink(origin, dest) {
    var parts = [];
    if (origin) parts.push("from=" + origin);
    if (dest) parts.push("to=" + encodeURIComponent(dest));
    return "/search/" + (parts.length ? "?" + parts.join("&") : "");
  }

  // Every row is a door to the search page. The old box was a picture of
  // twelve fares; this one is twelve links to every date for that city.
  function makeRowLink(row, origin, cityName) {
    var href = searchLink(origin, cityName);
    if (row.getAttribute("data-ch-link") === href) return;
    row.setAttribute("data-ch-link", href);
    row.setAttribute("role", "link");
    row.setAttribute("tabindex", "0");
    row.setAttribute("title", "See every date for " + cityName + " on the search");
    row.addEventListener("click", function () { location.href = href; });
    row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); location.href = href; } });
  }

  function ensureHomeStyles() {
    if (document.getElementById("ch-home-live-css")) return;
    var st = document.createElement("style");
    st.id = "ch-home-live-css";
    st.textContent =
      ".ch-d2[data-ch-link]{cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}" +
      ".ch-d2[data-ch-link]:hover,.ch-d2[data-ch-link]:focus-visible{transform:translateY(-1px);box-shadow:0 6px 16px rgba(14,53,80,.16);outline:none}" +
      ".ch-d2[data-ch-link] .ch-d2-route::after{content:' \\2192';color:#0E6FB6;font-weight:800;opacity:.55}" +
      ".ch-hp{display:flex;gap:8px;margin:0 0 12px;position:relative;z-index:2}" +
      ".ch-hp input{flex:1 1 auto;min-width:0;font:inherit;font-size:14px;font-weight:600;color:#0E3550;background:#fff;border:1px solid rgba(14,53,80,.14);border-radius:999px;padding:11px 16px;box-shadow:0 2px 8px rgba(14,53,80,.10)}" +
      ".ch-hp input::placeholder{color:#6B8394;font-weight:500}" +
      ".ch-hp input:focus{outline:none;border-color:#0E6FB6;box-shadow:0 0 0 4px rgba(14,111,182,.22)}" +
      ".ch-hp button{flex:0 0 auto;border:0;border-radius:999px;background:#F5C242;color:#16324A;font:inherit;font-weight:800;font-size:14px;padding:11px 18px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 6px rgba(14,53,80,.16)}" +
      ".ch-hp button:hover{transform:translateY(-1px)}" +
      ".ch-hp-lab{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#E8F3FB;margin:0 0 6px;text-align:center}" +
      "@media(max-width:480px){.ch-hp input{font-size:13.5px;padding:10px 13px}.ch-hp button{padding:10px 14px;font-size:13px}}";
    document.head.appendChild(st);
  }

  // One line above the box: say what you fancy, land on the search page
  // with it already applied. No filters here; the search page has them.
  function ensurePlanBar() {
    if (document.getElementById("ch-home-plan")) return;
    var box = document.querySelector(".ch-dbox");
    if (!box || !box.parentNode) return;
    var wrap = document.createElement("div");
    wrap.id = "ch-home-plan";
    wrap.innerHTML =
      '<span class="ch-hp-lab">&#10024; Tell us what you fancy</span>' +
      '<form class="ch-hp" action="/search/" method="get">' +
        '<input type="text" name="plan" maxlength="300" autocomplete="off" aria-label="Describe your trip" ' +
               'placeholder="Somewhere warm in November under £60">' +
        '<button type="submit">Plan it →</button>' +
      '</form>';
    box.parentNode.insertBefore(wrap, box);
    wrap.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = wrap.querySelector("input").value.trim();
      var parts = [];
      if (q) parts.push("plan=" + encodeURIComponent(q));
      if (homeOrigin) parts.push("from=" + homeOrigin);
      location.href = "/search/" + (parts.length ? "?" + parts.join("&") : "");
    });
  }

  // The lock card under the blurred rows used to sell the subscription.
  // It now points at the search, which is where the selling happens.
  function paintLockCard() {
    var card = document.querySelector(".ch-dbox .ch-veil .ch-vin");
    if (!card) return;
    var t = card.querySelector(".ch-vt");
    var subs = card.querySelectorAll(".ch-vs");
    var cta = card.querySelector(".ch-cta");
    var fine = card.querySelector(".ch-vf");
    var fromCity = homeOrigin ? ORIGIN_NAME[homeOrigin] : "";
    if (t) t.textContent = fromCity ? "Every fare from " + fromCity + ", every date" : "Every fare, every date, all 12 airports";
    if (subs[0]) subs[0].textContent = "Tell us where, when and how much, and see everything we have found today. Members book any of it in one tap.";
    if (cta) {
      cta.textContent = "Search flights →";
      cta.setAttribute("href", searchLink(homeOrigin, ""));
    }
    if (fine) fine.innerHTML = '<span class="ch-hlb">£2.99 a month</span> · cancel anytime';
  }

  function paintCaption() {
    var cap = document.querySelector(".ch-hcap");
    if (!cap) return;
    var text = homeOrigin ? "This week’s fares from " + ORIGIN_NAME[homeOrigin] : "This week’s fares";
    if (cap.textContent !== text) cap.textContent = text;
  }

  // The hero's airport picker drives the box. Its option values are the
  // join-page slugs, so "join-leeds" becomes LBA.
  function watchPicker() {
    var sel = document.querySelector(".ch-ap-select");
    if (!sel || sel.getAttribute("data-ch-live")) return;
    sel.setAttribute("data-ch-live", "1");
    sel.addEventListener("change", function () {
      var slug = String(sel.value || "").replace(/^join-/, "");
      homeOrigin = JOIN_ORIGIN[slug] || "";
      if (window.__chHomeRepaint) window.__chHomeRepaint();
    });
  }

  function paintHomepage(fares) {
    var cols = document.querySelectorAll(".ch-dbox .ch-col");
    if (cols.length < 2) return false;

    ensureHomeStyles();
    watchPicker();

    var ow = spread(bestPerDestination(candidates(fares, { origin: homeOrigin, returns:false, within:60 })), 6);

    // Keep the two columns showing twelve different cities. The same
    // place once as a one-way and again as a return wastes a row.
    var taken = {};
    ow.forEach(function (r) { taken[r.dest] = true; });
    var rtPool = bestPerDestination(candidates(fares, { origin: homeOrigin, returns:true, within:75 }))
                   .filter(function (r) { return !taken[r.dest]; });
    var rt = spread(rtPool, 6);
    if (ow.length < 3 || rt.length < 2) return false;   // do not gut the page

    function paint(col, rows, isReturn) {
      var cells = col.querySelectorAll(".ch-d2");
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (i >= rows.length) { c.style.display = "none"; continue; }
        c.style.display = "";
        var r = rows[i];
        var p = places() ? places()[r.dest] : null;
        makeRowLink(c, r.origin, p ? p[0] : r.dest);
        var routeEl = c.querySelector(".ch-d2-route");
        var metaEl  = c.querySelector(".ch-d2-meta");
        var priceEl = c.querySelector(".ch-d2-price");
        var avgEl   = c.querySelector(".ch-d2-avg");

        // Ghost only wrote an "avg" span for rows that happened to have
        // one when the block was typed out. A live fare with a genuine
        // saving would have had nowhere to show it.
        if (!avgEl && priceEl && priceEl.parentElement) {
          avgEl = document.createElement("span");
          avgEl.className = "ch-d2-avg";
          priceEl.parentElement.appendChild(avgEl);
        }
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
    rt.forEach(function (r) { taken[r.dest] = true; });
    paintLocked(fares, taken);
    paintLockCard();
    paintCaption();
    ensurePlanBar();
    stampDate();
    return true;
  }

  // The blurred rows behind the paywall are the "what you are missing"
  // tease. They keep their £?? because that is the whole point, but the
  // routes were typed out in June and should be real ones from today.
  function paintLocked(fares, taken) {
    var rows = document.querySelectorAll(".ch-lockwrap .ch-d");
    if (!rows.length) return;
    var pool = bestPerDestination(candidates(fares, { origin: homeOrigin, within: 45 }))
                 .filter(function (r) { return !taken[r.dest]; });
    var picks = spread(pool, rows.length);
    for (var i = 0; i < rows.length && i < picks.length; i++) {
      var r = picks[i];
      var p = places() ? places()[r.dest] : null;
      var routeEl = rows[i].querySelector(".ch-dr");
      if (routeEl) routeEl.textContent = (ORIGIN_NAME[r.origin] || r.origin) + " → " + (p ? p[0] : r.dest);
    }
  }

  // "Prices correct as of ..." sits under the block with no class of its
  // own. It said 1 September while the prices above it were from 30
  // August, which is worse than saying nothing.
  function stampDate() {
    if (!GENERATED) return;
    var box = document.querySelector(".ch-dbox");
    if (!box) return;
    var els = box.querySelectorAll("div, p, span, small");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.children.length) continue;
      if (el.textContent.indexOf("Prices correct as of") !== 0) continue;
      var d = new Date(GENERATED);
      if (isNaN(d)) return;
      var months = ["January","February","March","April","May","June","July",
                    "August","September","October","November","December"];
      var text = "Prices correct as of " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
      if (el.textContent !== text) el.textContent = text;
      return;
    }
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

  /* ---- any page: blocks that ask to be filled ------------------------ */

  // Today's Deals and Best Deals are plain HTML cards in Ghost. Marking
  // each row is enough for this to fill them, with no wrapper and no
  // knowledge of the rest of the page:
  //
  //   <div class="ch-lv-row" data-ch-live="oneway|return|mixed"
  //        data-ch-origin="MAN"      (optional, one airport only)
  //        data-ch-within="60">      (optional, days ahead)
  //
  // holding .ch-lv-route, .ch-lv-meta, .ch-lv-price and .ch-lv-avg. The
  // attributes may sit on an ancestor instead, if a page groups its rows.
  function paintBlocks(fares) {
    var found = document.querySelectorAll(".ch-lv-row");
    if (!found.length) return false;

    function attr(el, key) {
      var node = el;
      while (node && node.getAttribute) {
        var v = node.getAttribute(key);
        if (v) return v;
        node = node.parentElement;
      }
      return "";
    }

    // Group the rows by what they asked for, keeping page order.
    var order = [], groups = {};
    for (var g = 0; g < found.length; g++) {
      var key = (attr(found[g], "data-ch-live") || "mixed") + "|" +
                (attr(found[g], "data-ch-origin") || "") + "|" +
                (attr(found[g], "data-ch-within") || "");
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(found[g]);
    }

    // Do not repeat a route between groups on one page: the one-way and
    // return columns on Best Deals sat side by side showing Dublin five
    // times over.
    var seen = {};
    var any = false;

    for (var b = 0; b < order.length; b++) {
      var parts  = order[b].split("|");
      var rows   = groups[order[b]];
      var kind   = parts[0];
      var origin = parts[1];
      var within = parseInt(parts[2], 10) || 75;

      var opts = { within: within, origin: origin };
      if (kind === "oneway") opts.returns = false;
      if (kind === "return") opts.returns = true;

      var pool = bestPerDestination(candidates(fares, opts)).filter(function (r) {
        return !seen[r.dest];
      });
      var picks = spread(pool, rows.length);
      if (picks.length < 2) continue;
      picks.forEach(function (r) { seen[r.dest] = true; });

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (i >= picks.length) { row.style.display = "none"; continue; }
        row.style.display = "";
        var r = picks[i];
        var p = places() ? places()[r.dest] : null;
        var routeEl = row.querySelector(".ch-lv-route");
        var metaEl  = row.querySelector(".ch-lv-meta");
        var priceEl = row.querySelector(".ch-lv-price");
        var avgEl   = row.querySelector(".ch-lv-avg");
        if (routeEl) {
          routeEl.textContent = (ORIGIN_NAME[r.origin] || r.origin) + " → " + (p ? p[0] : r.dest);
        }
        if (metaEl) {
          metaEl.textContent = (r.ret ? "return · " : "one-way · ") +
                               fmt(r.dep) + (r.ret ? " – " + fmt(r.ret) : "");
        }
        if (priceEl) priceEl.textContent = "£" + r.price;
        if (avgEl) {
          var a = avgText(r);
          avgEl.textContent = a ? "avg " + a : "";
          avgEl.style.display = a ? "" : "none";
        }
      }
      any = true;
    }
    return any;
  }

  /* ---- run ----------------------------------------------------------- */

  var path = location.pathname.replace(/\/+$/, "").toLowerCase();
  var isHome = (path === "" || path === "/");
  var joinMatch = path.match(/^\/join-(.+)$/);
  var origin = joinMatch ? JOIN_ORIGIN[joinMatch[1]] : null;
  var hasBlocks = !!document.querySelector("[data-ch-live]");
  if (!isHome && !origin && !hasBlocks) return;

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
        if (isHome) paintHomepage(fares);
        else if (origin) paintJoin(fares, origin);
        paintBlocks(fares);
      } catch (e) { /* never take the page down over a teaser */ }
      busy = false;
    }

    paint();
    // The airport picker needs a way to ask for a repaint. Allow it a
    // fresh run count so choosing airports never hits the cap.
    window.__chHomeRepaint = function () { runs = 0; paint(); };

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
      GENERATED = j.generated || "";
      needPlaces(function () { start(j.fares); });
    })
    .catch(function () { /* leave whatever Ghost rendered */ });
})();
