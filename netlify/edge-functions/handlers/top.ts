import { home } from "../layouts/hn.ts";

interface SetContext {
  status?: number;
  headers: Record<string, string>;
}

export async function top(pageNumber: number, set: SetContext) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/news/${pageNumber}.json`
  );
  if (backendResponse.status >= 300) {
    if (backendResponse.status >= 500) {
      set.status = 502;
      return 'Backend service error';
    }
    set.status = 404;
    return 'No such page';
  }
  let body = await backendResponse.text()
  try {
    let results = JSON.parse(body);
    if (!results) {
      set.status = 404;
      return 'No such page';
    }
    set.headers['content-type'] = 'text/html; charset=utf-8';
    return home(results, pageNumber);
  } catch (error) {
    set.status = 500;
    return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(body)}`;
  }
}
