import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { getUserFromSession } from "../../lib/supabase-client";

/**
 * GET /auth/me
 * Validate session token and retrieve current user profile from Supabase.
 */
export class AuthMe extends OpenAPIRoute {
	public schema = {
		tags: ["Mobile App Auth - Ideamart"],
		summary: "Get current user profile and session info",
		description:
			"Validates the Bearer token passed in the Authorization header against Supabase 'app_sessions' and returns the active user profile.",
		request: {
			headers: z.object({
				authorization: z
					.string()
					.describe("Bearer <session_token> obtained from OTP verification"),
			}),
		},
		responses: {
			"200": {
				description: "Session is valid",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							session: z.object({
								id: z.string(),
								phone: z.string(),
								expires_at: z.string(),
							}),
							profile: z
								.object({
									id: z.string(),
									phone: z.string(),
									full_name: z.string().nullable().optional(),
									email: z.string().nullable().optional(),
									city: z.string().nullable().optional(),
								})
								.nullable(),
						}),
					})
				),
			},
			"401": {
				description: "Unauthorized or expired session",
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
		const { session, profile, error: authError } = await getUserFromSession(c);
		if (authError || !session) {
			return c.json(
				{
					success: false,
					error: authError || "Session is invalid or has expired. Please authenticate again with OTP.",
				},
				401
			);
		}

		return c.json({
			success: true,
			result: {
				session: {
					id: session.id,
					phone: session.phone,
					expires_at: session.expires_at,
				},
				profile: profile
					? {
							id: profile.id,
							phone: profile.phone,
							full_name: profile.full_name,
							email: profile.email,
							city: profile.city,
					  }
					: null,
			},
		});
	}
}

