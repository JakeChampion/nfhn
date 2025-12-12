# File System Access API

## Overview

The File System Access API provides read and write access to the local file system. Users can save and open files directly, without server round-trips. This is ideal for exporting/importing saved stories and creating local archives.

**Browser Support:** Chrome 86+, Edge 86+ (Chromium-based browsers only; Safari and Firefox have limited/no support)

## Current State in NFHN

NFHN currently:
- Stores saved stories in `localStorage` via `app.js`
- Caches pages in Service Worker for offline access
- Uses IndexedDB for background sync pending actions
- Has no export/import functionality

## Proposed Implementation

### 1. Export Saved Stories

Allow users to export their saved stories to a JSON or HTML file:

#### JavaScript Implementation (`static/app.js`)

```javascript
// Export saved stories to JSON file
async function exportSavedStories() {
  const STORAGE_KEY = 'nfhn-saved-stories';
  const savedStories = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  
  // Convert to array for easier processing
  const storiesArray = Object.entries(savedStories).map(([id, data]) => ({
    id,
    ...data,
    exportedAt: new Date().toISOString()
  }));
  
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'nfhn',
    totalStories: storiesArray.length,
    stories: storiesArray
  };
  
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  
  // Check for File System Access API support
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: `nfhn-saved-stories-${Date.now()}.json`,
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] }
        }]
      });
      
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      announce('Stories exported successfully');
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        return false; // User cancelled
      }
      throw err;
    }
  } else {
    // Fallback: use download link
    fallbackDownload(blob, `nfhn-saved-stories-${Date.now()}.json`);
    return true;
  }
}

// Fallback download for unsupported browsers
function fallbackDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### 2. Export as HTML Archive

Create a self-contained HTML file for offline reading:

```javascript
async function exportAsHTMLArchive() {
  const STORAGE_KEY = 'nfhn-saved-stories';
  const savedStories = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NFHN Saved Stories Archive</title>
  <style>
    :root {
      --background: #f5f5f5;
      --text: #1f2937;
      --border: rgba(0,0,0,0.1);
      --accent: #ff6600;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --background: #0d1117;
        --text: #c9d1d9;
        --border: rgba(255,255,255,0.1);
      }
    }
    body {
      font-family: system-ui, sans-serif;
      background: var(--background);
      color: var(--text);
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      line-height: 1.6;
    }
    h1 { border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; }
    .story {
      padding: 1rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .story-title { font-size: 1.1rem; margin: 0 0 0.5rem; }
    .story-meta { font-size: 0.85rem; color: #666; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <h1>NFHN Saved Stories</h1>
  <p>Exported on ${new Date().toLocaleString()}</p>
  <p>Total stories: ${Object.keys(savedStories).length}</p>
  
  ${Object.entries(savedStories).map(([id, story]) => `
    <article class="story">
      <h2 class="story-title">
        <a href="${story.url || `https://news.ycombinator.com/item?id=${id}`}" target="_blank">
          ${escapeHtml(story.title || 'Untitled')}
        </a>
      </h2>
      <p class="story-meta">
        ${story.points || 0} points | 
        <a href="https://news.ycombinator.com/item?id=${id}" target="_blank">HN Discussion</a> |
        Saved: ${story.savedAt ? new Date(story.savedAt).toLocaleDateString() : 'Unknown'}
      </p>
    </article>
  `).join('')}
</body>
</html>
  `;
  
  const blob = new Blob([htmlContent], { type: 'text/html' });
  
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: `nfhn-archive-${Date.now()}.html`,
        types: [{
          description: 'HTML Files',
          accept: { 'text/html': ['.html'] }
        }]
      });
      
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      announce('Archive exported successfully');
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }
  } else {
    fallbackDownload(blob, `nfhn-archive-${Date.now()}.html`);
  }
}
```

### 3. Import Saved Stories

Allow importing previously exported stories:

```javascript
async function importSavedStories() {
  let fileHandle;
  let file;
  
  if ('showOpenFilePicker' in window) {
    try {
      [fileHandle] = await window.showOpenFilePicker({
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] }
        }],
        multiple: false
      });
      file = await fileHandle.getFile();
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
  } else {
    // Fallback: use file input
    file = await fallbackFilePicker();
    if (!file) return null;
  }
  
  const text = await file.text();
  
  try {
    const importData = JSON.parse(text);
    
    // Validate structure
    if (!importData.stories || !Array.isArray(importData.stories)) {
      throw new Error('Invalid file format');
    }
    
    // Get current saved stories
    const STORAGE_KEY = 'nfhn-saved-stories';
    const currentStories = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    
    // Merge (imported stories don't overwrite existing)
    let imported = 0;
    let skipped = 0;
    
    importData.stories.forEach(story => {
      if (!currentStories[story.id]) {
        currentStories[story.id] = {
          title: story.title,
          url: story.url,
          points: story.points,
          savedAt: story.savedAt || new Date().toISOString(),
          importedAt: new Date().toISOString()
        };
        imported++;
      } else {
        skipped++;
      }
    });
    
    // Save merged stories
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStories));
    
    announce(`Imported ${imported} stories. ${skipped} already existed.`);
    
    // Refresh the saved page if on it
    if (window.location.pathname === '/saved') {
      window.location.reload();
    }
    
    return { imported, skipped };
    
  } catch (err) {
    announce('Error: Invalid file format');
    throw new Error('Invalid file format: ' + err.message);
  }
}

// Fallback file picker using input element
function fallbackFilePicker() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = () => {
      resolve(input.files[0] || null);
    };
    
    input.click();
  });
}
```

### 4. Export Reader Content

Save reader mode articles to local files:

```javascript
async function exportReaderArticle(content, title, format = 'html') {
  let blob;
  let filename;
  let mimeType;
  
  if (format === 'html') {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 2rem auto; padding: 1rem; line-height: 1.8; }
    img { max-width: 100%; }
    pre { overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${content}
</body>
</html>
    `;
    blob = new Blob([html], { type: 'text/html' });
    filename = `${sanitizeFilename(title)}.html`;
    mimeType = { 'text/html': ['.html'] };
  } else if (format === 'markdown') {
    // Convert HTML to markdown (simplified)
    const markdown = htmlToMarkdown(content, title);
    blob = new Blob([markdown], { type: 'text/markdown' });
    filename = `${sanitizeFilename(title)}.md`;
    mimeType = { 'text/markdown': ['.md'] };
  } else if (format === 'txt') {
    const text = htmlToPlainText(content, title);
    blob = new Blob([text], { type: 'text/plain' });
    filename = `${sanitizeFilename(title)}.txt`;
    mimeType = { 'text/plain': ['.txt'] };
  }
  
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: `${format.toUpperCase()} Files`, accept: mimeType }]
      });
      
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
      return false;
    }
  } else {
    fallbackDownload(blob, filename);
    return true;
  }
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 100);
}

function htmlToPlainText(html, title) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return `${title}\n${'='.repeat(title.length)}\n\n${temp.textContent}`;
}

function htmlToMarkdown(html, title) {
  // Simplified HTML to Markdown conversion
  let md = `# ${title}\n\n`;
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  // Very basic conversion - real implementation would use a library
  temp.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
    const level = parseInt(h.tagName[1]);
    h.outerHTML = `${'#'.repeat(level)} ${h.textContent}\n\n`;
  });
  
  temp.querySelectorAll('p').forEach(p => {
    p.outerHTML = `${p.textContent}\n\n`;
  });
  
  temp.querySelectorAll('a').forEach(a => {
    a.outerHTML = `[${a.textContent}](${a.href})`;
  });
  
  md += temp.textContent;
  return md;
}
```

### 5. Origin Private File System (OPFS)

Use OPFS for larger local storage without user prompts:

```javascript
// Store article content in OPFS for offline reading
async function saveToOPFS(storyId, content) {
  const root = await navigator.storage.getDirectory();
  const articlesDir = await root.getDirectoryHandle('articles', { create: true });
  
  const fileHandle = await articlesDir.getFileHandle(`${storyId}.html`, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

// Read from OPFS
async function readFromOPFS(storyId) {
  try {
    const root = await navigator.storage.getDirectory();
    const articlesDir = await root.getDirectoryHandle('articles');
    const fileHandle = await articlesDir.getFileHandle(`${storyId}.html`);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (err) {
    return null; // File doesn't exist
  }
}

// List all saved articles
async function listOPFSArticles() {
  const root = await navigator.storage.getDirectory();
  const articlesDir = await root.getDirectoryHandle('articles', { create: true });
  
  const articles = [];
  for await (const [name, handle] of articlesDir) {
    if (handle.kind === 'file') {
      articles.push(name.replace('.html', ''));
    }
  }
  return articles;
}

// Delete from OPFS
async function deleteFromOPFS(storyId) {
  const root = await navigator.storage.getDirectory();
  const articlesDir = await root.getDirectoryHandle('articles');
  await articlesDir.removeEntry(`${storyId}.html`);
}
```

### 6. UI Components

Add export/import buttons to saved stories page:

```typescript
// In render/pages.ts - saved page
export const savedPage = () => html`
  <main>
    <div class="saved-header">
      <h1>Saved Stories</h1>
      <div class="saved-actions">
        <button id="export-json" class="btn-secondary">
          Export JSON
        </button>
        <button id="export-html" class="btn-secondary">
          Export Archive
        </button>
        <button id="import-stories" class="btn-secondary">
          Import
        </button>
      </div>
    </div>
    <div id="saved-stories-list">
      <!-- Rendered by JavaScript -->
    </div>
  </main>
`;
```

### 7. Event Handlers

```javascript
// Initialize export/import buttons
function initFileActions() {
  document.getElementById('export-json')?.addEventListener('click', async () => {
    try {
      await exportSavedStories();
    } catch (err) {
      console.error('Export failed:', err);
      announce('Export failed. Please try again.');
    }
  });
  
  document.getElementById('export-html')?.addEventListener('click', async () => {
    try {
      await exportAsHTMLArchive();
    } catch (err) {
      console.error('Export failed:', err);
      announce('Export failed. Please try again.');
    }
  });
  
  document.getElementById('import-stories')?.addEventListener('click', async () => {
    try {
      const result = await importSavedStories();
      if (result) {
        alert(`Imported ${result.imported} stories.\n${result.skipped} already existed.`);
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('Import failed: ' + err.message);
    }
  });
}
```

## CSS Styles

```css
/* Export/Import button styles */
.saved-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.saved-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--background-elevated);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.15s, border-color 0.15s;
}

.btn-secondary:hover {
  background: var(--badge-bg);
  border-color: var(--text-muted);
}

.btn-secondary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

## Files to Modify

1. **`static/app.js`** - Add all file system functions
2. **`static/styles.css`** - Add button styles
3. **`netlify/edge-functions/saved.ts`** - Update saved page template with buttons
4. **`netlify/edge-functions/reader.ts`** - Add export button to reader mode

## Progressive Enhancement

```javascript
// Feature detection
const supportsFilePicker = 'showSaveFilePicker' in window;
const supportsOPFS = 'storage' in navigator && 'getDirectory' in navigator.storage;

// Update UI based on support
function updateFileUI() {
  if (!supportsFilePicker) {
    // Buttons still work via fallback, but update text
    const exportBtn = document.getElementById('export-json');
    if (exportBtn) {
      exportBtn.title = 'Download as JSON file';
    }
  }
}
```

## Security Considerations

1. **User Consent** - File System Access API always requires user interaction
2. **Same-Origin** - Files can't access other origins
3. **Permission Lifetime** - Permissions don't persist across sessions by default
4. **Sanitization** - Always sanitize filenames and validate imports

## Benefits for NFHN

1. **Data Portability** - Users own their saved stories
2. **Backup/Restore** - Protection against localStorage limits/clearing
3. **Cross-Device** - Export from one device, import to another
4. **Archival** - Create permanent offline archives
5. **Integration** - Easy to import into other apps

## References

- [MDN: File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Chrome Developers: File System Access](https://developer.chrome.com/articles/file-system-access/)
- [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [WICG File System Access Spec](https://wicg.github.io/file-system-access/)
