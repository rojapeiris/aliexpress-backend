import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY } from "../../../types";
import { ALIEXPRESS_AUTH_URL } from "../../../lib/aliexpress-client";

/**
 * GET /aliexpress/auth/authorize
 * Returns the OAuth authorization URL that the seller must visit
 * to grant your app access to their AliExpress account.
 *
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressAuthorize extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "Get OAuth authorization URL",
		description:
			"Returns the AliExpress OAuth 2.0 authorization URL. Redirect the seller to this URL. After the seller signs in and grants permission, AliExpress redirects back to your redirect_uri with an authorization code parameter.",
		request: {
			query: z.object({
				redirect_uri: z.string().url().describe("Your OAuth callback URL"),
				force_auth: z
					.enum(["true", "false"])
					.optional()
					.default("false")
					.describe("Force re-authentication (refreshes browser session)"),
			}),
		},
		responses: {
			"200": {
				description: "Authorization URL generated successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							authorization_url: z.string(),
							client_id: z.string(),
							instructions: z.string(),
						}),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const appKey = c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY;

		const params = new URLSearchParams({
			response_type: "code",
			client_id: appKey,
			redirect_uri: data.query.redirect_uri,
			force_auth: data.query.force_auth ?? "false",
		});

		const authorizationUrl = `${ALIEXPRESS_AUTH_URL}?${params.toString()}`;

		return c.json({
			success: true,
			result: {
				authorization_url: authorizationUrl,
				client_id: appKey,
				instructions:
					"1. Open the authorization_url in a browser. 2. The seller logs in to AliExpress and authorizes the application. 3. AliExpress redirects to your redirect_uri with ?code=AUTHORIZATION_CODE. 4. Call POST /aliexpress/auth/token/create with that code to receive and save your access token.",
			},
		});
	}
}
