import { createClient } from "@supabase/supabase-js";
import { getGoogleDriveAccessToken, getOrCreateDriveSubjectFolder, uploadFileToGoogleDrive, parseFolderId } from "./gdrive.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKET_NAME = "study-files";

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

function normalizeDriveUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("drive.google.com")) {
      const id = driveId(url);
      return id ? `https://drive.google.com/file/d/${id}/view?usp=sharing` : url;
    }
    return url;
  } catch {
    return url;
  }
}

function slugify(text) {
  return String(text || "general")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureBucket() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets && buckets.some(b => b.name === BUCKET_NAME);
    if (!exists) {
      await supabase.storage.createBucket(BUCKET_NAME, { public: true });
    }
  } catch (err) {
    console.warn("Supabase Bucket check warning:", err.message);
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb"
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { title, subject, semester, description, fileType, driveUrl, fileData, fileName, mimeType } = req.body || {};

    if (!title?.trim() || !subject?.trim()) {
      return res.status(400).json({ error: "Title and Subject are required fields." });
    }

    const cleanSubject = subject.trim();
    const cleanSemester = (semester || "Semester 1").trim();
    const cleanTitle = title.trim();
    const cleanDesc = String(description || "").trim();
    const type = fileType === "photo" ? "photo" : "pdf";
    let finalUrl = "";
    let storageProvider = "link";

    if (fileData) {
      const base64Content = fileData.includes(",") ? fileData.split(",")[1] : fileData;
      const buffer = Buffer.from(base64Content, "base64");
      const fileExt = fileName ? fileName.split(".").pop() : (type === "photo" ? "jpg" : "pdf");
      const sanitizedFileName = (fileName ? fileName.replace(/[^a-zA-Z0-9_.-]/g, "_") : `file_${Date.now()}.${fileExt}`);
      const targetMime = mimeType || (type === "photo" ? "image/jpeg" : "application/pdf");

      const rootFolderId = parseFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
      let driveUploaded = false;

      // 1. Try Google Drive API upload if keys & rootFolderId are set
      if (rootFolderId) {
        try {
          const driveAccessToken = await getGoogleDriveAccessToken();
          if (driveAccessToken) {
            const semesterFolderId = await getOrCreateDriveSubjectFolder(driveAccessToken, rootFolderId, cleanSemester);
            const subjectFolderId = await getOrCreateDriveSubjectFolder(driveAccessToken, semesterFolderId, cleanSubject);
            
            finalUrl = await uploadFileToGoogleDrive({
              accessToken: driveAccessToken,
              parentFolderId: subjectFolderId,
              fileName: sanitizedFileName,
              mimeType: targetMime,
              buffer: buffer
            });
            storageProvider = "google_drive";
            driveUploaded = true;
          }
        } catch (gErr) {
          console.warn("Google Drive upload warning (falling back to Supabase Storage):", gErr.message);
        }
      }

      // 2. Fallback to Supabase Storage if Google Drive is not configured or failed
      if (!driveUploaded) {
        await ensureBucket();
        const semSlug = slugify(cleanSemester);
        const subjectSlug = slugify(cleanSubject);
        const storagePath = `uploads/${semSlug}/${subjectSlug}/${Date.now()}-${sanitizedFileName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storagePath, buffer, {
            contentType: targetMime,
            upsert: true
          });

        if (uploadError) {
          throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(storagePath);

        finalUrl = publicUrlData.publicUrl;
        storageProvider = "supabase_storage";
      }
    } else if (driveUrl?.trim()) {
      finalUrl = normalizeDriveUrl(driveUrl.trim());
      storageProvider = "link";
    } else {
      return res.status(400).json({ error: "Please attach a file or provide a cloud link." });
    }

    // 3. Insert record into database
    const { data, error } = await supabase
      .from("pdfs")
      .insert({
        title: cleanTitle,
        subject: cleanSubject,
        semester: cleanSemester,
        description: cleanDesc,
        drive_url: finalUrl,
        file_type: type
      })
      .select()
      .single();

    if (error) throw error;

    const id = driveId(data.drive_url);
    return res.status(201).json({
      id: data.id,
      title: data.title,
      subject: data.subject,
      semester: data.semester || cleanSemester,
      description: data.description || "",
      fileType: data.file_type || type,
      driveUrl: data.drive_url,
      provider: storageProvider,
      previewUrl: id ? `https://drive.google.com/file/d/${id}/preview` : data.drive_url,
      downloadUrl: id ? `https://drive.google.com/uc?export=download&id=${id}` : data.drive_url,
      createdAt: data.created_at,
      views: data.views || 0
    });
  } catch (err) {
    console.error("Upload API Error:", err);
    return res.status(500).json({ error: err.message || "Server upload error" });
  }
}
