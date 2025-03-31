import { HTMLResponse } from "https://ghuc.cc/worker-tools/html";
import { notFound, internalServerError, ok } from "https://ghuc.cc/worker-tools/response-creators";

import { user as profile } from "../layouts/user.ts";

export async function user(name) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/user/${name}.json`
  );

  if (backendResponse.status >= 500) {
    return notFound('No such page')
  }
  let body = await backendResponse.text()
  try {
    let results = JSON.parse(body);
    if (!results || !results.length) {
      return notFound('No such page')
    }
    return new HTMLResponse(profile(results), ok());
  } catch (error) {
    return internalServerError(`Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(body)}`)
  }
}
