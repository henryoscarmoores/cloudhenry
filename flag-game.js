/* CloudHenry flag game — rebuilt small and static.
 *
 * The original lived in Ghost code injection at 15.7KB, a quarter of the
 * whole 65,535-byte budget, and opened as a popup over the hero. This
 * version sits inline on the homepage, injects its own styles, and costs
 * about 100 bytes of injection: one script tag.
 *
 * To offer a real discount, put your Ghost promo code in PROMO below.
 * Left empty, winners get a plain invitation to join instead of a code
 * that would not work.
 */
(function () {
  "use strict";

  var PROMO = "";              // e.g. "FLAGS10" — set this to hand out a code
  var ROUNDS = 3;
  var MOUNT_ON = ["/", ""];    // homepage only

  var path = location.pathname.replace(/\/+$/, "");
  if (MOUNT_ON.indexOf(path) === -1) return;
  if (document.querySelector(".chfg")) return;

  var COUNTRIES = [
    ["pt","Portugal"], ["es","Spain"], ["it","Italy"], ["gr","Greece"],
    ["hr","Croatia"], ["pl","Poland"], ["cz","Czechia"], ["hu","Hungary"],
    ["nl","Netherlands"], ["be","Belgium"], ["dk","Denmark"], ["se","Sweden"],
    ["no","Norway"], ["fi","Finland"], ["ie","Ireland"], ["at","Austria"],
    ["ch","Switzerland"], ["de","Germany"], ["fr","France"], ["tr","Türkiye"],
    ["ma","Morocco"], ["mt","Malta"], ["is","Iceland"], ["ee","Estonia"]
  ];

  var CSS = [
    '.chfg{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:440px;margin:44px auto 8px;padding:0 22px;text-align:center;color:#fff}',
    '.chfg-k{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#FFE071;text-shadow:0 1px 5px rgba(6,52,90,.5);margin:0 0 6px}',
    '.chfg-q{font-size:17px;font-weight:750;line-height:1.3;margin:0 0 4px;text-shadow:0 1px 5px rgba(6,52,90,.5)}',
    '.chfg-s{font-size:12.5px;color:rgba(255,255,255,.82);margin:0 0 14px;text-shadow:0 1px 5px rgba(6,52,90,.5);font-variant-numeric:tabular-nums}',
    '.chfg-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.chfg-btn{border:2px solid rgba(255,255,255,.55);border-radius:12px;background:rgba(255,255,255,.16);padding:7px;cursor:pointer;display:block;transition:transform .16s cubic-bezier(.22,.61,.36,1),border-color .16s,box-shadow .16s;box-shadow:0 2px 7px rgba(6,52,90,.22)}',
    '.chfg-btn img{display:block;width:100%;height:auto;border-radius:6px}',
    '.chfg-btn:hover{transform:translateY(-2px) scale(1.03);border-color:#FFE071}',
    '.chfg-btn:focus-visible{outline:none;border-color:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.45)}',
    '.chfg-btn.ok{border-color:#4ADE80;box-shadow:0 0 0 3px rgba(74,222,128,.35)}',
    '.chfg-btn.no{border-color:#FB7185;opacity:.55}',
    '.chfg-end{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.28);border-radius:16px;padding:20px 22px}',
    '.chfg-end b{display:block;font-size:19px;font-weight:800;letter-spacing:-.02em;margin-bottom:4px}',
    '.chfg-end p{margin:0 0 14px;font-size:14px;line-height:1.5;color:rgba(255,255,255,.9)}',
    '.chfg-code{display:inline-block;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:17px;font-weight:700;letter-spacing:.12em;background:#F5C242;color:#16324A;padding:8px 16px;border-radius:10px;margin-bottom:12px}',
    '.chfg-cta{display:inline-block;background:#F5C242;color:#16324A;font-weight:800;font-size:14.5px;padding:12px 24px;border-radius:999px;text-decoration:none;transition:transform .18s cubic-bezier(.22,.61,.36,1)}',
    '.chfg-cta:hover{transform:translateY(-2px)}',
    '.chfg-again{display:block;margin:10px auto 0;background:none;border:0;color:rgba(255,255,255,.8);font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer}',
    '@media (prefers-reduced-motion:reduce){.chfg *{transition:none!important}}'
  ].join("");

  var st = document.createElement("style");
  st.textContent = CSS;
  document.head.appendChild(st);

  var wrap = document.createElement("div");
  wrap.className = "chfg";

  // Sit after the "why join" tiles if they exist, else before the footer.
  var after = document.querySelector(".ch-why") || document.querySelector(".ch-sec");
  if (after && after.parentNode) after.parentNode.insertBefore(wrap, after.nextSibling);
  else document.body.appendChild(wrap);

  var round = 0, score = 0;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var k = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[k]; a[k] = t;
    }
    return a;
  }

  function ask() {
    var pool = shuffle(COUNTRIES.slice()).slice(0, 4);
    var answer = pool[Math.floor(Math.random() * pool.length)];

    wrap.innerHTML =
      '<p class="chfg-k">Guess the flag</p>' +
      '<p class="chfg-q">Which flag is ' + answer[1] + '?</p>' +
      '<p class="chfg-s">Round ' + (round + 1) + ' of ' + ROUNDS + ' &middot; ' + score + ' right</p>' +
      '<div class="chfg-grid"></div>';

    var grid = wrap.querySelector(".chfg-grid");
    pool.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chfg-btn";
      b.setAttribute("aria-label", c[1]);
      b.innerHTML = '<img alt="" loading="lazy" src="https://flagcdn.com/w160/' + c[0] + '.png" ' +
                    'srcset="https://flagcdn.com/w320/' + c[0] + '.png 2x">';
      b.addEventListener("click", function () {
        if (grid.dataset.done) return;
        grid.dataset.done = "1";
        var right = c[0] === answer[0];
        if (right) score++;
        [].forEach.call(grid.children, function (el, i) {
          el.classList.add(pool[i][0] === answer[0] ? "ok" : "no");
        });
        setTimeout(function () {
          round++;
          if (round >= ROUNDS) finish(); else ask();
        }, 850);
      });
      grid.appendChild(b);
    });
  }

  function finish() {
    var won = score === ROUNDS;
    var line = won ? "All three. You know your flags."
             : score === 0 ? "Not one. Bold."
             : score + " out of " + ROUNDS + ". Not bad.";

    wrap.innerHTML =
      '<div class="chfg-end">' +
        '<b>' + line + '</b>' +
        (won && PROMO
          ? '<p>Here is your code.</p><span class="chfg-code">' + PROMO + '</span>'
          : '<p>Now the easy bit: we find the cheap flights so you do not have to.</p>') +
        '<a class="chfg-cta" href="#/portal/signup">Join for &pound;2.99 a month</a>' +
        '<button class="chfg-again" type="button">Play again</button>' +
      '</div>';

    wrap.querySelector(".chfg-again").addEventListener("click", function () {
      round = 0; score = 0; ask();
    });
  }

  ask();
})();
