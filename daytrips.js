/* Extreme Day Trips (EDT)
 *
 * Out and back from the same airport on the same day.
 *
 * Three decisions do the work here.
 *
 * One: the card leads with hours on the ground, not price. A £31 flight
 * to Milan means nothing until you know it buys you ten hours in Milan.
 *
 * Two: one card per route, not per date. The raw feed holds eleven
 * Newcastle to Dublins and three Marrakechs, so sorting the lot by hours
 * puts Dublin at the top five times and hides Marrakech below the fold.
 * Collapsing to the best day per route turns 96 rows into 50 cards and
 * takes the page from six cities to twenty-seven.
 *
 * Three: fifty cards is still a wall. Nobody flies from twelve airports,
 * so the airport is asked first and answered for them where possible —
 * the join pages already store their choice in ch-airport. Picking one
 * takes fifty cards down to between four and twenty, which is a page you
 * can read rather than scroll. Everything after that is refinement, and
 * the counts on every chip are live, so no filter you can press returns
 * an empty grid.
 *
 * Four: nothing is text on raw sky. The theme paints a fixed gradient
 * behind everything, running deep blue at the top to near-white at the
 * bottom, so a scrolling element passes through every stop of it and no
 * single text colour stays legible across all of them — the old lede
 * measured 1.5:1. An ink plate carries the sentence and the feed's four
 * figures, a white console carries every control and the live result
 * line, white cards carry the trips, and the sky shows in the gutters.
 * The plate and the console are one object: the plate is square on the
 * bottom, the console square on the top and sticky, so the seam is exact
 * at rest and the console docks flush to the viewport edge. They must
 * stay siblings — a wrapper around just those two would become the
 * sticky containing block and unstick it.
 *
 * Reads daytrips.json, built by build-daytrips.ps1.
 */
(function () {
  "use strict";

  var DATA = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/daytrips.json";
  var MOUNT = "chEdt";
  var PAGE = 12; // Two or three rows. Enough to judge, not enough to drown.

  var AIRPORTS = {
    MAN: "Manchester", BHX: "Birmingham", LBA: "Leeds Bradford", STN: "London Stansted",
    LTN: "London Luton", BRS: "Bristol", NCL: "Newcastle", GLA: "Glasgow",
    EDI: "Edinburgh", LGW: "London Gatwick", LPL: "Liverpool", BFS: "Belfast",
    BOH: "Bournemouth", CWL: "Cardiff", EMA: "East Midlands", DUB: "Dublin",
    PIK: "Glasgow Prestwick", ORK: "Cork", SNN: "Shannon", NOC: "Knock"
  };

  // The pills are named by city, not by IATA code, because that is how
  // this audience thinks about airports — and in the same short forms
  // live-fares.js already uses for the homepage teaser. The full name is
  // still what the card says in "from London Stansted", where there is
  // room and no group label to lean on.
  var SHORT = {
    MAN: "Manchester", BHX: "Birmingham", LBA: "Leeds", STN: "Stansted",
    LTN: "Luton", BRS: "Bristol", NCL: "Newcastle", GLA: "Glasgow",
    EDI: "Edinburgh", LGW: "Gatwick", LPL: "Liverpool", BFS: "Belfast",
    BOH: "Bournemouth", CWL: "Cardiff", EMA: "East Midlands", DUB: "Dublin",
    PIK: "Prestwick", ORK: "Cork", SNN: "Shannon", NOC: "Knock"
  };

  var AIRLINES = {
    FR: "Ryanair", U2: "easyJet", RK: "Ryanair UK", LS: "Jet2",
    BA: "British Airways", EI: "Aer Lingus", W6: "Wizz Air", VY: "Vueling",
    TK: "Turkish Airlines", TP: "TAP", SK: "SAS", LH: "Lufthansa",
    W9: "Wizz Air UK", PC: "Pegasus", DE: "Condor"
  };

  // Three enclosed tracks have to fit the 686px the console's own padding
  // and borders leave, so the two "Any" chips and "Longest day" are
  // shortened. aria is set only on the chips that carry no count, because
  // aria-label replaces the whole accessible name and the count is
  // information: "8+ hours" and "Under £50" keep theirs and say enough
  // on their own.
  var HOURS = [
    { v: 0,  label: "Any", aria: "Any length" },
    { v: 8,  label: "8+ hours" },
    { v: 10, label: "10+ hours" }
  ];
  var PRICES = [
    { v: 0,   label: "Any", aria: "Any price" },
    { v: 50,  label: "Under &pound;50" },
    { v: 100, label: "Under &pound;100" }
  ];
  var SORTS = [
    { v: "ground", label: "Longest",  aria: "Longest day first" },
    { v: "price",  label: "Cheapest", aria: "Cheapest first" }
  ];

  var CSS = `
/* Extreme Day Trips.

   The page paints a fixed blue sky behind everything. That gradient is
   mapped to the viewport, so a scrolling element passes through every
   stop of it, from deep blue at the top to near-white at the bottom.
   There is no single text colour that stays legible across all of it, so
   the rule here is absolute: nothing is text on raw sky. An ink plate
   carries the sentence and the feed's four figures. A white console
   carries every control and the live result line. White cards carry the
   trips. The sky shows in the gutters, which is the composition.

   Palette is the house palette and nothing else: ink #0E3550, deeper
   #09263B, blue #0E6FB6 / #0B5A94, body #46607A, faint #7A90A5 and
   #9AA8B6, pale #F4FAFE, on-dark #E8F3FB, borders rgba(14,53,80,.12).
   No gradient and no inset shadow appears anywhere, because neither
   ch-offers.js nor live-fares.js contains one. No yellow either: on
   CloudHenry #F5C242 means buy this, and there is nothing to buy on this
   page, so blue is left with exactly three jobs - the chosen airport,
   the ground-time gauge and the focus ring.

   One micro-label token, 10px / 900 / .15em / uppercase, does every
   micro-label in the component. Motion is .18s ease and one 1px lift,
   which is the house register. Nothing animates on entry, because draw()
   rebuilds the grid on every chip press. */

.ch-edt{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0E3550;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;}
.ch-edt,.ch-edt *,.ch-edt *::before,.ch-edt *::after{box-sizing:border-box;}

/* ---- the briefing plate -------------------------------------------------
   The lede was #5A7488 grey sitting directly on the sky, which is close
   to invisible. It gets its own surface instead, and that surface is the
   top half of one object: rounded on top, SQUARE on the bottom, where the
   console butts into it. Flat ink, no gradient. The four figures are the
   whole feed, which is what the sentence above them describes; the
   current filtered view is reported by the status rail inside the
   console, so the two never contradict each other. */
/* position:sticky needs a scroll container that actually scrolls. The
   theme sets body{overflow:hidden auto}, and because html's overflow is
   not visible that never propagates to the viewport — body becomes its
   own scroll container, html does the scrolling, and body's scrollport
   therefore never moves, so the console silently never docked. It
   measured -355px at a 500px scroll. overflow-x:clip gives the same
   horizontal-overflow protection for the theme's clouds WITHOUT creating
   a scroll container, which is the whole reason clip exists. Scoped to a
   class this script sets on body, so it touches no other page; where
   clip is unsupported the declaration drops and the bar simply scrolls
   away as it does today. */
body.ch-edt-host{overflow-x:clip;overflow-y:visible;}

.ch-edt-plate{margin:0;padding:18px 18px 16px;background:#0E3550;border-radius:16px 16px 0 0;box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);}
.ch-edt-lede{margin:0;max-width:44em;font-size:14px;line-height:1.55;font-weight:500;color:#E8F3FB;}
/* These four figures are the whole feed, not the filtered view, because
   they are the proposition: shrinking them to "5 cities, 1 airport" the
   moment a reader picks their own airport argues against the page. But
   unlabelled they read as describing the grid, and filtered to
   Manchester the plate said CHEAPEST £30 over five cards whose cheapest
   was £52. The scope line is what makes both true at once — the plate
   is the feed, the rail inside the console is the view. */
.ch-edt-scope{margin:15px 0 0;padding:14px 0 0;border-top:1px solid rgba(255,255,255,.14);font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;line-height:1;color:#9AA8B6;}
.ch-edt-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:11px 0 0;}
.ch-edt-stats>div{min-width:0;padding:0 14px;border-left:1px solid rgba(255,255,255,.12);}
.ch-edt-stats>div:first-child{padding-left:0;border-left:0;}
.ch-edt-stats dt{margin:0 0 6px;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;line-height:1.2;color:#9AA8B6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ch-edt-stats dd{margin:0;font-size:19px;font-weight:900;letter-spacing:-.04em;line-height:1;color:#fff;}
.ch-edt-stats dd small{margin-left:3px;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#9AA8B6;}

/* ---- the control console -----------------------------------------------
   Sticky at top:0, square on top so the seam with the plate is exact at
   rest and the panel is flush with the viewport edge when docked. The
   rounded bottom is the only edge that ever floats over the grid. Solid
   white, never translucent: cards ghosting through the controls is the
   one thing that would make this cheap. */
.ch-edt-filters{position:sticky;top:0;z-index:20;margin:0 0 15px;padding:14px 16px 0;background:#fff;border:1px solid rgba(14,53,80,.12);border-top:0;border-radius:0 0 16px 16px;box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);}

/* A label with a hairline running out to the margin: the rule is the
   structure, so the label needs no box of its own. */
.ch-edt-lab{display:flex;align-items:center;gap:10px;margin:0 0 9px;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;line-height:1.2;color:#46607A;}
.ch-edt-lab::after{content:'';flex:1 1 auto;height:1px;background:rgba(14,53,80,.10);}

/* ---- the airport pills --------------------------------------------------
   Thirteen content-sized pills, which pack to exactly two rows at 720px
   with 33px of slack on the tighter row, and which can never overflow
   their container the way a fixed grid cell can: a longer airport name
   just makes a wider pill and the row reflows. Named by city, not by IATA
   code, because live-fares.js is right that this audience thinks in city
   names - and in its own short forms, which is what the homepage teaser
   already shows. */
.ch-edt-from{display:flex;flex-wrap:wrap;gap:5px;margin:0;}
.ch-edt-chip{margin:0;padding:9px 11px;font:inherit;font-size:12px;font-weight:700;line-height:1;color:#0E3550;background:#fff;border:1px solid rgba(14,53,80,.12);border-radius:999px;box-shadow:0 1px 1px rgba(14,53,80,.05);cursor:pointer;white-space:nowrap;-webkit-appearance:none;appearance:none;font-variant-numeric:tabular-nums;transition:background-color .18s ease,border-color .18s ease,color .18s ease,box-shadow .18s ease;}
.ch-edt-chip em{margin-left:4px;font-style:normal;font-size:10px;font-weight:800;color:#46607A;}
.ch-edt-chip:hover:not(:disabled){background:#F4FAFE;border-color:rgba(14,111,182,.45);}
.ch-edt-chip[aria-pressed='true']{color:#fff;background:#0E6FB6;border-color:#0B5A94;box-shadow:0 1px 2px rgba(11,90,148,.35);}
.ch-edt-chip[aria-pressed='true'] em{color:rgba(255,255,255,.88);}
.ch-edt-chip[aria-pressed='true']:hover{background:#0B5A94;border-color:#0B5A94;}
/* Unavailable is a material, not a translucency. The pill loses its white
   surface, its border and its lift and drops into the panel, so a zero
   reads as something you cannot press while the 0 itself stays readable. */
.ch-edt-chip:disabled{color:#7A90A5;background:rgba(14,53,80,.05);border-color:transparent;box-shadow:none;cursor:not-allowed;}
.ch-edt-chip:disabled em{color:#7A90A5;}

/* ---- the refine row: three segmented controls ---------------------------
   Hours, fare and order are each a choice of one, which three loose pills
   in a row actively hid. One enclosed track per group, 1px dividers, one
   white thumb. Measured, not estimated: 222.8 + 235.7 + 139.6 = 598px of
   track plus two 12px gaps = 622px against the 686px that this console's
   own 16px padding and 1px borders leave. flex-wrap is the contingency,
   and it wraps whole labelled tracks, never a stray chip. */
.ch-edt-refine{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin:13px 0 0;padding:13px 0 0;border-top:1px solid rgba(14,53,80,.10);}
.ch-edt-seg{display:inline-flex;align-items:stretch;padding:2px;background:rgba(14,53,80,.06);border:1px solid rgba(14,53,80,.10);border-radius:11px;}
.ch-edt-seg .ch-edt-chip{flex:0 1 auto;display:inline-flex;align-items:baseline;gap:4px;padding:7px 9px;font-size:11.5px;font-weight:700;color:#46607A;background:transparent;border:0;border-radius:9px;box-shadow:none;}
.ch-edt-seg .ch-edt-chip em{margin:0;font-size:10px;font-weight:800;color:#46607A;}
/* A real border, not an inset shadow, so the divider costs layout width
   once and toggling it cannot shift a chip by a pixel. */
.ch-edt-seg .ch-edt-chip+.ch-edt-chip{border-left:1px solid rgba(14,53,80,.14);}
.ch-edt-seg .ch-edt-chip[aria-pressed='true'],.ch-edt-seg .ch-edt-chip[aria-pressed='true']+.ch-edt-chip{border-left-color:transparent;}
.ch-edt-seg .ch-edt-chip:hover:not(:disabled):not([aria-pressed='true']){color:#0E3550;background:rgba(255,255,255,.70);}
.ch-edt-seg .ch-edt-chip[aria-pressed='true']{color:#0E3550;background:#fff;box-shadow:0 1px 2px rgba(14,53,80,.10),0 2px 6px rgba(14,53,80,.12);}
.ch-edt-seg .ch-edt-chip[aria-pressed='true'] em{color:#0E6FB6;}
.ch-edt-seg .ch-edt-chip:disabled{color:#7A90A5;background:transparent;box-shadow:none;cursor:not-allowed;}
.ch-edt-seg .ch-edt-chip:disabled em{color:#7A90A5;}

/* ---- focus: designed, and legible on every surface it can land on ----- */
.ch-edt-chip:focus-visible,.ch-edt-clear:focus-visible{outline:none;position:relative;z-index:2;box-shadow:0 0 0 2px #fff,0 0 0 4px #0E6FB6;}
/* A blue ring on blue sky is nearly invisible, so the one control that
   sits on the sky gets a white ring hard against its own dark fill. */
.ch-edt-rest:focus-visible{outline:none;box-shadow:0 0 0 3px #fff,0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);}

/* ---- the status rail ---------------------------------------------------
   The count was grey text on the sky. It becomes the console's bottom
   bar: it needed a surface anyway, it is the one line worth keeping on
   screen while you scroll, and it finishes the object. Radius 15px inside
   a 16px shell with a 1px border, so the curves are concentric. */
.ch-edt-count{display:flex;align-items:center;flex-wrap:wrap;gap:8px 0;margin:13px -16px 0;padding:9px 16px 10px;background:rgba(14,53,80,.03);border-top:1px solid rgba(14,53,80,.10);border-radius:0 0 15px 15px;font-size:12.5px;font-weight:700;line-height:1.3;color:#46607A;}
/* Load bearing: .ch-edt-count is a flex row, so without this wrapper
   every run of bare text becomes its own flex item and the sentence's own
   word spacing breaks. */
.ch-edt-countline{flex:1 1 auto;min-width:0;}
.ch-edt-count b{color:#0E3550;font-weight:900;}
.ch-edt-clear{flex:0 0 auto;margin-left:12px;padding:7px 12px;font:inherit;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#0E6FB6;background:#fff;border:1px solid rgba(14,53,80,.12);border-radius:999px;box-shadow:0 1px 1px rgba(14,53,80,.05);cursor:pointer;text-decoration:none;transition:background-color .18s ease,border-color .18s ease,color .18s ease;}
.ch-edt-clear:hover{color:#0B5A94;background:#F4FAFE;border-color:rgba(14,111,182,.45);}

/* ---- grid --------------------------------------------------------------
   208px holds three columns of 232px in a 720px column and will never try
   a fourth. scroll-margin-top clears the console, which measures about
   213px with the rail on it. */
.ch-edt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(208px,1fr));gap:12px;scroll-margin-top:226px;}
/* The no-results panel is written into the grid, so without this it
   renders as one 232px column with the rest of the row empty. */
.ch-edt-grid .ch-edt-empty{grid-column:1/-1;}

.ch-edt-card{display:flex;flex-direction:column;padding:15px 13px 12px;background:#fff;border:1px solid rgba(14,53,80,.12);border-radius:16px;box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;}
.ch-edt-card:hover{transform:translateY(-1px);border-color:rgba(14,111,182,.30);box-shadow:0 3px 6px rgba(14,53,80,.09),0 18px 36px rgba(14,53,80,.18);}

/* Hours is the headline, and it is ink, not blue: ch-offers.js puts its
   42px numeral in ink and never in brand blue. */
.ch-edt-h{display:flex;align-items:baseline;gap:7px;margin:0;}
.ch-edt-h b{font-size:36px;font-weight:900;line-height:.92;letter-spacing:-.04em;color:#0E3550;}
.ch-edt-h span{font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#46607A;}

/* This trip's ground time against the longest in the current result set,
   so a column of cards reads as a chart before a number is read. It sits
   inside the card's padding, so the 16px corner arc can never clip it
   into a diagonal wedge. */
.ch-edt-gauge{display:block;height:3px;margin:10px 0 11px;background:rgba(14,53,80,.09);border-radius:2px;overflow:hidden;}
.ch-edt-gauge i{display:block;height:100%;background:#0E6FB6;border-radius:2px;}

/* font-family:inherit defeats the Ghost theme's heading font on the h3. */
.ch-edt-city{margin:0;font-family:inherit;font-size:17.5px;font-weight:800;line-height:1.15;letter-spacing:-.025em;color:#0E3550;}
.ch-edt-sub{margin:4px 0 0;font-size:11.5px;font-weight:600;line-height:1.35;color:#46607A;}

/* The times are a readout, not a bubble: full bleed across the card,
   hairline above and below, two legs either side of a 1px rule. OUT and
   RETURN are load bearing - they are what tells you which flight is
   which - so they are set in the body colour at 6.14:1, not in a faint
   grey at 2.4:1. */
.ch-edt-run{display:flex;align-items:stretch;margin:11px -13px 0;padding:9px 13px;background:#F4FAFE;border-top:1px solid rgba(14,53,80,.10);border-bottom:1px solid rgba(14,53,80,.10);font-size:15px;font-weight:900;letter-spacing:-.02em;line-height:1.1;color:#0E3550;}
.ch-edt-leg{flex:1 1 0;min-width:0;white-space:nowrap;}
.ch-edt-run .ch-edt-leg:first-child{padding-right:11px;}
.ch-edt-run .ch-edt-leg:last-child{padding-left:11px;}
.ch-edt-run i{display:block;margin-top:5px;font-style:normal;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;line-height:1;color:#46607A;}
.ch-edt-arrow{flex:0 0 1px;width:1px;align-self:stretch;background:rgba(14,53,80,.14);font-size:0;line-height:0;}

.ch-edt-foot{margin-top:auto;display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding-top:11px;}
.ch-edt-date{font-size:12.5px;font-weight:700;color:#46607A;white-space:nowrap;}
.ch-edt-price{font-size:20px;font-weight:900;letter-spacing:-.04em;line-height:1;color:#0E3550;white-space:nowrap;text-align:right;}
.ch-edt-price small{display:block;margin-top:5px;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#46607A;}
/* The airline and the cheaper dates: this line quotes prices, so it is
   body colour, not a micro-label grey. */
.ch-edt-more{margin:9px 0 0;font-size:11px;font-weight:600;line-height:1.4;color:#46607A;}
.ch-edt-more:empty{display:none;}

/* ---- show the rest ----------------------------------------------------
   An ink slab, so it never competes with the fares, and it darkens on
   hover the way ch-offers.js does rather than shifting hue. */
.ch-edt-rest{display:block;width:100%;margin:16px 0 0;padding:14px 16px;font:inherit;font-size:13.5px;font-weight:800;color:#fff;background:#0E3550;border:0;border-radius:11px;box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);cursor:pointer;transition:background-color .18s ease;}
.ch-edt-rest:hover{background:#09263B;}
/* display:block outranks the browser's own [hidden] rule, so hiding the
   button left an empty bar under the grid. */
.ch-edt-rest[hidden]{display:none;}

/* ---- loading, feed failure, no feed, no matches -----------------------
   Three of these four render straight into the mount, before .ch-edt
   exists, so this block carries its own font, box model and numerals or
   the first thing anyone sees is the theme's body text on raw sky. */
.ch-edt-empty{box-sizing:border-box;padding:30px 22px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums;text-align:center;font-size:13.5px;font-weight:600;line-height:1.55;color:#46607A;background:#fff;border:1px solid rgba(14,53,80,.12);border-radius:16px;box-shadow:0 2px 4px rgba(14,53,80,.07),0 12px 28px rgba(14,53,80,.14);}
.ch-edt-empty b{display:block;margin:0 0 9px;font-size:10px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;color:#46607A;}

@media(prefers-reduced-motion:reduce){
  .ch-edt-card,.ch-edt-chip,.ch-edt-clear,.ch-edt-rest{transition:none;}
  .ch-edt-card:hover{transform:none;}
}

/* ---- 560px and down ----------------------------------------------------
   Thirteen pills wrap to five rows at phone width and push the trips off
   the screen, and three segmented tracks stack to three rows and turn the
   docked console into a third of the display. Both become one swipeable
   strip instead - the same gesture, taught once - which holds the console
   to about 171px. No scroll-snap: draw() restores scrollLeft by hand and
   proximity snap fights it. The strips fade out at their right edge
   rather than slicing a pill in half, and the trailing margin on the last
   item sits under the fade, so at the end of the scroll there is nothing
   left to fade and the last item is crisp. */
@media(max-width:560px){
  .ch-edt-plate{padding:15px 14px 14px;border-radius:14px 14px 0 0;}
  .ch-edt-lede{font-size:13.5px;}
  .ch-edt-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 0;margin-top:10px;}
  .ch-edt-stats>div{padding:0 12px;}
  .ch-edt-stats>div:nth-child(odd){padding-left:0;border-left:0;}
  .ch-edt-stats dd{font-size:17px;}

  .ch-edt-filters{padding:11px 12px 0;border-radius:0 0 14px 14px;}
  .ch-edt-lab{margin-bottom:8px;}

  .ch-edt-from{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:3px;}
  /* The hairline divider is a desktop nicety; dropped here so the fade
     has nothing structural to cut through. The pills and the tracks are
     two different materials, which separates them on their own. */
  .ch-edt-refine{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;gap:8px;margin-top:11px;padding:0 0 3px;border-top:0;}
  .ch-edt-from,.ch-edt-refine{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 24px),transparent);}
  .ch-edt-from::-webkit-scrollbar,.ch-edt-refine::-webkit-scrollbar{display:none;}
  .ch-edt-from>.ch-edt-chip:last-child,.ch-edt-refine>.ch-edt-seg:last-child{margin-right:24px;}
  .ch-edt-seg{flex:0 0 auto;}

  .ch-edt-count{margin:0 -12px;padding:9px 12px 10px;border-radius:0 0 13px 13px;font-size:12px;}
  .ch-edt-clear{margin-left:10px;}

  .ch-edt-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;scroll-margin-top:184px;}
  .ch-edt-card{padding:14px 11px 11px;}
  /* HOURS THERE at the house 10px floor needs 88px and a 162px card has
     138px of content beside a 30px numeral, so the label takes its own
     line rather than being set below the floor to fit. */
  .ch-edt-h{flex-wrap:wrap;}
  .ch-edt-h b{font-size:30px;}
  .ch-edt-h span{flex:0 0 100%;margin-top:5px;}
  .ch-edt-gauge{margin:9px 0 10px;}
  .ch-edt-city{font-size:16px;}
  .ch-edt-sub{font-size:11px;}
  /* Two legs will not sit side by side in 138px, so they get a line each
     and the label runs in beside the time instead of under it, which
     keeps the readout two lines rather than four. The 1px rule turns on
     its side rather than being hidden. */
  .ch-edt-run{flex-direction:column;align-items:stretch;margin:10px -11px 0;padding:8px 11px;font-size:14px;}
  .ch-edt-run .ch-edt-leg:first-child,.ch-edt-run .ch-edt-leg:last-child{padding:0;}
  .ch-edt-run i{display:inline;margin:0 0 0 6px;}
  .ch-edt-arrow{flex:0 0 1px;width:auto;height:1px;align-self:auto;margin:7px 0;}
  /* Sun 8 Nov beside Â£86 BOTH WAYS needs 160px and has 138, so they get a
     line each and both ways goes inline under the figure. */
  .ch-edt-foot{flex-direction:column;align-items:flex-start;gap:3px;padding-top:9px;}
  .ch-edt-price{font-size:18px;text-align:left;}
  .ch-edt-price small{display:inline;margin:0 0 0 6px;}
  .ch-edt-more{margin-top:8px;font-size:10.5px;}
  .ch-edt-rest{padding:13px 14px;font-size:13px;}
  .ch-edt-empty{padding:26px 16px;font-size:13px;}
}
`;

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

  // One card per city, keeping its best day. The feed holds fifteen
  // Dublins across six airports, and collapsing only by route still put
  // Dublin in three of the first six cards while the page claimed
  // twenty-seven cities. The other days and the other airports are worth
  // knowing, so they go on the card as a line of text rather than as
  // fourteen more cards.
  function collapse(trips, sort) {
    var byCity = {};
    trips.forEach(function (t) {
      var k = t.destination;
      if (!byCity[k]) { byCity[k] = { best: t, n: 0, min: t.price, origins: {}, rows: [] }; }
      var r = byCity[k];
      r.n++;
      r.origins[t.origin] = true;
      r.rows.push(t);
      if (t.price < r.min) r.min = t.price;
      var better = sort === "price"
        ? (t.price < r.best.price || (t.price === r.best.price && t.ground > r.best.ground))
        : (t.ground > r.best.ground || (t.ground === r.best.ground && t.price < r.best.price));
      if (better) r.best = t;
    });
    return Object.keys(byCity).map(function (k) { return byCity[k]; })
      .sort(function (a, b) {
        if (sort === "price") {
          if (a.best.price !== b.best.price) return a.best.price - b.best.price;
          return b.best.ground - a.best.ground;
        }
        if (b.best.ground !== a.best.ground) return b.best.ground - a.best.ground;
        return a.best.price - b.best.price;
      });
  }

  function card(r, showOrigin, top) {
    var t = r.best;
    var from = AIRPORTS[t.origin] || t.origin;
    var air = AIRLINES[t.airline] || t.airline || "";
    var hrs = Math.floor(t.ground);
    var sub = t.country ? esc(t.country) : "";
    if (showOrigin) sub += (sub ? " &middot; " : "") + "from " + esc(from);

    // The card shows the longest day, which is rarely the cheapest one:
    // Dublin leads at fifteen hours for £86 while another date does it
    // for £32. Saying so stops the headline price reading as the price
    // of the city. Naming the other airports was tried and dropped —
    // they only ever appear before the reader has said where they fly
    // from, which is exactly when the names mean nothing to them.
    var more = r.n - 1;
    var bits = [];
    if (air) bits.push(esc(air));
    if (more > 0) bits.push(more + " more date" + (more === 1 ? "" : "s") + " from &pound;" + r.min);
    // The gauge under the numeral is this trip's ground time against the
    // longest in the current result set, not against a notional sixteen
    // hour day: the default sort is longest first, so a fixed ceiling
    // would have pinned the first twelve bars between 71 and 98 per cent
    // and told you nothing. It sits inside the card's padding, so the
    // 16px corner arc cannot clip it into a wedge.
    var pct = Math.max(6, Math.round((t.ground / (top || t.ground)) * 100));
    return '<article class="ch-edt-card">' +
      '<p class="ch-edt-h"><b>' + hrs + "</b><span>hours there</span></p>" +
      '<span class="ch-edt-gauge" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
      '<h3 class="ch-edt-city">' + esc(t.city || t.destination) + "</h3>" +
      '<p class="ch-edt-sub">' + (sub || "&nbsp;") + "</p>" +
      '<p class="ch-edt-run">' +
        '<span class="ch-edt-leg">' + esc(t.out) + " <i>out</i></span>" +
        '<span class="ch-edt-arrow" aria-hidden="true"></span>' +
        '<span class="ch-edt-leg">' + esc(t.back) + " <i>return</i></span>" +
      "</p>" +
      '<div class="ch-edt-foot">' +
        '<span class="ch-edt-date">' + esc(pretty(t.date)) + "</span>" +
        '<span class="ch-edt-price">&pound;' + esc(t.price) + " <small>both ways</small></span>" +
      "</div>" +
      '<p class="ch-edt-more">' + bits.join(" &middot; ") + "</p>" +
      "</article>";
  }

  // Hours, fare and order are each a choice of one, which three loose
  // pills in a row actively hid. One enclosed track per group, and the
  // group carries the name, which is what lets the chips inside it be as
  // short as "Any" without two buttons ending up identically labelled.
  function group(lab, html) {
    return '<span class="ch-edt-seg" role="group" aria-label="' + lab + '">' + html + "</span>";
  }

  function chip(key, val, label, count, on, aria) {
    return '<button type="button" class="ch-edt-chip" data-k="' + key + '" data-v="' + esc(val) + '"' +
      (aria ? ' aria-label="' + esc(aria) + '"' : "") +
      ' aria-pressed="' + (on ? "true" : "false") + '"' + (count === 0 && !on ? " disabled" : "") + ">" +
      label + (count == null ? "" : "<em>" + count + "</em>") + "</button>";
  }

  function boot(root, data) {
    var trips = (data && data.trips) || [];
    if (!trips.length) {
      root.innerHTML = '<div class="ch-edt-empty"><b>Feed empty</b>No day trips in the feed right now. It refreshes daily.</div>';
      return;
    }

    var totalRoutes = collapse(trips, "ground");

    // The plate's stat strip. All four numbers come out of the feed, so
    // the masthead cannot drift away from the file it is describing. They
    // are deliberately feed-wide and not view-wide: the sentence above
    // them describes the whole proposition, and the status rail inside
    // the console reports the current filtered view one block below, so
    // the two never contradict each other.
    var longest = 0, cheapest = Infinity;
    trips.forEach(function (t) {
      if (t.ground > longest) longest = t.ground;
      if (t.price < cheapest) cheapest = t.price;
    });

    // Sorting by the full name while showing the short one put Gatwick,
    // Luton and Stansted in the middle of the alphabet under L. The pills
    // are alphabetical by what is printed on them.
    var codes = Object.keys(trips.reduce(function (a, t) { a[t.origin] = 1; return a; }, {}))
      .sort(function (a, b) {
        return (SHORT[a] || AIRPORTS[a] || a) < (SHORT[b] || AIRPORTS[b] || b) ? -1 : 1;
      });

    // Their airport is already known from the join pages, so the page
    // opens on the four-to-twenty trips they can actually take rather
    // than on all fifty.
    var stored = "";
    try { stored = (localStorage.getItem("ch-airport") || "").toUpperCase(); } catch (e) {}
    var state = {
      origin: codes.indexOf(stored) > -1 ? stored : "",
      hours: 0,
      price: 0,
      sort: "ground",
      all: false
    };

    function match(t, skip) {
      if (skip !== "origin" && state.origin && t.origin !== state.origin) return false;
      if (skip !== "hours" && state.hours && t.ground < state.hours) return false;
      if (skip !== "price" && state.price && t.price >= state.price) return false;
      return true;
    }
    // Counts ignore the axis being counted, so a chip never promises
    // trips it cannot deliver and never reads zero for its own filter.
    function routesFor(skip) {
      return collapse(trips.filter(function (t) { return match(t, skip); }), state.sort);
    }
    // Not "cities whose best fare happens to leave from here" — that is
    // what counting the collapsed rows gives you, and it greyed out
    // Birmingham, Cork, Dublin, Glasgow and Newcastle as having nothing
    // when every one of them had trips. It is cities you can reach from
    // here at all, under whatever else is filtered.
    function countOrigin(c) {
      var seen = {};
      trips.forEach(function (t) {
        if (t.origin === c && match(t, "origin")) seen[t.destination] = true;
      });
      return Object.keys(seen).length;
    }

    // The plate and the console are one object: the plate is rounded on
    // top and square on the bottom, the console square on top and rounded
    // on the bottom, so the seam is exact at rest and the console docks
    // flush to the viewport edge with no rounded corner for white cards
    // to flash through. They must stay SIBLINGS — a wrapper holding only
    // those two would become the sticky containing block and unstick the
    // console a few pixels down the page.
    root.innerHTML =
      '<div class="ch-edt">' +
        '<div class="ch-edt-plate">' +
          '<p class="ch-edt-lede">Fly out in the morning, home the same night. No hotel, no luggage, ' +
            "no days off. Every trip in today&rsquo;s feed is direct both ways.</p>" +
          '<p class="ch-edt-scope">Today&rsquo;s feed</p>' +
          '<dl class="ch-edt-stats">' +
            "<div><dt>Cities</dt><dd>" + totalRoutes.length + "</dd></div>" +
            "<div><dt>UK airports</dt><dd>" + codes.length + "</dd></div>" +
            "<div><dt>Longest day</dt><dd>" + Math.floor(longest) + "<small>hrs</small></dd></div>" +
            "<div><dt>Cheapest</dt><dd>&pound;" + cheapest + "</dd></div>" +
          "</dl>" +
        "</div>" +
        '<div class="ch-edt-filters">' +
          '<span class="ch-edt-lab">Flying from</span>' +
          '<div class="ch-edt-from" id="chEdtFrom" role="group" aria-label="Flying from"></div>' +
          '<div class="ch-edt-refine" id="chEdtRefine"></div>' +
          '<p class="ch-edt-count" id="chEdtCount"></p>' +
        "</div>" +
        '<div class="ch-edt-grid" id="chEdtGrid"></div>' +
        '<button type="button" class="ch-edt-rest" id="chEdtRest" hidden></button>' +
      "</div>";

    var elFrom   = root.querySelector("#chEdtFrom");
    var elRefine = root.querySelector("#chEdtRefine");
    var elCount  = root.querySelector("#chEdtCount");
    var elGrid   = root.querySelector("#chEdtGrid");
    var elRest   = root.querySelector("#chEdtRest");

    function draw() {
      var list = routesFor(null);
      var byH = routesFor("hours"), byP = routesFor("price");

      // Rebuilding the strip resets its scroll, which on a phone throws
      // you back to Birmingham every time you touch the hours.
      var keepScroll = elFrom.scrollLeft;
      elFrom.innerHTML =
        chip("origin", "", "All airports", routesFor("origin").length, !state.origin) +
        codes.map(function (c) {
          return chip("origin", c, esc(SHORT[c] || AIRPORTS[c] || c), countOrigin(c), state.origin === c);
        }).join("");
      elFrom.scrollLeft = keepScroll;

      elRefine.innerHTML =
        group("Hours on the ground", HOURS.map(function (h) {
          return chip("hours", h.v, h.label,
            h.v ? byH.filter(function (r) { return r.best.ground >= h.v; }).length : null,
            state.hours === h.v, h.aria);
        }).join("")) +
        group("Maximum fare", PRICES.map(function (p) {
          return chip("price", p.v, p.label,
            p.v ? byP.filter(function (r) { return r.best.price < p.v; }).length : null,
            state.price === p.v, p.aria);
        }).join("")) +
        group("Order", SORTS.map(function (s) {
          return chip("sort", s.v, s.label, null, state.sort === s.v, s.aria);
        }).join(""));

      if (!list.length) {
        elCount.innerHTML = '<span class="ch-edt-countline">Nothing matches that.</span>' +
          '<button type="button" class="ch-edt-clear" data-k="reset" data-v="">Clear filters</button>';
        elGrid.innerHTML = '<div class="ch-edt-empty"><b>No matches</b>No day trips on those terms. Widen the hours or the price.</div>';
        elRest.hidden = true;
        return;
      }

      var shown = state.all ? list : list.slice(0, PAGE);
      var where = state.origin ? " from <b>" + esc(AIRPORTS[state.origin] || state.origin) + "</b>" : "";
      var filtered = state.origin || state.hours || state.price;
      // The wrapper is load bearing: .ch-edt-count is display:flex so
      // Clear filters can sit hard right, and without it every run of
      // bare text becomes its own flex item and the sentence's own word
      // spacing breaks.
      elCount.innerHTML =
        '<span class="ch-edt-countline"><b>' + list.length + "</b> trip" + (list.length === 1 ? "" : "s") + where +
        " &middot; " + (state.sort === "price" ? "cheapest first" : "longest day first") + "</span>" +
        (filtered ? '<button type="button" class="ch-edt-clear" data-k="reset" data-v="">Clear filters</button>' : "");

      // The gauge on every card is scaled to the longest day in the whole
      // filtered list, not just the twelve on screen, so pressing Show
      // the other N does not rescale the bars you were already looking at.
      var top = 0;
      list.forEach(function (r) { if (r.best.ground > top) top = r.best.ground; });
      elGrid.innerHTML = shown.map(function (r) { return card(r, !state.origin, top); }).join("");

      if (list.length > PAGE) {
        elRest.hidden = false;
        elRest.textContent = state.all
          ? "Show fewer"
          : "Show the other " + (list.length - PAGE) + " trip" + (list.length - PAGE === 1 ? "" : "s");
      } else {
        elRest.hidden = true;
      }
    }

    root.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-k]");
      if (!b || b.disabled) return;
      var k = b.getAttribute("data-k"), v = b.getAttribute("data-v");
      if (k === "reset") { state.origin = ""; state.hours = 0; state.price = 0; state.all = false; }
      else if (k === "origin") { state.origin = v; state.all = false; }
      else if (k === "hours") { state.hours = +v; state.all = false; }
      else if (k === "price") { state.price = +v; state.all = false; }
      else if (k === "sort") { state.sort = v; }
      else return;
      draw();
    });

    elRest.addEventListener("click", function () {
      state.all = !state.all;
      draw();
      if (!state.all) elGrid.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    draw();

    // A pre-selected airport can sit off the right of the phone strip,
    // which makes the page look unfiltered when it is not.
    var on = elFrom.querySelector("[aria-pressed='true']");
    if (on && state.origin && elFrom.scrollWidth > elFrom.clientWidth) {
      elFrom.scrollLeft = Math.max(0, on.offsetLeft - 56);
    }
  }

  function start() {
    var root = document.getElementById(MOUNT);
    if (!root) return;
    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    // Lets body.ch-edt-host above take the body out of being its own
    // dead scroll container, which is what stops the console docking.
    try { document.body.classList.add("ch-edt-host"); } catch (e) {}
    root.innerHTML = '<div class="ch-edt-empty"><b>Live feed</b>Loading today&rsquo;s day trips&hellip;</div>';
    fetch(DATA, { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { boot(root, d); })
      .catch(function () {
        root.innerHTML = '<div class="ch-edt-empty"><b>Feed unreachable</b>Could not load the day trips just now. Try a refresh.</div>';
      });
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);
})();
