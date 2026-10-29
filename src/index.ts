import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { aliexpressRouter } from "./endpoints/aliexpress/router";
import { AppEnv } from "./types";

// Start a Hono app
const app = new Hono<{ Bindings: AppEnv }>();

app.onError((err, c) => {
	if (err instanceof ApiException) {
		// If it's a Chanfana ApiException, let Chanfana handle the response
		return c.json(
			{ success: false, errors: err.buildResponse() },
			err.status as ContentfulStatusCode,
		);
	}

	console.error("Global error handler caught:", err);

	return c.json(
		{
			success: false,
			errors: [{ code: 7000, message: err?.message || "Internal Server Error" }],
		},
		500,
	);
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
	schema: {
		info: {
			title: "AliExpress Dropshipping Platform API",
			version: "1.0.0",
			description:
				"API integration for AliExpress dropshipping platform using the official Open Platform specification (https://openservice.aliexpress.com/). Provides complete OAuth token management, category tree exploration, and dropshipping product discovery.",
		},
	},
});

// Register AliExpress Sub router
openapi.route("/aliexpress", aliexpressRouter);

// Export the Hono app
export default app;
