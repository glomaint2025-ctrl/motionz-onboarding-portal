/**
 * Turns the video link a CSM Manager pastes into something the Training page can show.
 * Pure (no server code), so the browser and the tests use the same rules.
 */

export type VideoProvider = 'youtube' | 'loom' | 'vimeo' | 'drive';

export type VideoEmbed =
  /** A link we know how to play inside the page. */
  | { kind: 'embed'; provider: VideoProvider; src: string }
  /** Any other https link: shown as an "Open video" button that opens a new tab. */
  | { kind: 'link'; href: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const LOOM_ID = /^[A-Za-z0-9]{8,64}$/;
const VIMEO_ID = /^\d{4,14}$/;
const VIMEO_HASH = /^[a-f0-9]{6,20}$/i;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

/** "90", "90s" or "1m30s" as seconds; 0 when there is no usable start time. */
function startSeconds(value: string | null): number {
  if (!value) return 0;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

/** Only https links are accepted; anything else (http, javascript:, plain text) is not a video link. */
export function parseHttpsUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && Boolean(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

/** Null when the link is not a usable https link. */
export function toVideoEmbed(value: unknown): VideoEmbed | null {
  const url = parseHttpsUrl(value);
  if (!url) return null;

  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    let id = '';
    if (host === 'youtu.be') id = parts[0] || '';
    else if (parts[0] === 'watch') id = url.searchParams.get('v') || '';
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] || '';
    if (YOUTUBE_ID.test(id)) {
      const start = startSeconds(url.searchParams.get('t') || url.searchParams.get('start'));
      return {
        kind: 'embed',
        provider: 'youtube',
        src: `https://www.youtube-nocookie.com/embed/${id}${start > 0 ? `?start=${start}` : ''}`,
      };
    }
  }

  if (host === 'loom.com' && (parts[0] === 'share' || parts[0] === 'embed') && LOOM_ID.test(parts[1] || '')) {
    return { kind: 'embed', provider: 'loom', src: `https://www.loom.com/embed/${parts[1]}` };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const index = parts.findIndex((part) => VIMEO_ID.test(part));
    if (index !== -1) {
      // Unlisted videos carry a second "hash" part (vimeo.com/123456789/abcdef1234) the player needs.
      const next = parts[index + 1] || '';
      const hash = VIMEO_HASH.test(next) ? next : url.searchParams.get('h') || '';
      return {
        kind: 'embed',
        provider: 'vimeo',
        src: `https://player.vimeo.com/video/${parts[index]}${VIMEO_HASH.test(hash) ? `?h=${hash}` : ''}`,
      };
    }
  }

  if (host === 'drive.google.com') {
    let id = '';
    if (parts[0] === 'file' && parts[1] === 'd') id = parts[2] || '';
    else if (parts[0] === 'open' || parts[0] === 'uc') id = url.searchParams.get('id') || '';
    if (DRIVE_ID.test(id)) {
      return { kind: 'embed', provider: 'drive', src: `https://drive.google.com/file/d/${id}/preview` };
    }
  }

  return { kind: 'link', href: url.toString() };
}
