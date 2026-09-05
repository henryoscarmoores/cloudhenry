/* CloudHenry Worker. One small server for the two things the browser
 * cannot do on its own:
 *
 *   POST /join   Create a member the instant someone presses "Send me
 *                deals", with their airport attached. No confirmation
 *                email, no waiting. Needs the Ghost Admin key, which
 *                must never be in the browser.
 *   POST /plan   The trip planner: turns a sentence into search filters
 *                with Claude. Needs the Anthropic key.
 *   GET  /health Says hello so the morning check can see it is up.
 *
 * Runs on Cloudflare Workers. Paste this file into a Worker in the
 * dashboard and add two secrets: GHOST_ADMIN_KEY (the "id:secret" from
 * Ghost, Settings, Integrations) and ANTHROPIC_API_KEY. No build step.
 *
 * No em dashes in any copy, per Henry.
 */

const GHOST = "https://cloudhenry.ghost.io/ghost/api/admin";
const MODEL = "claude-opus-5";
const PLACES_URL = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/places.js";

const ALLOWED_ORIGINS = [
  "https://cloudhenry.com",
  "https://www.cloudhenry.com",
  "http://localhost:8765"
];

// Airport page slug -> label and code. Nobody joins without one of these.
const AIRPORTS_BY_SLUG = {
  "manchester":["loc-manchester","MAN"], "birmingham":["loc-birmingham","BHX"], "leeds":["loc-leeds","LBA"],
  "leeds-bradford":["loc-leeds","LBA"], "london-stansted":["loc-london-stansted","STN"], "london-luton":["loc-london-luton","LTN"],
  "bristol":["loc-bristol","BRS"], "newcastle":["loc-newcastle","NCL"], "glasgow":["loc-glasgow","GLA"],
  "edinburgh":["loc-edinburgh","EDI"], "london-gatwick":["loc-london-gatwick","LGW"], "liverpool":["loc-liverpool","LPL"],
  "belfast":["loc-belfast","BFS"]
};
const SOURCES = { "homepage": "via-homepage", "airport-page": "via-airport-page", "flag-game": "via-flag-game" };

const AIRPORTS = [
  ["ANY", "Any UK airport"], ["MAN", "Manchester"], ["BHX", "Birmingham"],
  ["LBA", "Leeds Bradford"], ["STN", "London Stansted"], ["LTN", "London Luton"],
  ["BRS", "Bristol"], ["NCL", "Newcastle"], ["GLA", "Glasgow"], ["EDI", "Edinburgh"],
  ["LGW", "London Gatwick"], ["LPL", "Liverpool"], ["BFS", "Belfast"]
];

/* ---- plumbing ------------------------------------------------------ */

const hits = new Map();
function throttled(key, limit) {
  const now = Date.now();
  const rec = hits.get(key) || { n: 0, t: now };
  if (now - rec.t > 3600000) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(key, rec);
  return rec.n > limit;
}

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, cors(origin))
  });
}

/* ---- Ghost Admin API ------------------------------------------------ */

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Ghost wants a five-minute HS256 token made from the "id:secret" key.
async function ghostToken(key) {
  const [id, secretHex] = key.split(":");
  const secret = new Uint8Array(secretHex.match(/../g).map(h => parseInt(h, 16)));
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT", kid: id })));
  const payload = b64url(enc.encode(JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" })));
  const k = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(header + "." + payload)));
  return header + "." + payload + "." + b64url(sig);
}

async function ghost(env, method, path, body) {
  const token = await ghostToken(env.GHOST_ADMIN_KEY);
  const res = await fetch(GHOST + path, {
    method,
    headers: { "Authorization": "Ghost " + token, "Accept-Version": "v5.0", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) {}
  return { status: res.status, data, text };
}

// The newsletters new members should be on: whatever Ghost subscribes
// people to by default. Cached for an hour.
let newslettersCache = { at: 0, ids: [] };
async function defaultNewsletters(env) {
  if (Date.now() - newslettersCache.at < 3600000 && newslettersCache.ids.length) return newslettersCache.ids;
  const r = await ghost(env, "GET", "/newsletters/?limit=all&filter=status:active");
  const ids = ((r.data && r.data.newsletters) || []).filter(n => n.subscribe_on_signup).map(n => ({ id: n.id }));
  newslettersCache = { at: Date.now(), ids };
  return ids;
}

/* ---- email sanity --------------------------------------------------- */

const EMAIL = /^[^\s@]+@([^\s@]+\.[^\s@]{2,})$/;

// Obvious junk is refused before it reaches the list: a domain that
// cannot receive mail bounces, and bounces hurt everyone's delivery.
async function domainAcceptsMail(domain) {
  try {
    for (const type of ["MX", "A"]) {
      const r = await fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(domain) + "&type=" + type,
        { headers: { "Accept": "application/dns-json" } });
      const j = await r.json();
      if (j.Status === 0 && Array.isArray(j.Answer) && j.Answer.length) return true;
    }
    return false;
  } catch (e) {
    return true;   // DNS hiccup: let them in rather than lose a real person
  }
}

/* ---- /join ---------------------------------------------------------- */

async function handleJoin(request, env, origin) {
  if (!env.GHOST_ADMIN_KEY) return json({ error: "sign-up not configured" }, 500, origin);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (throttled("join:" + ip, 15)) return json({ error: "That is a lot of sign-ups from one place. Try again in an hour." }, 429, origin);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad request" }, 400, origin); }

  if (body.website) return json({ ok: true }, 200, origin);   // honeypot filled: a bot, pretend it worked

  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const slug = String(body.airport || "").trim().toLowerCase().replace(/^join-/, "");
  const airport = AIRPORTS_BY_SLUG[slug];
  const source = SOURCES[String(body.source || "")] || null;

  if (!airport) return json({ error: "Pick your airport first." }, 400, origin);
  const m = EMAIL.exec(email);
  if (!m) return json({ error: "That email does not look right." }, 400, origin);
  if (!(await domainAcceptsMail(m[1]))) return json({ error: "That email address cannot receive mail. Check the spelling." }, 400, origin);

  const labels = [{ name: airport[0] }];
  if (source) labels.push({ name: source });
  const newsletters = await defaultNewsletters(env);

  const r = await ghost(env, "POST", "/members/", {
    members: [{ email, name: "", labels, newsletters, note: "Joined via the website, " + new Date().toISOString().slice(0, 10) }]
  });

  if (r.status === 201) return json({ ok: true, created: true, code: airport[1] }, 201, origin);

  // Already a member: not an error for them, and nothing to change.
  const msg = (r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].message) || "";
  if (r.status === 422 && /already exists/i.test(msg)) return json({ ok: true, created: false, code: airport[1] }, 200, origin);

  return json({ error: "Something went wrong on our side. Please try again." }, 502, origin);
}

/* ---- /plan ---------------------------------------------------------- */

const SCHEMA = {
  type: "object",
  properties: {
    from:  { type: "string", enum: AIRPORTS.map(a => a[0]) },
    to:    { type: "string" },
    trip:  { type: "string", enum: ["any", "one", "ret", "weekend", "xmas"] },
    month: { type: "string" },
    dep:   { type: "string" },
    ret:   { type: "string" },
    theme: { type: "string", enum: ["", "beach", "city", "sun", "long"] },
    max:   { type: "integer" },
    ideas: { type: "array", items: { type: "string" } },
    reply: { type: "string" }
  },
  required: ["from", "to", "trip", "month", "dep", "ret", "theme", "max", "ideas", "reply"],
  additionalProperties: false
};

async function destinationNames() {
  const cache = caches.default;
  const key = new Request(PLACES_URL);
  let res = await cache.match(key);
  if (!res) {
    res = await fetch(PLACES_URL);
    if (!res.ok) return [];
    res = new Response(await res.text(), { headers: { "Cache-Control": "max-age=86400" } });
    await cache.put(key, res.clone());
  }
  const src = await res.text();
  const names = [];
  const re = /[A-Z]{3}:\["([^"]+)","([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    if (["England", "Scotland", "Wales", "N. Ireland"].includes(m[2])) continue;
    names.push(m[1] + " (" + m[2] + ")");
  }
  return names;
}

function monthsAhead(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

function systemPrompt(names) {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You turn a traveller's sentence into search filters for CloudHenry, a UK cheap-flights site.",
    "Today is " + today + ". Use British English. Never use an em dash.",
    "",
    "Airports (code: name): " + AIRPORTS.map(a => a[0] + ": " + a[1]).join(", ") + ".",
    "If no airport is named, use the one the page passes in. If they say anywhere, any airport, or do not mind, use ANY.",
    "",
    "Trip types: any, one (one way), ret (return), weekend (Friday or Saturday out, Sunday back),",
    "xmas (Christmas market long weekends, 15 November to 24 December, to market cities).",
    "Themes: beach, city (city break), sun (winter sun, October to March), long (long haul). Leave empty if none fits.",
    "",
    "Months available: " + monthsAhead(11).join(", ") + ". month is YYYY-MM or empty.",
    "dep and ret are exact dates YYYY-MM-DD, only when the person gives specific dates; otherwise empty.",
    "max is a budget in pounds, or 0 if none given.",
    "",
    "to must be exactly one destination name from this list, or empty when they have not named a place:",
    names.join("; "),
    "",
    "ideas: up to three destination names from the same list that fit what they asked for, most fitting first. Empty if they named a specific place.",
    "reply: one or two short friendly sentences saying what you have set the search to. Do not mention prices, availability, or airlines. Do not promise anything."
  ].join("\n");
}

async function handlePlan(request, env, origin) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "planner not configured" }, 500, origin);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (throttled("plan:" + ip, 60)) return json({ error: "slow down a little" }, 429, origin);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad request" }, 400, origin); }
  const q = String(body.q || "").trim().slice(0, 300);
  const from = String(body.from || "MAN").toUpperCase();
  if (!q) return json({ error: "say what you fancy first" }, 400, origin);

  const names = await destinationNames();
  const payload = {
    model: MODEL,
    max_tokens: 1024,
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: systemPrompt(names),
    messages: [{ role: "user", content: "Page airport: " + from + "\nTraveller: " + q }]
  };

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01"
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ error: "could not reach the planner" }, 502, origin);
  }
  if (!res.ok) return json({ error: "planner error " + res.status }, 502, origin);

  const msg = await res.json();
  if (msg.stop_reason === "refusal") return json({ error: "I cannot help with that one" }, 200, origin);
  if (msg.stop_reason === "max_tokens") return json({ error: "that got a bit long, try a shorter ask" }, 200, origin);

  const text = (msg.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  let plan;
  try { plan = JSON.parse(text); } catch (e) { return json({ error: "planner gave an odd answer" }, 502, origin); }

  plan.from  = AIRPORTS.some(a => a[0] === plan.from) ? plan.from : from;
  plan.max   = Number.isInteger(plan.max) && plan.max > 0 ? Math.min(plan.max, 600) : 0;
  plan.ideas = Array.isArray(plan.ideas) ? plan.ideas.slice(0, 3) : [];
  plan.reply = String(plan.reply || "").replace(/—/g, ",").slice(0, 240);
  return json(plan, 200, origin);
}

/* ---- router --------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, join: !!env.GHOST_ADMIN_KEY, plan: !!env.ANTHROPIC_API_KEY }, 200, origin);
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin not allowed" }, 403, origin);

    if (path === "/join") return handleJoin(request, env, origin);
    if (path === "/plan") return handlePlan(request, env, origin);
    return json({ error: "not found" }, 404, origin);
  }
};
