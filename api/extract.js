export default async function handler(req, res) {
  // Allow CORS if you ever host index.html elsewhere
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing 'text' in request body" });
    }

    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "Server missing OPENROUTER_API_KEY env var" });
    }

    const promptSystem =
      "Extract contact info from the user's text and return STRICT JSON only (no markdown, no commentary). " +
      "Keys: name, job_title, email, phone_display, phone_e164, linkedin, website. " +
      "Use empty string for unknown values. " +
      "phone_e164 must be E.164 like +61400111222 if possible; otherwise empty string.";

    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        // Optional but recommended by OpenRouter:
        "HTTP-Referer": "https://vercel.app",
        "X-Title": "Signature Builder"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: promptSystem },
          { role: "user", content: text }
        ],
        temperature: 0
      })
    });

    const raw = await r.text();

    // OpenRouter should return JSON; if not, return raw snippet for debugging
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        error: "OpenRouter returned non-JSON",
        raw: raw.slice(0, 300)
      });
    }

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error?.message || "OpenRouter error",
        details: data
      });
    }

    const content = data?.choices?.[0]?.message?.content || "{}";

    // The model returns JSON as *text*, parse it
    let extracted;
    try {
      extracted = JSON.parse(content);
    } catch {
      return res.status(502).json({
        error: "Model did not return valid JSON",
        raw: content.slice(0, 400)
      });
    }

    // Ensure keys exist (so your frontend can depend on them)
    const normalized = {
      name: extracted?.name || "",
      job_title: extracted?.job_title || "",
      email: extracted?.email || "",
      phone_display: extracted?.phone_display || "",
      phone_e164: extracted?.phone_e164 || "",
      linkedin: extracted?.linkedin || "",
      website: extracted?.website || ""
    };

    return res.status(200).json({ data: normalized });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}