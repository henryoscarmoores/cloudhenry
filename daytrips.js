/* Extreme Day Trips (EDT)
 *
 * Out and back from the same airport on the same day.
 *
 * Three decisions do the work here.
 *
 * One: the card leads with hours on the ground, not price. A £31 flight
 * to Milan means nothing until you know it buys you ten hours in Milan.
 *
 * Two: one card per route, not per date. The raw feed holds eleven
 * Newcastle to Dublins and three Marrakechs, so sorting the lot by hours
 * puts Dublin at the top five times and hides Marrakech below the fold.
 * Collapsing to the best day per route turns 96 rows into 50 cards and
 * takes the page from six cities to twenty-seven.
 *
 * Three: fifty cards is still a wall. Nobody flies from twelve airports,
 * so the airport is asked first and answered for them where possible —
 * the join pages already store their choice in ch-airport. Picking one
 * takes fifty cards down to between four and twenty, which is a page you
 * can read rather than scroll. Everything after that is refinement, and
 * the counts on every chip are live, so no filter you can press returns
 * an empty grid.
 *
 * Reads daytrips.json, built by build-daytrips.ps1.
 */
(function () {
  "use strict";

  var DATA = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/daytrips.json";
  var MOUNT = "chEdt";
  var PAGE = 12; // Two or three rows. Enough to judge, not enough to drown.

  var AIRPORTS = {
    MAN: "Manchester", BHX: "Birmingham", LBA: "Leeds Bradford", STN: "London Stansted",
    LTN: "London Luton", BRS: "Bristol", NCL: "Newcastle", GLA: "Glasgow",
    EDI: "Edinburgh", LGW: "London Gatwick", LPL: "Liverpool", BFS: "Belfast",
    BOH: "Bournemouth", CWL: "Cardiff", EMA: "East Midlands", DUB: "Dublin",
    PIK: "Glasgow Prestwick", ORK: "Cork", SNN: "Shannon", NOC: "Knock"
  };

  var AIRLINES = {
    FR: "Ryanair", U2: "easyJet", RK: "Ryanair UK", LS: "Jet2",
    BA: "British Airways", EI: "Aer Lingus", W6: "Wizz Air", VY: "Vueling",
    TK: "Turkish Airlines", TP: "TAP", SK: "SAS", LH: "Lufthansa",
    W9: "Wizz Air UK", PC: "Pegasus", DE: "Condor"
  };

  var HOURS = [
    { v: 0,  label: "Any length" },
    { v: 8,  label: "8+ hours" },
    { v: 10, label: "10+ hours" }
  ];
  var PRICES = [
    { v: 0,   label: "Any price" },
    { v: 50,  label: "Under &pound;50" },
    { v: 100, label: "Under &pound;100" }
  ];
  var SORTS = [
    { v: "ground", label: "Longest day" },
    { v: "price",  label: "Cheapest" }
  ];

  var CSS =
    ".ch-edt{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:var(--ink,#0E3550);}" +
    ".ch-edt-lede{font-size:15px;line-height:1.5;color:var(--mut,#5A7488);margin:0 0 16px;max-width:44em;}" +
    ".ch-edt-lede b{color:var(--ink,#0E3550);font-weight:700;}" +

    /* The filters are the page's spine, so they stay put while you scroll. */
    ".ch-edt-filters{position:sticky;top:0;z-index:20;background:#fff;padding:12px 0 11px;margin:0 0 16px;border-bottom:1px solid var(--line,#E3EEF6);}" +
    ".ch-edt-lab{display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.1px;color:var(--mut,#5A7488);margin:0 0 7px;}" +

    ".ch-edt-chips{display:flex;flex-wrap:wrap;gap:6px;}" +
    ".ch-edt-chip{font:inherit;font-size:13px;font-weight:700;line-height:1;color:var(--ink,#0E3550);background:#fff;border:1px solid var(--line,#E3EEF6);border-radius:999px;padding:9px 13px;cursor:pointer;white-space:nowrap;transition:background .15s ease,border-color .15s ease,color .15s ease;}" +
    ".ch-edt-chip:hover:not(:disabled){border-color:#B9DCF0;background:#F4FAFE;}" +
    ".ch-edt-chip em{font-style:normal;font-weight:700;opacity:.5;margin-left:5px;font-size:12px;}" +
    ".ch-edt-chip[aria-pressed='true']{background:var(--b,#0E6FB6);border-color:var(--b,#0E6FB6);color:#fff;}" +
    ".ch-edt-chip[aria-pressed='true'] em{opacity:.75;}" +
    ".ch-edt-chip:disabled{opacity:.34;cursor:default;}" +

    /* Second row: three small groups, not a second wall of buttons. */
    ".ch-edt-refine{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:11px;}" +
    ".ch-edt-refine .ch-edt-chip{font-size:12.5px;padding:7px 11px;}" +
    ".ch-edt-div{width:1px;height:18px;background:var(--line,#E3EEF6);margin:0 4px;}" +

    ".ch-edt-count{font-size:13px;color:var(--mut,#5A7488);font-weight:700;margin:0 0 11px;}" +
    ".ch-edt-count b{color:var(--ink,#0E3550);}" +
    ".ch-edt-clear{font:inherit;font-size:12.5px;font-weight:700;color:var(--b,#0E6FB6);background:none;border:0;padding:0;margin-left:8px;cursor:pointer;text-decoration:underline;}" +

    ".ch-edt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(224px,1fr));gap:12px;}" +

    ".ch-edt-card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line,#E3EEF6);border-radius:16px;padding:14px 14px 12px;box-shadow:0 1px 2px rgba(14,53,80,.06),0 2px 10px rgba(14,53,80,.05);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;}" +
    ".ch-edt-card:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(14,53,80,.14);border-color:#B9DCF0;}" +

    /* Hours is the headline. Everything else is supporting detail. */
    ".ch-edt-h{display:flex;align-items:baseline;gap:5px;margin:0 0 8px;}" +
    ".ch-edt-h b{font-size:32px;font-weight:900;line-height:1;letter-spacing:-1.5px;color:var(--b,#0E6FB6);}" +
    ".ch-edt-h span{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mut,#5A7488);}" +

    ".ch-edt-city{font-size:18.5px;font-weight:800;line-height:1.15;letter-spacing:-.4px;margin:0;}" +
    ".ch-edt-sub{font-size:12px;color:var(--mut,#5A7488);font-weight:600;margin:3px 0 10px;}" +

    ".ch-edt-run{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;color:var(--ink,#0E3550);background:#F4FAFE;border:1px solid #E3F1FA;border-radius:10px;padding:8px 10px;margin:0 0 10px;}" +
    ".ch-edt-run i{font-style:normal;color:var(--mut,#5A7488);font-weight:600;font-size:11.5px;}" +
    ".ch-edt-arrow{color:var(--y,#F5C242);font-weight:900;}" +

    ".ch-edt-foot{margin-top:auto;display:flex;align-items:baseline;justify-content:space-between;gap:8px;border-top:1px solid var(--line,#E3EEF6);padding-top:9px;}" +
    ".ch-edt-date{font-size:12px;color:var(--mut,#5A7488);font-weight:700;}" +
    ".ch-edt-price{font-size:19px;font-weight:900;letter-spacing:-.5px;}" +
    ".ch-edt-price small{font-size:10.5px;font-weight:700;color:var(--mut,#5A7488);letter-spacing:0;}" +
    ".ch-edt-more{font-size:11.5px;color:var(--mut,#5A7488);font-weight:600;margin:6px 0 0;}" +

    ".ch-edt-rest{display:block;width:100%;margin:14px 0 0;font:inherit;font-size:14px;font-weight:800;color:var(--ink,#0E3550);background:#fff;border:1px solid var(--line,#E3EEF6);border-radius:14px;padding:13px;cursor:pointer;transition:background .15s ease,border-color .15s ease;}" +
    ".ch-edt-rest:hover{background:#F4FAFE;border-color:#B9DCF0;}" +

    ".ch-edt-empty{padding:28px 18px;text-align:center;color:var(--mut,#5A7488);font-weight:600;background:#F7FBFE;border:1px dashed var(--line,#E3EEF6);border-radius:14px;}" +

    /* On a phone twelve airport chips wrap to six rows and push the trips
       off the screen, so they become one swipeable strip instead. */
    "@media(max-width:560px){" +
      ".ch-edt-from{display:flex;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:2px;}" +
      ".ch-edt-from::-webkit-scrollbar{display:none;}" +
      ".ch-edt-grid{grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:10px;}" +
      ".ch-edt-h b{font-size:28px;}.ch-edt-city{font-size:16.5px;}" +
      ".ch-edt-div{display:none;}" +
    "}";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function pretty(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return iso || "";
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    if (isNaN(d)) return iso;
    return DAYS[d.getUTCDay()] + " " + (+p[2]) + " " + MONS[+p[1] - 1];
  }

  // One card per city, keeping its best day. The feed holds fifteen
  // Dublins across six airports, and collapsing only by route still put
  // Dublin in three of the first six cards while the page claimed
  // twenty-seven cities. The other days and the other airports are worth
  // knowing, so they go on the card as a line of text rather than as
  // fourteen more cards.
  function collapse(trips, sort) {
    var byCity = {};
    trips.forEach(function (t) {
      var k = t.destination;
      if (!byCity[k]) { byCity[k] = { best: t, n: 0, min: t.price, origins: {}, rows: [] }; }
      var r = byCity[k];
      r.n++;
      r.origins[t.origin] = true;
      r.rows.push(t);
      if (t.price < r.min) r.min = t.price;
      var better = sort === "price"
        ? (t.price < r.best.price || (t.price === r.best.price && t.ground > r.best.ground))
        : (t.ground > r.best.ground || (t.ground === r.best.ground && t.price < r.best.price));
      if (better) r.best = t;
    });
    return Object.keys(byCity).map(function (k) { return byCity[k]; })
      .sort(function (a, b) {
        if (sort === "price") {
          if (a.best.price !== b.best.price) return a.best.price - b.best.price;
          return b.best.ground - a.best.ground;
        }
        if (b.best.ground !== a.best.ground) return b.best.ground - a.best.ground;
        return a.best.price - b.best.price;
      });
  }

  function card(r, showOrigin) {
    var t = r.best;
    var from = AIRPORTS[t.origin] || t.origin;
    var air = AIRLINES[t.airline] || t.airline || "";
    var hrs = Math.floor(t.ground);
    var sub = t.country ? esc(t.country) : "";
    if (showOrigin) sub += (sub ? " &middot; " : "") + "from " + esc(from);

    // The card shows the longest day, which is rarely the cheapest one:
    // Dublin leads at fifteen hours for £86 while another date does it
    // for £32. Saying so stops the headline price reading as the price
    // of the city. Naming the other airports was tried and dropped —
    // they only ever appear before the reader has said where they fly
    // from, which is exactly when the names mean nothing to them.
    var more = r.n - 1;
    var bits = [];
    if (air) bits.push(esc(air));
    if (more > 0) bits.push(more + " more date" + (more === 1 ? "" : "s") + " from &pound;" + r.min);
    return '<article class="ch-edt-card">' +
      '<p class="ch-edt-h"><b>' + hrs + "</b><span>hours there</span></p>" +
      '<h3 class="ch-edt-city">' + esc(t.city || t.destination) + "</h3>" +
      '<p class="ch-edt-sub">' + (sub || "&nbsp;") + "</p>" +
      '<p class="ch-edt-run">' + esc(t.out) + ' <i>out</i> <span class="ch-edt-arrow">&rarr;</span> ' + esc(t.back) + " <i>return</i></p>" +
      '<div class="ch-edt-foot">' +
        '<span class="ch-edt-date">' + esc(pretty(t.date)) + "</span>" +
        '<span class="ch-edt-price">&pound;' + esc(t.price) + " <small>both ways</small></span>" +
      "</div>" +
      '<p class="ch-edt-more">' + bits.join(" &middot; ") + "</p>" +
      "</article>";
  }

  function chip(key, val, label, count, on) {
    return '<button type="button" class="ch-edt-chip" data-k="' + key + '" data-v="' + esc(val) + '"' +
      ' aria-pressed="' + (on ? "true" : "false") + '"' + (count === 0 && !on ? " disabled" : "") + ">" +
      label + (count == null ? "" : "<em>" + count + "</em>") + "</button>";
  }

  function boot(root, data) {
    var trips = (data && data.trips) || [];
    if (!trips.length) {
      root.innerHTML = '<div class="ch-edt-empty">No day trips in the feed right now. It refreshes daily.</div>';
      return;
    }

    var totalRoutes = collapse(trips, "ground");

    var codes = Object.keys(trips.reduce(function (a, t) { a[t.origin] = 1; return a; }, {}))
      .sort(function (a, b) { return (AIRPORTS[a] || a) < (AIRPORTS[b] || b) ? -1 : 1; });

    // Their airport is already known from the join pages, so the page
    // opens on the four-to-twenty trips they can actually take rather
    // than on all fifty.
    var stored = "";
    try { stored = (localStorage.getItem("ch-airport") || "").toUpperCase(); } catch (e) {}
    var state = {
      origin: codes.indexOf(stored) > -1 ? stored : "",
      hours: 0,
      price: 0,
      sort: "ground",
      all: false
    };

    function match(t, skip) {
      if (skip !== "origin" && state.origin && t.origin !== state.origin) return false;
      if (skip !== "hours" && state.hours && t.ground < state.hours) return false;
      if (skip !== "price" && state.price && t.price >= state.price) return false;
      return true;
    }
    // Counts ignore the axis being counted, so a chip never promises
    // trips it cannot deliver and never reads zero for its own filter.
    function routesFor(skip) {
      return collapse(trips.filter(function (t) { return match(t, skip); }), state.sort);
    }
    // Not "cities whose best fare happens to leave from here" — that is
    // what counting the collapsed rows gives you, and it greyed out
    // Birmingham, Cork, Dublin, Glasgow and Newcastle as having nothing
    // when every one of them had trips. It is cities you can reach from
    // here at all, under whatever else is filtered.
    function countOrigin(c) {
      var seen = {};
      trips.forEach(function (t) {
        if (t.origin === c && match(t, "origin")) seen[t.destination] = true;
      });
      return Object.keys(seen).length;
    }

    root.innerHTML =
      '<div class="ch-edt">' +
        '<p class="ch-edt-lede">Fly out in the morning, home the same night. No hotel, no luggage, no days off. ' +
          "<b>" + totalRoutes.length + " cities</b> from <b>" + codes.length + " UK airports</b>, " +
          "every one direct both ways.</p>" +
        '<div class="ch-edt-filters">' +
          '<span class="ch-edt-lab">Flying from</span>' +
          '<div class="ch-edt-chips ch-edt-from" id="chEdtFrom"></div>' +
          '<div class="ch-edt-refine" id="chEdtRefine"></div>' +
        "</div>" +
        '<p class="ch-edt-count" id="chEdtCount"></p>' +
        '<div class="ch-edt-grid" id="chEdtGrid"></div>' +
        '<button type="button" class="ch-edt-rest" id="chEdtRest" hidden></button>' +
      "</div>";

    var elFrom   = root.querySelector("#chEdtFrom");
    var elRefine = root.querySelector("#chEdtRefine");
    var elCount  = root.querySelector("#chEdtCount");
    var elGrid   = root.querySelector("#chEdtGrid");
    var elRest   = root.querySelector("#chEdtRest");

    function draw() {
      var list = routesFor(null);
      var byH = routesFor("hours"), byP = routesFor("price");

      // Rebuilding the strip resets its scroll, which on a phone throws
      // you back to Birmingham every time you touch the hours.
      var keepScroll = elFrom.scrollLeft;
      elFrom.innerHTML =
        chip("origin", "", "All airports", routesFor("origin").length, !state.origin) +
        codes.map(function (c) {
          return chip("origin", c, esc(AIRPORTS[c] || c), countOrigin(c), state.origin === c);
        }).join("");
      elFrom.scrollLeft = keepScroll;

      elRefine.innerHTML =
        HOURS.map(function (h) {
          return chip("hours", h.v, h.label,
            h.v ? byH.filter(function (r) { return r.best.ground >= h.v; }).length : null,
            state.hours === h.v);
        }).join("") +
        '<span class="ch-edt-div"></span>' +
        PRICES.map(function (p) {
          return chip("price", p.v, p.label,
            p.v ? byP.filter(function (r) { return r.best.price < p.v; }).length : null,
            state.price === p.v);
        }).join("") +
        '<span class="ch-edt-div"></span>' +
        SORTS.map(function (s) {
          return chip("sort", s.v, s.label, null, state.sort === s.v);
        }).join("");

      if (!list.length) {
        elCount.innerHTML = "Nothing matches that." +
          '<button type="button" class="ch-edt-clear" data-k="reset" data-v="">Clear filters</button>';
        elGrid.innerHTML = '<div class="ch-edt-empty">No day trips on those terms. Widen the hours or the price.</div>';
        elRest.hidden = true;
        return;
      }

      var shown = state.all ? list : list.slice(0, PAGE);
      var where = state.origin ? " from <b>" + esc(AIRPORTS[state.origin] || state.origin) + "</b>" : "";
      var filtered = state.origin || state.hours || state.price;
      elCount.innerHTML =
        "<b>" + list.length + "</b> trip" + (list.length === 1 ? "" : "s") + where +
        " &middot; " + (state.sort === "price" ? "cheapest first" : "longest day first") +
        (filtered ? '<button type="button" class="ch-edt-clear" data-k="reset" data-v="">Clear filters</button>' : "");

      elGrid.innerHTML = shown.map(function (r) { return card(r, !state.origin); }).join("");

      if (list.length > PAGE) {
        elRest.hidden = false;
        elRest.textContent = state.all
          ? "Show fewer"
          : "Show the other " + (list.length - PAGE) + " trip" + (list.length - PAGE === 1 ? "" : "s");
      } else {
        elRest.hidden = true;
      }
    }

    root.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-k]");
      if (!b || b.disabled) return;
      var k = b.getAttribute("data-k"), v = b.getAttribute("data-v");
      if (k === "reset") { state.origin = ""; state.hours = 0; state.price = 0; state.all = false; }
      else if (k === "origin") { state.origin = v; state.all = false; }
      else if (k === "hours") { state.hours = +v; state.all = false; }
      else if (k === "price") { state.price = +v; state.all = false; }
      else if (k === "sort") { state.sort = v; }
      else return;
      draw();
    });

    elRest.addEventListener("click", function () {
      state.all = !state.all;
      draw();
      if (!state.all) elGrid.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    draw();

    // A pre-selected airport can sit off the right of the phone strip,
    // which makes the page look unfiltered when it is not.
    var on = elFrom.querySelector("[aria-pressed='true']");
    if (on && state.origin && elFrom.scrollWidth > elFrom.clientWidth) {
      elFrom.scrollLeft = Math.max(0, on.offsetLeft - 56);
    }
  }

  function start() {
    var root = document.getElementById(MOUNT);
    if (!root) return;
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    root.innerHTML = '<div class="ch-edt-empty">Loading day trips&hellip;</div>';
    fetch(DATA, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { boot(root, d); })
      .catch(function () {
        root.innerHTML = '<div class="ch-edt-empty">Could not load the day trips just now. Try a refresh.</div>';
      });
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
