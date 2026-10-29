import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAuthApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface CreateTokenApiResponse {
	access_token: string;
	refresh_token: string;
	expires_in: string | number;
	refresh_token_valid_time: string | number;
	account?: string;
	seller_id?: string;
	user_id: string;
	user_nick?: string;
	sp?: string;
}

/**
 * POST /aliexpress/auth/token/create
 * Exchange an OAuth authorization code for access_token and refresh_token.
 * Automatically saves the token to Cloudflare D1.
 *
 * Docs: https://openservice.aliexpress.com/ → /auth/token/create
 */
export class AliExpressTokenCreate extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "Create access token from authorization code",
		description:
			"Exchanges the temporary OAuth authorization code (obtained from the seller redirect callback) for a valid access_token and refresh_token, and stores them in Cloudflare D1.",
		request: {
			body: contentJson(
				z.object({
					code: z
						.string()
						.min(1)
						.describe("Authorization code received from the OAuth callback URL"),
					user_id: z
						.string()
						.optional()
						.describe(
							"Optional custom user/seller identifier in your database (defaults to the AliExpress user_id returned by the API)"
						),
				})
			),
		},
		responses: {
			"200": {
				description: "Token created and stored successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							user_id: z.string(),
							seller_id: z.string().optional(),
							user_nick: z.string().optional(),
							account: z.string().optional(),
							access_token: z.string(),
							refresh_token: z.string(),
							access_token_expires_at: z.number(),
							refresh_token_expires_at: z.number(),
							expires_in: z.number(),
						}),
					})
				),
			},
			"400": {
				description: "Failed to exchange code for token",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						errorCode: z.string().optional(),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Call AliExpress /auth/token/create
		const apiResult = await callAuthApi<CreateTokenApiResponse>(
			config,
			"/auth/token/create",
			{ code: data.body.code }
		);

		if (!apiResult.success || !apiResult.data) {
			return c.json(
				{
					success: false,
					error: apiResult.error ?? "Failed to create access token",
					errorCode: apiResult.errorCode,
				},
				400
			);
		}

		const tokenData = apiResult.data;
		const now = Date.now();
		const expiresInSeconds = Number(tokenData.expires_in) || 86400;
		const accessTokenExpiresAt = now + expiresInSeconds * 1000;

		// refresh_token_valid_time can be epoch ms or seconds
		let refreshTokenExpiresAt = Number(tokenData.refresh_token_valid_time) || 0;
		if (refreshTokenExpiresAt > 0 && refreshTokenExpiresAt < 10000000000) {
			refreshTokenExpiresAt *= 1000;
		}
		if (refreshTokenExpiresAt === 0) {
			// Default 30 days
			refreshTokenExpiresAt = now + 30 * 24 * 3600 * 1000;
		}

		const resolvedUserId = data.body.user_id || String(tokenData.user_id || tokenData.seller_id || "default_seller");

		const repo = new TokenRepository(c.env.DB);
		await repo.upsert({
			user_id: resolvedUserId,
			seller_id: tokenData.seller_id ? String(tokenData.seller_id) : undefined,
			account: tokenData.account,
			user_nick: tokenData.user_nick,
			access_token: tokenData.access_token,
			refresh_token: tokenData.refresh_token,
			access_token_expires_at: accessTokenExpiresAt,
			refresh_token_expires_at: refreshTokenExpiresAt,
		});

		return c.json({
			success: true,
			result: {
				user_id: resolvedUserId,
				seller_id: tokenData.seller_id ? String(tokenData.seller_id) : undefined,
				user_nick: tokenData.user_nick,
				account: tokenData.account,
				access_token: tokenData.access_token,
				refresh_token: tokenData.refresh_token,
				access_token_expires_at: accessTokenExpiresAt,
				refresh_token_expires_at: refreshTokenExpiresAt,
				expires_in: expiresInSeconds,
			},
		});
	}
}
