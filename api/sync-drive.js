import { createClient } from "@supabase/supabase-js";
import { getGoogleDriveAccessToken, parseFolderId } from "./gdrive.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function requireAuth(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice(7);
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

// Recursively fetch all files inside a Google Drive folder and build nested subfolder paths
async function scanFolderFiles(accessToken, folderId, semesterName = "Semester 1", subjectName = "General") {
  const items = [];
  const cleanId = parseFolderId(folderId);
  if (!cleanId) return items;

  const query = `'${cleanId}' in parents and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,parents,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (!res.ok || !data.files) return items;

  for (const file of data.files) {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      // Check if folder name is a Semester name (e.g. 'Semester 1' or 'Sem 1')
      const semMatch = file.name.match(/semester\s*([1-8])/i);
      const subSemester = semMatch ? `Semester ${semMatch[1]}` : semesterName;
      const subSubject = semMatch
        ? subjectName
        : (subjectName && subjectName !== "General" ? `${subjectName} / ${file.name}` : file.name);
      
      const subItems = await scanFolderFiles(accessToken, file.id, subSemester, subSubject);
      items.push(...subItems);
    } else {
      const isImage = file.mimeType.startsWith("image/");
      items.push({
        drive_id: file.id,
        title: file.name.replace(/\.[^/.]+$/, ""), // Strip extension for clean title
        subject: subjectName,
        semester: semesterName,
        description: `Imported from Google Drive (${file.name})`,
        drive_url: `https://drive.google.com/file/d/${file.id}/view?usp=sharing`,
        file_type: isImage ? "photo" : "pdf"
      });
    }
  }

  return items;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAuth(req);

    const accessToken = await getGoogleDriveAccessToken();
    if (!accessToken) {
      return res.status(400).json({ error: "Google Drive API keys or OAuth token are not configured." });
    }

    const rawRootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const rootFolderId = parseFolderId(rawRootFolderId);
    if (!rootFolderId) {
      return res.status(400).json({ error: "GOOGLE_DRIVE_FOLDER_ID is missing." });
    }

    // 1. Scan all existing files in Google Drive root directory
    const driveFiles = await scanFolderFiles(accessToken, rootFolderId);

    if (driveFiles.length === 0) {
      return res.status(200).json({ message: "No existing files found in Google Drive root folder.", syncedCount: 0 });
    }

    // 2. Fetch existing database records to avoid duplicate insertion
    const { data: existingRows } = await supabase.from("pdfs").select("drive_url");
    const existingUrls = new Set((existingRows || []).map(r => r.drive_url));

    const newFilesToInsert = driveFiles.filter(f => !existingUrls.has(f.drive_url));

    if (newFilesToInsert.length === 0) {
      return res.status(200).json({ message: "All Google Drive files are already indexed in your library!", syncedCount: 0 });
    }

    // 3. Batch insert new files into Supabase database
    const { data: inserted, error: insertError } = await supabase
      .from("pdfs")
      .insert(newFilesToInsert.map(f => ({
        title: f.title,
        subject: f.subject,
        semester: f.semester,
        description: f.description,
        drive_url: f.drive_url,
        file_type: f.file_type
      })))
      .select();

    if (insertError) throw insertError;

    return res.status(200).json({
      message: `Successfully synced ${inserted.length} existing files from Google Drive!`,
      syncedCount: inserted.length,
      files: inserted
    });
  } catch (err) {
    console.error("Drive Sync Error:", err);
    return res.status(500).json({ error: err.message || "Failed to sync Google Drive files." });
  }
}
