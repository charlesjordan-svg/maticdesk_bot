// @ts-check
/**
 * The one-line route constructor, in its own module so pages and the router do not import each
 * other in a circle. A route is: method, a regex over the path (named groups become
 * `ctx.params`), THE PERMISSION THAT OPENS IT, and the handler. The permission is not optional and
 * there is no "public" value — the router refuses a route without one by construction, because the
 * two routes that need no permission (login, logout) are handled before the table is consulted.
 */

/**
 * @param {"GET"|"POST"} method
 * @param {RegExp} pattern
 * @param {string} permission
 * @param {(ctx: any) => Promise<void>} handler
 */
export function route(method, pattern, permission, handler) {
  if (typeof permission !== "string" || !permission.includes(".")) {
    throw new Error(`route ${method} ${pattern} needs a permission`);
  }
  return { method, pattern, permission, handler };
}
