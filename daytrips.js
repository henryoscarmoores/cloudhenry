/* Extreme Day Trips (EDT)
 *
 * Out and back from the same airport on the same day. The number that
 * sells it is hours on the ground, not price, so that is the one the
 * card leads with. A £31 flight to Milan is only interesting once you
 * know it buys you ten and a half hours in Milan.
 *
 * Reads daytrips.json, built by build-daytrips.ps1. Same pattern as the
 * search page: the data file is pinned by commit, the renderer is not
 * clever, and anything missing is simply not drawn.
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
    BA: "British Airways", EI: "Aer Lingus", W6: "Wizz Air", VY: "Vueling"
  };

  var CSS =
    ".ch-edt{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:var(--ink,#0E3550);}" +
    ".ch-edt-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 18px;}" +
    ".ch-edt-sel{font:inherit;font-weight:700;color:var(--ink,#0E3550);background:#fff;border:1px solid var(--line,#E3EEF6);border-radius:12px;padding:11px 14px;min-width:190px;cursor:pointer;}" +
    ".ch-edt-sel:focus{outline:none;border-color:var(--b,#0E6FB6);box-shadow:0 0 0 3px rgba(14,111,182,.12);}" +
    ".ch-edt-count{font-size:13px;color:var(--mut,#5A7488);font-weight:600;}" +
    ".ch-edt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;}" +
    ".ch-edt-card{position:relative;background:#fff;border:1px solid var(--line,#E3EEF6);border-radius:16px;padding:16px 16px 14px;box-shadow:0 1px 2px rgba(14,53,80,.06),0 2px 10px rgba(14,53,80,.05);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;}" +
    ".ch-edt-card:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(14,53,80,.14);border-color:#B9DCF0;}" +
    ".ch-edt-hours{display:inline-block;background:var(--y,#F5C242);color:#12384F;font-weight:900;font-size:12.5px;letter-spacing:.2px;padding:5px 11px;border-radius:999px;margin-bottom:11px;}" +
    ".ch-edt-city{font-size:21px;font-weight:800;line-height:1.15;letter-spacing:-.4px;margin:0 0 2px;}" +
    ".ch-edt-country{font-size:12.5px;color:var(--mut,#5A7488);font-weight:600;margin:0 0 12px;}" +
    ".ch-edt-from{font-size:12.5px;color:var(--mut,#5A7488);font-weight:600;margin:0 0 12px;}" +
    ".ch-edt-times{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;margin:0 0 10px;}" +
    ".ch-edt-times span{color:var(--mut,#5A7488);font-weight:600;}" +
    ".ch-edt-foot{display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-top:1px solid var(--line,#E3EEF6);padding-top:11px;margin-top:2px;}" +
    ".ch-edt-date{font-size:12.5px;color:var(--mut,#5A7488);font-weight:700;}" +
    ".ch-edt-price{font-size:22px;font-weight:900;color:var(--b,#0E6FB6);letter-spacing:-.6px;}" +
    ".ch-edt-price small{font-size:11px;font-weight:700;color:var(--mut,#5A7488);letter-spacing:0;}" +
    ".ch-edt-air{font-size:11.5px;color:var(--mut,#5A7488);font-weight:600;margin-top:7px;}" +
    ".ch-edt-empty{padding:30px 18px;text-align:center;color:var(--mut,#5A7488);font-weight:600;background:#F7FBFE;border:1px dashed var(--line,#E3EEF6);border-radius:14px;}" +
    "@media(max-width:520px){.ch-edt-grid{grid-template-columns:1fr;}.ch-edt-sel{width:100%;}}";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // "Thu 12 Nov". Built by hand because toLocaleDateString varies by
  // device and this has to read the same on every phone.
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function pretty(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return iso || "";
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    if (isNaN(d)) return iso;
    return DAYS[d.getUTCDay()] + " " + (+p[2]) + " " + MONS[+p[1] - 1];
  }

  // Whole hours read better on a card than 10.6, and nobody plans a day
  // around a six minute difference.
  function hoursLabel(h) {
    var n = Math.floor(h);
    return n + (n === 1 ? " hour there" : " hours there");
  }

  function card(t) {
    var city = esc(t.city || t.destination);
    var from = AIRPORTS[t.origin] || t.origin;
    var air = AIRLINES[t.airline] || t.airline || "";
    return '<article class="ch-edt-card">' +
      '<div class="ch-edt-hours">' + esc(hoursLabel(t.ground)) + "</div>" +
      '<h3 class="ch-edt-city">' + city + "</h3>" +
      (t.country ? '<p class="ch-edt-country">' + esc(t.country) + "</p>" : "") +
      '<p class="ch-edt-from">from ' + esc(from) + "</p>" +
      '<p class="ch-edt-times">' + esc(t.out) + " <span>out</span> &rarr; " + esc(t.back) + " <span>back</span></p>" +
      '<div class="ch-edt-foot">' +
        '<span class="ch-edt-date">' + esc(pretty(t.date)) + "</span>" +
        '<span class="ch-edt-price">&pound;' + esc(t.price) + " <small>return</small></span>" +
      "</div>" +
      (air ? '<p class="ch-edt-air">' + esc(air) + ", direct both ways</p>" : "") +
      "</article>";
  }

  function boot(root, data) {
    var trips = (data && data.trips) || [];
    if (!trips.length) {
      root.innerHTML = '<div class="ch-edt-empty">No day trips in the feed right now. It refreshes daily.</div>';
      return;
    }

    var origins = {};
    trips.forEach(function (t) { origins[t.origin] = (origins[t.origin] || 0) + 1; });
    var codes = Object.keys(origins).sort(function (a, b) {
      return (AIRPORTS[a] || a) < (AIRPORTS[b] || b) ? -1 : 1;
    });

    var opts = '<option value="">Every airport (' + trips.length + ")</option>";
    codes.forEach(function (c) {
      opts += '<option value="' + c + '">' + esc(AIRPORTS[c] || c) + " (" + origins[c] + ")</option>";
    });

    root.innerHTML =
      '<div class="ch-edt">' +
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
      var list = code ? trips.filter(function (t) { return t.origin === code; }) : trips;
      grid.innerHTML = list.length
        ? list.map(card).join("")
        : '<div class="ch-edt-empty">Nothing from there at the moment. Try every airport.</div>';
      count.textContent = list.length
        ? "Longest days first. Prices are return, both legs direct."
        : "";
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
