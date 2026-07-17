(() => {
  const routeClasses = [
    'fb-route-chats',
    'fb-route-calls',
    'fb-route-timeline',
    'fb-route-meetings',
    'fb-route-contacts',
    'fb-route-mini-apps',
    'fb-route-integrations',
    'fb-route-profile',
    'fb-route-notifications',
    'fb-route-auth',
    'fb-route-user-profile',
  ];

  function applyRouteClass() {
    document.documentElement.classList.add('nexora-facebook-ui');

    if (!document.body) return;

    document.body.classList.add('nexora-facebook-ui');
    document.body.classList.remove(...routeClasses);

    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    let routeClass = '';

    if (path === '/chats' || path.startsWith('/chats/')) routeClass = 'fb-route-chats';
    else if (path === '/calls' || path.startsWith('/calls/')) routeClass = 'fb-route-calls';
    else if (path === '/timeline' || path.startsWith('/timeline/')) routeClass = 'fb-route-timeline';
    else if (path === '/meetings' || path.startsWith('/meetings/')) routeClass = 'fb-route-meetings';
    else if (path === '/contacts' || path.startsWith('/contacts/')) routeClass = 'fb-route-contacts';
    else if (path === '/mini-apps' || path.startsWith('/mini-apps/')) routeClass = 'fb-route-mini-apps';
    else if (path === '/integrations' || path.startsWith('/integrations/')) routeClass = 'fb-route-integrations';
    else if (path === '/profile') routeClass = 'fb-route-profile';
    else if (path.startsWith('/users/')) routeClass = 'fb-route-user-profile';
    else if (path === '/notifications' || path.startsWith('/notifications/')) routeClass = 'fb-route-notifications';
    else if (['/login', '/register', '/forgot-password'].includes(path)) routeClass = 'fb-route-auth';

    if (routeClass) document.body.classList.add(routeClass);
  }

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function patchedPushState(...args) {
    const result = originalPushState.apply(this, args);
    queueMicrotask(applyRouteClass);
    return result;
  };

  history.replaceState = function patchedReplaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    queueMicrotask(applyRouteClass);
    return result;
  };

  window.addEventListener('popstate', applyRouteClass);
  window.addEventListener('hashchange', applyRouteClass);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyRouteClass, { once: true });
  } else {
    applyRouteClass();
  }

  new MutationObserver(applyRouteClass).observe(document.documentElement, {
    childList: true,
    subtree: false,
  });
})();
