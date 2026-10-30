import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { getUserFromSession } from "../../lib/supabase-client";

/**
 * PATCH /profile
 * Update the authenticated user's profile details.
 */
export class ProfileUpdate extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Profile"],
		summary: "Update customer profile",
		description:
			"Updates the authenticated user's profile information (name, email, shipping address, city, etc.) stored in Supabase. Authenticates via Bearer session token.",
		request: {
			headers: z.object({
				authorization: z
					.string()
					.optional()
					.describe("Bearer <session_token> obtained from OTP verification"),
			}),
			body: contentJson(
				z.object({
					full_name: z.string().optional().describe("User's full name"),
					email: z.string().email().nullable().optional().or(z.literal("")).describe("Email address"),
					avatar_url: z.string().nullable().optional().or(z.literal("")).describe("Avatar/profile picture URL"),
					address_line1: z.string().optional().describe("Primary street address"),
					address_line2: z.string().optional().describe("Apartment, suite, unit, etc."),
					city: z.string().optional().describe("City / Town"),
					state_province: z.string().optional().describe("State or Province"),
					postal_code: z.string().optional().describe("Postal / ZIP code"),
					country: z.string().optional().default("LK").describe("Country code (default 'LK')"),
				})
			),
		},
		responses: {
			"200": {
				description: "Profile updated successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
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
								updated_at: z.string().optional(),
							}),
						}),
					})
				),
			},
			"401": {
				description: "Unauthorized - missing or invalid session",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
					})
				),
			},
			"400": {
				description: "Bad Request - update failed",
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
		const { session, error: authError, supabase } = await getUserFromSession(c);
		if (authError || !session) {
			return c.json(
				{
					success: false,
					error: authError || "Unauthorized: invalid or expired session token.",
				},
				401
			);
		}

		const data = await this.getValidatedData<typeof this.schema>();
		const body = data.body;

		// Update profile in Supabase
		const { profile, error: updateError } = await supabase.updateProfile(session.phone, {
			full_name: body.full_name,
			email: body.email === "" ? null : body.email,
			avatar_url: body.avatar_url === "" ? null : body.avatar_url,
			address_line1: body.address_line1,
			address_line2: body.address_line2,
			city: body.city,
			state_province: body.state_province,
			postal_code: body.postal_code,
			country: body.country,
		});

		if (updateError || !profile) {
			return c.json(
				{
					success: false,
					error: updateError || "Failed to update profile.",
				},
				400
			);
		}

		return c.json({
			success: true,
			message: "Profile updated successfully.",
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
					updated_at: profile.updated_at,
				},
			},
		});
	}
}

