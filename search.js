/* CloudHenry Everywhere search.
   Loaded by the HTML card on /search/. Reads the fare file the daily
   fetch-fares task publishes, and links every result to Aviasales with
   the CloudHenry affiliate marker attached.

   Namespaced under chfs* and scoped to the .chfs container so it cannot
   disturb the rest of the site. */
(function () {
  "use strict";

  var DATA_URL = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/fares.json";

  // jsDelivr tells browsers to cache for seven days, so a daily refresh
  // would take a week to reach anyone who had already visited. A date
  // stamp on the query makes it a new URL each morning; jsDelivr ignores
  // the parameter and still serves from its edge.
  function dataUrl() {
    var d = new Date();
    return DATA_URL + "?v=" + d.getUTCFullYear() +
           ("0" + (d.getUTCMonth() + 1)).slice(-2) +
           ("0" + d.getUTCDate()).slice(-2);
  }
  var MARKER   = "764584";

  // Everyone sees every fare. Only paying members can act on one:
  // /members/api/member/ answers 200 with the member when signed in and
  // 204 when not, so it is a reliable client-side check.
  var PAID = false;

  function checkMember() {
    return fetch("/members/api/member/", { credentials: "include" })
      .then(function (r) { return r.status === 200 ? r.json() : null; })
      .then(function (m) {
        if (!m) return false;
        if (m.status === "paid" || m.status === "comped") return true;
        return !!(m.subscriptions && m.subscriptions.some(function (s) {
          return s.status === "active" || s.status === "trialing";
        }));
      })
      .catch(function () { return false; });
  }

  // Swap every booking link for a subscribe prompt when the reader has
  // not paid. The fare, the date and the saving all stay visible: the
  // point is to show what they are missing, not to hide it.
  function applyGate(root) {
    if (PAID) return;
    var links = (root || document).querySelectorAll(".chfs-book, #chfsMain, .chfs-live a, .chfs-nodata a");
    Array.prototype.forEach.call(links, function (a) {
      a.setAttribute("href", "#/portal/signup");
      a.removeAttribute("target");
      a.removeAttribute("rel");
      a.classList.add("chfs-locked");
      a.textContent = a.id === "chfsMain" ? "Try 40 days free to book" : "Unlock";
    });
  }


  // "Any UK airport" is a real option, not a label. Weekend and
  // Christmas inventory is thin from most regional airports and someone
  // in the Midlands is often happy to leave from Birmingham or
  // Manchester, so the search can look at all twelve at once.
  var ANY = "ANY";
  var ORIGINS = [
    [ANY,"Any UK airport"],
    ["MAN","Manchester"], ["BHX","Birmingham"], ["LBA","Leeds Bradford"],
    ["STN","London Stansted"], ["LTN","London Luton"], ["BRS","Bristol"],
    ["NCL","Newcastle"], ["GLA","Glasgow"], ["EDI","Edinburgh"],
    ["LGW","London Gatwick"], ["LPL","Liverpool"], ["BFS","Belfast"]
  ];
  function originName(code) {
    var n = code;
    ORIGINS.forEach(function (o) { if (o[0] === code) n = o[1]; });
    return n;
  }
  // Short form for the card meta line, where "London Stansted" is too long.
  var ORIGIN_SHORT = { MAN:"Manchester", BHX:"Birmingham", LBA:"Leeds", STN:"Stansted",
                       LTN:"Luton", BRS:"Bristol", NCL:"Newcastle", GLA:"Glasgow",
                       EDI:"Edinburgh", LGW:"Gatwick", LPL:"Liverpool", BFS:"Belfast" };
  function fromMatches(f) { return state.from === ANY || f.origin === state.from; }

  // Other UK airports. A £44 hop to London with a stop is not a deal a
  // flight deals site should lead with. They still show when typed.
  var UK = { LON:1, MAN:1, BHX:1, LBA:1, STN:1, LTN:1, BRS:1, NCL:1, GLA:1, EDI:1,
             LGW:1, LPL:1, BFS:1, CWL:1, ILY:1, KOI:1, ABZ:1, INV:1, SOU:1, EXT:1, NQY:1 };

  // Codes the feed produces that are not real destinations for anyone
  // browsing. Bartica is a river town in Guyana quoted at £73 with two
  // stops; that is a data fault, not a fare, and it sat third in the
  // suggestions for "Barcelona".
  var BOGUS = { BSZ:1, DSE:1 };

  // Loose themes for the Inspire me row. Not exhaustive and not meant to
  // be; the point is a starting place for someone who has no destination
  // in mind, which is most people who land on this page.
  var THEMES = {
    beach: { label:"Beach", codes:"AGP ALC PMI IBZ FAO ACE LPA TCI FUE AYT DLM BJV IZM CFU CHQ ZTH JMK HER RHO MLA PFO SSH AGA RAK OLB CAG BRI BOJ" },
    city:  { label:"City break", codes:"PAR CDG AMS BCN MAD LIS OPO ROM FCO MIL MXP VCE NAP BER HAM DUS CGN FRA MUC PRG VIE BUD KRK WAW GDN CPH OSL ARN HEL RIX VNO TLL DUB ORK BRU GVA ZRH ATH BUH BEG IST EDI" },
    sun:   { label:"Winter sun", codes:"ACE LPA TCI FUE AGA RAK SSH HRG CAI DXB MLA PFO AGP ALC FAO MIR TUN AYT DLM" },
    long:  { label:"Long haul", codes:"NYC BOS YTO ORL CLT BKK HKT DXB JED SYD HKG KTM ISB LHE ATQ JNB ACC LOS TBS BAK ALA TAS" }
  };
  Object.keys(THEMES).forEach(function (k) {
    var set = {};
    THEMES[k].codes.split(" ").forEach(function (c) { set[c] = 1; });
    THEMES[k].set = set;
  });

  var PLACES = {
    BCN:["Barcelona","Spain","🇪🇸"],AYT:["Antalya","Türkiye","🇹🇷"],
    IST:["Istanbul","Türkiye","🇹🇷"],MOW:["Moscow","Russia","🇷🇺"],
    LED:["St Petersburg","Russia","🇷🇺"],EDI:["Edinburgh","Scotland","🏴"],
    PAR:["Paris","France","🇫🇷"],AGP:["Málaga","Spain","🇪🇸"],
    ALC:["Alicante","Spain","🇪🇸"],OSS:["Osh","Kyrgyzstan","🇰🇬"],
    FAO:["Faro","Portugal","🇵🇹"],TAS:["Tashkent","Uzbekistan","🇺🇿"],
    BFS:["Belfast","N. Ireland","🇬🇧"],KRK:["Kraków","Poland","🇵🇱"],
    AMS:["Amsterdam","Netherlands","🇳🇱"],PMI:["Palma","Spain","🇪🇸"],
    LIS:["Lisbon","Portugal","🇵🇹"],BAK:["Baku","Azerbaijan","🇦🇿"],
    ACE:["Lanzarote","Spain","🇪🇸"],MAD:["Madrid","Spain","🇪🇸"],
    BKK:["Bangkok","Thailand","🇹🇭"],LON:["London","England","🏴"],
    YTO:["Toronto","Canada","🇨🇦"],PRG:["Prague","Czechia","🇨🇿"],
    ALA:["Almaty","Kazakhstan","🇰🇿"],SKD:["Samarkand","Uzbekistan","🇺🇿"],
    DUB:["Dublin","Ireland","🇮🇪"],WAW:["Warsaw","Poland","🇵🇱"],
    BER:["Berlin","Germany","🇩🇪"],LPA:["Gran Canaria","Spain","🇪🇸"],
    BEG:["Belgrade","Serbia","🇷🇸"],NYC:["New York","USA","🇺🇸"],
    DUS:["Düsseldorf","Germany","🇩🇪"],RMO:["Chișinău","Moldova","🇲🇩"],
    GRO:["Girona","Spain","🇪🇸"],HAM:["Hamburg","Germany","🇩🇪"],
    TCI:["Tenerife","Spain","🇪🇸"],CIT:["Shymkent","Kazakhstan","🇰🇿"],
    DLM:["Dalaman","Türkiye","🇹🇷"],CPH:["Copenhagen","Denmark","🇩🇰"],
    HEL:["Helsinki","Finland","🇫🇮"],DXB:["Dubai","UAE","🇦🇪"],
    CGN:["Cologne","Germany","🇩🇪"],BIO:["Bilbao","Spain","🇪🇸"],
    DYU:["Dushanbe","Tajikistan","🇹🇯"],TBS:["Tbilisi","Georgia","🇬🇪"],
    BUD:["Budapest","Hungary","🇭🇺"],NQZ:["Astana","Kazakhstan","🇰🇿"],
    OSL:["Oslo","Norway","🇳🇴"],OPO:["Porto","Portugal","🇵🇹"],
    IZM:["Izmir","Türkiye","🇹🇷"],GLA:["Glasgow","Scotland","🏴"],
    ROM:["Rome","Italy","🇮🇹"],VIE:["Vienna","Austria","🇦🇹"],
    LOS:["Lagos","Nigeria","🇳🇬"],BRS:["Bristol","England","🏴"],
    LHE:["Lahore","Pakistan","🇵🇰"],JNB:["Johannesburg","South Africa","🇿🇦"],
    HKG:["Hong Kong","Hong Kong","🇭🇰"],VNO:["Vilnius","Lithuania","🇱🇹"],
    BRI:["Bari","Italy","🇮🇹"],KZN:["Kazan","Russia","🇷🇺"],
    AGA:["Agadir","Morocco","🇲🇦"],CWL:["Cardiff","Wales","🏴"],
    MLA:["Malta","Malta","🇲🇹"],MAN:["Manchester","England","🏴"],
    REU:["Reus","Spain","🇪🇸"],JMK:["Mykonos","Greece","🇬🇷"],
    HKT:["Phuket","Thailand","🇹🇭"],SYD:["Sydney","Australia","🇦🇺"],
    BHX:["Birmingham","England","🏴"],AER:["Sochi","Russia","🇷🇺"],
    KRR:["Krasnodar","Russia","🇷🇺"],ILY:["Islay","Scotland","🏴"],
    KOI:["Kirkwall","Scotland","🏴"],FRA:["Frankfurt","Germany","🇩🇪"],
    GBE:["Gaborone","Botswana","🇧🇼"],MCX:["Makhachkala","Russia","🇷🇺"],
    LPL:["Liverpool","England","🏴"],RAK:["Marrakesh","Morocco","🇲🇦"],
    OLB:["Olbia","Italy","🇮🇹"],FUE:["Fuerteventura","Spain","🇪🇸"],
    PFO:["Paphos","Cyprus","🇨🇾"],ORK:["Cork","Ireland","🇮🇪"],
    NCL:["Newcastle","England","🏴"],KUN:["Kaunas","Lithuania","🇱🇹"],
    DBV:["Dubrovnik","Croatia","🇭🇷"],CLT:["Charlotte","USA","🇺🇸"],
    MSQ:["Minsk","Belarus","🇧🇾"],CAG:["Cagliari","Italy","🇮🇹"],
    KTT:["Kittilä","Finland","🇫🇮"],PRN:["Pristina","Kosovo","🇽🇰"],
    FAE:["Faroe Islands","Faroes","🇫🇴"],ORL:["Orlando","USA","🇺🇸"],
    MIR:["Monastir","Tunisia","🇹🇳"],HAK:["Haikou","China","🇨🇳"],
    EBL:["Erbil","Iraq","🇮🇶"],CAI:["Cairo","Egypt","🇪🇬"],
    FNA:["Freetown","Sierra Leone","🇸🇱"],JED:["Jeddah","Saudi Arabia","🇸🇦"],
    GDN:["Gdańsk","Poland","🇵🇱"],ACC:["Accra","Ghana","🇬🇭"],
    ATQ:["Amritsar","India","🇮🇳"],BUH:["Bucharest","Romania","🇷🇴"],
    BOD:["Bordeaux","France","🇫🇷"],CLJ:["Cluj-Napoca","Romania","🇷🇴"],
    BOS:["Boston","USA","🇺🇸"],BOJ:["Burgas","Bulgaria","🇧🇬"],
    GIB:["Gibraltar","Gibraltar","🇬🇮"],IBZ:["Ibiza","Spain","🇪🇸"],
    CHQ:["Chania","Greece","🇬🇷"],CFU:["Corfu","Greece","🇬🇷"],
    KTM:["Kathmandu","Nepal","🇳🇵"],SJO:["San José","Costa Rica","🇨🇷"],
    NCE:["Nice","France","🇫🇷"],KUT:["Kutaisi","Georgia","🇬🇪"],
    BUS:["Batumi","Georgia","🇬🇪"],ZTH:["Zakynthos","Greece","🇬🇷"],
    SSH:["Sharm el-Sheikh","Egypt","🇪🇬"],MIL:["Milan","Italy","🇮🇹"],
    ABV:["Abuja","Nigeria","🇳🇬"],ISB:["Islamabad","Pakistan","🇵🇰"],
    BRU:["Brussels","Belgium","🇧🇪"],BJV:["Bodrum","Türkiye","🇹🇷"],
    BSZ:["Bartica","Guyana","🇬🇾"],DSE:["Dessie","Ethiopia","🇪🇹"]
  };

  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function $(id) { return document.getElementById(id); }
  function place(code) { return PLACES[code] || [code, "", "✈️"]; }

  // Windows has never shipped flag emoji, so a regional-indicator pair
  // renders as bare letters there. Draw a country badge instead: it is
  // legible on every platform and looks deliberate rather than broken.
  function badgeCode(flag) {
    if (!flag || flag.length < 4) return "";
    var a = flag.codePointAt(0), b = flag.codePointAt(2);
    if (a < 0x1F1E6 || a > 0x1F1FF) return "";
    return String.fromCharCode(65 + (a - 0x1F1E6)) + String.fromCharCode(65 + (b - 0x1F1E6));
  }

  // Real flag images. Emoji flags are not an option here: Windows ships
  // no glyphs for them. flagcdn serves plain PNGs, and the UK nations
  // need subdivision codes rather than the union flag.
  var SUBDIVISION = { "Scotland":"gb-sct", "England":"gb-eng", "Wales":"gb-wls", "N. Ireland":"gb-nir" };

  function flagImg(p) {
    var code = SUBDIVISION[p[1]] || badgeCode(p[2]).toLowerCase();
    if (!code) return '<span class="chfs-flag chfs-flag-x" aria-hidden="true">&#9992;</span>';
    return '<img class="chfs-flag" alt="" loading="lazy" decoding="async" src="https://flagcdn.com/w40/' +
           code + '.png" srcset="https://flagcdn.com/w80/' + code + '.png 2x">';
  }


  if (!$("chfsGrid")) { return; }   // widget not on this page

  // On the homepage the widget stands in for the old fares box. It shows
  // a handful of results and hands over to the full page for the rest,
  // and it leaves the homepage address bar alone.
  var ROOT  = $("chfsGrid").closest(".chfs");
  var EMBED = !!(ROOT && ROOT.getAttribute("data-embed"));
  var LIMIT = EMBED ? (parseInt(ROOT.getAttribute("data-limit"), 10) || 6) : 120;

  var FARES = [], state = { from:"MAN", q:"", from2:"", to2:"", month:"", flex:3, trip:"any", sort:"price", direct:false, budget:600, theme:"" };

  // A search is worth sharing and worth linking to from an email, so the
  // interesting parts of it live in the address bar: /search/?from=LBA&to=Krakow&trip=weekend
  var URL_KEYS = ["from", "to", "trip", "month", "dep", "ret", "theme", "max", "plan"];
  function readUrl() {
    var params = {};
    (location.search || "").replace(/^\?/, "").split("&").forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf("=");
      var k = decodeURIComponent(i > -1 ? kv.slice(0, i) : kv);
      var v = decodeURIComponent(i > -1 ? kv.slice(i + 1) : "").replace(/\+/g, " ");
      if (URL_KEYS.indexOf(k) > -1) params[k] = v;
    });
    return params;
  }
  // Read the address bar once, before anything renders. The first render
  // happens while the controls are being wired up, and it must not wipe
  // a shared link's parameters before the fares have loaded.
  var INITIAL = EMBED ? {} : readUrl();
  var READY = false;

  // Fares come in one file per airport (fares-MAN.json and so on), built
  // by build-fares.ps1 with every destination the cache knows. The slim
  // fares.json the rest of the site reads is loaded first so the page
  // paints straight away, then the airport file replaces it. If an
  // airport file is missing the slim data for that airport stands in.
  var FILE_BASE = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/";
  var LOADED = {}, LOADING = {}, SLIM = null, GENERATED = "";

  function stamp() {
    var d = new Date();
    return d.getUTCFullYear() + ("0" + (d.getUTCMonth() + 1)).slice(-2) + ("0" + d.getUTCDate()).slice(-2) + "-" + (d.getUTCHours() < 12 ? "am" : "pm");
  }
  function originsNeeded() {
    if (state.from === ANY) return ORIGINS.filter(function (o) { return o[0] !== ANY; }).map(function (o) { return o[0]; });
    return [state.from];
  }
  function composeFares() {
    var out = [];
    originsNeeded().forEach(function (c) {
      out = out.concat(LOADED[c] ? LOADED[c] : (SLIM || []).filter(function (f) { return f.origin === c; }));
    });
    FARES = out;
  }
  function loadOrigin(code) {
    if (LOADED[code] || LOADING[code]) return;
    LOADING[code] = true;
    fetch(FILE_BASE + "fares-" + code + ".json?v=" + stamp(), { cache: "default" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        LOADED[code] = (j && j.fares && j.fares.length) ? j.fares : ((SLIM || []).filter(function (f) { return f.origin === code; }));
        if (j && j.generated) { GENERATED = j.generated; stampLabel(); }
      })
      .catch(function () { LOADED[code] = (SLIM || []).filter(function (f) { return f.origin === code; }); })
      .then(function () {
        LOADING[code] = false;
        if (originsNeeded().indexOf(code) > -1) { composeFares(); buildMonths(); render(); }
      });
  }
  // Called at the top of every render: start any airport loads still
  // missing. The render carries on with what is in hand.
  function ensureOriginData() {
    if (!SLIM) return;
    originsNeeded().forEach(loadOrigin);
  }

  // places.js is the shared name list, and the daily job adds to it
  // whenever the feed finds a destination nobody has named. The copy
  // above stays as the base (its spellings win); anything new is merged
  // in, so a city the job named this morning shows up here today.
  function mergePlaces(next) {
    var s = document.createElement("script");
    s.src = FILE_BASE + "places.js?v=" + stamp();
    s.onload = function () {
      var extra = window.CH_PLACES || {};
      Object.keys(extra).forEach(function (code) { if (!PLACES[code]) PLACES[code] = extra[code]; });
      COUNTRIES = null;
      next();
    };
    s.onerror = next;
    document.head.appendChild(s);
  }
  function stampLabel() {
    if (!GENERATED || !$("chfsStamp")) return;
    var d = new Date(GENERATED);
    $("chfsStamp").textContent = " Last updated " + fmt(GENERATED) + ", " +
      ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ".";
  }

  // The same parameters writeUrl would put in the address bar, as a
  // query string, for the "see all" link out of the embedded widget.
  function searchQuery() {
    var parts = [];
    if (state.from !== "MAN") parts.push("from=" + state.from);
    if (!isEverywhere(state.q)) parts.push("to=" + encodeURIComponent(state.q.trim()));
    if (state.trip !== "any") parts.push("trip=" + state.trip);
    if (state.month) parts.push("month=" + state.month);
    if (state.from2) parts.push("dep=" + state.from2);
    if (state.to2) parts.push("ret=" + state.to2);
    if (state.theme) parts.push("theme=" + state.theme);
    if (state.budget < 600) parts.push("max=" + state.budget);
    return parts.length ? "?" + parts.join("&") : "";
  }

  function writeUrl() {
    if (!READY || EMBED) return;
    if (!window.history || !history.replaceState) return;
    var parts = [];
    if (state.from !== "MAN") parts.push("from=" + state.from);
    if (!isEverywhere(state.q)) parts.push("to=" + encodeURIComponent(state.q.trim()));
    if (state.trip !== "any") parts.push("trip=" + state.trip);
    if (state.month) parts.push("month=" + state.month);
    if (state.from2) parts.push("dep=" + state.from2);
    if (state.to2) parts.push("ret=" + state.to2);
    if (state.theme) parts.push("theme=" + state.theme);
    if (state.budget < 600) parts.push("max=" + state.budget);
    var next = location.pathname + (parts.length ? "?" + parts.join("&") : "");
    if (next !== location.pathname + location.search) history.replaceState(null, "", next);
  }

  ORIGINS.forEach(function (o) {
    var opt = document.createElement("option");
    opt.value = o[0]; opt.textContent = o[0] === ANY ? o[1] : o[1] + " (" + o[0] + ")";
    $("chfsFrom").appendChild(opt);
  });
  $("chfsFrom").value = state.from;

  function fmt(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return "";
    return parseInt(p[2], 10) + " " + MON[parseInt(p[1], 10) - 1];
  }
  function ddmm(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return "";
    return p[2] + p[1];
  }
  function monthKey(iso) { return String(iso).slice(0, 7); }

  // Whole days between two ISO dates, computed at midday UTC so a
  // daylight saving change cannot shift the answer by one.
  function toDays(iso) {
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return null;
    return Date.UTC(+p[0], +p[1] - 1, +p[2], 12) / 86400000;
  }
  function dayDiff(a, b) {
    var x = toDays(a), y = toDays(b);
    return (x === null || y === null) ? 9999 : Math.round(x - y);
  }

  // Day of week from the ISO string directly. Parsing these with Date
  // invites timezone shifts that can move a Friday flight to Thursday.
  function dow(iso) {
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return -1;
    var y = +p[0], m = +p[1], d = +p[2];
    if (m < 3) { m += 12; y--; }
    var k = y % 100, j = Math.floor(y / 100);
    var h = (d + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
    return (h + 6) % 7;   // 0 = Sunday
  }

  // Out on Friday or Saturday, home on Sunday. The most requested thing
  // Henry gets asked for, and the commonest pattern in the fare data.
  var XMAS = {
    PRG:1, BER:1, VIE:1, BUD:1, KRK:1, CPH:1, HAM:1, CGN:1, DUS:1, FRA:1,
    AMS:1, BRU:1, GDN:1, WAW:1, RIX:1, VNO:1, HEL:1, OSL:1, GVA:1, MIL:1,
    VCE:1, ROM:1, NYC:1, BOS:1, YTO:1, TLL:1
  };
  var XMAS_FROM = "2026-11-15", XMAS_TO = "2026-12-24";

  function isXmasMarket(r) {
    if (!XMAS[r.dest] || !r.ret) return false;
    var dep = String(r.dep).slice(0, 10);
    if (dep < XMAS_FROM || dep > XMAS_TO) return false;
    var nights = dayDiff(r.ret, r.dep);
    return nights >= 2 && nights <= 5;
  }

  function isWeekendBreak(r) {
    if (!r.ret) return false;
    var out = dow(r.dep), back = dow(r.ret);
    if (!((out === 5 || out === 6) && back === 0)) return false;
    // Friday to Sunday sixteen nights later is not a weekend. Only a
    // genuine short break counts: one or two nights away.
    var nights = dayDiff(r.ret, r.dep);
    return nights >= 1 && nights <= 2;
  }

  // Every booking link goes through Travelpayouts' own redirect. A link
  // straight to aviasales.com with ?marker= still earns commission, but
  // the Travelpayouts dashboard only counts clicks that pass through
  // tp.media, so Henry's own test clicks never showed up. trs is the
  // "Henrys-flight-club" traffic source, p is the Aviasales programme.
  function tracked(url) {
    return "https://tp.media/r?marker=" + MARKER + "&trs=562291&p=4114&u=" + encodeURIComponent(url);
  }
  // Aviasales deep link. Format: ORIGIN + DDMM + DEST + [DDMM return] + pax
  function bookUrl(origin, dest, dep, ret) {
    var o = ddmm(dep);
    if (!o) return tracked("https://www.aviasales.com/");
    return tracked("https://www.aviasales.com/search/" + origin + o + dest + (ddmm(ret) || "") + "1");
  }

  // Flatten each route into its individual dated departures, so the list
  // shows bookable flights rather than one summary row per destination.
  function mean(a) {
    if (!a.length) return null;
    var t = 0, i;
    for (i = 0; i < a.length; i++) t += a[i];
    return Math.round(t / a.length);
  }

  function flatten() {
    var out = [];
    var today = isoToday();
    FARES.forEach(function (f) {
      if (!fromMatches(f)) return;
      var opts = f.options && f.options.length ? f.options : null;
      if (!PLACES[f.destination]) return;   // unnamed code, looks broken
      if (BOGUS[f.destination]) return;
      if (opts) {
        // A return costs more than a one-way, so they need separate
        // baselines. Comparing a return against the one-way average was
        // making every round trip look "above usual" against a cheaper
        // struck-through figure, which is simply wrong.
        //
        // For one-ways the feed carries the route's own typical price
        // from the API. Prefer it: an average of the cheap dates we
        // happened to cache understates what people normally pay, and
        // the join pages already quote the API figure, so the same fare
        // was showing two different "usual" prices on one page.
        var ow = [], rt = [];
        opts.forEach(function (o) { (o.r ? rt : ow).push(o.p); });
        var owAvg = f.typical || mean(ow), rtAvg = mean(rt);
        opts.forEach(function (o) {
          if (o.d && o.d < today) return;   // already departed
          out.push({ origin:f.origin, dest:f.destination, price:o.p, dep:o.d, ret:o.r || "", stops:o.s || 0,
                     typical: o.r ? rtAvg : owAvg });
        });
      } else if (!f.departure || String(f.departure).slice(0, 10) >= today) {
        out.push({ origin:f.origin, dest:f.destination, price:f.price, dep:f.departure, ret:f.ret || "", stops:f.transfers || 0, typical: f.ret ? null : (f.typical || null) });
      }
    });
    return out;
  }

  // True when the typed text names at least one reachable place. Used so
  // a half-typed or misspelt city does not wipe the results while the
  // suggestions are still open.
  function queryMatchesSomething(q) {
    var term = q.trim().toLowerCase();
    if (!term) return true;
    if (term === "everywhere" || term === "anywhere" || term === "any") return true;
    var hit = false;
    Object.keys(PLACES).forEach(function (code) {
      if (hit) return;
      var p = PLACES[code];
      if ((p[0] + " " + p[1] + " " + code).toLowerCase().indexOf(term) > -1) hit = true;
    });
    return hit;
  }

  // "Everywhere" is a real choice in the Going to list as well as the
  // default, so a typed city can be undone with one tap.
  function isEverywhere(q) {
    var t = (q || "").trim().toLowerCase();
    return !t || t === "everywhere" || t === "anywhere" || t === "any";
  }
  var COUNTRIES = null;
  function isCountry(q) {
    var t = (q || "").trim().toLowerCase();
    if (!t) return false;
    if (!COUNTRIES) {
      COUNTRIES = {};
      Object.keys(PLACES).forEach(function (c) { if (PLACES[c][1]) COUNTRIES[PLACES[c][1].toLowerCase()] = 1; });
    }
    return !!COUNTRIES[t];
  }

  function build() {
    var rows = flatten();
    var q = isEverywhere(state.q) ? "" : state.q.trim().toLowerCase();

    if (q) {
      rows = rows.filter(function (r) {
        var p = place(r.dest);
        return (p[0] + " " + p[1] + " " + r.dest).toLowerCase().indexOf(q) > -1;
      });
    } else {
      // Browsing, not asking for somewhere in particular: leave out the
      // hops to other UK airports.
      rows = rows.filter(function (r) { return !UK[r.dest]; });
    }
    if (state.theme && THEMES[state.theme]) {
      var set = THEMES[state.theme].set;
      rows = rows.filter(function (r) { return set[r.dest]; });
      // Winter sun means winter. A Lanzarote fare in July is not it.
      if (state.theme === "sun") {
        rows = rows.filter(function (r) { var m = parseInt(String(r.dep).slice(5, 7), 10); return m >= 10 || m <= 3; });
      }
    }
    if (state.trip === "one") rows = rows.filter(function (r) { return !r.ret; });
    if (state.trip === "ret") rows = rows.filter(function (r) { return !!r.ret; });
    if (state.trip === "weekend") rows = rows.filter(isWeekendBreak);
    if (state.trip === "xmas") rows = rows.filter(isXmasMarket);
    if (state.direct) rows = rows.filter(function (r) { return r.stops === 0; });
    if (state.budget < 600) rows = rows.filter(function (r) { return r.price <= state.budget; });
    // Exact dates, with a tolerance either side. Someone asking for the
    // 12th does not want an empty page because the cache holds the 13th,
    // but they do want the 12th first. Set flex to 0 for exact only.
    if (state.month) {
      rows = rows.filter(function (r) { return monthKey(r.dep) === state.month; });
    }
    if (state.from2) {
      rows = rows.filter(function (r) { return Math.abs(dayDiff(r.dep, state.from2)) <= state.flex; });
    }
    if (state.to2 && state.trip !== "one") {
      rows = rows.filter(function (r) {
        return r.ret && Math.abs(dayDiff(r.ret, state.to2)) <= state.flex;
      });
    }

    rows.sort(function (a, b) {
      if (state.from2) {
        var da = Math.abs(dayDiff(a.dep, state.from2));
        var db = Math.abs(dayDiff(b.dep, state.from2));
        if (da !== db) return da - db;   // closest to the chosen day first
      }
      if (state.sort === "price") return a.price - b.price;
      if (state.sort === "date") return String(a.dep).localeCompare(String(b.dep));
      return place(a.dest)[0].localeCompare(place(b.dest)[0]);
    });

    // Browsing "Everywhere" is a question about places, not dates, so
    // show the best fare per destination. Sorting by price alone put
    // twelve consecutive Paris cards on screen and buried every other
    // city. Once a destination is named, every date for it is listed.
    var seen = {}, unique = [];
    // A country is a question about places too: one card per Spanish
    // city, not every Barcelona date in a row.
    var perDestination = isEverywhere(state.q) || isCountry(state.q);
    rows.forEach(function (r) {
      var k = perDestination ? r.dest : (r.origin + "|" + r.dest + "|" + r.dep + "|" + r.ret);
      if (!seen[k]) { seen[k] = 1; unique.push(r); }
    });
    return unique;
  }

  // The struck-through price only earns its place when the gap is worth
  // reading. £873 against £879 was being shown, which looks like a fault.
  function wasPrice(r) {
    if (!r.typical || r.typical < r.price * 1.1) return "";
    return '<span class="chfs-was">£' + r.typical + '</span>';
  }

  function tag(r) {
    if (!r.typical) return "";
    var s = Math.round(((r.typical - r.price) / r.typical) * 100);
    if (s >= 25) return '<span class="chfs-tag g">' + s + '% under usual</span>';
    if (s >= 12) return '<span class="chfs-tag b">Good price</span>';
    if (s <= -15) return '<span class="chfs-tag w">Above usual</span>';
    return "";
  }

  // The next Friday, and the Sunday after it.
  function nextWeekend() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    var add = (5 - d.getDay() + 7) % 7;
    if (add === 0) add = 7;                 // today is Friday: use next one
    var fri = new Date(d.getTime() + add * 86400000);
    var sun = new Date(fri.getTime() + 2 * 86400000);
    return [fri.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
  }

  function liveSearchUrl() {
    // Weekend mode always offers a live search, because the cache holds
    // only a handful of weekend-dated fares and a thin list should not
    // be the end of the road.
    if (!state.from2 && state.trip === "weekend") {
      var wk = nextWeekend();
      return tracked("https://www.aviasales.com/search/" + liveOrigin() + ddmm(wk[0]) + ddmm(wk[1]) + "1");
    }
    if (!state.from2) return null;
    var destCode = "";
    var q = state.q.trim().toLowerCase();
    if (q) {
      for (var code in PLACES) {
        if (PLACES[code][0].toLowerCase() === q || code.toLowerCase() === q) { destCode = code; break; }
      }
    }
    var back = (state.trip === "one" || !state.to2) ? "" : ddmm(state.to2);
    return tracked("https://www.aviasales.com/search/" + liveOrigin() + ddmm(state.from2) +
           destCode + back + "1");
  }

  function renderLiveBar() {
    var old = document.getElementById("chfsLive");
    if (old) old.remove();
    var url = liveSearchUrl();
    if (!url) return;
    var head = document.querySelector(".chfs-head");
    if (!head) return;
    var bar = document.createElement("div");
    bar.id = "chfsLive";
    bar.className = "chfs-live";
    var wkMode = (state.trip === "weekend" && !state.from2);
    var wk = wkMode ? nextWeekend() : null;
    bar.innerHTML =
      "<span>" + (wkMode
        ? (build().length ? "Want this coming weekend checked live as well, " : "We hold a handful of weekend fares. Check this coming weekend live, ") +
          fmt(wk[0]) + " to " + fmt(wk[1]) + "."
        : "Want these exact dates checked live, including any we have not cached?") + "</span>" +
      '<a href="' + url + '" target="_blank" rel="noopener sponsored">' +
        (wkMode ? "Search this weekend live" : "Search these dates on Aviasales") + '</a>';
    head.parentNode.insertBefore(bar, head);
    applyGate(bar);   // the bar sits outside the grid
  }

  // The airport code Aviasales gets when the reader has not picked one.
  // "LON" covers all the London airports, which hold most of the fares.
  function liveOrigin() { return state.from === ANY ? "LON" : state.from; }

  // Offered on every empty result from one airport. Switching to all
  // twelve is usually the answer, and a button beats an instruction.
  function tryAnyButton() {
    if (state.from === ANY) return "";
    return '<button type="button" class="chfs-tryany" id="chfsTryAny">Try every UK airport</button>';
  }
  function wireTryAny() {
    var b = $("chfsTryAny");
    if (!b) return;
    b.addEventListener("click", function () {
      state.from = ANY;
      $("chfsFrom").value = ANY;
      buildMonths();
      render();
    });
  }

  function render() {
    writeUrl();
    ensureOriginData();
    renderLiveBar();
    var rows = build();
    var grid = $("chfsGrid");
    var fromCity = originName(state.from);
    var anyMode = (state.from === ANY);

    var browsing = isEverywhere(state.q);
    var country = !browsing && isCountry(state.q);
    var themeLabel = state.theme && THEMES[state.theme] ? THEMES[state.theme].label + " " : "";
    $("chfsTitle").textContent = browsing
      ? (anyMode ? themeLabel + "Everywhere from any UK airport" : themeLabel + "Everywhere from " + fromCity)
      : country
        ? state.q.trim() + " from " + (anyMode ? "any UK airport" : fromCity)
        : (anyMode ? "Flights from any UK airport" : "Flights from " + fromCity);
    var noun = (browsing || country) ? "destination" : "flight";
    $("chfsCount").textContent = rows.length
      ? (rows.length > LIMIT ? "showing " + LIMIT + " of " + rows.length + " " + noun + "s"
                           : rows.length + " " + noun + (rows.length === 1 ? "" : "s"))
      : "";

    grid.innerHTML = "";
    if (!rows.length) {
      if (state.from2) {
        var dest = state.q.trim() ? state.q.trim().toUpperCase().slice(0, 3) : "";
        var url = tracked("https://www.aviasales.com/search/" + liveOrigin() + ddmm(state.from2) +
                  dest + (state.to2 ? ddmm(state.to2) : "") + "1");
        grid.innerHTML =
          '<div class="chfs-nodata">' +
            '<strong>No cached fare for those dates yet</strong>' +
            '<p>We refresh fares daily and these dates are not in this run. ' +
            'You can still search them live.</p>' +
            '<a href="' + url + '" target="_blank" rel="noopener sponsored">Search these dates on Aviasales</a>' +
            tryAnyButton() +
          '</div>';
      } else if (state.trip === "weekend" || state.trip === "xmas") {
        // Weekend and Christmas inventory is heavily London weighted.
        // Telling a Leeds visitor to clear the destination is simply
        // wrong; offering all twelve airports usually solves it.
        var wk = nextWeekend();
        var wkUrl = tracked("https://www.aviasales.com/search/" + liveOrigin() + ddmm(wk[0]) + ddmm(wk[1]) + "1");
        var what = state.trip === "xmas" ? "Christmas market trips" : "weekend breaks";
        grid.innerHTML =
          '<div class="chfs-nodata">' +
            '<strong>No ' + what + ' cached from ' + fromCity + ' yet</strong>' +
            '<p>These fares are strongest from the London airports right now. ' +
            (anyMode ? 'Try widening your dates or your budget.' : 'Widen the search to every UK airport, or check this coming weekend live.') + '</p>' +
            tryAnyButton() +
            '<a href="' + wkUrl + '" target="_blank" rel="noopener sponsored">Search ' +
            fmt(wk[0]) + ' to ' + fmt(wk[1]) + ' live</a>' +
          '</div>';
      } else {
        grid.innerHTML = '<div class="chfs-empty"><strong>No flights match</strong>' +
          'Try another destination, raise the price, or widen your dates.' + tryAnyButton() + '</div>';
      }
      applyGate(grid);
      wireTryAny();
      return;
    }

    rows.slice(0, LIMIT).forEach(function (r) {
      var p = place(r.dest);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chfs-card";
      var when = fmt(r.dep) + (r.ret ? " – " + fmt(r.ret) : "");
      var trip = r.ret ? "return" : "one way";
      var stops = r.stops === 0 ? "direct" : r.stops + (r.stops === 1 ? " stop" : " stops");
      var nights = r.ret ? dayDiff(r.ret, r.dep) : 0;
      var extra = nights > 0 ? " · " + nights + (nights === 1 ? " night" : " nights") : "";
      var from = anyMode ? '<span class="chfs-from">from ' + (ORIGIN_SHORT[r.origin] || r.origin) + '</span>' : "";

      b.innerHTML =
        flagImg(p) +
        '<span style="min-width:0">' +
          '<span class="chfs-city">' + p[0] + from + '</span>' +
          '<span class="chfs-meta">' + when + " · " + trip + extra + " · " + stops + '</span>' +
          tag(r) +
        '</span>' +
        '<span>' +
          '<span class="chfs-price">£' + r.price + '</span>' +
          wasPrice(r) +
        '</span>';

      b.addEventListener("click", function () { openSheet(r); });
      grid.appendChild(b);
    });

    // Embedded on the homepage: hand over to the full page for the rest,
    // carrying the search across so nobody starts again.
    if (EMBED && rows.length > LIMIT) {
      var more = document.createElement("a");
      more.className = "chfs-more";
      more.href = "/search/" + searchQuery();
      more.innerHTML = "See all " + rows.length + " " + noun + "s on the full search <span aria-hidden=\"true\">&rarr;</span>";
      grid.appendChild(more);
    }

    applyGate(grid);
  }

  var lastFocus = null;

  function openSheet(r) {
    lastFocus = document.activeElement;
    var p = place(r.dest);
    var fromCity = originName(r.origin);

    $("chfsCity").innerHTML = flagImg(p) + " " + p[0];
    $("chfsRoute").textContent = fromCity + " → " + p[0] + (p[1] ? ", " + p[1] : "");

    var v = $("chfsVerdict");
    if (r.typical) {
      var s = Math.round(((r.typical - r.price) / r.typical) * 100);
      v.className = "chfs-verdict " + (s >= 12 ? "g" : (s <= -15 ? "w" : ""));
      v.innerHTML = "<strong>" + (s >= 25 ? "Book it" : s >= 12 ? "Good price" : s <= -15 ? "Above the usual price" : "About usual") +
        "</strong><span>£" + r.price + " against a usual £" + r.typical + ", " +
        (s >= 0 ? s + "% cheaper" : Math.abs(s) + "% dearer") + " than normal.</span>";
    } else {
      v.className = "chfs-verdict";
      v.innerHTML = "<strong>£" + r.price + "</strong><span>No price history for this route yet.</span>";
    }

    // Other dates for the same destination, so people can shift a few days.
    var alts = flatten()
      .filter(function (x) { return x.dest === r.dest && x.origin === r.origin; })
      .filter(function (x) {
        if (state.trip === "one") return !x.ret;
        if (state.trip === "ret") return !!x.ret;
        if (state.trip === "weekend") return isWeekendBreak(x);
        return true;
      })
      .sort(function (a, b) { return a.price - b.price; })
      .filter(function (x, i, arr) {          // one row per date pair
        return arr.findIndex(function (y) { return y.dep === x.dep && y.ret === x.ret; }) === i;
      })
      .slice(0, 6);
    var o = $("chfsOpts");
    o.innerHTML = "";
    alts.forEach(function (a) {
      var row = document.createElement("div");
      row.className = "chfs-opt";
      row.innerHTML =
        '<span><span class="d">' + fmt(a.dep) + (a.ret ? " – " + fmt(a.ret) : "") + '</span>' +
        '<span class="s">' + (a.ret ? "return" : "one way") + " · " + (a.stops === 0 ? "direct" : a.stops + " stop") + '</span></span>' +
        '<span><span class="p">£' + a.price + '</span>' +
        '<a class="chfs-book" target="_blank" rel="noopener sponsored" href="' + bookUrl(a.origin, a.dest, a.dep, a.ret) + '">Book</a></span>';
      o.appendChild(row);
    });

    $("chfsMain").href = bookUrl(r.origin, r.dest, r.dep, r.ret);
    applyGate(document.getElementById("chfsBg"));
    $("chfsBg").hidden = false;
    $("chfsClose").focus();
  }

  function closeSheet() { $("chfsBg").hidden = true; if (lastFocus) lastFocus.focus(); }

  $("chfsClose").addEventListener("click", closeSheet);
  $("chfsBg").addEventListener("click", function (e) { if (e.target === $("chfsBg")) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("chfsBg").hidden) closeSheet(); });

  $("chfsFrom").addEventListener("change", function () { state.from = this.value; buildMonths(); render(); });
  // Typing a destination should suggest, not punish. A misspelling used
  // to return nothing at all; now the list shows what is actually
  // reachable from the chosen airport, cheapest first, and picking one
  // sets the exact name so the filter always matches.
  var acList = $("chfsAcList");
  var acItems = [];
  var acIndex = -1;

  function reachable() {
    var seen = {};
    FARES.forEach(function (f) {
      if (!fromMatches(f) || !PLACES[f.destination] || BOGUS[f.destination]) return;
      var price = f.price || 0;
      if (f.options && f.options.length) {
        f.options.forEach(function (o) { if (o.p && (!price || o.p < price)) price = o.p; });
      }
      if (!seen[f.destination] || price < seen[f.destination]) seen[f.destination] = price;
    });
    return Object.keys(seen).map(function (code) {
      return { code: code, name: PLACES[code][0], country: PLACES[code][1], price: seen[code] };
    }).sort(function (a, b) { return a.price - b.price; });
  }

  function acClose() {
    acList.hidden = true;
    acItems = []; acIndex = -1;
    $("chfsTo").setAttribute("aria-expanded", "false");
  }

  function acOpen(q) {
    var all = reachable();
    var term = (q || "").trim().toLowerCase();
    var matches;

    if (!term) {
      // The opening list is inspiration, so no hops to other UK airports.
      matches = all.filter(function (d) { return !UK[d.code]; }).slice(0, 8);
    } else {
      matches = all.filter(function (d) {
        return d.name.toLowerCase().indexOf(term) === 0 ||
               d.country.toLowerCase().indexOf(term) === 0 ||
               d.code.toLowerCase() === term;
      });
      if (!matches.length) {
        matches = all.filter(function (d) {
          return (d.name + " " + d.country).toLowerCase().indexOf(term) > -1;
        });
      }
      // Still nothing: a typo. Fall back to anything sharing a first
      // letter rather than showing an empty box.
      if (!matches.length) {
        matches = all.filter(function (d) { return d.name.toLowerCase().charAt(0) === term.charAt(0); });
      }
      matches = matches.slice(0, 8);
    }

    // Everywhere always heads the list, so a typed city can be undone.
    matches = [{ every: true, name: "Everywhere", country: "", code: "" }].concat(matches);
    acItems = matches;

    var html = '<li class="ac-head">' + (term ? "Did you mean" : "Cheapest from here") + "</li>";
    matches.forEach(function (d, i) {
      if (d.every) {
        html += '<li role="option" data-i="' + i + '" aria-selected="false" class="ac-every">' +
                '<span class="ac-globe" aria-hidden="true">&#127757;</span><span>Everywhere</span>' +
                '<span class="ac-sub">all destinations</span></li>';
        return;
      }
      var code = SUBDIVISION[d.country] || badgeCode(PLACES[d.code][2]).toLowerCase();
      html += '<li role="option" data-i="' + i + '" aria-selected="false">' +
              (code ? '<img alt="" loading="lazy" src="https://flagcdn.com/w40/' + code + '.png">' : "") +
              "<span>" + d.name + (d.country ? ", " + d.country : "") + "</span>" +
              '<span class="ac-sub">from &pound;' + d.price + "</span></li>";
    });
    acList.innerHTML = html;
    acList.hidden = false;
    $("chfsTo").setAttribute("aria-expanded", "true");
  }

  function acPick(i) {
    var d = acItems[i];
    if (!d) return;
    if (d.every) {
      $("chfsTo").value = "Everywhere";
      state.q = "Everywhere";
      acClose();
      render();
      return;
    }
    $("chfsTo").value = d.name;
    state.q = d.name;
    acClose();
    render();
  }

  acList.addEventListener("mousedown", function (e) {
    var li = e.target.closest("li[data-i]");
    if (li) { e.preventDefault(); acPick(parseInt(li.dataset.i, 10)); }
  });

  $("chfsTo").addEventListener("focus", function () { acOpen(this.value); });
  $("chfsTo").addEventListener("blur", function () { setTimeout(acClose, 150); });
  $("chfsTo").addEventListener("keydown", function (e) {
    if (acList.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      acIndex += (e.key === "ArrowDown") ? 1 : -1;
      if (acIndex < 0) acIndex = acItems.length - 1;
      if (acIndex >= acItems.length) acIndex = 0;
      Array.prototype.forEach.call(acList.querySelectorAll("li[data-i]"), function (li, i) {
        li.setAttribute("aria-selected", i === acIndex ? "true" : "false");
      });
    } else if (e.key === "Enter" && acIndex > -1) {
      e.preventDefault();
      acPick(acIndex);
    } else if (e.key === "Escape") {
      acClose();
    }
  });

  // While someone is still typing, a misspelling should not wipe the
  // results underneath the suggestions. The grid only follows the text
  // once it names a real place, or is cleared.
  $("chfsTo").addEventListener("input", function () {
    state.q = this.value;
    acOpen(this.value);
    if (queryMatchesSomething(this.value)) render();
  });
  function isoToday() { return new Date().toISOString().slice(0, 10); }

  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function buildMonths() {
    var sel = $("chfsMonth");
    if (!sel) return;
    var seen = {};
    FARES.forEach(function (f) {
      if (!fromMatches(f)) return;
      var opts = (f.options && f.options.length) ? f.options : [{ d: f.departure }];
      opts.forEach(function (o) { if (o.d) seen[monthKey(o.d)] = 1; });
    });
    var keys = Object.keys(seen).sort();
    sel.innerHTML = "";
    var any = document.createElement("option");
    any.value = ""; any.textContent = "Any month";
    sel.appendChild(any);
    keys.forEach(function (k) {
      var p = k.split("-");
      var o = document.createElement("option");
      o.value = k;
      o.textContent = MONTH_NAMES[parseInt(p[1], 10) - 1] + " " + p[0];
      sel.appendChild(o);
    });
    sel.value = (keys.indexOf(state.month) > -1) ? state.month : "";
    state.month = sel.value;
  }

  // Skyscanner splits this into specific dates and flexible dates.
  // Same idea: two ways of answering "when", one at a time, rather than
  // both controls competing in the same bar.
  function setDateMode(mode) {
    var dates = (mode === "dates");
    $("chfsModeDates").setAttribute("aria-pressed", dates ? "true" : "false");
    $("chfsModeMonth").setAttribute("aria-pressed", dates ? "false" : "true");
    $("fDep").hidden = !dates;
    $("fRet").hidden = !dates || state.trip === "one";
    $("fMonth").hidden = dates;
    // The quick-date chips only mean something once dates are in play.
    // In month mode they were five buttons that did nothing useful and
    // pushed the first result off a phone screen. The Inspire me row
    // takes their place there.
    var quick = document.querySelector(".chfs-quick");
    var themes = document.querySelector(".chfs-themes");
    if (quick) quick.hidden = !dates;
    if (themes) themes.hidden = dates;
    if (dates) {
      state.month = ""; $("chfsMonth").value = "";
    } else {
      state.from2 = ""; state.to2 = "";
      $("chfsFrom2").value = ""; $("chfsTo2").value = "";
    }
    render();
  }
  $("chfsModeDates").addEventListener("click", function () { setDateMode("dates"); });
  $("chfsModeMonth").addEventListener("click", function () { setDateMode("month"); });
  setDateMode("month");

  // A date box should open a calendar when tapped, not wait for someone
  // to find the little icon or type the digits by hand.
  ["chfsFrom2", "chfsTo2"].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener("focus", function () {
      if (typeof el.showPicker === "function") { try { el.showPicker(); } catch (e) {} }
    });
    el.addEventListener("click", function () {
      if (typeof el.showPicker === "function") { try { el.showPicker(); } catch (e) {} }
    });
  });

  $("chfsMonth").addEventListener("change", function () {
    state.month = this.value;
    if (state.month) {                    // a whole month and exact dates
      state.from2 = ""; state.to2 = "";   // are different questions
      $("chfsFrom2").value = ""; $("chfsTo2").value = "";
    }
    render();
  });

  function clearMonth() {
    state.month = "";
    var m = $("chfsMonth");
    if (m) m.value = "";
  }

  $("chfsFrom2").addEventListener("change", function () { state.from2 = this.value; clearMonth(); render(); });
  $("chfsTo2").addEventListener("change", function () { state.to2 = this.value; clearMonth(); render(); });

  var flexBtn = $("chfsFlex");
  if (flexBtn) {
    flexBtn.addEventListener("click", function () {
      state.flex = state.flex ? 0 : 3;
      flexBtn.textContent = state.flex ? "Exact dates only" : "Allow 3 days either side";
      flexBtn.setAttribute("aria-pressed", state.flex ? "false" : "true");
      render();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".chfs-quick button:not(#chfsFlex)"), function (b) {
    b.addEventListener("click", function () {
      var days = parseInt(b.dataset.days, 10);
      if (!days) {
        state.from2 = ""; state.to2 = "";
        $("chfsFrom2").value = ""; $("chfsTo2").value = "";
      } else {
        var start = new Date();
        var end = new Date(Date.now() + days * 86400000);
        clearMonth();
        state.from2 = start.toISOString().slice(0, 10);
        state.to2 = end.toISOString().slice(0, 10);
        $("chfsFrom2").value = state.from2;
        $("chfsTo2").value = state.to2;
      }
      render();
    });
  });
  $("chfsGo").addEventListener("click", render);
  $("chfsBudget").addEventListener("input", function () {
    state.budget = parseInt(this.value, 10);
    $("chfsBudgetVal").textContent = state.budget >= 600 ? "Any price" : "Under £" + state.budget;
    render();
  });

  function setTrip(v) {
    state.trip = v;
    $("chfsAny").setAttribute("aria-pressed", v === "any" ? "true" : "false");
    $("chfsOne").setAttribute("aria-pressed", v === "one" ? "true" : "false");
    $("chfsRet").setAttribute("aria-pressed", v === "ret" ? "true" : "false");
    $("chfsWknd").setAttribute("aria-pressed", v === "weekend" ? "true" : "false");
    if ($("chfsXmas")) $("chfsXmas").setAttribute("aria-pressed", v === "xmas" ? "true" : "false");
    var retField = $("fRet");
    if (retField) {
      var monthMode = $("fMonth") && !$("fMonth").hidden;
      var hide = (v === "one") || monthMode;
      retField.hidden = hide;
      if (hide) { state.to2 = ""; $("chfsTo2").value = ""; }
    }

    var note = $("chfsWkndNote");
    if (note) {
      note.hidden = (v !== "weekend" && v !== "xmas");
      note.innerHTML = (v === "xmas")
        ? "<b>Christmas markets.</b> Long weekends between 15 November and 24 December, " +
          "to the cities that actually hold them. Prague, Berlin, Krakow, Vienna, Cologne and more, plus New York."
        : "<b>Weekend getaways.</b> Out on a Friday or Saturday, home on the Sunday. " +
          "Nothing here needs a day off work.";
    }
    render();
  }
  $("chfsAny").addEventListener("click", function () { setTrip("any"); });
  $("chfsOne").addEventListener("click", function () { setTrip("one"); });
  $("chfsRet").addEventListener("click", function () { setTrip("ret"); });
  $("chfsWknd").addEventListener("click", function () { setTrip("weekend"); });
  if ($("chfsXmas")) $("chfsXmas").addEventListener("click", function () { setTrip("xmas"); });

  // Sorting used to be one button that cycled through three states, and
  // nobody could tell it was a control at all. Three chips, one lit.
  var sortBtns = document.querySelectorAll(".chfs-sortgrp button");
  function setSort(v) {
    state.sort = v;
    Array.prototype.forEach.call(sortBtns, function (b) {
      b.setAttribute("aria-pressed", b.dataset.sort === v ? "true" : "false");
    });
    render();
  }
  Array.prototype.forEach.call(sortBtns, function (b) {
    b.addEventListener("click", function () { setSort(b.dataset.sort); });
  });

  // Inspire me. One tap narrows Everywhere to a kind of trip.
  var themeBtns = document.querySelectorAll(".chfs-themes button");
  function setTheme(v) {
    state.theme = (state.theme === v) ? "" : v;   // tap again to clear
    Array.prototype.forEach.call(themeBtns, function (b) {
      b.setAttribute("aria-pressed", b.dataset.theme === state.theme ? "true" : "false");
    });
    render();
  }
  Array.prototype.forEach.call(themeBtns, function (b) {
    b.addEventListener("click", function () { setTheme(b.dataset.theme); });
  });
  $("chfsDirect").addEventListener("click", function () {
    state.direct = !state.direct;
    this.setAttribute("aria-pressed", state.direct ? "true" : "false");
    render();
  });

  // --- Plan my trip -----------------------------------------------------
  // A sentence in, search filters out. When the Worker is deployed the
  // sentence goes to Claude; until then, and whenever the Worker cannot
  // be reached, a small parser here does a plain-English best effort so
  // the box always does something.
  var PLANNER_URL = "";   // e.g. "https://cloudhenry-planner.<account>.workers.dev"

  var MONTH_WORDS = { january:1, jan:1, february:2, feb:2, march:3, mar:3, april:4, apr:4, may:5,
                      june:6, jun:6, july:7, jul:7, august:8, aug:8, september:9, sep:9, sept:9,
                      october:10, oct:10, november:11, nov:11, december:12, dec:12 };

  function planLocal(q) {
    var t = " " + q.toLowerCase().replace(/[^a-z0-9£ ]+/g, " ") + " ";
    var p = { from: state.from, to: "", trip: "any", month: "", dep: "", ret: "", theme: "", max: 0, ideas: [], reply: "" };

    if (/ (anywhere|any airport|any uk airport|dont mind where from|wherever) /.test(t)) p.from = ANY;
    ORIGINS.forEach(function (o) {
      if (o[0] === ANY) return;
      var names = [o[1].toLowerCase(), o[1].toLowerCase().replace("london ", ""), (ORIGIN_SHORT[o[0]] || "").toLowerCase(), o[0].toLowerCase()];
      names.forEach(function (name) {
        if (name && t.indexOf(" " + name + " ") > -1) p.from = o[0];
      });
    });

    // Longest place names first so "gran canaria" beats "canaria".
    var codes = Object.keys(PLACES).sort(function (a, b) { return PLACES[b][0].length - PLACES[a][0].length; });
    for (var i = 0; i < codes.length && !p.to; i++) {
      var nm = PLACES[codes[i]][0].toLowerCase().replace(/[^a-z ]/g, "");
      if (nm.length > 3 && t.indexOf(" " + nm + " ") > -1 && !UK[codes[i]] && !BOGUS[codes[i]]) p.to = PLACES[codes[i]][0];
    }
    // A country works too. "Spain" was the first thing someone typed and
    // the parser knew nothing but cities.
    if (!p.to) {
      var ALIAS = { turkey:"Türkiye", holland:"Netherlands", america:"USA", usa:"USA", "the states":"USA",
                    czech:"Czechia", "czech republic":"Czechia", uae:"UAE", emirates:"UAE" };
      Object.keys(ALIAS).forEach(function (a) { if (!p.to && t.indexOf(" " + a + " ") > -1) p.to = ALIAS[a]; });
      var countries = {};
      Object.keys(PLACES).forEach(function (c) {
        if (!UK[c] && !BOGUS[c] && PLACES[c][1]) countries[PLACES[c][1]] = 1;
      });
      Object.keys(countries).sort(function (a, b) { return b.length - a.length; }).forEach(function (cn) {
        var k = cn.toLowerCase().replace(/[^a-z ]/g, "");
        if (!p.to && k.length > 3 && t.indexOf(" " + k + " ") > -1) p.to = cn;
      });
    }

    if (/christmas|xmas|market/.test(t)) p.trip = "xmas";
    else if (/weekend/.test(t)) p.trip = "weekend";
    else if (/one way|single/.test(t)) p.trip = "one";
    else if (/return|round trip|come back|back on|nights|week away|fortnight/.test(t)) p.trip = "ret";

    var now = new Date(), y = now.getUTCFullYear(), m0 = now.getUTCMonth() + 1;
    Object.keys(MONTH_WORDS).some(function (w) {
      if (t.indexOf(" " + w + " ") === -1) return false;
      var m = MONTH_WORDS[w], yy = (m < m0) ? y + 1 : y;
      p.month = yy + "-" + ("0" + m).slice(-2);
      return true;
    });

    var money = t.match(/£\s?(\d{2,3})|under (\d{2,3})|(\d{2,3}) quid|(\d{2,3}) pounds|budget of (\d{2,3})/);
    if (money) p.max = parseInt(money[1] || money[2] || money[3] || money[4] || money[5], 10);

    var winter = p.month ? (parseInt(p.month.slice(5), 10) >= 10 || parseInt(p.month.slice(5), 10) <= 3) : (m0 >= 10 || m0 <= 3);
    if (/winter sun/.test(t)) p.theme = "sun";
    else if (/beach|seaside|by the sea/.test(t)) p.theme = "beach";
    else if (/\bsun\b|warm|hot|sunny|sunshine/.test(t)) p.theme = winter ? "sun" : "beach";
    else if (/city|culture|museum|weekend break|bars|food/.test(t)) p.theme = "city";
    else if (/long haul|far away|asia|america|thailand|usa|new york|dubai/.test(t)) p.theme = "long";

    // Nothing recognised at all: say so, rather than quietly showing the
    // same results and looking broken.
    var understood = p.to || p.month || p.max || p.theme || p.trip !== "any" || p.from !== state.from;
    if (!understood) {
      p.error = "I did not catch a place, a month or a budget in that. Try something like \"Spain in October\", \"weekend under £50\" or \"somewhere warm from Leeds\".";
      p.from = state.from;
      return p;
    }
    p.reply = "Set the search to " + (p.to ? p.to : "everywhere") +
              " from " + originName(p.from).toLowerCase().replace("any uk airport", "any UK airport") +
              (p.month ? " in " + MONTH_NAMES[parseInt(p.month.slice(5), 10) - 1] : "") +
              (p.max ? " under £" + p.max : "") +
              (p.trip === "weekend" ? ", weekends only" : p.trip === "xmas" ? ", Christmas markets" : "") + ".";
    return p;
  }

  function applyPlan(p) {
    if (p.from && ORIGINS.some(function (o) { return o[0] === p.from; })) {
      state.from = p.from; $("chfsFrom").value = p.from;
    }
    state.q = p.to || ""; $("chfsTo").value = state.q;
    state.theme = (p.theme && THEMES[p.theme]) ? p.theme : "";
    Array.prototype.forEach.call(themeBtns, function (b) {
      b.setAttribute("aria-pressed", b.dataset.theme === state.theme ? "true" : "false");
    });
    state.budget = (p.max && p.max >= 20 && p.max < 600) ? p.max : 600;
    $("chfsBudget").value = state.budget;
    $("chfsBudgetVal").textContent = state.budget >= 600 ? "Any price" : "Under £" + state.budget;

    if (p.dep) {
      setDateMode("dates");
      state.from2 = p.dep; $("chfsFrom2").value = p.dep;
      state.to2 = p.ret || ""; $("chfsTo2").value = state.to2;
    } else {
      setDateMode("month");
    }
    buildMonths();
    if (!p.dep) {
      // Always set it, so a plan with no month clears the last one.
      var sel = $("chfsMonth");
      var has = !!p.month && Array.prototype.some.call(sel.options, function (o) { return o.value === p.month; });
      state.month = has ? p.month : ""; sel.value = state.month;
    }
    setTrip(["any", "one", "ret", "weekend", "xmas"].indexOf(p.trip) > -1 ? p.trip : "any");   // renders

    var box = $("chfsPlanReply");
    var html = "";
    if (p.error) html += '<span class="chfs-plan-err">' + p.error + "</span>";
    else if (p.reply) html += p.reply;
    if (p.ideas && p.ideas.length) {
      html += '<div class="chfs-plan-ideas">' + p.ideas.map(function (n) {
        var city = String(n).split(" (")[0];
        return '<button type="button" data-city="' + city.replace(/"/g, "") + '">' + city + "</button>";
      }).join("") + "</div>";
    }
    box.innerHTML = html;
    box.hidden = !html;
    Array.prototype.forEach.call(box.querySelectorAll("button[data-city]"), function (b) {
      b.addEventListener("click", function () {
        state.q = b.dataset.city; $("chfsTo").value = state.q;
        render();
        var head = $("chfsTitle"); if (head && head.scrollIntoView) head.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    var head = $("chfsTitle");
    if (head && head.scrollIntoView && window.innerWidth < 700) head.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function plan() {
    var q = $("chfsPlanQ").value.trim();
    if (!q) { $("chfsPlanQ").focus(); return; }
    var btn = $("chfsPlanGo");
    btn.disabled = true; btn.textContent = "Thinking";

    function done(p) { btn.disabled = false; btn.textContent = "Plan it"; applyPlan(p); }

    if (!PLANNER_URL) { done(planLocal(q)); return; }
    fetch(PLANNER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q, from: state.from })
    })
      .then(function (r) { return r.json(); })
      .then(function (p) {
        if (!p || (p.error && !p.reply)) {
          var local = planLocal(q);
          if (p && p.error) local.error = p.error;
          done(local);
        } else done(p);
      })
      .catch(function () { done(planLocal(q)); });
  }
  if ($("chfsPlanGo")) {
    $("chfsPlanGo").addEventListener("click", plan);
    $("chfsPlanQ").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); plan(); } });
    Array.prototype.forEach.call(document.querySelectorAll(".chfs-plan-eg button"), function (b) {
      b.addEventListener("click", function () { $("chfsPlanQ").value = b.textContent; plan(); });
    });
  }

  // --- load -------------------------------------------------------------
  var g = $("chfsGrid");
  g.innerHTML = "";
  for (var i = 0; i < 6; i++) {
    var s = document.createElement("div");
    s.className = "chfs-skel";
    g.appendChild(s);
  }

  mergePlaces(function () { if (SLIM) { buildMonths(); render(); } });

  fetch(dataUrl(), { cache: "default" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) {
      SLIM = j.fares || [];
      FARES = SLIM;
      if (j.generated) { GENERATED = j.generated; stampLabel(); }
      var today = isoToday();
      $("chfsFrom2").min = today;
      $("chfsTo2").min = today;

      // Restore a shared or emailed search from the address bar.
      var u = INITIAL;
      READY = true;
      if (u.from && (u.from === ANY || ORIGINS.some(function (o) { return o[0] === u.from; }))) {
        state.from = u.from; $("chfsFrom").value = u.from;
      }
      if (u.to) { state.q = u.to; $("chfsTo").value = u.to; }
      if (u.max && parseInt(u.max, 10) >= 20 && parseInt(u.max, 10) < 600) {
        state.budget = parseInt(u.max, 10);
        $("chfsBudget").value = state.budget;
        $("chfsBudgetVal").textContent = "Under £" + state.budget;
      }
      if (u.theme && THEMES[u.theme]) {
        state.theme = u.theme;
        Array.prototype.forEach.call(themeBtns, function (b) {
          b.setAttribute("aria-pressed", b.dataset.theme === u.theme ? "true" : "false");
        });
      }
      if (u.dep) {
        setDateMode("dates");
        state.from2 = u.dep; $("chfsFrom2").value = u.dep;
        if (u.ret) { state.to2 = u.ret; $("chfsTo2").value = u.ret; }
      }
      buildMonths();
      if (u.month) { state.month = u.month; $("chfsMonth").value = u.month; }
      if (u.trip && ["any","one","ret","weekend","xmas"].indexOf(u.trip) > -1) {
        setTrip(u.trip);                       // this renders
      }
      // Sent here from the homepage's "tell us what you fancy" box.
      if (u.plan && $("chfsPlanQ")) {
        $("chfsPlanQ").value = u.plan;
        plan();
      }
      render();
      checkMember().then(function (paid) {
        PAID = paid;
        if (!paid) {
          var note = document.querySelector(".chfs-note");
          if (note && !document.getElementById("chfsTease")) {
            var t = document.createElement("div");
            t.id = "chfsTease";
            t.className = "chfs-tease";
            t.innerHTML = "<strong>These fares are real, and they go fast.</strong>" +
              "<span>Browse every route for free. Members book any of them: 40 days free, then &pound;2.99 a month.</span>" +
              "<a class=\"chfs-tease-cta\" href=\"#/portal/signup\">Try 40 days free</a>";
            note.parentNode.insertBefore(t, note);
          }
        }
      });
    })
    .catch(function (err) {
      $("chfsTitle").textContent = "Fares unavailable";
      g.innerHTML = '<div class="chfs-empty"><strong>Could not load fares</strong>' +
        'Please refresh in a moment. (' + err.message + ')</div>';
    });
})();
