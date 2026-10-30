import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { SupabaseClient } from "../../lib/supabase-client";

/**
 * DELETE /profile
 * Delete user account and associated active sessions.
 */
export class ProfileDelete extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Profile"],
		summary: "Delete customer profile and account",
		description:
			"Permanently removes the user profile and terminates all active sessions associated with the phone number.",
		request: {
			headers: z.object({
				authorization: z
					.string()
					.optional()
					.describe("Bearer <session_token> obtained from OTP verification"),
			}),
		},
		responses: {
			"200": {
				description: "Profile and sessions successfully deleted",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
					})
				),
			},
			"401": {
				description: "Unauthorized - invalid or expired session",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
					})
				),
			},
			"500": {
				description: "Internal Server Error",
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
		const authHeader = c.req.header("Authorization");

		const supabase = new SupabaseClient({
			url: c.env.SUPABASE_URL,
			key: c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_KEY,
		});

		const { session, error: authError } = await supabase.authenticateBearer(authHeader);
		if (authError || !session) {
			return c.json(
				{
					success: false,
					error: authError || "Unauthorized: invalid or expired session token.",
				},
				401
			);
		}

		const { success, error: deleteError } = await supabase.deleteProfile(session.phone);
		if (!success || deleteError) {
			return c.json(
				{
					success: false,
					error: deleteError || "Failed to delete user profile.",
				},
				500
			);
		}

		return c.json({
			success: true,
			message: "Account profile and sessions deleted successfully.",
		});
	}
}
