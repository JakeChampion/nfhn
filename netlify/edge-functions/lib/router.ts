// router.ts - Declarative routing abstraction

export type RouteParams = Record<string, string>;

export type RouteHandler = (
  request: Request,
  params: RouteParams,
) => Response | Promise<Response>;

export interface Route {
  pattern: URLPattern;
  handler: RouteHandler;
}

/**
 * Create a route from a path pattern and handler.
 * Path patterns use URLPattern syntax:
 *   - `/feed/:page` matches `/feed/1` with params.page = "1"
 *   - `/item/:id` matches `/item/123` with params.id = "123"
 *   - `/` matches exact root
 */
export function route(pathname: string, handler: RouteHandler): Route {
  return {
    pattern: new URLPattern({ pathname }),
    handler,
  };
}

/**
 * Create a redirect response with security headers applied.
 */
export function redirect(
  location: string,
  status: 301 | 302 | 307 | 308 = 301,
  applyHeaders?: (headers: Headers) => Headers,
): Response {
  const headers = new Headers({ Location: location });
  if (applyHeaders) applyHeaders(headers);
  return new Response(null, { status, headers });
}

/**
 * Router class for matching requests against routes.
 */
export class Router {
  private routes: Route[] = [];
  private notFoundHandler: RouteHandler | null = null;
  private errorHandler: ((error: unknown, request: Request) => Response | Promise<Response>) | null = null;

  /**
   * Add a route to the router.
   */
  add(pathname: string, handler: RouteHandler): this {
    this.routes.push(route(pathname, handler));
    return this;
  }

  /**
   * Add multiple routes at once.
   */
  addAll(routes: Route[]): this {
    this.routes.push(...routes);
    return this;
  }

  /**
   * Set handler for 404 responses.
   */
  onNotFound(handler: RouteHandler): this {
    this.notFoundHandler = handler;
    return this;
  }

  /**
   * Set handler for uncaught errors.
   */
  onError(handler: (error: unknown, request: Request) => Response | Promise<Response>): this {
    this.errorHandler = handler;
    return this;
  }

  /**
   * Match a request against all routes and execute the first matching handler.
   */
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      for (const { pattern, handler } of this.routes) {
        const match = pattern.exec(url);
        if (match) {
          const params = match.pathname.groups as RouteParams;
          return await handler(request, params);
        }
      }

      if (this.notFoundHandler) {
        return await this.notFoundHandler(request, {});
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      if (this.errorHandler) {
        return await this.errorHandler(error, request);
      }
      throw error;
    }
  }
}

/**
 * Helper to parse a parameter as a positive integer.
 * Returns null if invalid.
 */
export function parseIntParam(value: string | undefined): number | null {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num < 1) return null;
  return num;
}
