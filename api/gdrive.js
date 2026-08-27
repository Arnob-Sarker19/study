import crypto from "crypto";

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function getGoogleDriveAccessToken() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    return null;
  }

  privateKey = privateKey.replace(/\\n/g, "\n");

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaim = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signatureInput);
  const signature = signer.sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Google OAuth Error:", data);
    throw new Error(data.error_description || "Google Drive Authentication failed");
  }

  return data.access_token;
}

export async function getOrCreateDriveSubjectFolder(accessToken, rootFolderId, subjectName) {
  if (!rootFolderId) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID is missing or not configured.");
  }

  const sanitizedSubject = subjectName.replace(/'/g, "\\'");
  const query = `name='${sanitizedSubject}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create new subfolder inside specified parent folder
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: subjectName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId]
    })
  });
  const createData = await createRes.json();
  if (!createRes.ok) {
    throw new Error(createData.error?.message || "Failed to create folder in Google Drive");
  }
  return createData.id;
}

export async function uploadFileToGoogleDrive({ accessToken, parentFolderId, fileName, mimeType, buffer }) {
  if (!parentFolderId) {
    throw new Error("Google Drive parent folder ID is required for Service Account upload.");
  }

  const metadata = {
    name: fileName,
    parents: [parentFolderId]
  };

  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(
      `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`
    ),
    Buffer.from(buffer.toString("base64")),
    Buffer.from(closeDelimiter)
  ]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: bodyBuffer
    }
  );

  const fileData = await uploadRes.json();
  if (!uploadRes.ok) {
    console.error("Drive Upload Error:", fileData);
    throw new Error(fileData.error?.message || "Google Drive file upload failed");
  }

  // Make file publicly readable
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone"
    })
  }).catch(() => {});

  return `https://drive.google.com/file/d/${fileData.id}/view?usp=sharing`;
}

export default async function handler(req, res) {
  try {
    const isConfigured = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_DRIVE_FOLDER_ID);
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || null;

    let testStatus = "not_configured";
    if (isConfigured) {
      try {
        const token = await getGoogleDriveAccessToken();
        testStatus = token ? "connected" : "auth_error";
      } catch (err) {
        testStatus = `error: ${err.message}`;
      }
    }

    return res.status(200).json({
      configured: isConfigured,
      rootFolderId: rootFolderId,
      status: testStatus,
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL ? `${process.env.GOOGLE_CLIENT_EMAIL.substring(0, 8)}...` : null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
