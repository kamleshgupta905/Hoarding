/**
 * 🚫 Casual-inspection deterrent for internal screens only.
 *
 * IMPORTANT: this is NOT a security control. Blocking F12 / right-click cannot
 * stop anyone determined (the browser menu, `view-source:`, devtools opened
 * before navigating, or simply fetching the JS bundle all still work). Real
 * protection lives in the Apps Script backend session checks.
 *
 * It is therefore scoped to /admin and /staff routes only. On public pages it
 * stays off, because blocking right-click there stops genuine customers from
 * saving a hoarding photo or copying a site address.
 */

const PROTECTED_PATH_PREFIXES = ['/admin', '/staff'];

const isProtectedRoute = () => {
    if (typeof window === 'undefined') return false;

    // Staff mode can be reached via query flag or the Capacitor shell as well
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('mode') === 'staff' || params.get('app') === 'staff') return true;
    if (window.isStaffApp || window.Capacitor?.isNativePlatform?.()) return true;

    // Electron builds use hash routing (#/admin/dashboard)
    const path = window.location.hash?.startsWith('#/')
        ? window.location.hash.slice(1)
        : window.location.pathname;

    return PROTECTED_PATH_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    );
};

const handleContextMenu = (e) => {
    if (isProtectedRoute()) e.preventDefault();
};

const handleKeyDown = (e) => {
    if (!isProtectedRoute()) return;

    // F12
    if (e.key === 'F12') {
        e.preventDefault();
        return;
    }

    // Ctrl+Shift+I / J / C (DevTools, Console, Inspect Element)
    if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
        e.preventDefault();
        return;
    }

    // Ctrl+U (View Source)
    if (e.ctrlKey && e.key.toUpperCase() === 'U') {
        e.preventDefault();
    }
};

export const disableInspect = () => {
    if (typeof document === 'undefined') return;

    // Listeners are route-aware, so they stay harmless on public pages.
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
};
