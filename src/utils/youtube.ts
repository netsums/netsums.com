const CHANNEL_ID = 'UCCBxPV1V0majbAR5PNu2ACw';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

export interface Video {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
}

function decodeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export async function getLatestVideos(max = 9): Promise<Video[]> {
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();

    const videos: Video[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match: RegExpExecArray | null;

    while ((match = entryRegex.exec(xml)) !== null && videos.length < max) {
      const entry = match[1];
      const id = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
      const title = entry.match(/<title>(.*?)<\/title>/)?.[1];
      const published = entry.match(/<published>(.*?)<\/published>/)?.[1];
      const desc = entry.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1];

      if (!id || !title) continue;

      const description = decodeXml((desc ?? '').trim());
      const truncated = description.length > 140 ? description.slice(0, 140).trimEnd() + '…' : description;

      videos.push({
        id,
        title: decodeXml(title),
        description: truncated,
        publishedAt: published
          ? new Date(published).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
          : '',
      });
    }

    return videos;
  } catch (err) {
    console.warn('[NETSums] Could not fetch YouTube feed:', err);
    return [];
  }
}
