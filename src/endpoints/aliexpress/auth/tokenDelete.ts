import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../../types";
import { TokenRepository } from "../../../lib/token-repository";

/**
 * DELETE /aliexpress/auth/token/:userId
 * Revoke/delete a stored token for a user.
 */
export class AliExpressTokenDelete extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Token Management"],
		summary: "Delete stored token for a user",
		description: "Removes the stored token credentials for the specified user ID.",
		request: {
			params: z.object({
				userId: z.string().describe("User ID to remove"),
			}),
		},
		responses: {
			"200": {
				description: "Token deleted successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							deleted: z.boolean(),
							user_id: z.string(),
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
		const deleted = await repo.delete(data.params.userId);

		if (!deleted) {
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
				deleted: true,
				user_id: data.params.userId,
			},
		});
	}
}

