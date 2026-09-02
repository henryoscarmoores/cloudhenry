/* CloudHenry homepage conversion layer.
 *
 * Three changes, each for a stated reason:
 *
 *   1. The primary call to action shipped disabled until an airport was
 *      chosen, so every first-time visitor met a greyed-out button. A
 *      dead button reads as broken. It is now always clickable and, with
 *      nothing selected, opens the airport list instead of doing nothing.
 *
 *   2. The hero made claims ("cheaper flights") where it could show
 *      evidence. A real fare, pulled live from the same file the search
 *      page uses, is more persuasive than any adjective and cannot go
 *      stale because it is not hardcoded.
 *
 *   3. 458k Instagram followers is the strongest trust signal on the
 *      site and it was set in small type. Made legible.
 *
 * No em dashes anywhere in the copy, per Henry.
 */
(function () {
  "use strict";

  var DATA_URL = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/fares.json";
  var path = location.pathname.replace(/\/+$/, "");
  if (path !== "" && path !== "/") return;

  // Codes read as jargon in a headline. "Newcastle to Krakow" persuades;
  // "NCL to KRK" asks the reader to do work. Only the codes that actually
  // appear as origins, plus the destinations the feed returns most.
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
    ".ch-hp-proof{display:block;font-weight:800;font-size:13.5px;color:#FFE071;letter-spacing:.01em}" +
    ".ch-hp-deal{margin:14px auto 0;max-width:34ch;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.24);" +
      "border-radius:14px;padding:11px 14px;color:#fff;font-size:14px;line-height:1.45;text-align:center;" +
      "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
    ".ch-hp-deal b{color:#FFE071;font-weight:800}" +
    ".ch-hp-badge{display:inline-block;background:#F5C242;color:#16324A;font-size:9.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;padding:3px 9px;border-radius:999px;margin-bottom:7px}" +
    ".ch-hp-deal .ch-hp-was{text-decoration:line-through;opacity:.75;font-weight:600}" +
    ".ch-hp-deal .ch-hp-sub{display:block;margin-top:3px;font-size:12px;opacity:.82}";

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  // --- 1. Wake the call to action --------------------------------------
  function fixCta() {
    var btn = document.querySelector(".ch-ap-btn");
    var sel = document.querySelector(".ch-ap-select");
    if (!btn || btn.dataset.chFixed) return !!btn;
    btn.dataset.chFixed = "1";

    function enable() {
      btn.removeAttribute("disabled");
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
    enable();

    // Their own script re-disables it whenever the select is empty, so
    // keep re-enabling rather than fighting it once at load.
    if (sel) {
      sel.addEventListener("change", enable);
      new MutationObserver(function () {
        if (btn.hasAttribute("disabled")) enable();
      }).observe(btn, { attributes: true, attributeFilter: ["disabled"] });
    }

    // With no airport picked, send them to the list instead of nowhere.
    btn.addEventListener("click", function (e) {
      if (sel && !sel.value) {
        e.preventDefault();
        e.stopImmediatePropagation();
        sel.focus();
        if (typeof sel.showPicker === "function") { try { sel.showPicker(); } catch (err) {} }
        sel.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, true);

    return true;
  }

  // --- 3. Make the follower count readable ------------------------------
  function liftProof() {
    var f = document.querySelector(".ch-sfoll");
    if (f && !f.dataset.chLifted) {
      f.dataset.chLifted = "1";
      f.classList.add("ch-hp-proof");
    }
  }

  // --- 2. Show a real fare, not an adjective ----------------------------
  function showDeal() {
    if (document.querySelector(".ch-hp-deal")) return;
    var sub = document.querySelector(".ch-sub") || document.querySelector(".ch-h1");
    if (!sub) return;

    fetch(DATA_URL, { cache: "default" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.fares || !j.fares.length) return;

        // Best genuine saving we can evidence, not merely the lowest price.
        var best = null;
        j.fares.forEach(function (f) {
          if (!f.typical || !f.price || f.price >= f.typical) return;
          var saving = (f.typical - f.price) / f.typical;
          if (!best || saving > best.saving) {
            best = { f: f, saving: saving };
          }
        });
        if (!best) return;

        var pct = Math.round(best.saving * 100);
        var el = document.createElement("div");
        el.className = "ch-hp-deal";
        el.innerHTML =
          "<span class=\"ch-hp-badge\">Deal of the month</span><br>" +
          "<b>" + name(best.f.origin) + " to " + name(best.f.destination) + "</b> for <b>&pound;" +
          best.f.price + "</b>, usually <span class=\"ch-hp-was\">&pound;" + best.f.typical + "</span>. " +
          "That is " + pct + "% under." +
          "<span class=\"ch-hp-sub\">Members get every fare like it for &pound;2.99 a month, less than a pint.</span>";
        sub.parentNode.insertBefore(el, sub.nextSibling);
      })
      .catch(function () {});
  }

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    fixCta();
    liftProof();
    showDeal();
    if (tries > 25) clearInterval(timer);
  }, 200);
})();
