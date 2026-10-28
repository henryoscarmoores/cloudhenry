/* CloudHenry homepage price cards.
 *
 * These are the standing prices on the tier, not a timed offer:
 *   £18 a year   the one worth selling
 *   £3.99 month  £47.88 over a year, which is what the strike-through says
 *
 * The £47.88 is arithmetic, not a price we ever charged, so it is a fair
 * comparison to strike through. Never put a "was" price here that was not
 * genuinely charged for 28 days; that is the one thing Trading Standards
 * act on.
 *
 * Sits directly under the hero so the price is the first thing a visitor
 * sees, which is the whole point. The airport picker stays above it for
 * anyone who wants the guided route; members who come in through a card
 * set their airport afterwards in the member area.
 *
 * No end date. These cards used to delete themselves on 1 Nov 2026, which
 * would have taken the pricing off the homepage mid-trip.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";
  var path = location.pathname.replace(/\/+$/, "");
  var onHome = (path === "");
  var onJoin = /^\/join-[a-z-]+$/.test(path);
  if (!onHome) return;   // join pages need join.js changing, see note below
  if (window.__chOffers) return;

  var CSS = [
    ".ch-offers{display:flex;gap:12px;max-width:640px;margin:20px auto 0;padding:0 14px;",
      "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
      "box-sizing:border-box;align-items:stretch}",
    ".ch-offers *{box-sizing:border-box}",
    "@media(max-width:600px){.ch-offers{flex-direction:column;gap:10px;margin-top:16px}}",
    ".ch-off{flex:1 1 0;position:relative;background:#fff;border-radius:16px;",
      "padding:20px 14px 16px;text-align:center;border:1px solid rgba(14,53,80,.12);",
      "box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);",
      "display:flex;flex-direction:column}",
    ".ch-off.best{border:2px solid #F5C242}",
    ".ch-off-flash{position:absolute;top:-1px;right:-1px;background:#F5C242;color:#3A2A00;",
      "font-size:9.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;",
      "padding:5px 10px;border-radius:0 15px 0 12px;line-height:1}",
    ".ch-off-k{font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;",
      "color:#7A90A5;margin-bottom:8px}",
    ".ch-off-p{line-height:1;margin-bottom:5px;white-space:nowrap}",
    ".ch-off-was{font-size:18px;font-weight:700;color:#9AA8B6;text-decoration:line-through;",
      "margin-right:8px;font-variant-numeric:tabular-nums}",
    ".ch-off-now{font-size:42px;font-weight:900;letter-spacing:-.04em;color:#0E3550;",
      "font-variant-numeric:tabular-nums}",
    ".ch-off-save{font-size:11.5px;font-weight:800;color:#1B7F53;letter-spacing:.01em}",
    ".ch-off-sub{font-size:12.5px;color:#46607A;line-height:1.45;margin:7px 0 14px;flex:1 1 auto}",
    ".ch-off-b{display:block;background:#0E6FB6;color:#fff !important;font-size:15.5px;",
      "font-weight:800;text-decoration:none;padding:13px 8px;border-radius:11px;",
      "transition:background .18s ease;margin-top:auto}",
    ".ch-off-b:hover{background:#0B5A94;color:#fff !important}",
    ".ch-off.best .ch-off-b{background:#0E3550}",
    ".ch-off.best .ch-off-b:hover{background:#09263B}",
    ".ch-off-foot{max-width:640px;margin:11px auto 0;padding:0 14px;text-align:center;",
      "font-size:12.5px;line-height:1.5;color:#46607A;",
      "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}",
    ".ch-off-foot b{color:#0E3550}"
  ].join("");

  function card(o) {
    return '<div class="ch-off' + (o.best ? ' best' : '') + '">' +
      (o.flash ? '<span class="ch-off-flash">' + o.flash + '</span>' : '') +
      '<div class="ch-off-k">' + o.kicker + '</div>' +
      '<div class="ch-off-p"><span class="ch-off-was">' + o.was + '</span>' +
      '<span class="ch-off-now">' + o.now + '</span></div>' +
      '<div class="ch-off-save">' + o.save + '</div>' +
      '<div class="ch-off-sub">' + o.sub + '</div>' +
      '<a class="ch-off-b" href="' + o.href + '">' + o.cta + '</a></div>';
  }

  function build() {
    if (window.__chOffers) return;
    var anchor = document.querySelector(".ch-ap-note") ||
                 document.querySelector(".ch-airportpick");

    // Join pages have no airport picker, the price sits above the email
    // capture instead. Anchor to that block so the discounted price is
    // what someone reads before they type an address.
    if (!anchor && onJoin) {
      var em = document.querySelector('input[type="email"]');
      while (em && em.parentNode && em.getBoundingClientRect().width < 220) em = em.parentNode;
      if (em && em.parentNode) anchor = em;
    }

    if (!anchor || !anchor.parentNode) return;
    window.__chOffers = true;

    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    var wrap = document.createElement("div");
    wrap.className = "ch-offers";
    wrap.innerHTML =
      card({ best: true, flash: "Best value", kicker: "Full year",
             was: "£47.88", now: "£18", save: "Save £29.88",
             sub: "Every fare from your airport, every week, all year.",
             href: "#/portal/signup", cta: "Get a year for £18" }) +
      card({ kicker: "Monthly", was: "", now: "£3.99", save: "",
             sub: "Every fare from your airport, every week.",
             href: "#/portal/signup", cta: "Start for £3.99" });

    var foot = document.createElement("div");
    foot.className = "ch-off-foot";
    foot.innerHTML = "Paying monthly comes to <b>£47.88</b> over a year. The same thing up front is <b>£18</b>, which is £1.50 a month. One cheap flight covers it many times over. Cancel any time, no contract.";

    var after = anchor.nextSibling;
    anchor.parentNode.insertBefore(wrap, after);
    anchor.parentNode.insertBefore(foot, wrap.nextSibling);

    // the old price line is now said better by the cards
    if (anchor.classList.contains("ch-ap-note")) anchor.style.display = "none";

    // Nothing is hidden. The airport and email step stays, it is what
    // attaches the airport label, and Henry wants it kept. The cards
    // simply sit above it so the paid price is read first.

    // The why-join heading still quoted the old price, directly under cards
    // saying something different. One page, one number.
    var hs = document.querySelectorAll("h2");
    for (var j = 0; j < hs.length; j++) {
      if (/One good fare pays for the year/i.test(hs[j].textContent)) {
        hs[j].textContent = "\u00a320 for the year. One good fare covers it many times over.";
        break;
      }
    }
  }

  var n = 0, t = setInterval(function () {
    build();
    if (++n > 60 || window.__chOffers) clearInterval(t);
  }, 200);
  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
