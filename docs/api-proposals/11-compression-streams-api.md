# Compression Streams API

## Overview

The Compression Streams API provides a way to compress and decompress data using gzip and deflate formats directly in JavaScript. This enables efficient storage and transfer of data without server-side processing.

**Browser Support:** Baseline 2023 (Chrome 80+, Safari 16.4+, Firefox 113+)

## Current State in NFHN

NFHN currently:
- Stores saved stories as JSON in `localStorage`
- Caches pages in Service Worker without compression
- Uses IndexedDB for background sync
- No compression of stored data

## Proposed Implementation

### 1. Compress Saved Stories

Reduce localStorage usage by compressing saved stories:

```javascript
// Compression utilities
async function compressData(data) {
  const jsonString = JSON.stringify(data);
  const encoder = new TextEncoder();
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(jsonString));
      controller.close();
    }
  });
  
  const compressedStream = inputStream.pipeThrough(
    new CompressionStream('gzip')
  );
  
  const chunks = [];
  const reader = compressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Combine chunks into single Uint8Array
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

async function decompressData(compressedData) {
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressedData);
      controller.close();
    }
  });
  
  const decompressedStream = inputStream.pipeThrough(
    new DecompressionStream('gzip')
  );
  
  const decoder = new TextDecoder();
  const reader = decompressedStream.getReader();
  let result = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  
  return JSON.parse(result);
}
```

### 2. Compressed LocalStorage Wrapper

```javascript
// Compressed storage wrapper
const CompressedStorage = {
  async setItem(key, value) {
    const compressed = await compressData(value);
    // Convert to base64 for localStorage compatibility
    const base64 = btoa(String.fromCharCode(...compressed));
    localStorage.setItem(key, base64);
    
    // Log compression ratio
    const originalSize = JSON.stringify(value).length;
    const compressedSize = base64.length;
    console.log(`Compression: ${originalSize} → ${compressedSize} (${Math.round(compressedSize/originalSize*100)}%)`);
  },
  
  async getItem(key) {
    const base64 = localStorage.getItem(key);
    if (!base64) return null;
    
    // Convert from base64
    const binary = atob(base64);
    const compressed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      compressed[i] = binary.charCodeAt(i);
    }
    
    return await decompressData(compressed);
  },
  
  removeItem(key) {
    localStorage.removeItem(key);
  }
};

// Usage
const STORAGE_KEY = 'nfhn-saved-stories-compressed';

async function saveSavedStories(stories) {
  await CompressedStorage.setItem(STORAGE_KEY, stories);
}

async function loadSavedStories() {
  return await CompressedStorage.getItem(STORAGE_KEY) || {};
}
```

### 3. Compress Cached Reader Content

Store compressed article content in IndexedDB:

```javascript
// IndexedDB with compression
const ArticleCache = {
  dbName: 'nfhn-articles',
  storeName: 'articles',
  
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'url' });
        }
      };
    });
  },
  
  async saveArticle(url, content, metadata) {
    const db = await this.open();
    
    // Compress the content
    const compressed = await compressData({
      content,
      metadata,
      cachedAt: Date.now()
    });
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.put({
        url,
        compressed: compressed,
        originalSize: content.length,
        compressedSize: compressed.length
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  async getArticle(url) {
    const db = await this.open();
    
    return new Promise(async (resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(url);
      
      request.onsuccess = async () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        
        // Decompress
        const data = await decompressData(request.result.compressed);
        resolve(data);
      };
      
      request.onerror = () => reject(request.error);
    });
  },
  
  async getCacheStats() {
    const db = await this.open();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const articles = request.result;
        const stats = {
          count: articles.length,
          totalOriginal: articles.reduce((acc, a) => acc + a.originalSize, 0),
          totalCompressed: articles.reduce((acc, a) => acc + a.compressedSize, 0),
        };
        stats.ratio = stats.totalCompressed / stats.totalOriginal;
        stats.saved = stats.totalOriginal - stats.totalCompressed;
        resolve(stats);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
};
```

### 4. Service Worker Compression

Compress responses before caching:

```javascript
// In sw.js
async function compressResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  
  // Only compress text-based content
  if (!contentType.includes('text/') && 
      !contentType.includes('application/json') &&
      !contentType.includes('application/javascript')) {
    return response;
  }
  
  const body = await response.text();
  const compressed = await compressData({ body });
  
  return new Response(compressed, {
    headers: {
      ...Object.fromEntries(response.headers),
      'X-Compressed': 'gzip',
      'X-Original-Size': body.length.toString()
    }
  });
}

async function decompressResponse(response) {
  if (response.headers.get('X-Compressed') !== 'gzip') {
    return response;
  }
  
  const compressed = new Uint8Array(await response.arrayBuffer());
  const data = await decompressData(compressed);
  
  return new Response(data.body, {
    headers: {
      ...Object.fromEntries(response.headers),
      'content-type': 'text/html',
    }
  });
}

// Use in fetch handler
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) {
        return await decompressResponse(cached);
      }
      
      const response = await fetch(event.request);
      
      if (response.ok) {
        const compressed = await compressResponse(response.clone());
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, compressed);
      }
      
      return response;
    })
  );
});
```

### 5. Export Compressed Archives

Create compressed exports of saved content:

```javascript
async function exportCompressedArchive() {
  const savedStories = await loadSavedStories();
  const cachedArticles = await ArticleCache.getAll();
  
  const archive = {
    version: 1,
    exportedAt: new Date().toISOString(),
    stories: savedStories,
    articles: cachedArticles
  };
  
  // Compress the archive
  const compressed = await compressData(archive);
  
  // Create downloadable blob
  const blob = new Blob([compressed], { type: 'application/gzip' });
  
  if ('showSaveFilePicker' in window) {
    const handle = await window.showSaveFilePicker({
      suggestedName: `nfhn-archive-${Date.now()}.gz`,
      types: [{ accept: { 'application/gzip': ['.gz'] } }]
    });
    
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } else {
    // Fallback download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfhn-archive-${Date.now()}.gz`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

async function importCompressedArchive(file) {
  const buffer = await file.arrayBuffer();
  const compressed = new Uint8Array(buffer);
  
  const archive = await decompressData(compressed);
  
  // Validate and import
  if (archive.version !== 1) {
    throw new Error('Unsupported archive version');
  }
  
  // Import stories
  const currentStories = await loadSavedStories();
  const mergedStories = { ...currentStories, ...archive.stories };
  await saveSavedStories(mergedStories);
  
  // Import articles
  for (const [url, article] of Object.entries(archive.articles)) {
    await ArticleCache.saveArticle(url, article.content, article.metadata);
  }
  
  return {
    storiesImported: Object.keys(archive.stories).length,
    articlesImported: Object.keys(archive.articles).length
  };
}
```

### 6. Streaming Compression

For large data, use streaming compression:

```javascript
async function compressLargeData(data, onProgress) {
  const jsonString = JSON.stringify(data);
  const encoder = new TextEncoder();
  const chunkSize = 64 * 1024; // 64KB chunks
  
  const inputStream = new ReadableStream({
    start(controller) {
      let offset = 0;
      
      function pushChunk() {
        if (offset >= jsonString.length) {
          controller.close();
          return;
        }
        
        const chunk = jsonString.slice(offset, offset + chunkSize);
        controller.enqueue(encoder.encode(chunk));
        offset += chunkSize;
        
        if (onProgress) {
          onProgress(offset / jsonString.length);
        }
      }
      
      // Push chunks asynchronously
      const interval = setInterval(() => {
        pushChunk();
        if (offset >= jsonString.length) {
          clearInterval(interval);
        }
      }, 0);
    }
  });
  
  const compressedStream = inputStream.pipeThrough(
    new CompressionStream('gzip')
  );
  
  // Collect compressed output
  const chunks = [];
  const reader = compressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  return concatenateUint8Arrays(chunks);
}

function concatenateUint8Arrays(arrays) {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  
  return result;
}
```

### 7. Storage Quota Management

Monitor and manage storage with compression stats:

```javascript
async function getStorageStats() {
  const estimate = await navigator.storage.estimate();
  const cacheStats = await ArticleCache.getCacheStats();
  
  return {
    quota: estimate.quota,
    usage: estimate.usage,
    usagePercent: (estimate.usage / estimate.quota * 100).toFixed(2),
    articles: {
      count: cacheStats.count,
      originalSize: formatBytes(cacheStats.totalOriginal),
      compressedSize: formatBytes(cacheStats.totalCompressed),
      saved: formatBytes(cacheStats.saved),
      ratio: (cacheStats.ratio * 100).toFixed(1) + '%'
    }
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Display in settings
async function showStorageInfo() {
  const stats = await getStorageStats();
  
  return `
    <div class="storage-stats">
      <h3>Storage Usage</h3>
      <p>Using ${formatBytes(stats.usage)} of ${formatBytes(stats.quota)} (${stats.usagePercent}%)</p>
      
      <h4>Cached Articles</h4>
      <ul>
        <li>Articles cached: ${stats.articles.count}</li>
        <li>Original size: ${stats.articles.originalSize}</li>
        <li>Compressed size: ${stats.articles.compressedSize}</li>
        <li>Space saved: ${stats.articles.saved} (${stats.articles.ratio})</li>
      </ul>
    </div>
  `;
}
```

### 8. Deflate vs GZIP Selection

Choose compression based on use case:

```javascript
// GZIP for archives (better compression)
async function compressForStorage(data) {
  return compressWithAlgorithm(data, 'gzip');
}

// Deflate for real-time (faster)
async function compressForTransfer(data) {
  return compressWithAlgorithm(data, 'deflate');
}

async function compressWithAlgorithm(data, algorithm) {
  const jsonString = JSON.stringify(data);
  const encoder = new TextEncoder();
  
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(jsonString));
      controller.close();
    }
  });
  
  const compressedStream = inputStream.pipeThrough(
    new CompressionStream(algorithm)
  );
  
  return new Response(compressedStream).arrayBuffer()
    .then(buffer => new Uint8Array(buffer));
}
```

### 9. Migration from Uncompressed Storage

Migrate existing localStorage data:

```javascript
async function migrateToCompressedStorage() {
  const OLD_KEY = 'nfhn-saved-stories';
  const NEW_KEY = 'nfhn-saved-stories-compressed';
  
  // Check if migration needed
  const oldData = localStorage.getItem(OLD_KEY);
  const newData = localStorage.getItem(NEW_KEY);
  
  if (!oldData || newData) {
    return { migrated: false };
  }
  
  try {
    const stories = JSON.parse(oldData);
    
    // Compress and save
    await CompressedStorage.setItem(NEW_KEY, stories);
    
    // Verify
    const verified = await CompressedStorage.getItem(NEW_KEY);
    if (JSON.stringify(verified) !== JSON.stringify(stories)) {
      throw new Error('Verification failed');
    }
    
    // Remove old data
    localStorage.removeItem(OLD_KEY);
    
    return {
      migrated: true,
      originalSize: oldData.length,
      compressedSize: localStorage.getItem(NEW_KEY).length
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return { migrated: false, error };
  }
}

// Run on app init
migrateToCompressedStorage().then(result => {
  if (result.migrated) {
    console.log(`Migrated storage: ${result.originalSize} → ${result.compressedSize}`);
  }
});
```

## Files to Modify

1. **`static/app.js`** - Add compression utilities and storage wrapper
2. **`static/sw.js`** - Add compressed caching
3. **`netlify/edge-functions/saved.ts`** - Update to use compressed storage
4. **`netlify/edge-functions/reader.ts`** - Compress cached articles

## Performance Comparison

| Data Type | Original | Compressed | Ratio |
|-----------|----------|------------|-------|
| 100 saved stories | ~50 KB | ~8 KB | 84% reduction |
| 10 cached articles | ~500 KB | ~150 KB | 70% reduction |
| Full archive | ~2 MB | ~400 KB | 80% reduction |

## Browser Support Fallback

```javascript
// Feature detection
const supportsCompression = 'CompressionStream' in window;

async function saveData(key, data) {
  if (supportsCompression) {
    await CompressedStorage.setItem(key, data);
  } else {
    // Fallback to uncompressed
    localStorage.setItem(key, JSON.stringify(data));
  }
}

async function loadData(key) {
  if (supportsCompression && localStorage.getItem(key + '-compressed')) {
    return await CompressedStorage.getItem(key);
  } else {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  }
}
```

## Benefits for NFHN

1. **More Storage** - Fit 3-5x more saved stories in localStorage
2. **Faster Sync** - Smaller data transfers for background sync
3. **Efficient Archives** - Compact export files
4. **Better Offline** - Cache more content for offline use
5. **Reduced Quota Usage** - Stay within storage limits

## References

- [MDN: Compression Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API)
- [Chrome Developers: Compression Streams](https://developer.chrome.com/articles/compression-streams/)
- [WICG Compression Streams Specification](https://wicg.github.io/compression/)
