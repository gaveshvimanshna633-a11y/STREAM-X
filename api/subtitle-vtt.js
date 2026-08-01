// Vercel Serverless Function
// GET /api/subtitle-vtt?url=<encoded subtitle URL>
//
// Fetches the given .srt (or .vtt) file SERVER-SIDE — servers aren't subject
// to browser CORS restrictions, so this always works regardless of whether
// the source host (lksubs.com, back.asitha.top, etc.) sends CORS headers.
// Converts SRT -> WebVTT and returns it with permissive CORS headers so the
// site's own JS can fetch it directly, no third-party proxy needed.

function srtToVtt(text) {
  let body = text.replace(/\r+/g, '');
  // WebVTT requires "." instead of "," in timestamps
  body = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body;
}

module.exports = async (req, res) => {
  // Allow the site (and previews) to call this from the browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const subUrl = req.query.url;
  if (!subUrl) {
    res.status(400).json({ error: 'Missing ?url= parameter' });
    return;
  }

  try {
    const upstream = await fetch(subUrl, {
      // Some subtitle hosts check a browser-like User-Agent
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CineflixSubtitleFetcher/1.0)' },
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream fetch failed: ${upstream.status}` });
      return;
    }

    const rawText = await upstream.text();
    const isAlreadyVtt = /^\uFEFF?WEBVTT/i.test(rawText.trim());
    const vtt = isAlreadyVtt ? rawText : srtToVtt(rawText);

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    // Cache at Vercel's edge for an hour — same subtitle file gets requested
    // repeatedly by different viewers, no need to refetch upstream every time.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(vtt);
  } catch (err) {
    res.status(500).json({ error: 'Fetch/convert failed: ' + err.message });
  }
};
