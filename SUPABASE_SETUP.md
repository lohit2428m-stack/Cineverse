# CineVerse real movie upload setup

This version adds real authentication, movie metadata, poster uploads, video uploads, and publishing using Supabase.

## 1. Create a Supabase project
Create a project at https://supabase.com/ and open its SQL Editor.

## 2. Run the SQL
Copy everything from `supabase/schema.sql` into the SQL Editor and run it.

This creates:
- `movies` table
- `profiles` table
- admin-only database policies
- public read access for published movies
- `movies` and `posters` storage buckets
- storage policies for admins

## 3. Create your admin account
In Supabase, open Authentication → Users → Add user and create your email/password.

Then run this SQL, replacing the email:

```sql
insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where email = 'YOUR_EMAIL@example.com'
on conflict (id) do update set role = 'admin';
```

## 4. Add the two Supabase values
In Supabase open Project Settings → API and copy:
- Project URL
- anon/public key

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Do NOT put a service-role key in this app.

## 5. Deploy
Build the project with:

```bash
npm install
npm run build
```

Upload the generated `dist` folder to your hosting provider, or connect the project to Netlify/GitHub.

## Important
Only upload movies/videos you own or are licensed to distribute. This MVP stores files in Supabase Storage. For very large commercial-scale video libraries, a dedicated video service/CDN is usually better.
