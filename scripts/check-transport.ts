// check-transport.ts - Is the platform ready for the DNS work yet?
//
// docs/netlify-proposals/08-dns-and-transport.md deliberately does not publish
// an HTTPS/SVCB record, for two reasons that are both properties of Netlify
// rather than of this repository:
//
//   - no HTTP/3, so `alpn="h3"` would advertise a protocol that is not there
//   - no ECH, so there is no `ech=` config to publish
//
// Both are things Netlify could ship at any time, and neither will be announced
// in a way this repository notices. This script asks DNS directly.
//
//   deno run --allow-net scripts/check-transport.ts
//
// Uses DNS-over-HTTPS rather than raw UDP so it needs no unstable APIs and
// works anywhere `fetch` does, including CI.

const DOH_ENDPOINT = "https://dns.google/resolve";

/** SvcParamKeys we care about (RFC 9460 section 14.3.2). */
const SVC_PARAM_KEYS: Record<number, string> = {
  0: "mandatory",
  1: "alpn",
  2: "no-default-alpn",
  3: "port",
  4: "ipv4hint",
  5: "ech",
  6: "ipv6hint",
};

export interface TransportSupport {
  host: string;
  /** No HTTPS record published at all. */
  missing: boolean;
  alpn: string[];
  ech: boolean;
  raw: string;
}

interface DohAnswer {
  type: number;
  data: string;
}

/**
 * Parse the presentation format Google's DoH returns for an HTTPS record, e.g.
 * `1 . alpn="h3,h2" ipv4hint=... ech=...`
 */
export function parseHttpsRecord(host: string, raw: string): TransportSupport {
  const alpnMatch = raw.match(/alpn="?([^"\s]+)"?/);
  const alpn = alpnMatch ? alpnMatch[1]!.split(",").map((v) => v.trim()) : [];
  // Some resolvers render unknown keys numerically, so accept `key5=` too.
  const ech = /(^|\s)(ech|key5)=/.test(raw);
  return { host, missing: raw.length === 0, alpn, ech, raw };
}

export async function checkHost(host: string): Promise<TransportSupport> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(host)}&type=HTTPS`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error(`DoH query for ${host} failed: ${res.status}`);

  const body = await res.json() as { Answer?: DohAnswer[] };
  // Type 65 is HTTPS; a CNAME in the chain shows up as type 5 and is ignored.
  const answer = (body.Answer ?? []).find((a) => a.type === 65);
  return parseHttpsRecord(host, answer?.data ?? "");
}

const describe = (support: TransportSupport): string => {
  if (support.missing) return "no HTTPS record published";
  const bits = [
    support.alpn.length ? `alpn=${support.alpn.join(",")}` : "no alpn",
    support.alpn.includes("h3") ? "HTTP/3 ✅" : "HTTP/3 ❌",
    support.ech ? "ECH ✅" : "ECH ❌",
  ];
  return bits.join("  ·  ");
};

if (import.meta.main) {
  // netlify.app is the bellwether: if Netlify turns on HTTP/3 or ECH, it will
  // show up on their own apex before any documentation mentions it.
  // cloudflare.com is the positive control - if that stops reporting h3 and ECH,
  // the *check* is broken rather than the platform.
  const hosts = Deno.args.length > 0
    ? Deno.args
    : ["netlify.app", "hn.jakechampion.name", "cloudflare.com", "crypto.cloudflare.com"];

  let netlifyReady = false;

  for (const host of hosts) {
    try {
      const support = await checkHost(host);
      console.log(`${host.padEnd(26)} ${describe(support)}`);
      if (host === "netlify.app" && (support.alpn.includes("h3") || support.ech)) {
        netlifyReady = true;
      }
    } catch (error) {
      console.log(`${host.padEnd(26)} query failed: ${error}`);
    }
  }

  if (netlifyReady) {
    console.log(
      "\nNetlify now advertises HTTP/3 and/or ECH. " +
        "Revisit docs/netlify-proposals/08-dns-and-transport.md - the records there are ready to publish.",
    );
  }
}
