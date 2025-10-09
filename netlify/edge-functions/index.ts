import type { Config } from "@netlify/edge-functions"


export default function() {
  try {
    return Response.json(typeof global)
  } catch (er) {
    return new Response(er.message + '\n' + er.stack, {status:500})
  }
})

export const config: Config = {
  method: ['GET'],
  path: '/*'
}
