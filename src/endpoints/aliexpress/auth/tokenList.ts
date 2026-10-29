import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../../types";
import { TokenRepository } from "../../../lib/token-repository";

/**
 * GET /aliexpress/auth/tokens
 * List all saved AliExpress seller tokens and their statuses.
 */
export class AliExpressTokenList extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "List all stored seller tokens",
		description: "Returns all saved AliExpress tokens along with their active/expired status.",
		responses: {
			"200": {
				description: "List of stored tokens",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.array(
							z.object({
								id: z.number().optional(),
								user_id: z.string(),
								seller_id: z.string().nullable().optional(),
								account: z.string().nullable().optional(),
								user_nick: z.string().nullable().optional(),
								access_token_masked: z.string(),
								is_access_token_expired: z.boolean(),
								is_refresh_token_expired: z.boolean(),
								access_token_expires_at: z.number(),
								refresh_token_expires_at: z.number(),
								updated_at: z.string().optional(),
							})
						),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const repo = new TokenRepository(c.env.DB);
		const tokens = await repo.findAll();

		const result = tokens.map((t) => ({
			id: t.id,
			user_id: t.user_id,
			seller_id: t.seller_id ?? null,
			account: t.account ?? null,
			user_nick: t.user_nick ?? null,
			access_token_masked:
				t.access_token.length > 8
					? `${t.access_token.substring(0, 4)}...${t.access_token.slice(-4)}`
					: "****",
			is_access_token_expired: repo.isAccessTokenExpired(t),
			is_refresh_token_expired: repo.isRefreshTokenExpired(t),
			access_token_expires_at: t.access_token_expires_at,
			refresh_token_expires_at: t.refresh_token_expires_at,
			updated_at: t.updated_at,
		}));

		return c.json({
			success: true,
			result,
		});
	}
}

