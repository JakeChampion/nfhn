import { HTMLResponse } from "https://ghuc.cc/worker-tools/html";
import { notFound, ok } from "https://ghuc.cc/worker-tools/response-creators";

import { home } from "../layouts/hn.ts";

export async function top(pageNumber) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/news/${pageNumber}.json`
  );
  if (backendResponse.status >= 500) {
    return notFound('No such page')
  }
  try {
    const results = await backendResponse.json();
    if (!results || !results.length) {
      return notFound('No such page')
    }
    const body = home(results, pageNumber);
    return new HTMLResponse(body, ok());
  } catch (error) {
    return notFound('No such page')
  }
}
