/* CloudHenry homepage offer cards.
 *
 * Two live Ghost offers, both genuine discounts off prices actually charged:
 *   annual-20        2900p -> 2000p  first year, then 29
 *   first-month-99p   299p ->   99p  first month, then 2.99
 *
 * Sits directly under the hero so the price is the first thing a visitor
 * sees, which is the whole point. The airport picker stays above it for
 * anyone who wants the guided route; members who come in through a card
 * set their airport afterwards in the member area.
 *
 * The cards remove themselves after the offers end, so a dead deadline
 * can never sit on the page if nobody archives the offers in Ghost.
 *
 * No em dashes in any copy, per Henry.
 */
(function () {
  "use strict";
  var path = location.pathname.replace(/\/+$/, "");
  var onHome = (path === "");
  var onJoin = /^\/join-[a-z-]+$/.test(path);
  if (!onHome && !onJoin) return;
  if (window.__chOffers) return;

  var ENDS = new Date("2026-11-01T23:59:59Z");
  if (new Date() > ENDS) return;

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
             was: "£29", now: "£20", save: "Save £9",
             sub: "Every fare from your airport, all year. Then £29.",
             href: "/annual-20/", cta: "Get a year for £20" }) +
      card({ kicker: "Monthly", was: "£2.99", now: "99p", save: "67% off",
             sub: "Your first month. Then £2.99, cancel any time.",
             href: "/first-month-99p/", cta: "Start for 99p" });

    var foot = document.createElement("div");
    foot.className = "ch-off-foot";
    foot.innerHTML = "Both offers end <b>1 November</b>. Cancel any time, no contract.";

    var after = anchor.nextSibling;
    anchor.parentNode.insertBefore(wrap, after);
    anchor.parentNode.insertBefore(foot, wrap.nextSibling);

    // the old price line is now said better by the cards
    if (anchor.classList.contains("ch-ap-note")) anchor.style.display = "none";

    // The free email capture only, never its parent. #ch-airportpick also
    // holds the airport select and button, and hiding the container once
    // took the whole picker off the homepage.
    // HOMEPAGE ONLY. On a join page the email box is the signup itself,
    // and hiding it would stop anyone joining at all.
    if (onHome) {
      var kill = document.querySelectorAll(".ch-hj-email, .ch-hj-btn, .ch-hj-err, .ch-hj-note");
      for (var i = 0; i < kill.length; i++) { kill[i].style.display = "none"; }
      var ecap = document.getElementById("ch-emailcap");
      if (ecap) ecap.style.display = "none";
    }

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
