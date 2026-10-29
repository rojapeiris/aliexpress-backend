import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAuthApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RefreshTokenApiResponse {
	access_token: string;
	refresh_token: string;
	expires_in: string | number;
	refresh_token_valid_time: string | number;
	user_id?: string;
	seller_id?: string;
	user_nick?: string;
	account?: string;
}

/**
 * POST /aliexpress/auth/token/refresh
 * Refresh an expired access_token using a refresh_token.
 * Can take a refresh_token explicitly or look up the stored token for a user_id.
 *
 * Docs: https://openservice.aliexpress.com/ → /auth/token/refresh
 */
export class AliExpressTokenRefresh extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "Refresh access token",
		description:
			"Uses a refresh_token to acquire a new active access_token pair without requiring the user to re-authenticate. Automatically updates the database record.",
		request: {
			body: contentJson(
				z.object({
					user_id: z
						.string()
						.optional()
						.describe(
							"User ID to refresh token for (looks up refresh_token from D1 database). If omitted, pass refresh_token directly."
						),
					refresh_token: z
						.string()
						.optional()
						.describe("AliExpress refresh_token (optional if user_id is provided)"),
				})
			),
		},
		responses: {
			"200": {
				description: "Token refreshed successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							user_id: z.string(),
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
				description: "Failed to refresh token",
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
		const repo = new TokenRepository(c.env.DB);

		let refreshToken = data.body.refresh_token;
		let userId = data.body.user_id;
		let existingRecord = null;

		if (userId) {
			existingRecord = await repo.findByUserId(userId);
			if (existingRecord && !refreshToken) {
				refreshToken = existingRecord.refresh_token;
			}
		} else if (!refreshToken) {
			// Try to get latest token
			existingRecord = await repo.getLatestToken();
			if (existingRecord) {
				userId = existingRecord.user_id;
				refreshToken = existingRecord.refresh_token;
			}
		}

		if (!refreshToken) {
			return c.json(
				{
					success: false,
					error:
						"No refresh_token found. Provide 'refresh_token' in the request body or 'user_id' with an existing stored token.",
				},
				400
			);
		}

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Call AliExpress /auth/token/refresh
		const apiResult = await callAuthApi<RefreshTokenApiResponse>(
			config,
			"/auth/token/refresh",
			{ refresh_token: refreshToken }
		);

		if (!apiResult.success || !apiResult.data) {
			return c.json(
				{
					success: false,
					error: apiResult.error ?? "Failed to refresh token",
					errorCode: apiResult.errorCode,
				},
				400
			);
		}

		const tokenData = apiResult.data;
		const now = Date.now();
		const expiresInSeconds = Number(tokenData.expires_in) || 86400;
		const accessTokenExpiresAt = now + expiresInSeconds * 1000;

		let refreshTokenExpiresAt = Number(tokenData.refresh_token_valid_time) || 0;
		if (refreshTokenExpiresAt > 0 && refreshTokenExpiresAt < 10000000000) {
			refreshTokenExpiresAt *= 1000;
		}
		if (refreshTokenExpiresAt === 0) {
			refreshTokenExpiresAt = now + 30 * 24 * 3600 * 1000;
		}

		const resolvedUserId = userId || String(tokenData.user_id || tokenData.seller_id || "default_seller");

		await repo.upsert({
			user_id: resolvedUserId,
			seller_id: existingRecord?.seller_id ?? tokenData.seller_id,
			account: existingRecord?.account ?? tokenData.account,
			user_nick: existingRecord?.user_nick ?? tokenData.user_nick,
			access_token: tokenData.access_token,
			refresh_token: tokenData.refresh_token || refreshToken,
			access_token_expires_at: accessTokenExpiresAt,
			refresh_token_expires_at: refreshTokenExpiresAt,
		});

		return c.json({
			success: true,
			result: {
				user_id: resolvedUserId,
				access_token: tokenData.access_token,
				refresh_token: tokenData.refresh_token || refreshToken,
				access_token_expires_at: accessTokenExpiresAt,
				refresh_token_expires_at: refreshTokenExpiresAt,
				expires_in: expiresInSeconds,
			},
		});
	}
}

