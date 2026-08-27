import { createClient } from "@supabase/supabase-js";
import { getGoogleDriveAccessToken, deleteFileFromGoogleDrive, updateGoogleDriveFileMetadata } from "./gdrive.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function driveId(url) {
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];
  for (const p of patterns) {
    const m = String(url || "").match(p);
    if (m) return m[1];
  }
  return null;
}

function normalize(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("drive.google.com")) return url;
    const id = driveId(url);
    return id ? `https://drive.google.com/file/d/${id}/view?usp=sharing` : url;
  } catch { return url; }
}

function enrich(p) {
  const id = driveId(p.drive_url);
  const isImage = p.file_type === "photo" || /\.(png|jpg|jpeg|webp|gif|svg)($|\?)/i.test(p.drive_url || "");
  const detectedType = p.file_type || (isImage ? "photo" : "pdf");

  return {
    id: p.id,
    title: p.title,
    subject: p.subject,
    semester: p.semester || "Semester 1",
    description: p.description || "",
    fileType: detectedType,
    driveUrl: p.drive_url,
    previewUrl: id ? `https://drive.google.com/file/d/${id}/preview` : p.drive_url,
    downloadUrl: id ? `https://drive.google.com/uc?export=download&id=${id}` : p.drive_url,
    createdAt: p.created_at,
    views: p.views || 0
  };
}

async function requireAuth(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice(7);
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

export default async function handler(req, res) {
  try {
    await requireAuth(req);

    if (req.method === "GET") {
      const { data, error } = await supabase.from("pdfs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return res.status(200).json(data.map(enrich));
    }

    if (req.method === "POST") {
      const { title, subject, semester, description, driveUrl, fileType } = req.body || {};
      const normalized = normalize(driveUrl);
      if (!title?.trim() || !subject?.trim() || !normalized) {
        return res.status(400).json({ error: "Title, subject and valid URL are required." });
      }
      const { data, error } = await supabase.from("pdfs").insert({
        title: title.trim(),
        subject: subject.trim(),
        semester: (semester || "Semester 1").trim(),
        description: String(description || "").trim(),
        drive_url: normalized,
        file_type: fileType === "photo" ? "photo" : "pdf"
      }).select().single();
      if (error) throw error;
      return res.status(201).json(enrich(data));
    }

    if (req.method === "PUT") {
      const { id, title, subject, semester, description, driveUrl, fileType } = req.body || {};
      const normalized = normalize(driveUrl);
      if (!id || !title?.trim() || !subject?.trim() || !normalized) {
        return res.status(400).json({ error: "ID, title, subject and URL are required." });
      }

      // Update row in Supabase database
      const { data, error } = await supabase.from("pdfs").update({
        title: title.trim(),
        subject: subject.trim(),
        semester: (semester || "Semester 1").trim(),
        description: String(description || "").trim(),
        drive_url: normalized,
        file_type: fileType === "photo" ? "photo" : "pdf"
      }).eq("id", id).select().single();
      if (error) throw error;

      // Sync metadata changes to Google Drive if applicable
      const googleDriveId = driveId(normalized);
      if (googleDriveId) {
        try {
          const accessToken = await getGoogleDriveAccessToken();
          if (accessToken) {
            await updateGoogleDriveFileMetadata(accessToken, googleDriveId, title.trim(), String(description || "").trim());
          }
        } catch (gErr) {
          console.warn("Google Drive metadata update warning:", gErr.message);
        }
      }

      return res.status(200).json(enrich(data));
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || "");
      if (!id) return res.status(400).json({ error: "Missing ID" });

      // 1. Fetch item details before deletion to get Storage/Drive URLs
      const { data: item } = await supabase.from("pdfs").select("*").eq("id", id).single();

      if (item) {
        // 2. Delete file from Google Drive if Google Drive ID exists
        const googleDriveId = driveId(item.drive_url);
        if (googleDriveId) {
          try {
            const accessToken = await getGoogleDriveAccessToken();
            if (accessToken) {
              await deleteFileFromGoogleDrive(accessToken, googleDriveId);
            }
          } catch (gErr) {
            console.warn("Google Drive file delete warning:", gErr.message);
          }
        }

        // 3. Delete file from Supabase Storage if uploaded via Supabase
        if (item.drive_url && item.drive_url.includes("supabase.co/storage")) {
          try {
            const storagePath = item.drive_url.split("/study-files/")[1];
            if (storagePath) {
              await supabase.storage.from("study-files").remove([decodeURIComponent(storagePath)]);
            }
          } catch (sErr) {
            console.warn("Supabase Storage delete warning:", sErr.message);
          }
        }
      }

      // 4. Delete row from database
      const { error } = await supabase.from("pdfs").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e.message === "Unauthorized") return res.status(401).json({ error: "Unauthorized" });
    console.error("Admin API Error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}