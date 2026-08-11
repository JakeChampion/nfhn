# Declined: `Sec-CH-Prefers-Color-Scheme` for the theme

This one looks obviously correct and is not, so it is written down rather than quietly dropped.

## The problem it appears to solve

Every page carries an inline script that runs before first paint:

```js
var t = localStorage.getItem('theme') || 'auto',
    d = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme:dark)').matches);
document.documentElement.setAttribute('data-theme', t);
```

It exists to stop a flash of the wrong theme. It is the only reason `script-src` carries a hash at
all, and it costs a hashed inline script on every response.

Critical client hints look like the fix. Send:

```http
Accept-CH: Sec-CH-Prefers-Color-Scheme
Critical-CH: Sec-CH-Prefers-Color-Scheme
Vary: Sec-CH-Prefers-Color-Scheme
```

and the browser resends the request with the preference attached, so the server can render
`<html data-theme="dark">` directly. No inline script, no hash, no flash.

## Why it does not work here

**The hint reports the operating system, and the site does not follow the operating system.** There
is a theme control with three states — light, dark and auto — and the stored choice overrides the OS
in two of them. `Sec-CH-Prefers-Color-Scheme` only ever answers the `auto` case. For a reader who
has chosen light on a dark-mode machine, a server that trusts the hint renders the wrong theme with
full confidence, and the inline script has to correct it on load. That is the flash the script
exists to prevent, reintroduced by the thing meant to remove it.

Carrying the override to the server means a cookie, and this site sets none. Trading that for the
removal of one hashed inline script is not a trade worth making: cookies are a consent surface, a
caching hazard and a thing to explain, and the script is 300 bytes that the compression dictionary
reduces to almost nothing.

**And it would fragment the CDN cache.** `Vary: Sec-CH-Prefers-Color-Scheme` doubles every cached
entry — the same page twice, differing by one attribute — for pages whose whole design is that one
cached copy serves everyone. This is the same reasoning that keeps `context.geo.timezone` out of
feed and item pages and confines it to reader mode.

**`Critical-CH` also costs a round trip** on the first navigation from a client that has not yet
seen the `Accept-CH`, which is exactly the visit where a flash would be most noticeable.

## What would change the answer

Dropping the manual override and following the OS unconditionally. That is a worse product for a
smaller cost, so: no.

There is a narrower version worth keeping in mind — send the hint's value only as the *initial*
`<meta name="theme-color">` for the browser chrome, where being wrong is invisible until the page
loads and corrects it. That is a real but very small win, and it still carries the `Vary`. Not now.

## Sources

- [`Sec-CH-Prefers-Color-Scheme` on MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-CH-Prefers-Color-Scheme)
- [`Critical-CH` on MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Critical-CH)
