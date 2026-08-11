# DNS and transport: what is actually available

**Status:** Partially implemented (hostname consolidated in code; DNS records are a registrar action)
· **Impact:** Medium · **Effort:** Low

## The review closed this category for a reason that expired

The full spec review put CAA and DNSSEC under "not applicable":

> **DNS and domain-level, not in this repository** — CAA records, DNSSEC, `_for-sale` records, and
> the `netlify.app` domain is not ours to configure.

The second half of that is no longer true: the site is served from `hn.jakechampion.name`, a domain
that *is* ours. So the DNS layer is in scope after all. What follows is what is worth doing there,
and — just as important — what is not worth doing yet.

## Fixed here: the site could not agree on its own hostname

Three different hostnames were baked into the repository:

| Where | Said |
| --- | --- |
| `robots.txt` (`Sitemap:`), `security.txt` (`Canonical:`), `llms.txt` | `nfhn.netlify.app` |
| JSON-LD in `render/pages.ts` | `hn.jakechampion.name` |
| Deploy target | a third name again |

Crawlers, security researchers and LLM agents each believe whichever they happen to read, and
`Canonical:` in a `security.txt` that points somewhere else is the kind of thing that makes a
vulnerability report go to the wrong place. There is now one `SITE_ORIGIN` constant in `config.ts`
and a test that fails if the old hostname reappears anywhere.

Runtime canonical and `og:url` values are still derived from the request, which is strictly more
correct; `SITE_ORIGIN` covers only the places with no request to derive from.

## Worth doing at the registrar

Neither of these is a code change, which is why they are described rather than committed.

**CAA** — restricts which certificate authorities may issue for the domain. Netlify provisions
through Let's Encrypt:

```dns
hn.jakechampion.name.  IN CAA 0 issue "letsencrypt.org"
hn.jakechampion.name.  IN CAA 0 iodef "mailto:security@jakechampion.name"
```

The `iodef` line matters as much as the `issue` line: it is how you find out about an attempted
mis-issuance rather than reading about it later.

**DNSSEC** — enable at the registrar. It is a checkbox on most, and the failure mode of getting it
wrong (a broken chain takes the domain offline) is the reason to do it deliberately rather than
casually.

## Deliberately *not* doing yet: HTTPS/SVCB records

An HTTPS record (RFC 9460) is the obvious next thing, and on most sites it is a clear win. Here it is
not, for two specific reasons:

**No HTTP/3.** The headline benefit is `alpn="h3,h2"`, which tells the browser you speak HTTP/3
before it connects instead of discovering it from `Alt-Svc` on a later visit. Netlify does not serve
HTTP/3, so publishing that would advertise a protocol that is not there — browsers would attempt
QUIC, fail, and fall back, which is slower than never having claimed it. Publishing `alpn="h2"` alone
buys essentially nothing: TLS ALPN already negotiates h2 during the handshake.

**No confirmed ECH.** The genuinely valuable parameter is `ech=`, which carries the public key that
encrypts the TLS ClientHello — the one remaining plaintext field that reveals *which site* a reader
is visiting. [RFC 9849](https://datatracker.ietf.org/doc/rfc9849/) was finalised in March 2026 and
browser support is deployable, but ECH needs the *server* to hold the matching key, and there is no
evidence Netlify offers it. A published `ech=` config that the edge cannot decrypt breaks
connections outright.

For a Hacker News reader, ECH is the item on this page most worth wanting: it is the difference
between a network observer knowing you read this site and not.

**Revisit when either lands.** The record is one line each time:

```dns
; when Netlify serves HTTP/3
hn.jakechampion.name.  IN HTTPS 1 . alpn="h3,h2"

; when Netlify supports ECH (the ech= value comes from them)
hn.jakechampion.name.  IN HTTPS 1 . alpn="h3,h2" ech="..."
```

## Already handled elsewhere

- **HSTS** is sent with `includeSubDomains; preload` by `applySecurityHeaders`. Worth checking
  whether the domain is actually on the preload list — sending the directive and being submitted are
  two different things.
- **`.well-known/security.txt`** exists and now has a correct `Canonical:`.

## Sources

- [RFC 9460: SVCB and HTTPS RRs](https://www.rfc-editor.org/rfc/rfc9460.html)
- [RFC 9849: TLS Encrypted Client Hello](https://datatracker.ietf.org/doc/rfc9849/)
- [RFC 9848: Bootstrapping ECH with DNS Service Bindings](https://datatracker.ietf.org/doc/rfc9848/)
