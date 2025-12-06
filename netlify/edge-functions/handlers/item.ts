import { article } from "../layouts/article.ts";

export async function item(id: number, set: any) {
  const backendResponse = await fetch(
    `https://api.hnpwa.com/v0/item/${id}.json`
  );
  if (backendResponse.status >= 500) {
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
    return article(results);
  } catch (error) {
    set.status = 500;
    return `Hacker News API did not return valid JSON.\n\nResponse Body: ${JSON.stringify(body)}`;
  }
}
