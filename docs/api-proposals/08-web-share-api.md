# Web Share API (Level 2)

## Status: ✅ IMPLEMENTED

**Implementation Date:** Pre-existing (before Phase 2)

## Overview

The Web Share API allows websites to share text, URLs, and files to other apps installed on the user's device using the native share dialog. Level 2 adds support for sharing files (images, documents, etc.).

**Browser Support:** Baseline (Chrome 89+, Safari 15+, Firefox 71+ - with varying Level 2 file support)

## Implementation Summary

The Web Share API was already implemented in NFHN with the following features:

### Features Implemented
1. **Share buttons** on all stories (visible only when Web Share API is available)
2. **Feature detection** - adds `can-share` or `no-share` class to `<html>` element
3. **Progressive enhancement** - buttons hidden by default, shown via CSS when supported
4. **Graceful error handling** - AbortError (user cancel) handled silently

### Location in Codebase
- Component: `netlify/edge-functions/lib/render/components.ts` (`shareButton()`)
- JavaScript: `static/app.js` (Web Share API section)
- CSS: `static/styles.css` (Share button styles section)

### How It Works
1. On page load, JavaScript checks `navigator.share` support
2. Adds `can-share` class to `<html>` if supported
3. CSS shows `.share-btn` elements only inside `.can-share`
4. Click handler uses `navigator.share()` with title and URL from data attributes

---

## Original Proposal

### 1. Basic Story Sharing

Add share buttons to stories:

#### JavaScript Implementation (`static/app.js`)

```javascript
// Check Web Share API support
const canShare = 'share' in navigator;
const canShareFiles = 'canShare' in navigator;

// Share a story
async function shareStory(story) {
  const shareData = {
    title: story.title,
    text: `${story.title} (${story.points} points)`,
    url: story.url || `https://nfhn.netlify.app/item/${story.id}`
  };
  
  if (!canShare) {
    fallbackShare(shareData);
    return;
  }
  
  try {
    await navigator.share(shareData);
    announce('Story shared successfully');
  } catch (err) {
    if (err.name === 'AbortError') {
      // User cancelled - that's fine
      return;
    }
    console.error('Share failed:', err);
    fallbackShare(shareData);
  }
}

// Fallback for browsers without Web Share
function fallbackShare(shareData) {
  // Copy to clipboard as fallback
  const text = `${shareData.title}\n${shareData.url}`;
  
  navigator.clipboard.writeText(text).then(() => {
    announce('Link copied to clipboard');
  }).catch(() => {
    // Show manual copy dialog
    prompt('Copy this link:', shareData.url);
  });
}
```

### 2. Share Button Component

```typescript
// In render/components.ts
export const shareButton = (story: Story) => html`
  <button 
    class="share-btn"
    data-story-id="${story.id}"
    data-story-title="${escapeHtml(story.title)}"
    data-story-url="${story.url || ''}"
    data-story-points="${story.points}"
    aria-label="Share this story"
    title="Share"
  >
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
      <path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
    </svg>
  </button>
`;
```

### 3. Share Reader Mode Content

Share article content with a generated image preview:

```javascript
// Share reader mode article
async function shareReaderArticle(article) {
  const shareData = {
    title: article.title,
    text: `${article.title}\n\nRead on NFHN Reader`,
    url: `https://nfhn.netlify.app/reader/${encodeURIComponent(article.originalUrl)}`
  };
  
  // Check if we can share files (for image preview)
  if (canShareFiles) {
    try {
      // Generate preview image
      const previewImage = await generateArticlePreview(article);
      
      const fileShareData = {
        ...shareData,
        files: [previewImage]
      };
      
      // Verify browser can share these files
      if (navigator.canShare(fileShareData)) {
        await navigator.share(fileShareData);
        return;
      }
    } catch (err) {
      console.log('File sharing not supported, falling back to URL share');
    }
  }
  
  // Fall back to URL-only share
  await navigator.share(shareData);
}

// Generate article preview image using Canvas
async function generateArticlePreview(article) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630; // Standard OG image size
  
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Brand bar
  ctx.fillStyle = '#ff6600';
  ctx.fillRect(0, 0, canvas.width, 8);
  
  // Title
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 48px system-ui, sans-serif';
  
  // Word wrap title
  const words = article.title.split(' ');
  let line = '';
  let y = 100;
  const maxWidth = canvas.width - 100;
  
  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line, 50, y);
      line = word + ' ';
      y += 60;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 50, y);
  
  // Domain
  ctx.fillStyle = '#6b7280';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText(article.domain || 'nfhn.netlify.app', 50, y + 80);
  
  // Reading time
  ctx.fillText(`${article.readingTime} min read`, 50, y + 120);
  
  // NFHN branding
  ctx.fillStyle = '#ff6600';
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillText('NFHN', canvas.width - 150, canvas.height - 50);
  
  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob], 'preview.png', { type: 'image/png' }));
    }, 'image/png');
  });
}
```

### 4. Share HN Discussion

Share link to HN comments:

```javascript
async function shareHNDiscussion(item) {
  const shareData = {
    title: `Discussion: ${item.title}`,
    text: `${item.comments} comments on "${item.title}"`,
    url: `https://news.ycombinator.com/item?id=${item.id}`
  };
  
  if (canShare) {
    await navigator.share(shareData);
  } else {
    fallbackShare(shareData);
  }
}
```

### 5. Share Saved Stories Collection

Share multiple saved stories as a list:

```javascript
async function shareSavedCollection() {
  const STORAGE_KEY = 'nfhn-saved-stories';
  const savedStories = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  
  const storiesArray = Object.entries(savedStories);
  
  if (storiesArray.length === 0) {
    announce('No saved stories to share');
    return;
  }
  
  const listText = storiesArray
    .map(([id, story], index) => `${index + 1}. ${story.title}\n   ${story.url || `https://news.ycombinator.com/item?id=${id}`}`)
    .join('\n\n');
  
  const shareData = {
    title: 'My Saved Stories from NFHN',
    text: `My reading list (${storiesArray.length} stories):\n\n${listText}`,
  };
  
  if (canShare) {
    await navigator.share(shareData);
  } else {
    fallbackShare(shareData);
  }
}
```

### 6. Share as Text File (Level 2)

Share saved stories as a downloadable text file:

```javascript
async function shareAsFile() {
  const STORAGE_KEY = 'nfhn-saved-stories';
  const savedStories = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  
  const content = Object.entries(savedStories)
    .map(([id, story]) => `${story.title}\n${story.url || `https://news.ycombinator.com/item?id=${id}`}\n`)
    .join('\n');
  
  const file = new File(
    [content],
    'saved-stories.txt',
    { type: 'text/plain' }
  );
  
  const shareData = {
    title: 'My Saved Stories',
    files: [file]
  };
  
  if (canShareFiles && navigator.canShare(shareData)) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('File share failed:', err);
      }
    }
  } else {
    // Fallback to download
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'saved-stories.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

### 7. Context-Aware Share Menu

Show different share options based on context:

```javascript
async function showShareMenu(element, options) {
  const menu = document.getElementById('share-menu');
  
  // Position menu near element (use Anchor Positioning if available)
  // ... positioning code ...
  
  // Populate menu based on options
  menu.innerHTML = `
    <button data-action="share-url">Share Link</button>
    ${options.hasComments ? '<button data-action="share-discussion">Share Discussion</button>' : ''}
    ${options.hasContent ? '<button data-action="share-with-preview">Share with Preview</button>' : ''}
    <button data-action="copy-link">Copy Link</button>
  `;
  
  menu.showPopover();
  
  // Handle clicks
  menu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    menu.hidePopover();
    
    switch (action) {
      case 'share-url':
        await shareStory(options.story);
        break;
      case 'share-discussion':
        await shareHNDiscussion(options.story);
        break;
      case 'share-with-preview':
        await shareReaderArticle(options.article);
        break;
      case 'copy-link':
        await copyToClipboard(options.story.url);
        break;
    }
  }, { once: true });
}
```

### 8. Share Target Registration (PWA)

Register NFHN as a share target so other apps can share to it:

```json
// In manifest.json
{
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

```typescript
// In edge function: share-target.ts
export default async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.redirect('/');
  }
  
  const formData = await req.formData();
  const title = formData.get('title') as string;
  const text = formData.get('text') as string;
  const url = formData.get('url') as string;
  
  // Extract URL from shared content
  const sharedUrl = url || extractUrlFromText(text);
  
  if (sharedUrl) {
    // Redirect to reader mode
    return Response.redirect(`/reader/${encodeURIComponent(sharedUrl)}`);
  }
  
  // No URL found, show error or search
  return Response.redirect(`/?shared=${encodeURIComponent(text || title || '')}`);
};

function extractUrlFromText(text: string): string | null {
  const urlRegex = /https?:\/\/[^\s]+/;
  const match = text?.match(urlRegex);
  return match ? match[0] : null;
}
```

### 9. Event Handlers

```javascript
// Initialize share buttons
function initShareButtons() {
  document.addEventListener('click', async (e) => {
    const shareBtn = e.target.closest('.share-btn');
    if (!shareBtn) return;
    
    e.preventDefault();
    
    const story = {
      id: shareBtn.dataset.storyId,
      title: shareBtn.dataset.storyTitle,
      url: shareBtn.dataset.storyUrl,
      points: shareBtn.dataset.storyPoints
    };
    
    await shareStory(story);
  });
}

// Reader mode share
function initReaderShare() {
  const readerShareBtn = document.getElementById('reader-share');
  if (!readerShareBtn) return;
  
  readerShareBtn.addEventListener('click', async () => {
    const article = {
      title: document.querySelector('.reader-title')?.textContent,
      originalUrl: document.querySelector('.reader-source')?.href,
      domain: document.querySelector('.reader-domain')?.textContent,
      readingTime: document.querySelector('.reading-time')?.textContent
    };
    
    await shareReaderArticle(article);
  });
}
```

## CSS Styles

```css
/* Share button styling */
.share-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s, color 0.15s;
}

.share-btn:hover {
  background: var(--badge-bg);
  color: var(--text-primary);
}

.share-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Share menu popover */
#share-menu {
  padding: 0.5rem 0;
  min-width: 180px;
  background: var(--background-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

#share-menu button {
  display: block;
  width: 100%;
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
}

#share-menu button:hover {
  background: var(--badge-bg);
}
```

## Files to Modify

1. **`static/app.js`** - Add share functions and event handlers
2. **`static/styles.css`** - Add share UI styles
3. **`netlify/edge-functions/lib/render/components.ts`** - Add share button component
4. **`static/manifest.json`** - Add share_target configuration
5. **`netlify/edge-functions/share-target.ts`** - New edge function for share target
6. **`netlify.toml`** - Add share-target route

## Progressive Enhancement

```javascript
// Feature detection and UI updates
function initShare() {
  const shareBtns = document.querySelectorAll('.share-btn');
  
  if (!canShare) {
    // Update button labels for fallback behavior
    shareBtns.forEach(btn => {
      btn.title = 'Copy link';
      btn.setAttribute('aria-label', 'Copy link to clipboard');
    });
  }
  
  // Hide file-share options if not supported
  if (!canShareFiles) {
    document.querySelectorAll('[data-requires-file-share]').forEach(el => {
      el.style.display = 'none';
    });
  }
}
```

## Benefits for NFHN

1. **Native Experience** - Uses OS share dialog
2. **App Integration** - Share to any installed app
3. **Frictionless** - One tap to share
4. **Rich Sharing** - Include images and files
5. **Bidirectional** - Can receive shares as a PWA

## Security Considerations

1. **User Gesture Required** - Can only call from user interaction
2. **HTTPS Required** - Only works on secure contexts
3. **Content Validation** - Validate incoming share target data

## References

- [MDN: Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)
- [Chrome Developers: Web Share](https://developer.chrome.com/articles/web-share/)
- [Web Share Target API](https://developer.chrome.com/articles/web-share-target/)
- [W3C Web Share Specification](https://w3c.github.io/web-share/)
