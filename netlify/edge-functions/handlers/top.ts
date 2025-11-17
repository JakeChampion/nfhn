import { HTMLResponse } from "https://ghuc.cc/worker-tools/html";
import { notFound, ok, internalServerError } from "https://ghuc.cc/worker-tools/response-creators";

import { home } from "../layouts/hn.ts";

export async function top(pageNumber) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/news/${pageNumber}.json`
  );
  if (backendResponse.status >= 300) {
    return notFound('No such page')
  }
  let body = await backendResponse.text()
  try {
    let results = JSON.parse(body);
    if (!results) {
      return notFound('No such page')
    }
    return new HTMLResponse(home(results, pageNumber), ok());
  } catch (error) {
    return internalServerError(`Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(body)}`)
  }
}
