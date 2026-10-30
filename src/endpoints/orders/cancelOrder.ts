import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { SupabaseClient } from "../../lib/supabase-client";

/**
 * POST /orders/:orderId/cancel
 * Cancel an existing order by ID or order number.
 */
export class CancelOrder extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Orders"],
		summary: "Cancel an order",
		description:
			"Cancels an existing order if it is in a cancellable status ('pending', 'paid', 'processing'). Orders that are already 'shipped' or 'delivered' cannot be cancelled. Authenticates via Bearer session token.",
		request: {
			headers: z.object({
				authorization: z
					.string()
					.optional()
					.describe("Bearer <session_token> obtained from OTP verification"),
			}),
			params: z.object({
				orderId: z
					.string()
					.describe("Order ID (UUID) or Order Number (e.g. ORD-20261030-XXXX) to cancel"),
			}),
			body: contentJson(
				z.object({
					reason: z
						.string()
						.optional()
						.describe("Optional reason provided for cancelling the order"),
				})
			),
		},
		responses: {
			"200": {
				description: "Order cancelled successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						message: z.string(),
						result: z.object({
							order: z.object({
								id: z.string(),
								order_number: z.string(),
								status: z.string(),
								total_amount: z.number(),
								currency: z.string(),
								payment_status: z.string(),
								notes: z.string().nullable().optional(),
								updated_at: z.string(),
							}),
						}),
					})
				),
			},
			"400": {
				description: "Cannot cancel order in its current status",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
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
			"404": {
				description: "Order not found",
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

		// Authenticate session first
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

		const data = await this.getValidatedData<typeof this.schema>();
		const { orderId } = data.params;
		const { reason } = data.body || {};

		// Cancel order
		const { order, error: cancelError } = await supabase.cancelOrder(session.phone, orderId, reason);

		if (cancelError || !order) {
			const isNotFound = cancelError?.toLowerCase().includes("not found");
			const statusCode = isNotFound ? 404 : 400;

			return c.json(
				{
					success: false,
					error: cancelError || "Failed to cancel order.",
				},
				statusCode
			);
		}

		return c.json({
			success: true,
			message: "Order cancelled successfully.",
			result: {
				order: {
					id: order.id,
					order_number: order.order_number,
					status: order.status,
					total_amount: order.total_amount,
					currency: order.currency,
					payment_status: order.payment_status,
					notes: order.notes ?? null,
					updated_at: order.updated_at,
				},
			},
		});
	}
}
