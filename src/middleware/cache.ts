import { Context, Next } from "hono";

export interface CacheOptions {
	ttl?: number; // Time to live in seconds
	staleWhileRevalidate?: number; // SWR window in seconds
}

/**
 * Cloudflare Workers Cache API Middleware
 *
 * Automatically caches GET responses using Cloudflare's `caches.default`
 * and attaches Cache-Control headers for Cloudflare Edge and browser caching.
 *
 * Features:
 * - Only caches GET requests with HTTP 200 responses
 * - Caches per unique URL (including query string parameters like page_no, category_id, etc.)
 * - Attaches `X-Cache: HIT` / `X-Cache: MISS` headers
 * - Bypass cache on `?refresh=true` or `Cache-Control: no-cache`
 * - Non-blocking background cache write via `c.executionCtx.waitUntil`
 */
export function cfCache(options: CacheOptions | number = 86400) {
	const ttl = typeof options === "number" ? options : options.ttl ?? 86400;
	const swr = typeof options === "number" ? 300 : options.staleWhileRevalidate ?? 300;

	return async (c: Context, next: Next) => {
		// Only cache GET requests
		if (c.req.method !== "GET") {
			return next();
		}

		const url = new URL(c.req.url);
		const refreshRequested =
			url.searchParams.get("refresh") === "true" ||
			c.req.header("Cache-Control")?.includes("no-cache") ||
			c.req.header("Pragma")?.includes("no-cache");

		// Access Cloudflare Workers default cache
		const cache = typeof caches !== "undefined" ? caches.default : null;
		const cacheKey = new Request(c.req.url, {
			method: "GET",
			headers: c.req.raw.headers,
		});

		// Check cache if not bypassed
		if (cache && !refreshRequested) {
			try {
				const cachedResponse = await cache.match(cacheKey);
				if (cachedResponse) {
					// Return cached response with cache hit headers
					const response = new Response(cachedResponse.body, cachedResponse);
					response.headers.set("X-Cache", "HIT");
					response.headers.set("CF-Cache-Status", "HIT");
					return response;
				}
			} catch (err) {
				console.warn("[Cache] Error matching cache:", err);
			}
		}

		// Proceed to handler
		await next();

		// Only cache successful 200 responses
		if (c.res && c.res.status === 200) {
			const cacheControlHeader = `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=${swr}`;
			c.res.headers.set("Cache-Control", cacheControlHeader);
			c.res.headers.set("X-Cache", "MISS");

			if (cache) {
				try {
					const responseToCache = c.res.clone();
					if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
						c.executionCtx.waitUntil(cache.put(cacheKey, responseToCache));
					} else {
						await cache.put(cacheKey, responseToCache);
					}
				} catch (err) {
					console.warn("[Cache] Error putting into cache:", err);
				}
			}
		}
	};
}

