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
      a.textContent = a.id === "chfsMain" ? "Subscribe to book — £2.99/month" : "Unlock";
    });
  }


  var ORIGINS = [
    ["MAN","Manchester"], ["BHX","Birmingham"], ["LBA","Leeds Bradford"],
    ["STN","London Stansted"], ["LTN","London Luton"], ["BRS","Bristol"],
    ["NCL","Newcastle"], ["GLA","Glasgow"], ["EDI","Edinburgh"],
    ["LGW","London Gatwick"], ["LPL","Liverpool"], ["BFS","Belfast"]
  ];

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

  var FARES = [], state = { from:"MAN", q:"", from2:"", to2:"", month:"", flex:3, trip:"any", sort:"price", direct:false, budget:600 };

  ORIGINS.forEach(function (o) {
    var opt = document.createElement("option");
    opt.value = o[0]; opt.textContent = o[1] + " (" + o[0] + ")";
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
  function isWeekendBreak(r) {
    if (!r.ret) return false;
    var out = dow(r.dep), back = dow(r.ret);
    if (!((out === 5 || out === 6) && back === 0)) return false;
    // Friday to Sunday sixteen nights later is not a weekend. Only a
    // genuine short break counts: one or two nights away.
    var nights = dayDiff(r.ret, r.dep);
    return nights >= 1 && nights <= 2;
  }

  // Aviasales deep link. Format: ORIGIN + DDMM + DEST + [DDMM return] + pax
  function bookUrl(origin, dest, dep, ret) {
    var o = ddmm(dep);
    if (!o) return "https://www.aviasales.com/?marker=" + MARKER;
    return "https://www.aviasales.com/search/" + origin + o + dest + (ddmm(ret) || "") + "1?marker=" + MARKER;
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
    FARES.forEach(function (f) {
      if (f.origin !== state.from) return;
      var opts = f.options && f.options.length ? f.options : null;
      if (!PLACES[f.destination]) return;   // unnamed code, looks broken
      if (opts) {
        // A return costs more than a one-way, so they need separate
        // baselines. Comparing a return against the one-way average was
        // making every round trip look "above usual" against a cheaper
        // struck-through figure, which is simply wrong.
        var ow = [], rt = [];
        opts.forEach(function (o) { (o.r ? rt : ow).push(o.p); });
        var owAvg = mean(ow), rtAvg = mean(rt);
        opts.forEach(function (o) {
          out.push({ dest:f.destination, price:o.p, dep:o.d, ret:o.r || "", stops:o.s || 0,
                     typical: o.r ? rtAvg : owAvg });
        });
      } else {
        out.push({ dest:f.destination, price:f.price, dep:f.departure, ret:f.ret || "", stops:f.transfers || 0, typical: f.ret ? null : (f.typical || null) });
      }
    });
    return out;
  }

  function build() {
    var rows = flatten();
    var q = state.q.trim().toLowerCase();
    if (q === "everywhere" || q === "anywhere" || q === "any") q = "";

    if (q) {
      rows = rows.filter(function (r) {
        var p = place(r.dest);
        return (p[0] + " " + p[1] + " " + r.dest).toLowerCase().indexOf(q) > -1;
      });
    }
    if (state.trip === "one") rows = rows.filter(function (r) { return !r.ret; });
    if (state.trip === "ret") rows = rows.filter(function (r) { return !!r.ret; });
    if (state.trip === "weekend") rows = rows.filter(isWeekendBreak);
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
    var perDestination = !state.q.trim();
    rows.forEach(function (r) {
      var k = perDestination ? r.dest : (r.dest + "|" + r.dep + "|" + r.ret);
      if (!seen[k]) { seen[k] = 1; unique.push(r); }
    });
    return unique;
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
      return "https://www.aviasales.com/search/" + state.from + ddmm(wk[0]) + ddmm(wk[1]) + "1?marker=" + MARKER;
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
    return "https://www.aviasales.com/search/" + state.from + ddmm(state.from2) +
           destCode + back + "1?marker=" + MARKER;
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
        ? "We hold a handful of weekend fares. Check this coming weekend live, " +
          fmt(wk[0]) + " to " + fmt(wk[1]) + "."
        : "Want these exact dates checked live, including any we have not cached?") + "</span>" +
      '<a href="' + url + '" target="_blank" rel="noopener sponsored">' +
        (wkMode ? "Search this weekend live" : "Search these dates on Aviasales") + '</a>';
    head.parentNode.insertBefore(bar, head);
  }

  function render() {
    renderLiveBar();
    var rows = build();
    var grid = $("chfsGrid");
    var fromCity = "";
    ORIGINS.forEach(function (o) { if (o[0] === state.from) fromCity = o[1]; });

    $("chfsTitle").textContent = state.q ? "Flights from " + fromCity : "Everywhere from " + fromCity;
    $("chfsCount").textContent = rows.length ? (rows.length > 120 ? "showing 120 of " + rows.length + " flights" : rows.length + (rows.length === 1 ? " flight" : " flights")) : "";

    grid.innerHTML = "";
    if (!rows.length) {
      if (state.from2) {
        var dest = state.q.trim() ? state.q.trim().toUpperCase().slice(0, 3) : "";
        var url = "https://www.aviasales.com/search/" + state.from + ddmm(state.from2) +
                  dest + (state.to2 ? ddmm(state.to2) : "") + "1?marker=" + MARKER;
        grid.innerHTML =
          '<div class="chfs-nodata">' +
            '<strong>No cached fare for those dates yet</strong>' +
            '<p>We refresh fares daily and these dates are not in this run. ' +
            'You can still search them live.</p>' +
            '<a href="' + url + '" target="_blank" rel="noopener sponsored">Search these dates on Aviasales</a>' +
          '</div>';
      } else if (state.trip === "weekend") {
        // Weekend inventory is heavily London weighted: Gatwick, Stansted
        // and Luton hold 459 of 520 breaks and Leeds Bradford holds none.
        // Telling a Leeds visitor to clear the destination is simply wrong.
        var wk = nextWeekend();
        var wkUrl = "https://www.aviasales.com/search/" + state.from + ddmm(wk[0]) + ddmm(wk[1]) + "1?marker=" + MARKER;
        var fromCity = "";
        ORIGINS.forEach(function (o) { if (o[0] === state.from) fromCity = o[1]; });
        grid.innerHTML =
          '<div class="chfs-nodata">' +
            '<strong>No weekend breaks cached from ' + fromCity + ' yet</strong>' +
            '<p>Our weekend fares are strongest from the London airports right now. ' +
            'Try another airport above, or check this coming weekend live.</p>' +
            '<a href="' + wkUrl + '" target="_blank" rel="noopener sponsored">Search ' +
            fmt(wk[0]) + ' to ' + fmt(wk[1]) + ' live</a>' +
          '</div>';
        applyGate(grid);
      } else {
        grid.innerHTML = '<div class="chfs-empty"><strong>No flights match</strong>Try another airport, raise the price, or widen your dates.</div>';
      }
      applyGate(grid);
      return;
    }

    rows.slice(0, 120).forEach(function (r) {
      var p = place(r.dest);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chfs-card";
      var when = fmt(r.dep) + (r.ret ? " – " + fmt(r.ret) : "");
      var trip = r.ret ? "return" : "one way";
      var stops = r.stops === 0 ? "direct" : r.stops + (r.stops === 1 ? " stop" : " stops");

      b.innerHTML =
        flagImg(p) +
        '<span style="min-width:0">' +
          '<span class="chfs-city">' + p[0] + '</span>' +
          '<span class="chfs-meta">' + when + " · " + trip + " · " + stops + '</span>' +
          tag(r) +
        '</span>' +
        '<span>' +
          '<span class="chfs-price">£' + r.price + '</span>' +
          (r.typical && r.typical > r.price ? '<span class="chfs-was">£' + r.typical + '</span>' : '') +
        '</span>';

      b.addEventListener("click", function () { openSheet(r); });
      grid.appendChild(b);
    });

    applyGate(grid);
  }

  var lastFocus = null;

  function openSheet(r) {
    lastFocus = document.activeElement;
    var p = place(r.dest);
    var fromCity = "";
    ORIGINS.forEach(function (o) { if (o[0] === state.from) fromCity = o[1]; });

    $("chfsCity").innerHTML = flagImg(p) + " " + p[0];
    $("chfsRoute").textContent = fromCity + " → " + p[0] + (p[1] ? ", " + p[1] : "");

    var v = $("chfsVerdict");
    if (r.typical) {
      var s = Math.round(((r.typical - r.price) / r.typical) * 100);
      v.className = "chfs-verdict " + (s >= 12 ? "g" : (s <= -15 ? "w" : ""));
      v.innerHTML = "<strong>" + (s >= 25 ? "Book it" : s >= 12 ? "Good price" : s <= -15 ? "Above the usual price" : "About usual") +
        "</strong><span>£" + r.price + " against a usual £" + r.typical + " — " +
        (s >= 0 ? s + "% cheaper" : Math.abs(s) + "% dearer") + " than normal.</span>";
    } else {
      v.className = "chfs-verdict";
      v.innerHTML = "<strong>£" + r.price + "</strong><span>No price history for this route yet.</span>";
    }

    // Other dates for the same destination, so people can shift a few days.
    var alts = flatten()
      .filter(function (x) { return x.dest === r.dest; })
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
        '<a class="chfs-book" target="_blank" rel="noopener sponsored" href="' + bookUrl(state.from, a.dest, a.dep, a.ret) + '">Book</a></span>';
      o.appendChild(row);
    });

    $("chfsMain").href = bookUrl(state.from, r.dest, r.dep, r.ret);
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
      if (f.origin !== state.from || !PLACES[f.destination]) return;
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
      matches = all.slice(0, 8);
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

    acItems = matches;
    if (!matches.length) { acClose(); return; }

    var html = '<li class="ac-head">' + (term ? "Did you mean" : "Cheapest from here") + "</li>";
    matches.forEach(function (d, i) {
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

  $("chfsTo").addEventListener("input", function () { state.q = this.value; acOpen(this.value); render(); });
  function isoToday() { return new Date().toISOString().slice(0, 10); }

  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function buildMonths() {
    var sel = $("chfsMonth");
    if (!sel) return;
    var seen = {};
    FARES.forEach(function (f) {
      if (f.origin !== state.from) return;
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
    var retField = $("fRet");
    if (retField) {
      var monthMode = $("fMonth") && !$("fMonth").hidden;
      var hide = (v === "one") || monthMode;
      retField.hidden = hide;
      if (hide) { state.to2 = ""; $("chfsTo2").value = ""; }
    }

    var note = $("chfsWkndNote");
    if (note) {
      note.hidden = (v !== "weekend");
      note.innerHTML = "<b>Weekend getaways.</b> Out on a Friday or Saturday, home on the Sunday. " +
                       "Nothing here needs a day off work.";
    }
    render();
  }
  $("chfsAny").addEventListener("click", function () { setTrip("any"); });
  $("chfsOne").addEventListener("click", function () { setTrip("one"); });
  $("chfsRet").addEventListener("click", function () { setTrip("ret"); });
  $("chfsWknd").addEventListener("click", function () { setTrip("weekend"); });

  $("chfsSort").addEventListener("click", function () {
    state.sort = state.sort === "price" ? "date" : (state.sort === "date" ? "name" : "price");
    this.textContent = state.sort === "price" ? "Cheapest" : (state.sort === "date" ? "Soonest" : "A–Z");
    this.setAttribute("aria-pressed", state.sort === "name" ? "false" : "true");
    render();
  });
  $("chfsDirect").addEventListener("click", function () {
    state.direct = !state.direct;
    this.setAttribute("aria-pressed", state.direct ? "true" : "false");
    render();
  });

  // --- load -------------------------------------------------------------
  var g = $("chfsGrid");
  g.innerHTML = "";
  for (var i = 0; i < 6; i++) {
    var s = document.createElement("div");
    s.className = "chfs-skel";
    g.appendChild(s);
  }

  fetch(dataUrl(), { cache: "default" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) {
      FARES = j.fares || [];
      if (j.generated) {
        var d = new Date(j.generated);
        $("chfsStamp").textContent = " Last updated " + fmt(j.generated) + ", " +
          ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ".";
      }
      var today = isoToday();
      $("chfsFrom2").min = today;
      $("chfsTo2").min = today;
      buildMonths();
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
              "<span>Browse every route for free. Members book them for &pound;2.99 a month.</span>" +
              "<a class=\"chfs-tease-cta\" href=\"#/portal/signup\">Become a member</a>";
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
