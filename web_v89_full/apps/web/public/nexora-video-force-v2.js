(() => {
  const VERSION = '2.0.0-force';

  document.documentElement.dataset.nxVideoFix = 'v2';

  let playbackObserver = null;
  let runTimer = null;
  let lastCount = -1;

  function important(element, property, value) {
    element?.style?.setProperty(property, value, 'important');
  }

  function currentPathIsTimeline() {
    const path = String(window.location.pathname || '').toLowerCase();
    return path === '/timeline' || path.startsWith('/timeline/');
  }

  function visible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width >= 260 &&
      rect.height >= 120
    );
  }

  function largeVideos() {
    return [...document.querySelectorAll('video')].filter((video) => {
      if (!visible(video)) return false;

      const rect = video.getBoundingClientRect();

      return (
        rect.width >= Math.min(520, window.innerWidth * 0.42) ||
        rect.height >= 260
      );
    });
  }

  function chooseStage(video) {
    const videoRect = video.getBoundingClientRect();
    let node = video.parentElement;
    let fallback = node;

    for (let depth = 0; node && depth < 7; depth += 1) {
      const rect = node.getBoundingClientRect();
      const className = String(node.className || '').toLowerCase();
      const videoCount = node.querySelectorAll('video').length;

      if (
        videoCount === 1 &&
        rect.width >= videoRect.width * 0.88 &&
        rect.height >= Math.max(140, videoRect.height * 0.72) &&
        rect.height <= Math.max(videoRect.height * 1.55, 760)
      ) {
        fallback = node;
      }

      if (
        videoCount === 1 &&
        /(video|player|media|reel|stage|viewport)/.test(className) &&
        rect.width >= videoRect.width * 0.88
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return fallback || video.parentElement;
  }

  function chooseCard(stage) {
    let node = stage?.parentElement;

    for (let depth = 0; node && depth < 7; depth += 1) {
      const className = String(node.className || '').toLowerCase();

      if (
        /(video-card|video-item|reel-card|reel-item|post-card|feed-card|card)/.test(
          className
        )
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return stage?.parentElement || stage;
  }

  function chooseScrollParent(card) {
    let node = card?.parentElement;

    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);

      if (
        /(auto|scroll|overlay)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 20
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function forceVideoStyles(video, stage, card, scrollParent) {
    video.dataset.nxVideoMediaV2 = 'true';
    stage.dataset.nxVideoStageV2 = 'true';
    card.dataset.nxVideoCardV2 = 'true';

    if (scrollParent?.dataset) {
      scrollParent.dataset.nxVideoScrollV2 = 'true';
    }

    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    important(video, 'position', 'absolute');
    important(video, 'inset', '0');
    important(video, 'display', 'block');
    important(video, 'width', '100%');
    important(video, 'height', '100%');
    important(video, 'min-width', '0');
    important(video, 'min-height', '0');
    important(video, 'max-width', '100%');
    important(video, 'max-height', '100%');
    important(video, 'object-fit', 'contain');
    important(video, 'object-position', 'center center');
    important(video, 'transform', 'none');
    important(video, 'scale', '1');
    important(video, 'translate', 'none');
    important(video, 'margin', '0');
    important(video, 'padding', '0');
    important(video, 'background', '#000');
    important(video, 'z-index', '1');

    important(stage, 'position', 'relative');
    important(stage, 'width', '100%');
    important(stage, 'height', 'var(--nx-video-v2-height)');
    important(stage, 'min-height', window.innerWidth <= 600 ? '520px' : '520px');
    important(stage, 'max-height', 'none');
    important(stage, 'overflow', 'hidden');
    important(stage, 'background', '#000');
    important(stage, 'isolation', 'isolate');

    important(card, 'height', 'auto');
    important(card, 'min-height', '0');
    important(card, 'max-height', 'none');
    important(card, 'overflow', 'visible');
  }

  function addFullscreen(stage) {
    if (
      !stage ||
      stage.querySelector(':scope > .nx-video-v2-fullscreen')
    ) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nx-video-v2-fullscreen';
    button.title = 'Xem video toàn màn hình';
    button.setAttribute('aria-label', 'Xem video toàn màn hình');
    button.textContent = '⛶';

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else if (stage.requestFullscreen) {
          await stage.requestFullscreen();
        } else if (stage.webkitRequestFullscreen) {
          stage.webkitRequestFullscreen();
        }
      } catch (error) {
        console.warn('[NEXORA VIDEO FIX V2] Fullscreen error:', error);
      }
    });

    stage.appendChild(button);
  }

  function setupPlayback(videos) {
    playbackObserver?.disconnect();

    playbackObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
            videos.forEach((other) => {
              if (other !== video && !other.paused) {
                other.pause();
              }
            });

            video.play().catch(() => {});
          } else if (!video.paused) {
            video.pause();
          }
        }
      },
      {
        threshold: [0, 0.35, 0.72, 1],
      }
    );

    videos.forEach((video) => playbackObserver.observe(video));
  }

  function apply() {
    if (!currentPathIsTimeline()) {
      document.body?.classList.remove('nx-timeline-video-v2');
      return;
    }

    const videos = largeVideos();

    if (!videos.length) {
      return;
    }

    document.body.classList.add('nx-timeline-video-v2');

    videos.forEach((video) => {
      const stage = chooseStage(video);
      if (!stage) return;

      const card = chooseCard(stage);
      const scrollParent = chooseScrollParent(card);

      forceVideoStyles(video, stage, card, scrollParent);
      addFullscreen(stage);
    });

    setupPlayback(videos);

    if (lastCount !== videos.length) {
      lastCount = videos.length;
      console.log(
        `[NEXORA VIDEO FIX V2] Applied to ${videos.length} video(s).`,
        videos
      );
    }
  }

  function schedule() {
    window.clearTimeout(runTimer);
    runTimer = window.setTimeout(apply, 50);
  }

  const mutationObserver = new MutationObserver(schedule);

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'src'],
  });

  window.addEventListener('resize', schedule);
  window.addEventListener('popstate', schedule);
  document.addEventListener('click', schedule, true);

  window.setInterval(apply, 700);

  window.__NEXORA_VIDEO_FIX_V2__ = {
    version: VERSION,
    apply,
    status() {
      return {
        version: VERSION,
        path: window.location.pathname,
        videos: largeVideos().length,
        active: document.body.classList.contains('nx-timeline-video-v2'),
      };
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }

  console.log(`[NEXORA VIDEO FIX V2] Runtime loaded: ${VERSION}`);
})();
