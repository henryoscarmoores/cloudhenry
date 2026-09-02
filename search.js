/* CloudHenry Everywhere search.
   Loaded by the HTML card on /search/. Reads the fare file the daily
   fetch-fares task publishes, and links every result to Aviasales with
   the CloudHenry affiliate marker attached.

   Namespaced under chfs* and scoped to the .chfs container so it cannot
   disturb the rest of the site. */
(function () {
  "use strict";

  var DATA_URL = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/fares.json";
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
    var links = (root || document).querySelectorAll(".chfs-book, #chfsMain");
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
    BRU:["Brussels","Belgium","🇧🇪"],BJV:["Bodrum","Türkiye","🇹🇷"]
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

  var FARES = [], state = { from:"MAN", q:"", when:"any", trip:"any", sort:"price", direct:false, budget:600 };

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

  // Aviasales deep link. Format: ORIGIN + DDMM + DEST + [DDMM return] + pax
  function bookUrl(origin, dest, dep, ret) {
    var o = ddmm(dep);
    if (!o) return "https://www.aviasales.com/?marker=" + MARKER;
    return "https://www.aviasales.com/search/" + origin + o + dest + (ddmm(ret) || "") + "1?marker=" + MARKER;
  }

  // Flatten each route into its individual dated departures, so the list
  // shows bookable flights rather than one summary row per destination.
  function flatten() {
    var out = [];
    FARES.forEach(function (f) {
      if (f.origin !== state.from) return;
      var opts = f.options && f.options.length ? f.options : null;
      if (opts) {
        opts.forEach(function (o) {
          out.push({ dest:f.destination, price:o.p, dep:o.d, ret:o.r || "", stops:o.s || 0, typical:f.typical || null });
        });
      } else {
        out.push({ dest:f.destination, price:f.price, dep:f.departure, ret:f.ret || "", stops:f.transfers || 0, typical:f.typical || null });
      }
    });
    return out;
  }

  function build() {
    var rows = flatten();
    var q = state.q.trim().toLowerCase();

    if (q) {
      rows = rows.filter(function (r) {
        var p = place(r.dest);
        return (p[0] + " " + p[1] + " " + r.dest).toLowerCase().indexOf(q) > -1;
      });
    }
    if (state.trip === "one") rows = rows.filter(function (r) { return !r.ret; });
    if (state.trip === "ret") rows = rows.filter(function (r) { return !!r.ret; });
    if (state.direct) rows = rows.filter(function (r) { return r.stops === 0; });
    if (state.budget < 600) rows = rows.filter(function (r) { return r.price <= state.budget; });
    if (state.when !== "any") rows = rows.filter(function (r) { return monthKey(r.dep) === state.when; });

    rows.sort(function (a, b) {
      if (state.sort === "price") return a.price - b.price;
      if (state.sort === "date") return String(a.dep).localeCompare(String(b.dep));
      return place(a.dest)[0].localeCompare(place(b.dest)[0]);
    });

    // One row per destination+date so the grid does not fill with the
    // same city over and over.
    var seen = {}, unique = [];
    rows.forEach(function (r) {
      var k = r.dest + "|" + r.dep + "|" + r.ret;
      if (!seen[k]) { seen[k] = 1; unique.push(r); }
    });
    return unique;
  }

  function buildMonths() {
    var sel = $("chfsWhen");
    var months = {};
    flatten().forEach(function (r) { if (r.dep) months[monthKey(r.dep)] = 1; });
    var keys = Object.keys(months).sort();
    sel.innerHTML = "";
    var any = document.createElement("option");
    any.value = "any"; any.textContent = "Any date";
    sel.appendChild(any);
    keys.forEach(function (k) {
      var p = k.split("-");
      var o = document.createElement("option");
      o.value = k; o.textContent = MON[parseInt(p[1], 10) - 1] + " " + p[0];
      sel.appendChild(o);
    });
    sel.value = (keys.indexOf(state.when) > -1) ? state.when : "any";
    state.when = sel.value;
  }

  function tag(r) {
    if (!r.typical) return "";
    var s = Math.round(((r.typical - r.price) / r.typical) * 100);
    if (s >= 25) return '<span class="chfs-tag g">' + s + '% under usual</span>';
    if (s >= 12) return '<span class="chfs-tag b">Good price</span>';
    if (s <= -15) return '<span class="chfs-tag w">Above usual</span>';
    return "";
  }

  function render() {
    var rows = build();
    var grid = $("chfsGrid");
    var fromCity = "";
    ORIGINS.forEach(function (o) { if (o[0] === state.from) fromCity = o[1]; });

    $("chfsTitle").textContent = state.q ? "Flights from " + fromCity : "Everywhere from " + fromCity;
    $("chfsCount").textContent = rows.length ? (rows.length > 120 ? "showing 120 of " + rows.length + " flights" : rows.length + (rows.length === 1 ? " flight" : " flights")) : "";

    grid.innerHTML = "";
    if (!rows.length) {
      grid.innerHTML = '<div class="chfs-empty"><strong>No flights match</strong>Clear the destination, raise the price, or choose Any date.</div>';
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
          (r.typical ? '<span class="chfs-was">£' + r.typical + '</span>' : '') +
        '</span>';

      b.addEventListener("click", function () { openSheet(r); });
      grid.appendChild(b);
    });
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
    var alts = build().filter(function (x) { return x.dest === r.dest; }).slice(0, 6);
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
  $("chfsTo").addEventListener("input", function () { state.q = this.value; render(); });
  $("chfsWhen").addEventListener("change", function () { state.when = this.value; render(); });
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
    render();
  }
  $("chfsAny").addEventListener("click", function () { setTrip("any"); });
  $("chfsOne").addEventListener("click", function () { setTrip("one"); });
  $("chfsRet").addEventListener("click", function () { setTrip("ret"); });

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

  fetch(DATA_URL, { cache: "default" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (j) {
      FARES = j.fares || [];
      if (j.generated) {
        var d = new Date(j.generated);
        $("chfsStamp").textContent = " Last updated " + fmt(j.generated) + ", " +
          ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ".";
      }
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
