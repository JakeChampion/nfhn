import { HTMLResponse } from "https://ghuc.cc/worker-tools/html";
import { internalServerError, ok, notFound } from "https://ghuc.cc/worker-tools/response-creators";

import { article } from "../layouts/article.ts";

export async function item(id) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/item/${id}.json`
  );
  if (backendResponse.status >= 500) {
    return notFound('No such page')
  }
  let body = await backendResponse.text()
  try {
    let results = JSON.parse(body);
    if (!results) {
      return notFound('No such page')
    }
    return new HTMLResponse(article(results), ok());
  } catch (error) {
    return internalServerError(`Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(body)}`)
  }
}
