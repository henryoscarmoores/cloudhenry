/* CloudHenry conversion layer.
 *
 * Homepage:
 *   The primary call to action shipped disabled until an airport was
 *   chosen, so every first-time visitor met a greyed-out button. A dead
 *   button reads as broken. It is now always clickable and, with nothing
 *   selected, opens the airport list instead of doing nothing.
 *
 * Join pages:
 *   A real fare beats an adjective, but it has to be the right fare. On
 *   join-manchester this shows the best Manchester deal rather than a
 *   random route, and it sits on white where it can be read. It lived in
 *   the homepage hero first and ended up over the sand, white on yellow.
 *
 * Data comes from the same file the search page uses, so it refreshes
 * with the daily job and cannot go stale.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";

  var DATA_URL = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/fares.json";
  var path = location.pathname.replace(/\/+$/, "");
  var isHome = (path === "" || path === "/");
  var joinMatch = path.match(/^\/join-(.+)$/);
  if (!isHome && !joinMatch) return;

  var JOIN_ORIGIN = {
    "manchester": "MAN", "birmingham": "BHX", "leeds": "LBA",
    "london-stansted": "STN", "london-luton": "LTN", "bristol": "BRS",
    "newcastle": "NCL", "glasgow": "GLA", "edinburgh": "EDI",
    "london-gatwick": "LGW", "liverpool": "LPL", "belfast": "BFS"
  };

  var NAMES = {
    MAN:"Manchester",BHX:"Birmingham",LBA:"Leeds",STN:"London",LTN:"London",
    BRS:"Bristol",NCL:"Newcastle",GLA:"Glasgow",EDI:"Edinburgh",LGW:"London",
    LPL:"Liverpool",BFS:"Belfast",
    BCN:"Barcelona",AYT:"Antalya",IST:"Istanbul",MOW:"Moscow",LED:"St Petersburg",
    PAR:"Paris",AGP:"Malaga",ALC:"Alicante",FAO:"Faro",KRK:"Krakow",AMS:"Amsterdam",
    PMI:"Palma",LIS:"Lisbon",ACE:"Lanzarote",MAD:"Madrid",BKK:"Bangkok",LON:"London",
    PRG:"Prague",DUB:"Dublin",WAW:"Warsaw",BER:"Berlin",LPA:"Gran Canaria",
    NYC:"New York",DUS:"Dusseldorf",GRO:"Girona",HAM:"Hamburg",TCI:"Tenerife",
    DLM:"Dalaman",CPH:"Copenhagen",HEL:"Helsinki",DXB:"Dubai",CGN:"Cologne",
    BIO:"Bilbao",TBS:"Tbilisi",BUD:"Budapest",OSL:"Oslo",OPO:"Porto",IZM:"Izmir",
    ROM:"Rome",VIE:"Vienna",VNO:"Vilnius",BRI:"Bari",AGA:"Agadir",MLA:"Malta",
    REU:"Reus",FRA:"Frankfurt",RAK:"Marrakesh",OLB:"Olbia",FUE:"Fuerteventura",
    PFO:"Paphos",ORK:"Cork",DBV:"Dubrovnik",CAG:"Cagliari",NCE:"Nice",MIL:"Milan",
    BRU:"Brussels",BJV:"Bodrum",IBZ:"Ibiza",CFU:"Corfu",CHQ:"Chania",GDN:"Gdansk",
    BUH:"Bucharest",BOD:"Bordeaux",VCE:"Venice",ATH:"Athens",RIX:"Riga",MXP:"Milan",
    FCO:"Rome",NAP:"Naples",CDG:"Paris",GVA:"Geneva",SSH:"Sharm el-Sheikh",CAI:"Cairo"
  };
  function name(code) { return NAMES[code] || code; }

  var CSS =
    "@media(min-width:860px){.ch-airportpick{margin-left:0 !important;margin-right:auto !important}}" +
    ".ch-jd{max-width:700px;margin:24px auto 4px;background:#fff;border:1px solid rgba(14,53,80,.12);" +
      "border-left:3px solid #F5C242;border-radius:16px;padding:16px 18px;text-align:left;" +
      "box-shadow:0 1px 2px rgba(14,53,80,.06),0 8px 22px rgba(14,53,80,.09);" +
      "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0E3550}" +
    ".ch-jd-badge{display:inline-block;background:#F5C242;color:#16324A;font-size:9px;font-weight:900;" +
      "letter-spacing:.11em;text-transform:uppercase;padding:2px 8px;border-radius:999px;margin-bottom:8px}" +
    ".ch-jd-route{font-size:17px;font-weight:800;letter-spacing:-.02em;margin:0 0 4px;line-height:1.3}" +
    ".ch-jd-price{color:#0E6FB6;font-variant-numeric:tabular-nums}" +
    ".ch-jd-was{color:#7A90A5;text-decoration:line-through;font-weight:700;font-variant-numeric:tabular-nums;font-size:14px}" +
    ".ch-jd-sub{font-size:13.5px;color:#46607A;margin:0;line-height:1.5}" +
    ".ch-jd-sub b{color:#1B7F53;font-weight:800}";

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  // --- Homepage: wake the call to action --------------------------------
  function fixCta() {
    var btn = document.querySelector(".ch-ap-btn");
    var sel = document.querySelector(".ch-ap-select");
    if (!btn || btn.dataset.chFixed) return;
    btn.dataset.chFixed = "1";

    function enable() {
      btn.removeAttribute("disabled");
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
    enable();
    if (sel) sel.addEventListener("change", enable);

    btn.addEventListener("click", function (e) {
      if (sel && !sel.value) {
        e.preventDefault();
        e.stopImmediatePropagation();
        sel.focus();
        if (typeof sel.showPicker === "function") { try { sel.showPicker(); } catch (err) {} }
        sel.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, true);
  }

  // --- Join pages: the best fare from their own airport -----------------
  function showJoinDeal(origin) {
    if (document.querySelector(".ch-jd")) return;

    var anchor = null;
    var all = document.querySelectorAll("div, section, p, h2, h3");
    for (var i = 0; i < all.length; i++) {
      if (all[i].children.length === 0 && /^recent fares from/i.test(all[i].textContent.trim())) {
        anchor = all[i];
        break;
      }
    }
    if (!anchor || !anchor.parentNode) return;

    fetch(DATA_URL, { cache: "default" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fares) return;

        // The headline price is rarely the cheapest one available: the
        // dated options underneath it usually are. Checking only the
        // headline produced a "best deal" of 10% sitting directly above a
        // fare in the page's own list at 82%, which reads as nonsense.
        var best = null;
        j.fares.forEach(function (f) {
          if (f.origin !== origin || !f.typical) return;

          var price = f.price || Infinity;
          var dep = f.departure, ret = f.ret;
          if (f.options && f.options.length) {
            f.options.forEach(function (o) {
              if (o.p && o.p < price) { price = o.p; dep = o.d; ret = o.r; }
            });
          }
          if (!isFinite(price) || price >= f.typical) return;

          var saving = (f.typical - price) / f.typical;
          if (!best || saving > best.saving) {
            best = { f: f, price: price, dep: dep, ret: ret, saving: saving };
          }
        });

        // Never show a weak number next to the page's own stronger ones.
        if (!best || best.saving < 0.2) return;

        var pct = Math.round(best.saving * 100);
        var el = document.createElement("div");
        el.className = "ch-jd";
        el.innerHTML =
          '<span class="ch-jd-badge">Best deal right now</span>' +
          '<p class="ch-jd-route">' + name(best.f.origin) + " to " + name(best.f.destination) +
            ' <span class="ch-jd-price">&pound;' + best.price + '</span> ' +
            '<span class="ch-jd-was">&pound;' + best.f.typical + '</span></p>' +
          '<p class="ch-jd-sub"><b>' + pct + '% below the usual price.</b> ' +
            'This is the sort of fare members get every week from ' + name(best.f.origin) + '.</p>';

        anchor.parentNode.insertBefore(el, anchor);
      })
      .catch(function () {});
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    if (isHome) {
      fixCta();
      if (tries > 40) clearInterval(timer);
      return;
    }
    var origin = JOIN_ORIGIN[joinMatch[1]];
    if (!origin) { clearInterval(timer); return; }
    showJoinDeal(origin);
    if (tries > 40 || document.querySelector(".ch-jd")) clearInterval(timer);
  }, 250);
})();
