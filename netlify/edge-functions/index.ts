import type { Config } from "@netlify/edge-functions"
import { Hono } from 'https://deno.land/x/hono/mod.ts'
import { handle } from 'https://deno.land/x/hono/adapter/netlify/mod.ts'
import { logger } from "https://deno.land/x/hono@v4.3.11/middleware/logger/index.ts"
import { icon } from './handlers/icon.ts'
import { item } from './handlers/item.ts'
import { top } from './handlers/top.ts'
import { user } from './handlers/user.ts'
import { permanentRedirect } from "https://ghuc.cc/worker-tools/response-creators";
export function redirectToTop() {
  return permanentRedirect("/top/1");
}
const app = new Hono()
app.use('*', logger())
app.get('/', redirectToTop)
app.get('/top', redirectToTop)
app.get('/top/', redirectToTop)
app.get('/icon.svg', icon)
app.get('/top/:pageNumber{[1]?[0-9]|20}', (c) => {
  console.log('typeof Deno', typeof Deno)
  const pageNumber = Number.parseInt(c.req.param('pageNumber'), 10)
  return top(pageNumber)
})
app.get('/item/:id{[0-9]+}', (c) => {
  const id = Number.parseInt(c.req.param('id'), 10)
  return item(id)
})
app.get('/user/:name', (c) => {
  const name = c.req.param('name')
  return user(name)
})
app.get('/error', (c) => {
  throw new Error('uh oh')
})

export default handle(app)

// export default async () => {
//   throw new Error('meow')
//   return new Response("Hello World", {
//     headers: { "content-type": "text/plain" },
//   });
// };
export const config: Config = {
  method: ['GET'],
  path: '/*'
}
