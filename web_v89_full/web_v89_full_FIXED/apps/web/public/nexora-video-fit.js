(() => {
  const BODY_CLASS = 'nx-video-tab-active';
  const STAGE_CLASS = 'nx-video-fit-stage';
  const MEDIA_CLASS = 'nx-video-fit-media';
  const CARD_CLASS = 'nx-video-fit-card';
  const SCROLL_CLASS = 'nx-video-fit-scroll';

  let observer = null;
  let resizeTimer = null;

  const normalize = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function isActiveControl(element) {
    if (!element) return false;

    return (
      element.getAttribute('aria-selected') === 'true' ||
      element.getAttribute('aria-current') === 'page' ||
      element.dataset.active === 'true' ||
      /\b(active|selected|current)\b/i.test(String(element.className || ''))
    );
  }

  function findVideoTab() {
    const controls = [
      ...document.querySelectorAll(
        'button, [role="tab"], a, [data-tab], [class*="tab"]'
      ),
    ].filter(isVisible);

    return controls.find((element) => {
      const text = normalize(element.textContent);

      return (
        text === 'video' ||
        text.startsWith('video ') ||
        text.includes('cuộn xem toàn màn hình')
      );
    });
  }

  function videoTabIsActive() {
    const videoTab = findVideoTab();
    if (!videoTab) return false;

    if (isActiveControl(videoTab)) return true;

    const activeSibling = videoTab.parentElement?.querySelector(
      '[aria-selected="true"], [aria-current="page"], .active, .selected'
    );

    return activeSibling === videoTab || activeSibling?.contains(videoTab);
  }

  function mediaCandidates() {
    const main = document.querySelector('main') || document.body;

    return [...main.querySelectorAll('video')].filter((video) => {
      if (!isVisible(video)) return false;

      const rect = video.getBoundingClientRect();
      return rect.width >= 240 && rect.height >= 140;
    });
  }

  function findStage(video) {
    let node = video.parentElement;
    let best = node;
    const videoRect = video.getBoundingClientRect();

    for (let depth = 0; node && depth < 6; depth += 1) {
      const rect = node.getBoundingClientRect();
      const classText = normalize(node.className);

      if (
        rect.width >= videoRect.width * 0.9 &&
        rect.height >= Math.min(140, videoRect.height * 0.7)
      ) {
        best = node;
      }

      if (
        /(player|media|video-stage|video-wrap|video-container|reel-media)/.test(
          classText
        )
      ) {
        return node;
      }

      if (
        depth > 0 &&
        /(card|post|item|feed|reel)/.test(classText) &&
        node.querySelectorAll('video').length === 1
      ) {
        break;
      }

      node = node.parentElement;
    }

    return best || video.parentElement;
  }

  function findCard(stage) {
    let node = stage?.parentElement;

    for (let depth = 0; node && depth < 7; depth += 1) {
      const classText = normalize(node.className);

      if (
        /(video-card|video-item|reel-card|reel-item|post-card|feed-card)/.test(
          classText
        )
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return stage?.parentElement || stage;
  }

  function findScrollParent(element) {
    let node = element?.parentElement;

    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;

      if (
        /(auto|scroll|overlay)/.test(overflowY) &&
        node.scrollHeight > node.clientHeight + 10
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function updateAvailableHeight(stages) {
    const firstStage = stages.find(isVisible);
    if (!firstStage) return;

    const rect = firstStage.getBoundingClientRect();
    const top = Math.max(88, Math.min(rect.top, window.innerHeight * 0.46));
    const available = Math.max(360, Math.floor(window.innerHeight - top - 14));

    document.body.style.setProperty(
      '--nx-video-stage-height',
      `${available}px`
    );
  }

  function addFullscreenButton(stage) {
    if (!stage || stage.querySelector(':scope > .nx-video-fit-fullscreen')) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nx-video-fit-fullscreen';
    button.title = 'Xem toàn màn hình';
    button.setAttribute('aria-label', 'Xem video toàn màn hình');
    button.innerHTML = '⛶';

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
      } catch (_) {
        // Trình duyệt không cho fullscreen thì bỏ qua.
      }
    });

    stage.appendChild(button);
  }

  function setupPlayback(videos) {
    observer?.disconnect();

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.72) {
            for (const other of videos) {
              if (other !== video && !other.paused) {
                other.pause();
              }
            }

            video.play().catch(() => {
              // Autoplay có âm thanh có thể bị trình duyệt chặn.
            });
          } else if (!video.paused) {
            video.pause();
          }
        }
      },
      {
        threshold: [0, 0.4, 0.72, 1],
      }
    );

    videos.forEach((video) => observer.observe(video));
  }

  function clearClasses() {
    document.body.classList.remove(BODY_CLASS);

    document
      .querySelectorAll(
        `.${STAGE_CLASS}, .${MEDIA_CLASS}, .${CARD_CLASS}, .${SCROLL_CLASS}`
      )
      .forEach((element) => {
        element.classList.remove(
          STAGE_CLASS,
          MEDIA_CLASS,
          CARD_CLASS,
          SCROLL_CLASS
        );
      });

    observer?.disconnect();
  }

  function applyFix() {
    const active = videoTabIsActive();

    if (!active) {
      clearClasses();
      return;
    }

    const videos = mediaCandidates();

    if (!videos.length) {
      document.body.classList.add(BODY_CLASS);
      return;
    }

    document.body.classList.add(BODY_CLASS);

    const stages = [];

    videos.forEach((video) => {
      const stage = findStage(video);
      const card = findCard(stage);
      const scrollParent = findScrollParent(card);

      video.classList.add(MEDIA_CLASS);
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      stage?.classList.add(STAGE_CLASS);
      card?.classList.add(CARD_CLASS);
      scrollParent?.classList?.add(SCROLL_CLASS);

      if (stage) {
        stages.push(stage);
        addFullscreenButton(stage);
      }
    });

    updateAvailableHeight(stages);
    setupPlayback(videos);
  }

  function scheduleApply() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(applyFix, 80);
  }

  document.addEventListener('click', scheduleApply, true);
  window.addEventListener('resize', scheduleApply);
  window.addEventListener('popstate', scheduleApply);

  const mutationObserver = new MutationObserver(scheduleApply);
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-selected', 'aria-current', 'style'],
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
  } else {
    scheduleApply();
  }
})();
