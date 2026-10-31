/* Extreme Day Trips (EDT)
 *
 * Out and back from the same airport on the same day.
 *
 * Two decisions do most of the work here.
 *
 * One: the card leads with hours on the ground, not price. A £31 flight
 * to Milan means nothing until you know it buys you ten hours in Milan.
 *
 * Two: one card per route, not per date. The raw feed holds eleven
 * Newcastle to Dublins and three Marrakechs, so sorting the lot by hours
 * puts Dublin at the top five times and hides Marrakech below the fold.
 * Collapsing to the best day per route turns 96 rows into 50 cards and
 * takes the page from six cities to twenty-seven. The other dates are
 * still worth knowing about, so they are counted on the card.
 *
 * Reads daytrips.json, built by build-daytrips.ps1.
 */
(function () {
  "use strict";

  var DATA = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/daytrips.json";
  var MOUNT = "chEdt";

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
    TK: "Turkish Airlines", TP: "TAP", SK: "SAS", LH: "Lufthansa"
  };

  var CSS =
    ".ch-edt{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:var(--ink,#0E3550);}" +
    ".ch-edt-lede{font-size:15.5px;line-height:1.55;color:var(--mut,#5A7488);margin:0 0 20px;max-width:46em;}" +
    ".ch-edt-lede b{color:var(--ink,#0E3550);font-weight:700;}" +
    ".ch-edt-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 16px;}" +
    ".ch-edt-sel{font:inherit;font-weight:700;color:var(--ink,#0E3550);background:#fff;border:1px solid var(--line,#E3EEF6);border-radius:12px;padding:11px 14px;min-width:200px;cursor:pointer;}" +
    ".ch-edt-sel:focus{outline:none;border-color:var(--b,#0E6FB6);box-shadow:0 0 0 3px rgba(14,111,182,.12);}" +
    ".ch-edt-count{font-size:13px;color:var(--mut,#5A7488);font-weight:600;}" +
    ".ch-edt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:12px;}" +

    ".ch-edt-card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line,#E3EEF6);border-radius:16px;padding:15px 15px 13px;box-shadow:0 1px 2px rgba(14,53,80,.06),0 2px 10px rgba(14,53,80,.05);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;}" +
    ".ch-edt-card:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(14,53,80,.14);border-color:#B9DCF0;}" +

    /* Hours is the headline. Everything else is supporting detail. */
    ".ch-edt-h{display:flex;align-items:baseline;gap:5px;margin:0 0 9px;}" +
    ".ch-edt-h b{font-size:34px;font-weight:900;line-height:1;letter-spacing:-1.6px;color:var(--b,#0E6FB6);}" +
    ".ch-edt-h span{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.1px;color:var(--mut,#5A7488);}" +

    ".ch-edt-city{font-size:19px;font-weight:800;line-height:1.15;letter-spacing:-.4px;margin:0;}" +
    ".ch-edt-sub{font-size:12px;color:var(--mut,#5A7488);font-weight:600;margin:3px 0 11px;}" +

    ".ch-edt-run{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;color:var(--ink,#0E3550);background:#F4FAFE;border:1px solid #E3F1FA;border-radius:10px;padding:8px 10px;margin:0 0 10px;}" +
    ".ch-edt-run i{font-style:normal;color:var(--mut,#5A7488);font-weight:600;font-size:11.5px;}" +
    ".ch-edt-arrow{color:var(--y,#F5C242);font-weight:900;}" +

    ".ch-edt-foot{margin-top:auto;display:flex;align-items:baseline;justify-content:space-between;gap:8px;border-top:1px solid var(--line,#E3EEF6);padding-top:10px;}" +
    ".ch-edt-date{font-size:12px;color:var(--mut,#5A7488);font-weight:700;}" +
    ".ch-edt-price{font-size:19px;font-weight:900;letter-spacing:-.5px;}" +
    ".ch-edt-price small{font-size:10.5px;font-weight:700;color:var(--mut,#5A7488);letter-spacing:0;}" +
    ".ch-edt-more{font-size:11.5px;color:var(--mut,#5A7488);font-weight:600;margin:7px 0 0;}" +

    ".ch-edt-empty{padding:30px 18px;text-align:center;color:var(--mut,#5A7488);font-weight:600;background:#F7FBFE;border:1px dashed var(--line,#E3EEF6);border-radius:14px;}" +
    "@media(max-width:560px){.ch-edt-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}.ch-edt-sel{width:100%;}.ch-edt-h b{font-size:29px;}.ch-edt-city{font-size:17px;}}";

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

  // One card per route, keeping its best day. Everything else about that
  // route becomes a count, because fifteen Dublin cards is not a page.
  function collapse(trips) {
    var byRoute = {};
    trips.forEach(function (t) {
      var k = t.origin + "-" + t.destination;
      if (!byRoute[k]) { byRoute[k] = { best: t, n: 0, min: t.price }; }
      var r = byRoute[k];
      r.n++;
      if (t.price < r.min) r.min = t.price;
      if (t.ground > r.best.ground || (t.ground === r.best.ground && t.price < r.best.price)) r.best = t;
    });
    return Object.keys(byRoute).map(function (k) { return byRoute[k]; })
      .sort(function (a, b) {
        if (b.best.ground !== a.best.ground) return b.best.ground - a.best.ground;
        return a.best.price - b.best.price;
      });
  }

  function card(r) {
    var t = r.best;
    var from = AIRPORTS[t.origin] || t.origin;
    var air = AIRLINES[t.airline] || t.airline || "";
    var hrs = Math.floor(t.ground);
    var others = r.n - 1;
    return '<article class="ch-edt-card">' +
      '<p class="ch-edt-h"><b>' + hrs + "</b><span>hours there</span></p>" +
      '<h3 class="ch-edt-city">' + esc(t.city || t.destination) + "</h3>" +
      '<p class="ch-edt-sub">' + (t.country ? esc(t.country) + " &middot; " : "") + "from " + esc(from) + "</p>" +
      '<p class="ch-edt-run">' + esc(t.out) + ' <i>out</i> <span class="ch-edt-arrow">&rarr;</span> ' + esc(t.back) + " <i>return</i></p>" +
      '<div class="ch-edt-foot">' +
        '<span class="ch-edt-date">' + esc(pretty(t.date)) + "</span>" +
        '<span class="ch-edt-price">&pound;' + esc(t.price) + " <small>rtn</small></span>" +
      "</div>" +
      '<p class="ch-edt-more">' + esc(air) +
        (others > 0 ? " &middot; " + others + " other date" + (others === 1 ? "" : "s") + " from &pound;" + r.min : "") +
      "</p>" +
      "</article>";
  }

  function boot(root, data) {
    var trips = (data && data.trips) || [];
    if (!trips.length) {
      root.innerHTML = '<div class="ch-edt-empty">No day trips in the feed right now. It refreshes daily.</div>';
      return;
    }

    var origins = {};
    trips.forEach(function (t) { origins[t.origin] = true; });
    var codes = Object.keys(origins).sort(function (a, b) {
      return (AIRPORTS[a] || a) < (AIRPORTS[b] || b) ? -1 : 1;
    });

    var allRoutes = collapse(trips);
    var cities = {};
    allRoutes.forEach(function (r) { cities[r.best.destination] = true; });

    var opts = '<option value="">Every airport</option>';
    codes.forEach(function (c) {
      var n = collapse(trips.filter(function (t) { return t.origin === c; })).length;
      opts += '<option value="' + c + '">' + esc(AIRPORTS[c] || c) + " (" + n + ")</option>";
    });

    root.innerHTML =
      '<div class="ch-edt">' +
        '<p class="ch-edt-lede">Fly out in the morning, home the same night. No hotel, no luggage, no days off. ' +
          "<b>" + allRoutes.length + " trips</b> to <b>" + Object.keys(cities).length + " cities</b>, " +
          "every one of them out and back on the same day, direct both ways.</p>" +
        '<div class="ch-edt-bar">' +
          '<select class="ch-edt-sel" id="chEdtFrom" aria-label="Filter by departure airport">' + opts + "</select>" +
          '<span class="ch-edt-count" id="chEdtCount"></span>' +
        "</div>" +
        '<div class="ch-edt-grid" id="chEdtGrid"></div>' +
      "</div>";

    var sel = root.querySelector("#chEdtFrom");
    var grid = root.querySelector("#chEdtGrid");
    var count = root.querySelector("#chEdtCount");

    function draw() {
      var code = sel.value;
      var list = code ? collapse(trips.filter(function (t) { return t.origin === code; })) : allRoutes;
      grid.innerHTML = list.length
        ? list.map(card).join("")
        : '<div class="ch-edt-empty">Nothing from there at the moment. Try every airport.</div>';
      count.textContent = list.length ? "Longest days first" : "";
    }
    sel.addEventListener("change", draw);
    draw();
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
