/* EDT showcase: fifteen to twenty day trips in square tiles.
 *
 * A short page for the homepage and the newsletter, not the search. It
 * takes the best trips from daytrips.json by a few simple rules, so the mix
 * stays balanced when the feed changes: mostly Manchester, Birmingham and
 * London, then a couple from anywhere else. One tile per route, and no more
 * than two tiles for any city, so the page is a mix rather than five Dublins.
 * Every tile is square, so a row reads as a set of like things.
 *
 * Reads daytrips.json, built by build-daytrips.ps1.
 */
(function () {
  "use strict";

  var DATA = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/daytrips.json";
  var MOUNT = "chEdtShow";
  var MIN_GROUND = 5;     // the build's own floor: below this you have flown somewhere to look at an airport
  var MAX_PRICE = 250;    // the build's own ceiling
  var PER_CITY = 2;       // the same city from two airports is still two tiles, not five

  // How many trips each group may show. London is one group, not three airports.
  // The other group may use at most two airports between them.
  var LONDON = { STN: 1, LTN: 1, LGW: 1 };
  var CAP = { MAN: 5, BHX: 5, LON: 8, OTHER: 3 };
  var OTHER_AIRPORTS = 2;

  var AIRPORTS = {
    MAN: "Manchester", BHX: "Birmingham", STN: "Stansted", LTN: "Luton", LGW: "Gatwick",
    NCL: "Newcastle", EDI: "Edinburgh", GLA: "Glasgow", LBA: "Leeds Bradford", BRS: "Bristol",
    LPL: "Liverpool", BFS: "Belfast", DUB: "Dublin"
  };

  var CSS =
    ".ch-sq-wrap{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0E3550;}" +
    /* Text never sits on the sky: the lede and the note share one ink panel. */
    ".ch-sq-plate{background:#0E3550;border-radius:16px;padding:16px 18px;margin:0 0 16px;box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);}" +
    ".ch-sq-lede{font-size:14.5px;line-height:1.5;color:#E8F3FB;margin:0;max-width:44em;}" +
    ".ch-sq-lede b{color:#fff;font-weight:800;}" +
    ".ch-sq-note{font-size:12px;line-height:1.5;color:#9DB6C9;margin:10px 0 0;}" +
    ".ch-sq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:12px;}" +
    ".ch-sq{aspect-ratio:1/1;display:flex;flex-direction:column;min-width:0;overflow:hidden;background:#fff;border:1px solid rgba(14,53,80,.12);border-radius:16px;padding:12px 12px 11px;box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);font-variant-numeric:tabular-nums;}" +
    /* Flex would otherwise squeeze the lines to zero height to fit the square. */
    ".ch-sq>*{flex-shrink:0;}" +
    ".ch-sq-top{display:flex;justify-content:space-between;gap:6px;margin:0;font-size:9.5px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#46607A;white-space:nowrap;}" +
    ".ch-sq-city{font-size:17px;font-weight:800;letter-spacing:-.4px;line-height:1.15;margin:6px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".ch-sq-country{font-size:11px;font-weight:600;color:#46607A;margin:1px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".ch-sq-hours{display:flex;align-items:baseline;gap:6px;margin:8px 0 0;}" +
    ".ch-sq-hours b{font-size:26px;font-weight:900;line-height:1;letter-spacing:-1px;color:#0E6FB6;white-space:nowrap;}" +
    ".ch-sq-hours span{font-size:9.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#46607A;}" +
    ".ch-sq-legs{margin:auto 0 0;padding-top:8px;border-top:1px solid rgba(14,53,80,.1);}" +
    ".ch-sq-legs p{display:flex;align-items:baseline;gap:6px;margin:0;font-size:12.5px;line-height:1.35;}" +
    ".ch-sq-legs i{font-style:normal;width:32px;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#46607A;}" +
    ".ch-sq-legs b{font-weight:800;}" +
    ".ch-sq-legs small{margin-left:auto;font-size:10.5px;font-weight:700;color:#46607A;white-space:nowrap;}" +
    ".ch-sq-foot{display:flex;align-items:baseline;gap:6px;margin:6px 0 0;}" +
    ".ch-sq-foot b{font-size:16px;font-weight:900;letter-spacing:-.4px;}" +
    ".ch-sq-foot small{font-size:10px;font-weight:700;color:#46607A;}" +
    ".ch-sq-empty{padding:24px 16px;text-align:center;font-weight:600;color:#46607A;background:#fff;border-radius:14px;}" +
    /* Phones: two across, so the tile is about 166px. Drop the country line and step the type down. */
    "@media(max-width:560px){" +
      ".ch-sq-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}" +
      ".ch-sq{padding:10px;}" +
      ".ch-sq-country{display:none;}" +
      ".ch-sq-city{font-size:15px;}" +
      ".ch-sq-hours b{font-size:22px;}" +
      ".ch-sq-legs p{font-size:11.5px;}" +
      ".ch-sq-legs i{width:28px;}" +
      ".ch-sq-legs small{font-size:9.5px;}" +
      ".ch-sq-foot b{font-size:14px;}" +
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

  function duration(mins) {
    var m = Math.round(+mins || 0);
    return Math.floor(m / 60) + "h " + (m % 60 < 10 ? "0" : "") + (m % 60) + "m";
  }

  function group(code) {
    if (code === "MAN" || code === "BHX") return code;
    if (LONDON[code]) return "LON";
    return "OTHER";
  }

  // Longest day first, then cheapest. Each group has a cap, each route
  // appears once, and each city at most PER_CITY times, so the page is a
  // mix rather than fifteen Dublins.
  function pick(trips) {
    var route = {}, city = {}, count = {}, others = {}, nOthers = 0, out = [];
    trips
      .filter(function (t) { return t.ground >= MIN_GROUND && t.price <= MAX_PRICE; })
      .sort(function (a, b) { return b.ground - a.ground || a.price - b.price; })
      .forEach(function (t) {
        var g = group(t.origin);
        if ((count[g] || 0) >= CAP[g]) return;
        var r = t.origin + "-" + t.destination;
        if (route[r]) return;
        if ((city[t.destination] || 0) >= PER_CITY) return;
        if (g === "OTHER" && !others[t.origin]) {
          if (nOthers >= OTHER_AIRPORTS) return;
          others[t.origin] = true;
          nOthers++;
        }
        route[r] = true;
        city[t.destination] = (city[t.destination] || 0) + 1;
        count[g] = (count[g] || 0) + 1;
        out.push(t);
      });
    return out;
  }

  function tile(t) {
    return '<article class="ch-sq">' +
      '<p class="ch-sq-top"><span>' + esc(t.origin) + "</span><span>" + esc(pretty(t.date)) + "</span></p>" +
      '<h3 class="ch-sq-city">' + esc(t.city || t.destination) + "</h3>" +
      '<p class="ch-sq-country">' + esc(t.country || AIRPORTS[t.origin] || "") + "</p>" +
      '<p class="ch-sq-hours"><b>' + Math.floor(t.ground) + "</b><span>hrs in country</span></p>" +
      '<div class="ch-sq-legs">' +
        "<p><i>Out</i><b>" + esc(t.out) + "</b><small>" + duration(t.minsOut) + "</small></p>" +
        "<p><i>Back</i><b>" + esc(t.back) + "</b><small>" + duration(t.minsBack) + "</small></p>" +
      "</div>" +
      '<p class="ch-sq-foot"><b>&pound;' + esc(t.price) + "</b><small>both ways</small></p>" +
      "</article>";
  }

  function boot(root, data) {
    var picks = pick((data && data.trips) || []);
    if (!picks.length) {
      root.innerHTML = '<p class="ch-sq-empty">No day trips in the feed right now. It refreshes daily.</p>';
      return;
    }
    root.innerHTML =
      '<div class="ch-sq-wrap">' +
        '<div class="ch-sq-plate">' +
          '<p class="ch-sq-lede">Fly out in the morning, home the same night. <b>' + picks.length +
            " trips</b> from Manchester, Birmingham and London, plus a couple more. Longest day first.</p>" +
          '<p class="ch-sq-note">Anything with less than five hours on the ground is left out, because below that you have flown somewhere to look at an airport. Prices are for the return and move constantly.</p>' +
        "</div>" +
        '<div class="ch-sq-grid">' + picks.map(tile).join("") + "</div>" +
      "</div>";
  }

  function start() {
    var root = document.getElementById(MOUNT);
    if (!root) return;
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    root.innerHTML = '<p class="ch-sq-empty">Loading day trips&hellip;</p>';
    fetch(DATA, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { boot(root, d); })
      .catch(function () {
        root.innerHTML = '<p class="ch-sq-empty">Could not load the day trips just now. Try a refresh.</p>';
      });
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
