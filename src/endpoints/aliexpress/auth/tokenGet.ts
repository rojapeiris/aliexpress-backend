import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../../types";
import { TokenRepository } from "../../../lib/token-repository";

/**
 * GET /aliexpress/auth/token/:userId
 * Get the stored token and expiration details for a specific user ID.
 */
export class AliExpressTokenGet extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "Get stored token details for a user",
		description:
			"Retrieves the active token, remaining validity, and expiry status for a user ID.",
		request: {
			params: z.object({
				userId: z.string().describe("User ID of the seller"),
			}),
		},
		responses: {
			"200": {
				description: "Token details",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							user_id: z.string(),
							seller_id: z.string().nullable().optional(),
							account: z.string().nullable().optional(),
							user_nick: z.string().nullable().optional(),
							access_token: z.string(),
							refresh_token: z.string(),
							is_access_token_expired: z.boolean(),
							is_refresh_token_expired: z.boolean(),
							access_token_expires_at: z.number(),
							refresh_token_expires_at: z.number(),
							updated_at: z.string().optional(),
						}),
					})
				),
			},
			"404": {
				description: "Token not found",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const repo = new TokenRepository(c.env.DB);
		const record = await repo.findByUserId(data.params.userId);

		if (!record) {
			return c.json(
				{
					success: false,
					error: `No token found for user_id: ${data.params.userId}`,
				},
				404
			);
		}

		return c.json({
			success: true,
			result: {
				user_id: record.user_id,
				seller_id: record.seller_id ?? null,
				account: record.account ?? null,
				user_nick: record.user_nick ?? null,
				access_token: record.access_token,
				refresh_token: record.refresh_token,
				is_access_token_expired: repo.isAccessTokenExpired(record),
				is_refresh_token_expired: repo.isRefreshTokenExpired(record),
				access_token_expires_at: record.access_token_expires_at,
				refresh_token_expires_at: record.refresh_token_expires_at,
				updated_at: record.updated_at,
			},
		});
	}
}

