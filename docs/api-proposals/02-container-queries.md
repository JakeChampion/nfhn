# Container Queries

## Implementation Status

✅ **IMPLEMENTED** - This feature has been implemented in the codebase.

### What was implemented:

1. **Container contexts defined** for main content, story lists, story items, articles, comments, saved stories, and user profiles
2. **Story list responsive behavior** - adapts padding, font sizes, and layout based on container width
3. **Comment threading** - adjusts indentation, font size, and spacing based on available space
4. **Deeply nested comments** - auto-adapts when container becomes narrow (truncated usernames, smaller touch targets)
5. **Main content queries** - header bar and navigation adapt to container size
6. **Container query units** - fluid typography using `cqi` units where supported
7. **User profile layout** - stats grid adapts from 1-column to 4-column based on container

### Files modified:
- `static/styles.css` - Added comprehensive container query rules (~200 lines)

### Containers defined:
- `main-content` - Main content area
- `stories` - Story list (`<ol class="stories">`)
- `story` - Individual story items (`<li>`)
- `article-content` - Article/comment section
- `comment` - Individual comments (`<details>`)
- `saved-stories` - Saved stories container
- `user-profile` - User profile page

---

## Overview

Container Queries allow elements to be styled based on the size of their container rather than the viewport. This enables truly modular, reusable components that adapt to their context.

**Browser Support:** Baseline 2023 (Chrome 105+, Safari 16+, Firefox 110+)

## Current State in NFHN

NFHN currently uses:
- Traditional media queries for responsive design
- Fixed layouts for story lists and comments
- No container-based responsive logic

## Proposed Implementation

### 1. Story List Containers

Make story items adapt to their container, useful when stories appear in different contexts (main feed vs. sidebar vs. search results).

#### Define Containment (`styles.css`)

```css
/* Define container context for story lists */
.stories-container {
  container-type: inline-size;
  container-name: stories;
}

/* Individual story items also as containers for nested queries */
.story-item {
  container-type: inline-size;
  container-name: story;
}
```

#### Container Query Rules

```css
/* Compact view for narrow containers (< 400px) */
@container stories (max-width: 400px) {
  .story-item {
    padding: 0.75rem;
  }
  
  .story-meta {
    flex-wrap: wrap;
    font-size: 0.75rem;
  }
  
  .story-domain {
    display: none;
  }
  
  .story-score {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }
}

/* Standard view (400px - 700px) */
@container stories (min-width: 400px) and (max-width: 700px) {
  .story-item {
    padding: 1rem;
  }
  
  .story-meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
}

/* Wide view (> 700px) - show more details inline */
@container stories (min-width: 700px) {
  .story-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1rem;
    align-items: center;
  }
  
  .story-score {
    font-size: 1.25rem;
    min-width: 3rem;
    text-align: center;
  }
  
  .story-comments {
    min-width: 5rem;
    text-align: right;
  }
}
```

### 2. Comment Thread Containers

Comment nesting depth should adapt based on available space:

```css
/* Comment container */
.comments-section {
  container-type: inline-size;
  container-name: comments;
}

.comment {
  container-type: inline-size;
  container-name: comment;
}

/* Reduce nesting indentation in narrow containers */
@container comments (max-width: 500px) {
  .comment {
    --indent-width: 0.5rem;
    border-left-width: 2px;
  }
  
  .comment-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }
  
  .comment-actions {
    font-size: 0.75rem;
  }
}

/* Standard comment layout */
@container comments (min-width: 500px) {
  .comment {
    --indent-width: 1rem;
    border-left-width: 3px;
  }
}

/* Wide comments - more horizontal space for actions */
@container comments (min-width: 800px) {
  .comment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .comment-actions {
    opacity: 0;
    transition: opacity 0.2s;
  }
  
  .comment:hover .comment-actions,
  .comment:focus-within .comment-actions {
    opacity: 1;
  }
}

/* Deep nesting auto-collapse in narrow containers */
@container comment (max-width: 200px) {
  .comment-replies {
    display: none;
  }
  
  .comment::after {
    content: "...";
    color: var(--text-muted);
    font-style: italic;
  }
}
```

### 3. Reader Mode Container Queries

Reader mode content should adapt to its container, especially useful for the Document PiP feature:

```css
/* Reader container */
.reader-content {
  container-type: inline-size;
  container-name: reader;
}

/* Narrow reader (PiP window or mobile) */
@container reader (max-width: 400px) {
  .reader-content {
    font-size: 1rem;
    line-height: 1.6;
    padding: 1rem;
  }
  
  .reader-content img {
    width: 100%;
    height: auto;
  }
  
  .reader-content pre {
    font-size: 0.8rem;
    overflow-x: auto;
  }
  
  .reader-content blockquote {
    margin-left: 0;
    padding-left: 1rem;
    border-left: 3px solid var(--border-color);
  }
}

/* Standard reader width */
@container reader (min-width: 400px) and (max-width: 700px) {
  .reader-content {
    font-size: 1.125rem;
    line-height: 1.7;
    max-width: 65ch;
    margin: 0 auto;
  }
}

/* Wide reader - can show figures side by side */
@container reader (min-width: 700px) {
  .reader-content {
    font-size: 1.2rem;
    line-height: 1.8;
  }
  
  .reader-content figure {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
  }
  
  .reader-content figure img {
    max-width: calc(50% - 0.5rem);
  }
}
```

### 4. Settings Panel Container Queries

The settings popover should adapt when space is limited:

```css
.settings-menu {
  container-type: inline-size;
  container-name: settings;
}

@container settings (max-width: 250px) {
  .theme-toggle fieldset {
    flex-direction: column;
  }
  
  .settings-section {
    padding: 0.5rem;
  }
}
```

### 5. Card Components

Create truly reusable card components for user profiles, job listings, etc.:

```css
/* Generic card container */
.card {
  container-type: inline-size;
  container-name: card;
}

/* Compact card */
@container card (max-width: 300px) {
  .card-content {
    padding: 0.75rem;
  }
  
  .card-title {
    font-size: 1rem;
  }
  
  .card-meta {
    display: none;
  }
}

/* Standard card */
@container card (min-width: 300px) and (max-width: 500px) {
  .card-content {
    padding: 1rem;
  }
  
  .card-title {
    font-size: 1.25rem;
  }
}

/* Wide card - horizontal layout */
@container card (min-width: 500px) {
  .card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1.5rem;
  }
  
  .card-image {
    width: 150px;
    height: 150px;
    object-fit: cover;
  }
}
```

## HTML Updates

Update templates to add container classes:

```typescript
// In render/pages.ts
export const feedPage = (feed: FeedSlug, stories: Story[], page: number) => html`
  <main>
    <section class="stories-container" aria-label="${feed} stories">
      <ol class="stories-list">
        ${stories.map((story, i) => storyItem(story, i))}
      </ol>
    </section>
  </main>
`;

// In render/components.ts
export const commentsSection = (comments: Comment[]) => html`
  <section class="comments-section" aria-label="Comments">
    ${comments.map(comment => commentItem(comment))}
  </section>
`;
```

## Container Query Units

Use container query units for fluid sizing:

```css
/* Container query units */
.story-title {
  /* 5% of container width, clamped between 1rem and 1.5rem */
  font-size: clamp(1rem, 5cqi, 1.5rem);
}

.comment-indent {
  /* Indent based on container width */
  padding-left: calc(var(--depth, 0) * 3cqi);
}
```

## Style Queries (Experimental)

Style queries allow querying custom property values:

```css
/* When a story is saved */
@container style(--is-saved: true) {
  .save-button {
    background: var(--accent-color);
    color: white;
  }
  
  .save-icon {
    fill: currentColor;
  }
}

/* When comment is collapsed */
@container style(--is-collapsed: true) {
  .comment-body {
    display: none;
  }
  
  .comment-header::after {
    content: " [collapsed]";
    color: var(--text-muted);
  }
}
```

## Files to Modify

1. **`static/styles.css`** - Add container definitions and queries
2. **`netlify/edge-functions/lib/render/pages.ts`** - Add container wrapper classes
3. **`netlify/edge-functions/lib/render/components.ts`** - Add container classes to components
4. **`netlify/edge-functions/reader.ts`** - Add reader container classes

## Progressive Enhancement

Container queries are well-supported, but we should provide fallbacks:

```css
/* Fallback using media queries */
@media (max-width: 400px) {
  .story-item {
    padding: 0.75rem;
  }
}

/* Container query enhancement */
@supports (container-type: inline-size) {
  @container stories (max-width: 400px) {
    .story-item {
      padding: 0.75rem;
    }
  }
}
```

## Benefits for NFHN

1. **Modular Components** - Story items work in any context (main feed, search, saved)
2. **Better Reader Mode** - Content adapts to window size, especially in PiP
3. **Improved Comments** - Deep nesting handles gracefully in narrow views
4. **Future-Proof** - Components adapt automatically when layout changes

## References

- [MDN: CSS Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)
- [Chrome Developers: Container Queries](https://developer.chrome.com/docs/css-ui/container-queries)
- [Container Query Units](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries#container_query_length_units)
