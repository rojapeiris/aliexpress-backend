import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { getUserFromSession } from "../../lib/supabase-client";

/**
 * GET /profile
 * Retrieve the authenticated user's profile details.
 */
export class ProfileGet extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Profile"],
		summary: "Get customer profile",
		description:
			"Retrieves the active user's profile information from Supabase using their Bearer session token.",
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
				description: "Profile retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							profile: z.object({
								id: z.string(),
								phone: z.string(),
								subscriber_id: z.string().nullable().optional(),
								full_name: z.string().nullable().optional(),
								email: z.string().nullable().optional(),
								avatar_url: z.string().nullable().optional(),
								address_line1: z.string().nullable().optional(),
								address_line2: z.string().nullable().optional(),
								city: z.string().nullable().optional(),
								state_province: z.string().nullable().optional(),
								postal_code: z.string().nullable().optional(),
								country: z.string().optional(),
								created_at: z.string().optional(),
								updated_at: z.string().optional(),
							}),
						}),
					})
				),
			},
			"401": {
				description: "Unauthorized",
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
		if (authError || !session || !profile) {
			return c.json(
				{
					success: false,
					error: authError || "Unauthorized: invalid or expired session token.",
				},
				401
			);
		}

		return c.json({
			success: true,
			result: {
				profile: {
					id: profile.id,
					phone: profile.phone,
					subscriber_id: profile.subscriber_id ?? null,
					full_name: profile.full_name ?? null,
					email: profile.email ?? null,
					avatar_url: profile.avatar_url ?? null,
					address_line1: profile.address_line1 ?? null,
					address_line2: profile.address_line2 ?? null,
					city: profile.city ?? null,
					state_province: profile.state_province ?? null,
					postal_code: profile.postal_code ?? null,
					country: profile.country || "LK",
					created_at: profile.created_at,
					updated_at: profile.updated_at,
				},
			},
		});
	}
}

