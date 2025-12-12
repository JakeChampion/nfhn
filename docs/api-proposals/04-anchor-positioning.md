# CSS Anchor Positioning

## Status: ✅ IMPLEMENTED

**Implementation Date:** Phase 2

## Overview

CSS Anchor Positioning allows elements to be positioned relative to other elements (anchors) without JavaScript. This is ideal for tooltips, popovers, dropdown menus, and contextual UI elements.

**Browser Support:** Baseline 2024 (Chrome 125+, Safari 18+, Firefox planned)

## Implementation Summary

CSS Anchor Positioning has been implemented with the following features:

### Features Implemented
1. **Settings Menu Positioning** - The settings popover is now anchored to the settings button with fallback positions (below-left, below-right, above-left, above-right)
2. **Share Button Tooltips** - Hover tooltips showing "Share" anchored below the button
3. **Bookmark Button Tooltips** - Hover tooltips showing "Save"/"Saved" with dynamic content based on `aria-pressed` state
4. **Back to Top Tooltips** - Tooltip anchored to the left of the back-to-top button

### Technical Details
- All anchor positioning is wrapped in `@supports (anchor-name: ...)` for progressive enhancement
- Uses `position-try-fallbacks` for automatic flipping when there's not enough space
- Custom `@position-try` rules define fallback positions

### Location in Codebase
- CSS: `static/styles.css` (CSS Anchor Positioning section, after Popover API styles)

---

## Original Proposal

### 1. Story Metadata Tooltips

Show expanded metadata on hover without layout shift:

#### CSS Implementation (`styles.css`)

```css
/* Define anchor on story score */
.story-score {
  anchor-name: --story-score;
}

/* Tooltip positioned relative to score */
.score-tooltip {
  /* Position relative to anchor */
  position: fixed;
  position-anchor: --story-score;
  
  /* Position below the anchor */
  top: anchor(bottom);
  left: anchor(center);
  translate: -50% 0;
  
  /* Styling */
  background: var(--background-elevated);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  
  /* Hidden by default */
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  
  /* Auto-flip if not enough space below */
  position-try-fallbacks: 
    --tooltip-above,
    --tooltip-left,
    --tooltip-right;
}

/* Fallback positions */
@position-try --tooltip-above {
  bottom: anchor(top);
  top: auto;
}

@position-try --tooltip-left {
  right: anchor(left);
  left: auto;
  top: anchor(center);
  translate: 0 -50%;
}

@position-try --tooltip-right {
  left: anchor(right);
  top: anchor(center);
  translate: 0 -50%;
}

/* Show on hover */
.story-score:hover + .score-tooltip,
.story-score:focus + .score-tooltip {
  opacity: 1;
  pointer-events: auto;
}
```

#### HTML Template (`render/components.ts`)

```typescript
export const storyScore = (score: number, id: number) => html`
  <span 
    class="story-score" 
    style="anchor-name: --story-score-${id}"
    tabindex="0"
    aria-describedby="score-tooltip-${id}"
  >
    ${score}
  </span>
  <div 
    class="score-tooltip" 
    id="score-tooltip-${id}"
    role="tooltip"
    style="position-anchor: --story-score-${id}"
  >
    <strong>${score} points</strong>
    <br>
    Click to see voting history
  </div>
`;
```

### 2. User Profile Hover Card

Show user info when hovering over username:

```css
/* User link as anchor */
.user-link {
  anchor-name: --user-anchor;
}

/* User hover card */
.user-card {
  position: fixed;
  position-anchor: --user-anchor;
  
  /* Position below and to the right */
  top: anchor(bottom);
  left: anchor(left);
  margin-top: 0.5rem;
  
  /* Card styling */
  width: 280px;
  background: var(--background-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  
  /* Visibility */
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0.2s;
  
  /* Flip positions */
  position-try-fallbacks: 
    --card-above,
    --card-right;
}

@position-try --card-above {
  bottom: anchor(top);
  top: auto;
  margin-top: 0;
  margin-bottom: 0.5rem;
}

@position-try --card-right {
  left: anchor(right);
  top: anchor(top);
  margin-left: 0.5rem;
  margin-top: 0;
}

/* Show on hover with delay */
.user-link:hover + .user-card,
.user-card:hover {
  opacity: 1;
  visibility: visible;
}
```

### 3. Comment Reply Positioning

Position reply forms relative to comments:

```css
/* Comment as anchor */
.comment {
  anchor-name: --comment;
}

/* Reply form anchored to comment */
.reply-form {
  position: absolute;
  position-anchor: --comment;
  
  /* Position below the comment */
  top: anchor(bottom);
  left: anchor(left);
  right: anchor(right);
  
  /* Styling */
  margin-top: 0.5rem;
  padding: 1rem;
  background: var(--comment-bg);
  border-radius: 8px;
  border-left: 3px solid var(--accent-color);
}

/* Nested comment anchors need unique names */
.comment:nth-child(1) { anchor-name: --comment-1; }
.comment:nth-child(2) { anchor-name: --comment-2; }
/* ... dynamically generated in JS/template */
```

### 4. Share Menu Positioning

Position share menu relative to share button:

```css
/* Share button anchor */
.share-button {
  anchor-name: --share-button;
}

/* Share menu */
.share-menu[popover] {
  position: fixed;
  position-anchor: --share-button;
  
  /* Position below button */
  top: anchor(bottom);
  left: anchor(left);
  margin-top: 0.25rem;
  
  /* Menu styling */
  min-width: 160px;
  background: var(--background-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.5rem 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  
  /* Flip if needed */
  position-try-fallbacks: --menu-above;
}

@position-try --menu-above {
  bottom: anchor(top);
  top: auto;
  margin-top: 0;
  margin-bottom: 0.25rem;
}
```

### 5. Keyboard Shortcut Hints

Show keyboard hints anchored to UI elements:

```css
/* Navigation links as anchors */
.nav-link {
  anchor-name: --nav-link;
}

/* Keyboard hint badge */
.kbd-hint {
  position: fixed;
  position-anchor: --nav-link;
  
  /* Position to the right of the link */
  left: anchor(right);
  top: anchor(center);
  translate: 0.5rem -50%;
  
  /* Styling */
  background: var(--badge-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.7rem;
  font-family: monospace;
  
  /* Only visible in keyboard mode */
  opacity: 0;
  transition: opacity 0.15s;
}

/* Show when keyboard navigation is active */
.keyboard-mode .kbd-hint {
  opacity: 1;
}
```

### 6. Context Menu for Stories

Right-click context menu positioned at click location:

```css
/* Context menu (popover) */
.context-menu[popover] {
  position: fixed;
  
  /* Will be positioned via JS based on click coordinates */
  /* But anchor API can position relative to the clicked element */
  position-anchor: --clicked-item;
  
  top: anchor(--click-y, top);
  left: anchor(--click-x, left);
  
  /* Menu styling */
  min-width: 180px;
  background: var(--background-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.5rem 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 0.5rem 1rem;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
}

.context-menu-item:hover {
  background: var(--badge-bg);
}
```

### 7. Timestamp Relative Tooltips

Show exact timestamps when hovering over relative times:

```css
/* Time element as anchor */
time[datetime] {
  anchor-name: --timestamp;
  cursor: help;
  text-decoration: underline dotted;
}

/* Timestamp tooltip */
.timestamp-tooltip {
  position: fixed;
  position-anchor: --timestamp;
  
  top: anchor(bottom);
  left: anchor(center);
  translate: -50% 0.25rem;
  
  /* Styling */
  background: var(--text-primary);
  color: var(--background);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  white-space: nowrap;
  
  /* Arrow */
  &::before {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 50%;
    translate: -50% 0;
    border: 5px solid transparent;
    border-bottom-color: var(--text-primary);
  }
  
  /* Hidden by default */
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s;
}

time[datetime]:hover + .timestamp-tooltip {
  opacity: 1;
}
```

### 8. Inline Position Anchors (CSS `anchor()` function)

Use `anchor()` for inline positioning without creating named anchors:

```css
/* Position an element relative to its previous sibling */
.tooltip {
  position: absolute;
  top: anchor(--implicit previous);
  left: anchor(--implicit previous center);
}

/* Inset positioning for centered overlays */
.overlay {
  position-anchor: --container;
  inset: anchor(top) anchor(right) anchor(bottom) anchor(left);
}
```

## JavaScript Integration

For dynamic anchor names (e.g., per-item tooltips):

```javascript
// Set anchor names dynamically
function setupAnchors() {
  document.querySelectorAll('.story-item').forEach((item, index) => {
    const anchor = item.querySelector('.story-score');
    const tooltip = item.querySelector('.score-tooltip');
    
    if (anchor && tooltip) {
      const anchorName = `--story-score-${index}`;
      anchor.style.anchorName = anchorName;
      tooltip.style.positionAnchor = anchorName;
    }
  });
}

// For hover cards that fetch async content
async function showUserCard(userLink, username) {
  const card = document.getElementById('user-card');
  card.style.positionAnchor = userLink.style.anchorName;
  
  // Fetch user data
  const userData = await fetch(`/api/user/${username}`).then(r => r.json());
  
  // Populate and show card
  card.innerHTML = renderUserCard(userData);
  card.showPopover();
}
```

## Files to Modify

1. **`static/styles.css`** - Add anchor positioning rules and fallbacks
2. **`netlify/edge-functions/lib/render/components.ts`** - Add tooltip HTML structure
3. **`static/app.js`** - Dynamic anchor name assignment
4. **`netlify/edge-functions/lib/render/pages.ts`** - Add hover card container

## Progressive Enhancement

Anchor positioning is cutting-edge; provide fallbacks:

```css
/* Fallback: simple CSS positioning */
.tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
}

/* Enhanced: anchor positioning */
@supports (position-anchor: --test) {
  .tooltip {
    position: fixed;
    position-anchor: --parent;
    top: anchor(bottom);
    left: anchor(center);
    translate: -50% 0;
    bottom: auto;
    transform: none;
  }
}
```

## Accessibility Considerations

1. **ARIA attributes** - Use `aria-describedby` for tooltips
2. **Keyboard access** - Tooltips should appear on focus, not just hover
3. **Focus management** - Popovers should trap focus appropriately
4. **Screen readers** - Use `role="tooltip"` for informational popups

```html
<button 
  aria-describedby="share-tooltip"
  class="share-button"
  style="anchor-name: --share-btn"
>
  Share
</button>
<div 
  id="share-tooltip" 
  role="tooltip"
  style="position-anchor: --share-btn"
>
  Share this story
</div>
```

## Benefits for NFHN

1. **Better UX** - Contextual information without modals
2. **No Layout Shift** - Tooltips don't affect document flow
3. **Responsive** - Auto-flip handles edge cases
4. **Performance** - No JavaScript for positioning logic
5. **Maintainable** - Declarative positioning in CSS

## References

- [MDN: CSS Anchor Positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_anchor_positioning)
- [Chrome Developers: Anchor Positioning](https://developer.chrome.com/blog/anchor-positioning-api)
- [CSS Anchor Positioning Specification](https://drafts.csswg.org/css-anchor-position-1/)
