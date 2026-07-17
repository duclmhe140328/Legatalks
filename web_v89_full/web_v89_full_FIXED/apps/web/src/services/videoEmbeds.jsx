import { useEffect, useMemo, useRef, useState } from 'react';

const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

function cleanUrl(url) {
  return url.replace(/[),.!?]+$/, '');
}

export function extractVideoEmbed(text = '') {
  const urls = text.match(URL_PATTERN) || [];
  for (const raw of urls) {
    const url = cleanUrl(raw);
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

      if (host === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        if (id) return { provider: 'youtube', id, url, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
      }
      if (host.endsWith('youtube.com')) {
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const id = parsed.searchParams.get('v') || (['shorts', 'embed'].includes(pathParts[0]) ? pathParts[1] : null);
        if (id) return { provider: 'youtube', id, url, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
      }
      if (host.endsWith('tiktok.com')) {
        const match = parsed.pathname.match(/\/video\/(\d+)/);
        if (match) return { provider: 'tiktok', id: match[1], url, embedUrl: `https://www.tiktok.com/player/v1/${match[1]}?autoplay=0&loop=0` };
      }
      if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
        const id = parsed.pathname.match(/\/(\d+)/)?.[1];
        if (id) return { provider: 'vimeo', id, url, embedUrl: `https://player.vimeo.com/video/${id}` };
      }
      if (/\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url)) {
        return { provider: 'direct', url, embedUrl: url };
      }
    } catch {
      // Ignore malformed URLs and continue scanning the post.
    }
  }
  return null;
}

export function removeEmbeddedUrl(text = '', embed) {
  if (!embed?.url) return text;
  return text.replace(embed.url, '').replace(/\n{3,}/g, '\n\n').trim();
}

const PROVIDER_LABEL = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  vimeo: 'Vimeo'
};

/**
 * External players are expensive on mobile, especially TikTok. We only mount
 * an iframe when it is near the viewport. On touch devices TikTok waits for a
 * tap so a long feed does not initialize many third-party apps at once.
 */
export function EmbeddedVideo({ embed, className = '', eager = false }) {
  const placeholderRef = useRef(null);
  const [nearViewport, setNearViewport] = useState(() => eager || embed?.provider === 'direct');
  const isCoarsePointer = useMemo(() => (
    typeof window !== 'undefined' && window.matchMedia?.('(hover: none), (pointer: coarse)').matches
  ), []);
  const requiresTap = embed?.provider === 'tiktok' && isCoarsePointer && !eager;
  const [activated, setActivated] = useState(() => !requiresTap);

  useEffect(() => {
    setNearViewport(eager || embed?.provider === 'direct');
    setActivated(!requiresTap);
  }, [embed?.embedUrl, embed?.provider, eager, requiresTap]);

  useEffect(() => {
    if (!embed || nearViewport || typeof IntersectionObserver === 'undefined') return undefined;
    const node = placeholderRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '320px 0px', threshold: 0.01 });

    observer.observe(node);
    return () => observer.disconnect();
  }, [embed, nearViewport]);

  if (!embed) return null;

  if (embed.provider === 'direct') {
    return <video
      className={className}
      src={embed.embedUrl}
      controls
      playsInline
      preload={eager ? 'metadata' : 'none'}
    />;
  }

  const shouldMount = nearViewport && activated;
  if (!shouldMount) {
    return <div ref={placeholderRef} className={`video-embed-placeholder ${className}`.trim()}>
      <button type="button" onClick={() => { setNearViewport(true); setActivated(true); }} aria-label={`Tải video ${PROVIDER_LABEL[embed.provider] || ''}`}>
        <span className="video-embed-play">▶</span>
        <b>{requiresTap ? `Chạm để phát video ${PROVIDER_LABEL[embed.provider] || ''}` : 'Đang chuẩn bị video…'}</b>
        <small>Chỉ tải trình phát khi cần để cuộn mượt hơn</small>
      </button>
    </div>;
  }

  return <iframe
    className={className}
    src={embed.embedUrl}
    title={`${embed.provider} video`}
    loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
    referrerPolicy="strict-origin-when-cross-origin"
  />;
}
