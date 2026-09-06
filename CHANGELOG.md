
## 5 Sep 2026 (late)
- Homepage hero for paying members: live fare tiles, Open my deals + Search buttons (home-join.js, welcome.js exports; footer pinned e591d08).
- Free tier renamed Freemium in Ghost; "On the list" wording now "Freemium" (member.js, home-join.js).
- Monday email: dark-mode safe header images, mixed one-way/return top 3, flags fixed (UTF-8), Book pill in own column, paid list 8+5.

## 6 Sep 2026
- Copy fixes from the daily customer read applied everywhere (40 days free, no "two months free", honest booking wording, "Try 40 days free" gate).
- Ryanair fare-finder feed (ryanair.ps1, patch-ryanair.ps1) merged into the airport files; search links Ryanair fares direct.
- Search: "London (any airport)" option.
- Ghost: free tier is "Freemium"; member hero live for paying members (from 5 Sep evening).

- Wizz Air and Norwegian feeds, Ryanair per-day calendar, weekend/Christmas/day-trip pairs built in the feeds (feeds-common.ps1). 138,833 dated fares on 3,922 routes.
- Search: Extreme day trips button, stronger title with live totals, airline-direct links for Wizz and Norwegian.
- Bournemouth (BOH) is the 13th airport everywhere.
- Homepage: planner bar removed; fare tiles for visitors and Freemium members.
- Monday posts are public teasers; old city posts unpublished; paid-draft and monday-auto tags made internal; headline fares favour recognisable places.
- Homepage sign-up: `var go` in home-join.js shadowed the submit function for 17 hours; renamed searchLink (78236b0). Real plus-address sign-up now tested after every change.
- Source tracking: footer snippet keeps first-touch ref/utm in localStorage; Worker labels src-<source> and camp-<campaign>; stats.json carries `sources`.
- Worker: three goes at Ghost with waits when it answers anything but a member (spike on 6 Sep turned a few sign-ups away in under 100ms); refusals logged with status and masked email; Anthropic planner error text logged and returned as `detail`.
- Search planner: falls back silently to the built-in parser when the Worker errors (the Anthropic account is out of credit, so every planner call has been failing).
- Probed airports for Henry: Southampton has no readable flights; East Midlands (33+ Ryanair destinations) is the next add; Prestwick, Newquay, Cardiff, Teesside, Exeter, Aberdeen, Norwich are thin.
- Cardiff (CWL) is the 14th airport (2dff548): every code list, Worker labels, fares-CWL.json (45 routes, minimum 5), /join-cardiff/ page with real rows, choose-city card, footer picker, loc-cardiff label, "14 UK airports" everywhere, both routines updated.
- First full backup taken to Desktop\CloudHenry\backup\2026-09-06 (Ghost content and members exports, theme, routes, redirects, repo snapshot, restore notes).
- Duffel researched: no monthly fee, $3 per order, easyJet/KLM/BA/Aer Lingus/Vueling/Norwegian available; Henry to create the account himself.
- Fares five months ahead (cdbc4a1, 532200b): per-month caps replace cheapest-first caps (32 one-ways, 22 returns, 14 assembled pairs, 12 weekends, 10 day trips per route per month), Ryanair per-day calendar reads six months, weekly pass 30 weeks. Birmingham January went from 282 options and 12 weekend routes to 866 options and 34 weekend routes. Prompted by a reader who found one January route.
