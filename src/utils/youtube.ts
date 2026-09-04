import { YOUTUBE_API_KEY } from 'astro:env/server';
import fallbackVideos from './videos-fallback.json';

const CHANNEL_ID = 'UCCBxPV1V0majbAR5PNu2ACw';
// Every channel's uploads live in a playlist whose id is the channel id with
// the leading "UC" swapped for "UU".
const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.slice(2);

// How long a successful fetch is reused before we hit the API again. The
// homepage is server-rendered, so without this cache every visitor would
// trigger API calls. Six hours keeps us well inside the free daily quota
// while still surfacing new uploads the same day.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// YouTube Shorts are at most 3 minutes long. We treat anything this short as a
// Short and leave it out of the "Latest Tutorials" list.
const SHORT_MAX_SECONDS = 180;

// Pull a generous window of recent uploads so that, after Shorts are removed,
// we still have enough long-form videos to fill the grid. (Capped at 50, the
// API maximum per page.)
const FETCH_WINDOW = 50;

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

// Parse an ISO 8601 duration (e.g. "PT1H2M30s") into seconds.
function parseDurationSeconds(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

async function fetchJson(url: URL): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API responded ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function fetchFromApi(max: number): Promise<Video[]> {
  // 1. Newest uploads, in order (cheap: contentDetails just carries the ids).
  const listUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  listUrl.searchParams.set('part', 'contentDetails');
  listUrl.searchParams.set('playlistId', UPLOADS_PLAYLIST_ID);
  listUrl.searchParams.set('maxResults', String(FETCH_WINDOW));
  listUrl.searchParams.set('key', YOUTUBE_API_KEY);
  const list = await fetchJson(listUrl);

  const ids: string[] = (list.items ?? [])
    .map((it: any) => it?.contentDetails?.videoId)
    .filter(Boolean);
  if (ids.length === 0) return [];

  // 2. Look up snippet + duration for those ids in one call.
  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.searchParams.set('part', 'snippet,contentDetails');
  videosUrl.searchParams.set('id', ids.join(','));
  videosUrl.searchParams.set('maxResults', String(FETCH_WINDOW));
  videosUrl.searchParams.set('key', YOUTUBE_API_KEY);
  const details = await fetchJson(videosUrl);

  // Index by id so we can keep the newest-first order from step 1.
  const byId = new Map<string, any>();
  for (const item of details.items ?? []) byId.set(item.id, item);

  const videos: Video[] = [];
  for (const id of ids) {
    if (videos.length >= max) break;
    const item = byId.get(id);
    const s = item?.snippet;
    if (!s?.title) continue;
    // Drop Shorts (<= 3 minutes).
    if (parseDurationSeconds(item?.contentDetails?.duration) <= SHORT_MAX_SECONDS) continue;
    videos.push({
      id,
      title: s.title,
      description: truncate(s.description ?? ''),
      publishedAt: s.publishedAt ? formatDate(s.publishedAt) : '',
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
