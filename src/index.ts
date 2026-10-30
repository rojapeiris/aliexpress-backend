import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { aliexpressRouter } from "./endpoints/aliexpress/router";
import { mobileAuthRouter } from "./endpoints/auth/router";
import { profileRouter } from "./endpoints/profile/router";
import { ordersRouter } from "./endpoints/orders/router";
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
				"API integration for AliExpress dropshipping platform using the official Open Platform specification. Provides complete OAuth token management, category tree exploration, dropshipping product discovery, Ideamart OTP mobile auth, customer profiles, and order management.",
		},
	},
});

// Register Sub routers
openapi.route("/auth", mobileAuthRouter);
openapi.route("/profile", profileRouter);
openapi.route("/orders", ordersRouter);
openapi.route("/aliexpress", aliexpressRouter);

// Export the Hono app
export default app;
