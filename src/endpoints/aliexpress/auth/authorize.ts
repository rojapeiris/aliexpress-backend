import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY } from "../../../types";
import { ALIEXPRESS_AUTH_URL } from "../../../lib/aliexpress-client";

/**
 * GET /aliexpress/auth/authorize
 * Returns the OAuth authorization URL that the seller/customer must visit
 * to grant your app access to their AliExpress account.
 *
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressAuthorize extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "Get OAuth authorization URL",
		description:
			"Returns the AliExpress OAuth 2.0 authorization URL. Redirect the user to this URL. You can pass a 'state' (e.g. customer_id or store_id) which AliExpress will return back to your callback.",
		request: {
			query: z.object({
				redirect_uri: z.string().url().describe("Your OAuth callback URL"),
				state: z
					.string()
					.optional()
					.describe("Customer / user ID or custom state parameter to identify the customer upon return"),
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

		const queryParams: Record<string, string> = {
			response_type: "code",
			client_id: appKey,
			redirect_uri: data.query.redirect_uri,
			force_auth: data.query.force_auth ?? "false",
		};

		if (data.query.state) {
			queryParams.state = data.query.state;
		}

		const params = new URLSearchParams(queryParams);
		const authorizationUrl = `${ALIEXPRESS_AUTH_URL}?${params.toString()}`;

		return c.json({
			success: true,
			result: {
				authorization_url: authorizationUrl,
				client_id: appKey,
				instructions:
					"1. Direct the customer/seller to authorization_url. 2. After they authorize, AliExpress redirects to redirect_uri with ?code=CODE&state=CUSTOMER_ID. 3. The callback saves their token mapped to their customer ID.",
			},
		});
	}
}
