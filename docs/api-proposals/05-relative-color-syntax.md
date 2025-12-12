# Relative Color Syntax

## Overview

Relative Color Syntax (RCS) allows creating new colors by modifying existing ones using `from` keyword in color functions. This enables dynamic color manipulation like adjusting lightness, saturation, or creating complementary colors directly in CSS.

**Browser Support:** Baseline 2024 (Chrome 119+, Safari 16.4+, Firefox 128+)

## Current State in NFHN

NFHN currently uses:
- CSS custom properties for theme colors
- `light-dark()` function for automatic theme switching
- Static color definitions in both light and dark modes

## Proposed Implementation

### 1. Dynamic Color Variations

Create color variations from base accent color:

```css
:root {
  /* Base accent color */
  --accent: #ff6600;
  
  /* Derive variations using relative color syntax */
  --accent-light: oklch(from var(--accent) calc(l + 0.15) c h);
  --accent-dark: oklch(from var(--accent) calc(l - 0.15) c h);
  --accent-muted: oklch(from var(--accent) l calc(c * 0.5) h);
  --accent-subtle: oklch(from var(--accent) calc(l + 0.3) calc(c * 0.3) h);
  
  /* Complementary color (opposite hue) */
  --accent-complement: oklch(from var(--accent) l c calc(h + 180));
  
  /* Analogous colors */
  --accent-warm: oklch(from var(--accent) l c calc(h - 30));
  --accent-cool: oklch(from var(--accent) l c calc(h + 30));
}
```

### 2. Improved Theme System

Enhance existing theme with relative colors:

```css
/* Light theme with relative variations */
:root[data-theme="light"] {
  --background: #f5f5f5;
  --text-primary: #1f2937;
  
  /* Derive all UI colors from base colors */
  --background-elevated: oklch(from var(--background) calc(l + 0.05) c h);
  --background-sunken: oklch(from var(--background) calc(l - 0.03) c h);
  
  --text-muted: oklch(from var(--text-primary) calc(l + 0.3) c h);
  --text-secondary: oklch(from var(--text-primary) calc(l + 0.15) c h);
  
  /* Borders derived from text */
  --border-color: oklch(from var(--text-primary) l c h / 0.1);
  --border-subtle: oklch(from var(--text-primary) l c h / 0.06);
  
  /* Interactive states */
  --hover-bg: oklch(from var(--accent) l c h / 0.1);
  --active-bg: oklch(from var(--accent) l c h / 0.2);
  --focus-ring: oklch(from var(--accent) l c h / 0.5);
}

/* Dark theme - just flip the operations */
:root[data-theme="dark"] {
  --background: #0d1117;
  --text-primary: #c9d1d9;
  
  --background-elevated: oklch(from var(--background) calc(l + 0.03) c h);
  --background-sunken: oklch(from var(--background) calc(l - 0.02) c h);
  
  --text-muted: oklch(from var(--text-primary) calc(l - 0.25) c h);
  --text-secondary: oklch(from var(--text-primary) calc(l - 0.1) c h);
  
  --border-color: oklch(from var(--text-primary) l c h / 0.1);
  --border-subtle: oklch(from var(--text-primary) l c h / 0.06);
}
```

### 3. Accessible Color Contrast

Automatically ensure accessible contrast:

```css
/* Button with guaranteed contrast */
.button {
  --button-bg: var(--accent);
  
  /* Ensure text has sufficient contrast with background */
  /* If background is light, use dark text; if dark, use light text */
  --button-text: oklch(
    from var(--button-bg) 
    /* If lightness > 0.6, use dark text (l=0.2), else light (l=0.98) */
    clamp(0.2, calc((0.6 - l) * 100), 0.98)
    0 
    h
  );
  
  background: var(--button-bg);
  color: var(--button-text);
}

/* Hover state - darken or lighten based on base */
.button:hover {
  background: oklch(
    from var(--button-bg)
    /* Darken light buttons, lighten dark buttons */
    calc(l + (0.5 - l) * 0.2)
    c
    h
  );
}
```

### 4. Story Score Color Gradient

Color scores based on value using hue shifting:

```css
/* Score coloring - low scores are cool (blue), high scores are warm (orange) */
.story-score {
  /* Score percentage passed as custom property from template */
  --score-hue: calc(240 - (var(--score-percent, 50) * 2.4));
  
  color: oklch(0.6 0.15 var(--score-hue));
}

/* Alternative: Use relative color from accent */
.story-score[data-high] {
  color: oklch(from var(--accent) l c h);
}

.story-score[data-medium] {
  color: oklch(from var(--accent) l calc(c * 0.7) calc(h + 20));
}

.story-score[data-low] {
  color: oklch(from var(--text-muted) l c h);
}
```

### 5. Comment Depth Coloring

Visually distinguish nested comment levels:

```css
/* Base comment border color */
.comment {
  --base-comment-color: var(--accent);
}

/* Each nesting level shifts hue */
.comment { 
  border-left-color: oklch(from var(--base-comment-color) 0.65 0.15 h); 
}

.comment .comment { 
  border-left-color: oklch(from var(--base-comment-color) 0.65 0.15 calc(h + 30)); 
}

.comment .comment .comment { 
  border-left-color: oklch(from var(--base-comment-color) 0.65 0.15 calc(h + 60)); 
}

.comment .comment .comment .comment { 
  border-left-color: oklch(from var(--base-comment-color) 0.65 0.15 calc(h + 90)); 
}

/* Or use CSS counter for unlimited depth */
.comment {
  counter-increment: comment-depth;
  border-left-color: oklch(
    from var(--base-comment-color) 
    0.65 
    0.15 
    calc(h + (counter(comment-depth) * 30))
  );
}
```

### 6. Feed Type Coloring

Different accent colors for different feeds:

```css
/* Define feed-specific accents */
[data-feed="top"] { --feed-accent: var(--accent); }
[data-feed="new"] { --feed-accent: oklch(from var(--accent) l c calc(h + 120)); }
[data-feed="ask"] { --feed-accent: oklch(from var(--accent) l c calc(h - 60)); }
[data-feed="show"] { --feed-accent: oklch(from var(--accent) l c calc(h + 60)); }
[data-feed="jobs"] { --feed-accent: oklch(from var(--accent) l c calc(h + 180)); }

/* Apply throughout the page */
.nav-link[aria-current="page"] {
  color: var(--feed-accent);
  border-bottom-color: var(--feed-accent);
}

.story-item:focus-within {
  outline-color: var(--feed-accent);
}
```

### 7. Reader Mode Color Adjustments

Sepia/reading mode with relative colors:

```css
/* Reading modes derived from base colors */
.reader-content[data-mode="sepia"] {
  --reader-bg: oklch(from #f4ecd8 l c h);
  --reader-text: oklch(from #5c4b37 l c h);
  
  /* Links maintain hue relationship to accent */
  --reader-link: oklch(from var(--accent) l c calc(h + 10));
}

.reader-content[data-mode="night"] {
  --reader-bg: oklch(from #1a1a2e l c h);
  --reader-text: oklch(from #eaeaea l c h);
  
  /* Reduce chroma for easier reading */
  --reader-link: oklch(from var(--accent) l calc(c * 0.8) h);
}

/* High contrast mode */
.reader-content[data-mode="high-contrast"] {
  --reader-bg: #000000;
  --reader-text: #ffffff;
  --reader-link: oklch(from var(--accent) 0.8 0.2 h);
}
```

### 8. Syntax Highlighting with Relative Colors

Code blocks with theme-aware syntax colors:

```css
/* Base syntax colors derived from accent */
.code-block {
  --syntax-keyword: oklch(from var(--accent) 0.7 0.2 calc(h + 180));
  --syntax-string: oklch(from var(--accent) 0.65 0.18 calc(h + 90));
  --syntax-number: oklch(from var(--accent) 0.7 0.2 calc(h - 60));
  --syntax-comment: oklch(from var(--text-primary) calc(l + 0.2) 0.02 h);
  --syntax-function: oklch(from var(--accent) 0.75 0.15 calc(h + 30));
}

.token-keyword { color: var(--syntax-keyword); }
.token-string { color: var(--syntax-string); }
.token-number { color: var(--syntax-number); }
.token-comment { color: var(--syntax-comment); font-style: italic; }
.token-function { color: var(--syntax-function); }
```

### 9. Status Indicators

Semantic colors derived from base:

```css
:root {
  /* Semantic colors derived from green/red base hues */
  --success-base: oklch(0.7 0.2 145);
  --error-base: oklch(0.6 0.25 25);
  --warning-base: oklch(0.75 0.2 85);
  --info-base: oklch(0.65 0.2 230);
  
  /* Variations */
  --success: var(--success-base);
  --success-light: oklch(from var(--success-base) calc(l + 0.2) calc(c * 0.5) h);
  --success-dark: oklch(from var(--success-base) calc(l - 0.15) c h);
  
  --error: var(--error-base);
  --error-light: oklch(from var(--error-base) calc(l + 0.25) calc(c * 0.5) h);
  --error-dark: oklch(from var(--error-base) calc(l - 0.1) c h);
}

/* Badge colors */
.badge-success {
  background: var(--success-light);
  color: var(--success-dark);
  border: 1px solid oklch(from var(--success) l c h / 0.3);
}

.badge-error {
  background: var(--error-light);
  color: var(--error-dark);
  border: 1px solid oklch(from var(--error) l c h / 0.3);
}
```

### 10. User Customization

Allow users to set their own accent color:

```javascript
// In app.js - user accent color picker
function setUserAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  localStorage.setItem('userAccent', color);
}

// Initialize from storage
const savedAccent = localStorage.getItem('userAccent');
if (savedAccent) {
  document.documentElement.style.setProperty('--accent', savedAccent);
}
```

```html
<!-- Settings panel -->
<label>
  Accent Color
  <input type="color" 
         value="#ff6600" 
         onchange="setUserAccent(this.value)">
</label>
```

All derived colors update automatically thanks to relative color syntax!

## Files to Modify

1. **`static/styles.css`** - Replace static color values with relative calculations
2. **`netlify/edge-functions/lib/render/pages.ts`** - Add data attributes for feed types
3. **`netlify/edge-functions/lib/render/components.ts`** - Add score data attributes
4. **`static/app.js`** - Add user accent color picker functionality

## Progressive Enhancement

```css
/* Fallback for browsers without RCS support */
:root {
  --accent-light: #ff8533;
  --accent-dark: #cc5200;
}

/* Enhanced with relative color syntax */
@supports (color: oklch(from red l c h)) {
  :root {
    --accent-light: oklch(from var(--accent) calc(l + 0.15) c h);
    --accent-dark: oklch(from var(--accent) calc(l - 0.15) c h);
  }
}
```

## Benefits for NFHN

1. **Single Source of Truth** - Change one color, everything updates
2. **Consistent Palettes** - Mathematical relationships between colors
3. **Theme Flexibility** - Easy to create new themes
4. **User Personalization** - Users can customize accent color
5. **Accessibility** - Easier to maintain contrast ratios
6. **Maintainability** - Fewer hard-coded color values

## References

- [MDN: Relative color syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_colors/Relative_colors)
- [Chrome Developers: CSS Relative Color Syntax](https://developer.chrome.com/docs/css-ui/relative-color-syntax)
- [OKLCH Color Space](https://oklch.com/)
- [Color.js - Relative color manipulation](https://colorjs.io/docs/manipulation.html)
