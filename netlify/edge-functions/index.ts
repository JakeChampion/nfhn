import type { Config } from "@netlify/edge-functions"
import { Elysia } from 'elysia'
import { icon } from './handlers/icon.ts'
import { item } from './handlers/item.ts'
import { top } from './handlers/top.ts'
import { user } from './handlers/user.ts'
import { permanentRedirect } from "https://ghuc.cc/worker-tools/response-creators";

export function redirectToTop() {
  return permanentRedirect("/top/1");
}

const app = new Elysia()
  .onRequest((ctx) => {
    console.log(`${ctx.request.method} ${new URL(ctx.request.url).pathname}`)
  })
  .get('/', redirectToTop)
  .get('/top', redirectToTop)
  .get('/top/', redirectToTop)
  .get('/icon.svg', icon)
  .get('/top/:pageNumber', ({ params }) => {
    console.log('typeof Deno', typeof Deno)
    const pageNumber = Number.parseInt(params.pageNumber, 10)
    // Validate pageNumber is a valid number and between 1-20
    if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > 20) {
      return new Response('Not Found', { status: 404 })
    }
    return top(pageNumber)
  })
  .get('/item/:id', ({ params }) => {
    const id = Number.parseInt(params.id, 10)
    // Validate id is a valid number
    if (isNaN(id)) {
      return new Response('Not Found', { status: 404 })
    }
    return item(id)
  })
  .get('/user/:name', ({ params }) => {
    return user(params.name)
  })
  .get('/error', () => {
    throw new Error('uh oh')
  })

export default async (request: Request) => {
  return app.handle(request)
}

export const config: Config = {
  method: ['GET'],
  path: '/*',
}
