import crypto from "crypto";

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function parseFolderId(rawId) {
  if (!rawId) return null;
  let str = String(rawId).trim();
  if (str.includes("?")) {
    str = str.split("?")[0];
  }
  str = str.replace(/\/+$/, "");
  const folderMatch = str.match(/\/(?:folders|d)\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const queryMatch = str.match(/id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];
  return str.split("/").pop().trim();
}

export async function getGoogleDriveAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // 1. Preferred Method: User Personal Google Account OAuth Refresh Token (Uses personal 15GB quota)
  if (clientId && clientSecret && refreshToken) {
    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        return data.access_token;
      }
      console.warn("User OAuth Refresh Token failed, falling back to Service Account:", data);
    } catch (err) {
      console.warn("User OAuth Refresh Token error:", err.message);
    }
  }

  // 2. Fallback Method: Service Account JWT Assertion
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

export async function getOrCreateDriveSubjectFolder(accessToken, rawRootFolderId, subjectName) {
  const rootFolderId = parseFolderId(rawRootFolderId);
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
  const cleanParentId = parseFolderId(parentFolderId);
  if (!cleanParentId) {
    throw new Error("Google Drive parent folder ID is required for upload.");
  }

  const metadata = {
    name: fileName,
    parents: [cleanParentId]
  };

  const boundary = "study_drive_upload_boundary_314159";

  const headBuffer = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );

  const tailBuffer = Buffer.from(`\r\n--${boundary}--`);

  const bodyBuffer = Buffer.concat([headBuffer, buffer, tailBuffer]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(bodyBuffer.length)
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

export async function deleteFileFromGoogleDrive(accessToken, fileId) {
  if (!accessToken || !fileId) return;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      console.warn("Google Drive delete warning:", await res.text());
    }
  } catch (err) {
    console.warn("Google Drive delete error:", err.message);
  }
}

export async function updateGoogleDriveFileMetadata(accessToken, fileId, newName, newDescription) {
  if (!accessToken || !fileId) return;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: newName,
        description: newDescription
      })
    });
    if (!res.ok) {
      console.warn("Google Drive update metadata warning:", await res.text());
    }
  } catch (err) {
    console.warn("Google Drive update metadata error:", err.message);
  }
}

export default async function handler(req, res) {
  try {
    const isUserOAuth = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
    const isServiceAccount = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
    const isConfigured = (isUserOAuth || isServiceAccount) && !!process.env.GOOGLE_DRIVE_FOLDER_ID;
    const rootFolderId = parseFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);

    let testStatus = "not_configured";
    let authMode = isUserOAuth ? "user_oauth" : (isServiceAccount ? "service_account" : "none");

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
      mode: authMode,
      rootFolderId: rootFolderId,
      status: testStatus,
      clientEmail: process.env.GOOGLE_CLIENT_EMAIL ? `${process.env.GOOGLE_CLIENT_EMAIL.substring(0, 8)}...` : null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
