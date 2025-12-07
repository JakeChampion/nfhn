import type { Config } from "@netlify/edge-functions"
import { Elysia } from 'elysia'
import { contents } from './handlers/icon.ts'
import { item } from './handlers/item.ts'
import { top } from './handlers/top.ts'
import { user } from './handlers/user.ts'

export const app = new Elysia()
  .onError(({ code, error, set }) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error:', code, errorMessage);
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return 'Not Found';
    }
    set.status = 500;
    return 'Internal Server Error';
  })
  .get('/', ({ redirect }) => {
    redirect('/top/1');
  })
  .get('/top', ({ redirect }) => {
    redirect('/top/1')
  })
  .get('/top/', ({ redirect }) => {
    redirect('/top/1')
  })
  .get('/icon.svg', ({ set }) => {
    set.headers['content-type'] = 'image/svg+xml; charset=utf-8';
    return contents;
  })
  .get('/top/:pageNumber', ({ params, set }) => {
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
