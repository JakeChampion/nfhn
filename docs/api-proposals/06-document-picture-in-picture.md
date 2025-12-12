# Document Picture-in-Picture API

## Overview

The Document Picture-in-Picture API allows websites to open an always-on-top floating window that can contain arbitrary HTML content. Unlike the video-only Picture-in-Picture API, this can display any DOM content, making it perfect for a floating reader mode.

**Browser Support:** Chrome 116+ (experimental), Safari and Firefox not yet supported

## Current State in NFHN

NFHN has a robust reader mode (`/reader/`) that:
- Extracts article content using Readability.js
- Provides clean, focused reading experience
- Supports dark/light/sepia themes
- Estimates reading time

Currently, users must leave the HN feed to read articles.

## Proposed Implementation

### 1. Floating Reader Mode

Allow users to read articles in a PiP window while browsing HN:

#### JavaScript Implementation (`static/app.js`)

```javascript
// Document PiP for reader mode
async function openReaderPiP(articleUrl, articleTitle) {
  // Check for support
  if (!('documentPictureInPicture' in window)) {
    // Fallback: open in new tab
    window.open(`/reader/${encodeURIComponent(articleUrl)}`, '_blank');
    return;
  }

  try {
    // Open PiP window
    const pipWindow = await documentPictureInPicture.requestWindow({
      width: 400,
      height: 600,
      disallowReturnToOpener: false,
    });

    // Copy stylesheets to PiP window
    const styles = document.querySelectorAll('link[rel="stylesheet"], style');
    styles.forEach(style => {
      pipWindow.document.head.appendChild(style.cloneNode(true));
    });

    // Add PiP-specific styles
    const pipStyles = pipWindow.document.createElement('style');
    pipStyles.textContent = `
      body {
        margin: 0;
        padding: 1rem;
        font-family: system-ui, sans-serif;
        background: var(--background);
        color: var(--text-primary);
        overflow-y: auto;
      }
      
      .pip-header {
        position: sticky;
        top: 0;
        background: var(--background);
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .pip-title {
        font-size: 0.9rem;
        font-weight: 600;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }
      
      .pip-controls {
        display: flex;
        gap: 0.5rem;
      }
      
      .pip-button {
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        background: var(--background-elevated);
        cursor: pointer;
        font-size: 0.75rem;
      }
      
      .pip-content {
        font-size: 1rem;
        line-height: 1.7;
      }
      
      .pip-content img {
        max-width: 100%;
        height: auto;
      }
      
      .pip-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--text-muted);
      }
    `;
    pipWindow.document.head.appendChild(pipStyles);

    // Apply current theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'auto';
    pipWindow.document.documentElement.setAttribute('data-theme', currentTheme);

    // Create initial loading state
    pipWindow.document.body.innerHTML = `
      <div class="pip-header">
        <h1 class="pip-title">${escapeHtml(articleTitle)}</h1>
        <div class="pip-controls">
          <button class="pip-button" onclick="window.close()">✕</button>
        </div>
      </div>
      <div class="pip-content">
        <div class="pip-loading">Loading article...</div>
      </div>
    `;

    // Fetch article content
    const response = await fetch(`/reader/${encodeURIComponent(articleUrl)}`);
    const html = await response.text();
    
    // Parse and extract just the article content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const articleContent = doc.querySelector('.reader-content, article, main');
    
    if (articleContent) {
      pipWindow.document.querySelector('.pip-content').innerHTML = articleContent.innerHTML;
    } else {
      pipWindow.document.querySelector('.pip-content').innerHTML = 
        '<p>Unable to extract article content.</p>';
    }

    // Handle window close
    pipWindow.addEventListener('pagehide', () => {
      console.log('PiP window closed');
    });

  } catch (error) {
    console.error('Failed to open PiP:', error);
    // Fallback
    window.open(`/reader/${encodeURIComponent(articleUrl)}`, '_blank');
  }
}

// Helper function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

### 2. Add PiP Button to Story Items

```typescript
// In render/components.ts
export const storyItem = (story: Story, index: number) => html`
  <li class="story-item">
    <div class="story-content">
      <a href="${story.url}" class="story-title">${story.title}</a>
      <span class="story-domain">(${story.domain})</span>
    </div>
    <div class="story-actions">
      <button 
        class="pip-reader-btn"
        data-url="${story.url}"
        data-title="${story.title}"
        aria-label="Open in floating reader"
        title="Open in floating reader"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
          <path fill="currentColor" d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
        </svg>
      </button>
      <a href="/item/${story.id}" class="comments-link">
        ${story.comments} comments
      </a>
    </div>
  </li>
`;
```

### 3. Event Handler for PiP Buttons

```javascript
// In app.js
document.addEventListener('click', async (e) => {
  const pipBtn = e.target.closest('.pip-reader-btn');
  if (!pipBtn) return;
  
  e.preventDefault();
  
  const url = pipBtn.dataset.url;
  const title = pipBtn.dataset.title;
  
  await openReaderPiP(url, title);
});
```

### 4. Enhanced PiP Controls

Add controls within the PiP window for better UX:

```javascript
function createPiPControls(pipWindow, articleUrl) {
  return `
    <div class="pip-header">
      <h1 class="pip-title">${articleTitle}</h1>
      <div class="pip-controls">
        <button class="pip-button" id="pip-theme" title="Toggle theme">🌓</button>
        <button class="pip-button" id="pip-font-up" title="Increase font">A+</button>
        <button class="pip-button" id="pip-font-down" title="Decrease font">A-</button>
        <button class="pip-button" id="pip-open-full" title="Open full page">↗</button>
        <button class="pip-button" id="pip-close" title="Close">✕</button>
      </div>
    </div>
  `;
}

// Add event listeners in PiP window
function setupPiPControls(pipWindow, articleUrl) {
  const doc = pipWindow.document;
  
  // Theme toggle
  doc.getElementById('pip-theme')?.addEventListener('click', () => {
    const root = doc.documentElement;
    const current = root.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
  });
  
  // Font size controls
  let fontSize = 1;
  doc.getElementById('pip-font-up')?.addEventListener('click', () => {
    fontSize = Math.min(fontSize + 0.1, 1.5);
    doc.querySelector('.pip-content').style.fontSize = `${fontSize}rem`;
  });
  
  doc.getElementById('pip-font-down')?.addEventListener('click', () => {
    fontSize = Math.max(fontSize - 0.1, 0.8);
    doc.querySelector('.pip-content').style.fontSize = `${fontSize}rem`;
  });
  
  // Open full reader
  doc.getElementById('pip-open-full')?.addEventListener('click', () => {
    window.open(`/reader/${encodeURIComponent(articleUrl)}`, '_blank');
    pipWindow.close();
  });
  
  // Close
  doc.getElementById('pip-close')?.addEventListener('click', () => {
    pipWindow.close();
  });
}
```

### 5. Multiple PiP Windows (Reading Queue)

Allow opening multiple articles:

```javascript
// Track open PiP windows
const pipWindows = new Map();

async function openReaderPiP(articleUrl, articleTitle) {
  // Check if already open
  if (pipWindows.has(articleUrl)) {
    pipWindows.get(articleUrl).focus();
    return;
  }

  const pipWindow = await documentPictureInPicture.requestWindow({
    width: 400,
    height: 600,
  });
  
  pipWindows.set(articleUrl, pipWindow);
  
  pipWindow.addEventListener('pagehide', () => {
    pipWindows.delete(articleUrl);
  });
  
  // ... rest of setup
}

// Close all PiP windows
function closeAllPiP() {
  pipWindows.forEach(win => win.close());
  pipWindows.clear();
}
```

### 6. Comment Thread in PiP

View comments in floating window:

```javascript
async function openCommentsPiP(itemId, title) {
  if (!('documentPictureInPicture' in window)) {
    window.open(`/item/${itemId}`, '_blank');
    return;
  }

  const pipWindow = await documentPictureInPicture.requestWindow({
    width: 450,
    height: 700,
  });

  // Setup styles...

  // Fetch comments
  const response = await fetch(`/item/${itemId}`);
  const html = await response.text();
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const comments = doc.querySelector('.comments-section');
  
  pipWindow.document.body.innerHTML = `
    <div class="pip-header">
      <h1 class="pip-title">${title} - Comments</h1>
      <button class="pip-button" onclick="window.close()">✕</button>
    </div>
    <div class="pip-content comments-pip">
      ${comments ? comments.innerHTML : '<p>No comments</p>'}
    </div>
  `;
}
```

### 7. Side-by-Side: Article + Comments

Open both article and comments:

```javascript
async function openSplitView(articleUrl, itemId, title) {
  // Open article PiP on left
  const articlePip = await documentPictureInPicture.requestWindow({
    width: 400,
    height: 600,
  });
  
  // Position on left side of screen
  // Note: positioning is limited in PiP API
  
  // Setup article content...
  
  // Open comments PiP on right
  const commentsPip = await documentPictureInPicture.requestWindow({
    width: 400,
    height: 600,
  });
  
  // Setup comments content...
}
```

### 8. PiP Feature Detection and UI

```javascript
// Feature detection
const supportsPiP = 'documentPictureInPicture' in window;

// Conditionally render PiP buttons
function initPiPButtons() {
  if (!supportsPiP) {
    // Hide or repurpose PiP buttons
    document.querySelectorAll('.pip-reader-btn').forEach(btn => {
      btn.title = 'Open in new tab';
      btn.setAttribute('aria-label', 'Open in new tab');
    });
  }
}
```

## CSS Styles for PiP Buttons

```css
/* PiP button styling */
.pip-reader-btn {
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

.pip-reader-btn:hover {
  background: var(--badge-bg);
  color: var(--text-primary);
}

.pip-reader-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Hide if not supported (JS will handle) */
.no-pip .pip-reader-btn {
  display: none;
}
```

## Files to Modify

1. **`static/app.js`** - Add PiP functionality and event handlers
2. **`static/styles.css`** - Add PiP button styles
3. **`netlify/edge-functions/lib/render/components.ts`** - Add PiP button to story items
4. **`netlify/edge-functions/reader.ts`** - Ensure reader content is extractable

## Accessibility Considerations

1. **Keyboard Navigation** - PiP windows should be fully keyboard accessible
2. **Screen Reader Announcements** - Announce when PiP opens/closes
3. **Focus Management** - Return focus appropriately when PiP closes
4. **Reduced Motion** - Respect user preferences in PiP animations

```javascript
// Announce PiP state changes
function announcePiP(message) {
  const liveRegion = document.getElementById('aria-live');
  if (liveRegion) {
    liveRegion.textContent = message;
  }
}

// Usage
await openReaderPiP(url, title);
announcePiP(`Opened ${title} in floating reader`);
```

## Benefits for NFHN

1. **Multitasking** - Read articles while browsing HN
2. **Context Retention** - Keep feed visible while reading
3. **Distraction-Free** - Floating window focuses on content
4. **Always On Top** - PiP stays visible over other windows
5. **Productivity** - Queue multiple articles for reading

## Limitations

- Browser support limited to Chromium browsers
- Can only have one PiP window in some implementations
- Styling must be re-applied to PiP window
- Limited control over window position

## References

- [MDN: Document Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API)
- [Chrome Developers: Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture/)
- [W3C Specification](https://wicg.github.io/document-picture-in-picture/)
