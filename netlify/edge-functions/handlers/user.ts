import { HTMLResponse } from "https://ghuc.cc/worker-tools/html";
import { internalServerError, ok } from "https://ghuc.cc/worker-tools/response-creators";

import { user as profile } from "../layouts/user.ts";

export async function user(name) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/user/${name}.json`
  );
  if (backendResponse.status != 200) {
    return internalServerError('https://api.hnpwa.com is currently not responding')
  }
  const results = await backendResponse.json();
  const body = profile(results);
  return new HTMLResponse(body, ok());
}
