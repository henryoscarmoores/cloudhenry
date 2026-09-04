/* CloudHenry trip planner, the bit that talks to Claude.
 *
 * A Cloudflare Worker. It exists for one reason: the Anthropic API key
 * cannot live in the browser, so the search page sends the visitor's
 * sentence here and this turns it into search filters.
 *
 * Deploy by pasting this file into a Worker in the Cloudflare dashboard
 * and adding one secret, ANTHROPIC_API_KEY. No build step, no npm, which
 * is why this uses fetch() against the Messages API directly rather than
 * the SDK.
 *
 * The browser sends   POST { q: "somewhere warm in November under £60 from Leeds" }
 * and gets back       { from:"LBA", to:"", trip:"any", month:"2026-11", dep:"", ret:"",
 *                       theme:"sun", max:60, ideas:["Tenerife","Alicante","Malta"],
 *                       reply:"November sun from Leeds under £60. Here is what is out there." }
 *
 * The search page applies those to its own controls; nothing here ever
 * quotes a price, because the fares live in the page, not in the model.
 */

const MODEL = "claude-opus-5";
const PLACES_URL = "https://cdn.jsdelivr.net/gh/henryoscarmoores/cloudhenry@main/places.js";

const ALLOWED_ORIGINS = [
  "https://cloudhenry.com",
  "https://www.cloudhenry.com",
  "http://localhost:8765"
];

const AIRPORTS = [
  ["ANY", "Any UK airport"], ["MAN", "Manchester"], ["BHX", "Birmingham"],
  ["LBA", "Leeds Bradford"], ["STN", "London Stansted"], ["LTN", "London Luton"],
  ["BRS", "Bristol"], ["NCL", "Newcastle"], ["GLA", "Glasgow"], ["EDI", "Edinburgh"],
  ["LGW", "London Gatwick"], ["LPL", "Liverpool"], ["BFS", "Belfast"]
];

// What the model has to give back. additionalProperties:false and a full
// required list are what the API needs to enforce it.
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

// Best-effort per-isolate throttle. Not a security boundary, just enough
// to stop one tab hammering the key.
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60000) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(ip, rec);
  return rec.n > 20;
}

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// The destination names the site can actually show. Cached for a day so
// a burst of questions does not fetch the file a hundred times.
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
    // Skip the UK airports themselves; nobody plans a trip to Luton.
    if (["England", "Scotland", "Wales", "N. Ireland"].includes(m[2])) continue;
    names.push(m[1] + " (" + m[2] + ")");
  }
  return names;
}

function monthsAhead(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1;
    out.push(y + "-" + String(mo).padStart(2, "0"));
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== "POST") return json({ error: "POST only" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "origin not allowed" }, 403, origin);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "planner not configured" }, 500, origin);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (throttled(ip)) return json({ error: "slow down a little" }, 429, origin);

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

    if (!res.ok) {
      const text = await res.text();
      return json({ error: "planner error " + res.status, detail: text.slice(0, 200) }, 502, origin);
    }

    const msg = await res.json();
    if (msg.stop_reason === "refusal") return json({ error: "I cannot help with that one" }, 200, origin);
    if (msg.stop_reason === "max_tokens") return json({ error: "that got a bit long, try a shorter ask" }, 200, origin);

    const text = (msg.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    let plan;
    try { plan = JSON.parse(text); } catch (e) { return json({ error: "planner gave an odd answer" }, 502, origin); }

    // Belt and braces: the schema is enforced, but keep the page safe
    // from anything unexpected all the same.
    plan.from  = AIRPORTS.some(a => a[0] === plan.from) ? plan.from : from;
    plan.max   = Number.isInteger(plan.max) && plan.max > 0 ? Math.min(plan.max, 600) : 0;
    plan.ideas = Array.isArray(plan.ideas) ? plan.ideas.slice(0, 3) : [];
    plan.reply = String(plan.reply || "").replace(/—/g, ",").slice(0, 240);

    return json(plan, 200, origin);
  }
};
