async function fetchViaIP(
  ip: string,
  hostname: string,
  path: string
): Promise<Record<string, unknown>> {
  try {
    const tcpConn = await Deno.connect({ hostname: ip, port: 443 });
    const tlsConn = await Deno.startTls(tcpConn, { hostname });

    const request = `GET ${path} HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\nAccept: */*\r\n\r\n`;
    await tlsConn.write(new TextEncoder().encode(request));

    const chunks: Uint8Array[] = [];
    const buf = new Uint8Array(8192);
    while (true) {
      const n = await tlsConn.read(buf);
      if (n === null) break;
      chunks.push(buf.slice(0, n));
    }
    tlsConn.close();

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const responseBytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      responseBytes.set(chunk, offset);
      offset += chunk.length;
    }
    const responseText = new TextDecoder().decode(responseBytes);

    const headerEnd = responseText.indexOf("\r\n\r\n");
    const headerSection = responseText.substring(0, headerEnd);
    const rawBody = responseText.substring(headerEnd + 4);

    const headerLines = headerSection.split("\r\n");
    const statusLine = headerLines[0];
    const status = parseInt(statusLine.split(" ")[1]);

    const headers: Record<string, string> = {};
    for (let i = 1; i < headerLines.length; i++) {
      const colonIndex = headerLines[i].indexOf(":");
      if (colonIndex === -1) continue;
      const key = headerLines[i].substring(0, colonIndex).trim().toLowerCase();
      const value = headerLines[i].substring(colonIndex + 1).trim();
      headers[key] = value;
    }

    let body = rawBody;
    if (headers["transfer-encoding"]?.includes("chunked")) {
      body = decodeChunked(rawBody);
    }

    return { status, headers, body };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function decodeChunked(raw: string): string {
  let result = "";
  let pos = 0;
  while (pos < raw.length) {
    const lineEnd = raw.indexOf("\r\n", pos);
    if (lineEnd === -1) break;
    const size = parseInt(raw.substring(pos, lineEnd).trim(), 16);
    if (size === 0) break;
    pos = lineEnd + 2;
    result += raw.substring(pos, pos + size);
    pos += size + 2;
  }
  return result;
}

export default async function handler(_request: Request, _context: Context) {
  try {
    const dnsAAAARecords = await Deno.resolveDns("ipv6is.life", "AAAA").catch(() => [] as string[]);
    const dnsARecords = await Deno.resolveDns("ipv6is.life", "A").catch(() => [] as string[]);

    const aIP = dnsARecords[0] ?? null;
    const aaaaIP = dnsAAAARecords[0] ?? null;

    const [ipv4Response, ipv6Response, domainResponse] = await Promise.all([
      aIP ? fetchViaIP(aIP, "ipv6is.life", "/") : { skipped: "no A record" },
      aaaaIP ? fetchViaIP(aaaaIP, "ipv6is.life", "/") : { skipped: "no AAAA record" },
      fetch("https://ipv6is.life/")
        .then(async (r) => ({
          status: r.status,
          headers: Object.fromEntries(r.headers.entries()),
          body: await r.text(),
        }))
        .catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
    ]);

    return new Response(
      JSON.stringify(
        {
          dns: {
            hostname: "ipv6is.life",
            aaaa_records: dnsAAAARecords,
            a_records: dnsARecords,
          },
          fetch_via_domain: domainResponse,
          fetch_via_a_record: {
            ip: aIP,
            ...ipv4Response,
          },
          fetch_via_aaaa_record: {
            ip: aaaaIP,
            ...ipv6Response,
          },
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export const config: Config = {
  path: "/*",
};
