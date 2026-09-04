import { YOUTUBE_API_KEY } from 'astro:env/server';
import fallbackVideos from './videos-fallback.json';

const CHANNEL_ID = 'UCCBxPV1V0majbAR5PNu2ACw';
// Every channel's uploads live in a playlist whose id is the channel id with
// the leading "UC" swapped for "UU".
const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);

// How long a successful fetch is reused before we hit the API again. The
// homepage is server-rendered, so without this cache every visitor would
// trigger an API call. Six hours keeps us well inside the free daily quota
// while still surfacing new uploads the same day.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface Video {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
}

interface Cache {
  fetchedAt: number;
  videos: Video[];
}

// Module-level cache. Persists for the life of the server process (i.e. between
// requests) but resets on redeploy — exactly what we want.
let cache: Cache | null = null;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function truncate(text: string): string {
  const clean = text.trim();
  return clean.length > 140 ? clean.slice(0, 140).trimEnd() + '…' : clean;
}

async function fetchFromApi(max: number): Promise<Video[]> {
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('playlistId', UPLOADS_PLAYLIST_ID);
  url.searchParams.set('maxResults', String(Math.min(Math.max(max, 1), 50)));
  url.searchParams.set('key', YOUTUBE_API_KEY);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API responded ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        resourceId?: { videoId?: string };
      };
    }>;
  };

  const videos: Video[] = [];
  for (const item of data.items ?? []) {
    const s = item.snippet;
    const id = s?.resourceId?.videoId;
    const title = s?.title;
    // Private/deleted uploads come back with no id or a "Deleted video" title.
    if (!id || !title || title === 'Deleted video' || title === 'Private video') continue;
    videos.push({
      id,
      title,
      description: truncate(s?.description ?? ''),
      publishedAt: s?.publishedAt ? formatDate(s.publishedAt) : '',
    });
  }
  return videos;
}

export async function getLatestVideos(max = 9): Promise<Video[]> {
  // Serve a warm cache without touching the network.
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.videos.slice(0, max);
  }

  try {
    if (!YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY is not set');
    const videos = await fetchFromApi(max);
    if (videos.length === 0) throw new Error('YouTube API returned no videos');
    cache = { fetchedAt: Date.now(), videos };
    return videos.slice(0, max);
  } catch (err) {
    console.warn('[Netsums] Could not fetch YouTube videos, using fallback:', (err as Error).message);
    // Prefer the last good fetch from this process; otherwise the bundled
    // snapshot so the homepage is never empty.
    const stale = cache?.videos ?? (fallbackVideos as Video[]);
    return stale.slice(0, max);
  }
}
