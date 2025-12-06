import type { Config } from "@netlify/edge-functions"
import { Elysia } from 'elysia'
import { icon } from './handlers/icon.ts'
import { item } from './handlers/item.ts'
import { top } from './handlers/top.ts'
import { user } from './handlers/user.ts'

// Helper function for redirecting to top page
function redirectToTop({ set }: { set: any }) {
  set.redirect = '/top/1';
  set.status = 301;
}

const app = new Elysia()
  .onRequest((ctx) => {
    console.log(`${ctx.request.method} ${new URL(ctx.request.url).pathname}`)
  })
  .onError(({ code, error, set }) => {
    console.error('Error:', code, error.message);
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return 'Not Found';
    }
    set.status = 500;
    return 'Internal Server Error';
  })
  .get('/', redirectToTop)
  .get('/top', redirectToTop)
  .get('/top/', redirectToTop)
  .get('/icon.svg', ({ set }) => icon(set))
  .get('/top/:pageNumber', ({ params, set }) => {
    console.log('typeof Deno', typeof Deno)
    const pageNumber = Number.parseInt(params.pageNumber, 10)
    // Validate pageNumber is a valid number and between 1-20
    if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > 20) {
      set.status = 404;
      return 'Not Found';
    }
    return top(pageNumber, set)
  })
  .get('/item/:id', ({ params, set }) => {
    const id = Number.parseInt(params.id, 10)
    // Validate id is a valid number
    if (isNaN(id)) {
      set.status = 404;
      return 'Not Found';
    }
    return item(id, set)
  })
  .get('/user/:name', ({ params, set }) => {
    return user(params.name, set)
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
