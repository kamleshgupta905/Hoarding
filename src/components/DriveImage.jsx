import React from 'react';

/**
 * 🖼️ Resilient <img> for Google Drive hosted photos.
 *
 * Drive serves the same file from several hosts, and any one of them can fail
 * for a given file depending on how it was shared, whether Google has finished
 * generating a thumbnail, or transient rate limiting. A single URL is therefore
 * unreliable — this component walks through every known format before giving up:
 *
 *   1. the URL as given
 *   2. drive.google.com/thumbnail?id=...   (most reliable for shared files)
 *   3. drive.google.com/uc?export=view&id=...
 *   4. lh3.googleusercontent.com/d/...     (direct CDN)
 *   5. one delayed retry for transient network errors
 *   6. a placeholder, so the layout never collapses into a broken-image icon
 *
 * referrerPolicy="no-referrer" matters: without it Drive rejects hotlinked
 * requests from a different origin and returns 403.
 */

const extractDriveFileId = (url = '') => {
  const match =
    url.match(/lh3\.googleusercontent\.com\/d\/([^/?#\s]+)/) ||
    url.match(/\/file\/d\/([^/?#\s]+)/) ||
    url.match(/[?&]id=([^&#/\s]+)/) ||
    url.match(/drive\.google\.com\/thumbnail\?[^#]*\bid=([^&#/\s]+)/);
  return match && match[1] ? match[1] : null;
};

const PLACEHOLDER = 'https://placehold.co/600x400?text=Photo+Unavailable';

export default function DriveImage({
  src,
  alt = '',
  thumbnailSize = 'w600',
  placeholder = PLACEHOLDER,
  onFinalError,
  ...imgProps
}) {
  const imgRef = React.useRef(null);

  // The fallback chain records its progress on the DOM node's dataset, and we
  // mutate el.src directly (React does not re-render on that). So when the
  // `src` prop changes we must clear both, otherwise the new image inherits the
  // previous one's "already tried everything" state and jumps to the placeholder.
  React.useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    delete el.dataset.triedThumb;
    delete el.dataset.triedView;
    delete el.dataset.triedLh3;
    delete el.dataset.retriedOnce;
    delete el.dataset.usedPlaceholder;
    if (src) el.src = src;
  }, [src]);

  const handleError = (event) => {
    const el = event.target;
    const currentSrc = el.src || '';
    const fileId = extractDriveFileId(currentSrc) || extractDriveFileId(src || '');

    // 1. Drive thumbnail endpoint
    if (fileId && !el.dataset.triedThumb) {
      el.dataset.triedThumb = 'true';
      el.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=${thumbnailSize}`;
      return;
    }

    // 2. Drive direct view endpoint
    if (fileId && !el.dataset.triedView) {
      el.dataset.triedView = 'true';
      el.src = `https://drive.google.com/uc?export=view&id=${fileId}`;
      return;
    }

    // 3. Google user-content CDN
    if (fileId && !el.dataset.triedLh3) {
      el.dataset.triedLh3 = 'true';
      el.src = `https://lh3.googleusercontent.com/d/${fileId}`;
      return;
    }

    // 4. One delayed retry for transient failures / rate limiting
    if (!el.dataset.retriedOnce) {
      el.dataset.retriedOnce = 'true';
      const retryUrl = currentSrc;
      setTimeout(() => {
        el.src = retryUrl.includes('?')
          ? `${retryUrl}&_r=${Date.now()}`
          : `${retryUrl}?_r=${Date.now()}`;
      }, 1200);
      return;
    }

    // 5. Give up — show a placeholder rather than a broken image icon
    if (!el.dataset.usedPlaceholder) {
      el.dataset.usedPlaceholder = 'true';
      el.src = placeholder;
      if (typeof onFinalError === 'function') onFinalError(event);
    }
  };

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={handleError}
      {...imgProps}
    />
  );
}
