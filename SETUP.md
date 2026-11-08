# Fall 2026 Student Tracker — deployment guide

Your original dashboard has been upgraded to use the Supabase `assignments` table and a private server-side Canvas calendar importer.

## 1. Upload these files to your EXISTING GitHub repository

Repository: `cpow444/student-tracker`. **Do not create another Vercel project.**

Unzip the `Fall_2026_Cloud_Tracker.zip` file. Upload the contents of its `student-tracker-deploy` folder **to the root** of your existing repository (not inside a nested `student-tracker-deploy` folder). The repository should look like this:

```
index.html
tracker.js
package.json
vercel.json
api/
  config.js
  sync.js
SETUP.md
```

In GitHub, select **Add file > Upload files**, then drag the files and `api` folder in. Commit the change. Your existing `index.html` must be replaced. If GitHub does not let you replace it, open the existing file and edit it, or use github.dev (press `.` in the repository) to replace files and commit.

Vercel automatically deploys changes pushed to the `main` branch of your existing repository. Check **Deployments** until it says **Ready**.

## 2. Confirm the environment variables you have already added

Vercel > `student-tracker` > Settings > Environment Variables:

- `SUPABASE_URL`: your existing Supabase project URL (`https://...supabase.co`)
- `SUPABASE_PUBLISHABLE_KEY`: your **publishable** API key, starting `sb_publishable_` (not your secret key)

The browser only receives these public configuration values through `/api/config`. Security relies on your existing Supabase Row Level Security policies and Supabase Auth.

## 3. Allow email sign-in on your website

Supabase > Authentication > URL Configuration:

- Set **Site URL** to your actual production Vercel website URL (for example, `https://student-tracker-indol-two.vercel.app`).
- Add that same URL and, if offered, `https://your-vercel-domain.vercel.app/**` to the **Redirect URLs** allowlist.

Supabase > Authentication > Providers: Email enabled; confirm email on. Open your live Vercel website, choose **Create account**, enter your email/password, follow the confirmation email, and sign in.

Supabase > Authentication > Users: open your new user and copy its **User UID**. Do not share your password or access token.

If you want only your account to be able to register, disable **Allow new users to sign up** *after* creating and confirming your own account.

## 4. Add private SERVER environment variables for Canvas syncing

In Vercel > `student-tracker` > Settings > Environment Variables, create these **Production** variables:

- `SUPABASE_SECRET_KEY`: **server-side** Supabase secret key (`sb_secret_...`) from Supabase > Settings > API Keys. **Never put it in index.html, tracker.js, or GitHub.** This key bypasses RLS; treat it like a password.
- `SYNC_OWNER_USER_ID`: the user UID you copied from Supabase Authentication > Users.
- `CANVAS_ICS_URL`: your full private `https://canvas.umw.edu/feeds/calendars/...ics` feed URL. **Only enter it here in Vercel, not in GitHub or client code.** Since this feed URL was previously shared in chat, consider regenerating the private link in Canvas first if the school allows.
- `CRON_SECRET`: a long randomly generated secret (at least 32 random characters). **Do not post it to chat or put it in GitHub.** Vercel uses it to authenticate its scheduled sync request.

Make sure your existing `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are correct. Redeploy the same project after saving the variables (a new GitHub commit also triggers a deployment).

## 5. Test the app

1. Open your deployed website; log in.
2. Add a manual assignment, then reload: it should remain.
3. Log in on your phone and verify that assignment appears. Mark it done; your laptop should reflect it after refresh.
4. Click **Sync now**. After the server-side variables are added, you should see the number of new/updated Canvas calendar events.
5. If you get an error, check Vercel > `student-tracker` > Logs for `/api/sync`. Never share secret variable values when sending screenshots.

The included `vercel.json` schedules an automatic Canvas check **once per day (09:00 UTC)**, compatible with Vercel Hobby's cron frequency. The app also checks when you log in/open it and supports **Sync now** while signed in. On the Vercel Hobby plan, more frequent background cron runs need another scheduler or a different plan. Scheduled cron times are approximate, not guaranteed to run at the exact minute.

## Important behavior

- Canvas calendar feed events are imported by their unique event IDs. Changed due dates and titles are updated. Your completed checkmarks, priorities, and notes remain untouched.
- The ICS feed might include events that are not assignments, and may not include undated to-dos or content found only on Canvas Pages. Assign the correct class manually if needed.
- Deleting a Canvas task from your database may cause it to reappear on the next sync if the event remains in the feed. The importer does not delete vanished Canvas events automatically.
- The website uses the existing table and RLS policies you already created. No additional SQL is required for this version.
- The previous tracker stored tasks **locally** in your browser. They will not automatically transfer. From your original site, use **Export backup**; in the new site, use **Import backup**.
- The website needs internet access. Refresh the other device to see the latest changes; push-live updates are not implemented.
- This package has been syntax-checked locally but has **not been deployed into your accounts or tested against your private Canvas feed**.
