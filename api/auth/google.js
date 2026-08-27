export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const host = req.headers.host || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = `${protocol}://${host}/api/auth/google`;

  const { code } = req.query || {};

  // Step 1: Handle OAuth Callback when Google redirects back with ?code=...
  if (code) {
    if (!clientId || !clientSecret) {
      return res.status(400).send("<h3>Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.</h3>");
    }

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokenData.error_description || tokenData.error || "Token exchange failed");
      }

      const refreshToken = tokenData.refresh_token;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Drive OAuth Success</title>
          <style>
            body { font-family: -apple-system, sans-serif; background: #050b14; color: #f8fafc; padding: 40px; line-height: 1.6; }
            .card { max-width: 650px; margin: 0 auto; background: #0a1324; border: 1px solid #6366f1; border-radius: 18px; padding: 30px; }
            h2 { color: #34d399; margin-top: 0; }
            code { background: #020710; padding: 12px; border-radius: 8px; display: block; color: #a5b4fc; word-break: break-all; margin: 15px 0; font-family: monospace; font-size: 13px; }
            .btn { display: inline-block; padding: 12px 24px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 700; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>🎉 Personal Google Account Connected!</h2>
            <p>Your OAuth 2.0 Refresh Token has been successfully generated for your personal @gmail.com account.</p>
            <p><strong>Copy this Refresh Token and add it to your <code>.env</code> or Vercel Environment Variables:</strong></p>
            <code>GOOGLE_REFRESH_TOKEN="${refreshToken || "Check your Vercel logs"}"</code>
            <p>With this Refresh Token set, all uploaded files will save directly into your personal Google Drive using your 15 GB personal quota!</p>
            <a href="/" class="btn">Return to Study Drive Library</a>
          </div>
        </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send(`<h3>OAuth Callback Error: ${err.message}</h3>`);
    }
  }

  // Step 2: Redirect user to Google OAuth Consent Screen
  if (!clientId) {
    return res.status(400).send("<h3>GOOGLE_CLIENT_ID is not configured in .env / Vercel.</h3>");
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent"
  }).toString();

  return res.redirect(302, authUrl);
}
