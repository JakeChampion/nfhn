import type { Config } from "@netlify/edge-functions"
import { Hono } from 'https://deno.land/x/hono/mod.ts'
import { handle } from 'https://deno.land/x/hono/adapter/netlify/mod.ts'

import { logger } from "https://deno.land/x/hono@v4.3.11/middleware/logger/index.ts"
import { icon } from './handlers/icon.ts'
import { item } from './handlers/item.ts'
import { redirectToTop } from './handlers/redirectToTop.ts'
import { top } from './handlers/top.ts'
import { user } from './handlers/user.ts'

const app = new Hono()
app.use('*', logger())
app.get('/', redirectToTop)
app.get('/top', redirectToTop)
app.get('/top/', redirectToTop)
app.get('/icon.svg', icon)
app.get('/top/:pageNumber{[1]?[0-9]|20}', (c) => {
  // const TIMER_LABEL = 'edge-log-duration'
const COUNT_LABEL = 'edge-log-count'

console.clear()

console.log('Hello world!');
console.error('Something went wrong!');

// console.time(TIMER_LABEL)
console.count(COUNT_LABEL)

console.assert(Infinity == Math.random(), 'Edge functions expect HTTPS URLs')
console.log(`log log log`)
console.info('info info info')
console.debug('debug debug debug')
console.warn('warn warn warn')
console.error('error error error')

console.group('grouped log')

console.groupCollapsed('Something')
console.table(["apples", "oranges", "bananas"]);
console.groupEnd()

console.groupCollapsed('Stuff')
console.table(["carrots", "peas", "lettuce"]);
console.groupEnd()

console.dir({ a: 1, b: 2, c: 3, d: { e: 5, f: 6 } }, { depth: null })

console.dirxml({
  g: 1,
  h: 2,
  i: 3,
  j: { k: 5, l: 6 },
})
console.trace('Trace marker for request diagnostics')

console.groupEnd()

// console.timeLog(TIMER_LABEL, 'Finished console instrumentation')
// console.timeStamp(`response-ready`)
// console.timeEnd(TIMER_LABEL)
console.countReset(COUNT_LABEL)
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

export default handle(app)
export const config: Config = {
  method: ['GET'],
  path: '/*'
}
