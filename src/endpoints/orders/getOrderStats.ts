import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { SupabaseClient } from "../../lib/supabase-client";

/**
 * GET /orders/stats
 * Get breakdown of order counts by status for the current user.
 */
export class GetOrderStats extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Orders"],
		summary: "Get order statistics",
		description:
			"Returns the total number of orders placed by the user, broken down by order status (pending, paid, processing, shipped, delivered, cancelled). Useful for dashboard badge counters.",
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
				description: "Order statistics retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							stats: z.object({
								total: z.number(),
								pending: z.number(),
								paid: z.number(),
								processing: z.number(),
								shipped: z.number(),
								delivered: z.number(),
								cancelled: z.number(),
							}),
						}),
					})
				),
			},
			"401": {
				description: "Unauthorized – missing or invalid session",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
					})
				),
			},
			"400": {
				description: "Failed to retrieve order statistics",
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

		// Authenticate session
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

		const { stats, error: statsError } = await supabase.getOrderStats(session.phone);
		if (statsError) {
			return c.json(
				{
					success: false,
					error: statsError,
				},
				400
			);
		}

		return c.json({
			success: true,
			result: {
				stats,
			},
		});
	}
}
