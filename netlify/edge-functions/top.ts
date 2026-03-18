export default async function handler(_request: Request, _context: Context) {
  try {
    const dnsRecords = await Deno.resolveDns("ipv6is.life", "AAAA");

    const fetchResponse = await fetch("https://ipv6is.life/");
    const body = await fetchResponse.text();

    return new Response(
      JSON.stringify(
        {
          dns: {
            hostname: "ipv6is.life",
            aaaa_records: dnsRecords,
          },
          fetch: {
            status: fetchResponse.status,
            headers: Object.fromEntries(fetchResponse.headers.entries()),
            body: body,
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
