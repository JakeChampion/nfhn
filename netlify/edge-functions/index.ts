// important to import this before anything else so that global exists before any other code runs
import "./hack/global.ts"

import type { Config } from "@netlify/edge-functions"


export default function() {
  try {
    return Response.json(typeof global)
  } catch (er) {
    return new Response(er.message + '\n' + er.stack, {status:500})
  }
}

export const config: Config = {
  method: ['GET'],
  path: '/*'
}
