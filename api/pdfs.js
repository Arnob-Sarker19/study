import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function driveId(url) {
  if (!url) return null;
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];
  for (const p of patterns) {
    const m = String(url).match(p);
    if (m) return m[1];
  }
  return null;
}

function normalize(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("drive.google.com")) return null;
    const id = driveId(url);
    return id ? `https://drive.google.com/file/d/${id}/view?usp=sharing` : null;
  } catch { return null; }
}

function enrich(p) {
  const id = driveId(p.drive_url);
  return {
    id: p.id,
    title: p.title,
    subject: p.subject,
    description: p.description || "",
    driveUrl: p.drive_url,
    previewUrl: id ? `https://drive.google.com/file/d/${id}/preview` : p.drive_url,
    downloadUrl: id ? `https://drive.google.com/uc?export=download&id=${id}` : p.drive_url,
    createdAt: p.created_at,
    views: p.views || 0
  };
}

function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || origin.includes("vercel.app") || origin.includes("localhost") || origin.includes("127.0.0.1");
}

export default async function handler(req, res) {
  if (!originAllowed(req)) return res.status(403).json({ error: "Forbidden" });
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const { q = "", subject = "" } = req.query || {};
      let query = supabase.from("pdfs").select("*").order("created_at", { ascending: false });

      if (q) {
        const term = String(q).replace(/[%_,]/g, "");
        query = query.or(`title.ilike.%${term}%,subject.ilike.%${term}%,description.ilike.%${term}%`);
      }
      if (subject && subject !== "all") query = query.eq("subject", subject);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data.map(enrich));
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
}