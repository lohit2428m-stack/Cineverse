import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function requireAdmin(req) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('You must be signed in as an admin.');
  const token = auth.slice(7).trim();
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) throw new Error('Supabase environment variables are missing on Netlify.');
  const supabase = createClient(supabaseUrl, supabaseAnon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) throw new Error('Your login session is invalid or expired.');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') throw new Error('Admin access required.');
}

function client() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) throw new Error('R2 environment variables are missing.');
  return { s3: new S3Client({ region: 'auto', endpoint: R2_ENDPOINT, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } }), bucket: R2_BUCKET_NAME };
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  try {
    await requireAdmin(req);
    const body = await req.json();
    const action = body.action;
    const { s3, bucket } = client();

    if (action === 'init') {
      const name = String(body.name || 'movie.mp4').replace(/[^a-zA-Z0-9._-]/g, '-');
      const key = `movies/${crypto.randomUUID()}-${name}`;
      const type = String(body.contentType || 'video/mp4');
      const out = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: type }));
      return json(200, { key, uploadId: out.UploadId, contentType: type });
    }

    if (action === 'sign') {
      const key = String(body.key); const uploadId = String(body.uploadId);
      const nums = Array.isArray(body.partNumbers) ? body.partNumbers.map(Number) : [Number(body.partNumber)];
      if (!key || !uploadId || !nums.length || nums.some(n => !Number.isInteger(n) || n < 1 || n > 10000)) return json(400, { error: 'Invalid multipart part.' });
      const urls = [];
      for (const partNumber of nums) {
        const url = await getSignedUrl(s3, new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 });
        urls.push({ partNumber, url });
      }
      return json(200, { urls });
    }

    if (action === 'complete') {
      const key = String(body.key); const uploadId = String(body.uploadId); const parts = Array.isArray(body.parts) ? body.parts : [];
      const normalized = parts.map(p => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag) })).filter(p => p.PartNumber && p.ETag).sort((a,b) => a.PartNumber - b.PartNumber);
      if (!normalized.length) return json(400, { error: 'No uploaded parts supplied.' });
      await s3.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: normalized } }));
      const base = String(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
      return json(200, { key, videoUrl: `${base}/${key}` });
    }

    if (action === 'abort') {
      await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: String(body.key), UploadId: String(body.uploadId) }));
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    console.error(e);
    return json(500, { error: e?.message || 'R2 upload service error.' });
  }
};
