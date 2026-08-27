# Study Drive Library — Vercel + Supabase

This version is designed for GitHub + Vercel hosting. PDF files stay in Google Drive. Supabase stores only PDF metadata and view counts.

## Setup

### 1. Create Supabase project

Create a project in Supabase.

Then open SQL Editor and run the complete `supabase.sql` file.

### 2. Create the admin account

In Supabase:
Authentication -> Users -> Add user

Create the email/password account you will use for the Admin panel.

Example:
- Email: your-admin-email@example.com
- Password: a strong password

You do not need a separate admin table for this starter. Any authenticated Supabase account can manage the library, so keep the Auth account private.

### 3. Get Supabase credentials

Project Settings -> API.

Set these Vercel environment variables:

SUPABASE_URL=your project URL
SUPABASE_SERVICE_ROLE_KEY=your service role key

IMPORTANT: Never put SUPABASE_SERVICE_ROLE_KEY in browser JavaScript or commit it to GitHub.

### 4. Local development

```bash
npm install
npx vercel dev
```

Open the local URL shown by Vercel.

### 5. GitHub + Vercel

Push the whole project to GitHub.

In Vercel:
1. Add New Project
2. Import the GitHub repository
3. Framework Preset: Other
4. Build Command: leave empty
5. Output Directory: leave empty
6. Add the two environment variables
7. Deploy

### 6. Google Drive

For each PDF:
1. Open Google Drive.
2. Share the PDF.
3. General access -> Anyone with the link.
4. Role -> Viewer.
5. Copy the link.
6. Add it from Admin.

The actual PDF remains in Google Drive.

## Security

- `SUPABASE_SERVICE_ROLE_KEY` is server-only.
- Public users can read PDFs.
- Only signed-in Supabase users can add/edit/delete PDFs.
- The service-role key is used only by Vercel API routes.
- Use HTTPS (Vercel provides this).
