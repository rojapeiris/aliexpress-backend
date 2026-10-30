import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { SupabaseClient, hashToken } from "../../lib/supabase-client";

/**
 * POST /auth/logout
 * Revoke the current active session in Supabase.
 */
export class AuthLogout extends OpenAPIRoute {
	public schema = {
		tags: ["Mobile App Auth - Ideamart"],
		summary: "Logout and revoke session",
		description:
			"Revokes the session in Supabase 'app_sessions' associated with the Bearer token in the Authorization header.",
		request: {
			headers: z.object({
				authorization: z
					.string()
					.describe("Bearer <session_token> to revoke"),
			}),
		},
		responses: {
			"200": {
				description: "Logged out successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
					})
				),
			},
			"400": {
				description: "Missing token",
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
		const authHeader = c.req.header("Authorization") || "";
		const token = authHeader.replace(/^Bearer\s+/i, "").trim();

		if (!token) {
			return c.json(
				{
					success: false,
					error: "Missing Authorization header.",
				},
				400
			);
		}

		const supabase = new SupabaseClient({
			url: c.env.SUPABASE_URL,
			key: c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_KEY,
		});

		const tokenHash = await hashToken(token);
		await supabase.deleteSession(tokenHash);

		return c.json({
			success: true,
			message: "Session successfully revoked. User logged out.",
		});
	}
}

