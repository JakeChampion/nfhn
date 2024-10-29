import { HTMLResponse } from "https://ghuc.cc/worker-tools/html";
import { internalServerError, ok, notFound } from "https://ghuc.cc/worker-tools/response-creators";

import { article } from "../layouts/article.ts";

export async function item(id) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/item/${id}.json`
  );
  if (backendResponse.status >= 500) {
    return internalServerError('https://api.hnpwa.com is currently not responding')
  }
  const results = await backendResponse.json();
  if (!results) {
    return notFound('No such item')
  }
  const body = article(results);
  return new HTMLResponse(body, ok());
}
