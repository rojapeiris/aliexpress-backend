import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { getUserFromSession } from "../../lib/supabase-client";

/**
 * GET /orders/:orderId
 * Retrieve single order details with all line items and shipping info.
 */
export class GetOrderDetail extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Orders"],
		summary: "Get order details",
		description:
			"Retrieves complete details of a specific customer order by Order ID (UUID) or Order Number (e.g. ORD-20261030-XXXX). Authenticates via Bearer session token.",
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
					.describe("Order ID (UUID) or Order Number (e.g. ORD-20261030-XXXX)"),
			}),
		},
		responses: {
			"200": {
				description: "Order details retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							order: z.object({
								id: z.string(),
								order_number: z.string(),
								status: z.string(),
								total_amount: z.number(),
								currency: z.string(),
								payment_method: z.string().nullable().optional(),
								payment_status: z.string(),
								payment_reference: z.string().nullable().optional(),
								shipping_address: z.record(z.unknown()),
								aliexpress_order_id: z.string().nullable().optional(),
								tracking_number: z.string().nullable().optional(),
								notes: z.string().nullable().optional(),
								created_at: z.string(),
								updated_at: z.string(),
								items: z.array(
									z.object({
										id: z.string().optional(),
										order_id: z.string().optional(),
										product_id: z.string(),
										product_title: z.string(),
										product_image: z.string().nullable().optional(),
										product_detail_url: z.string().nullable().optional(),
										sku_id: z.string().nullable().optional(),
										sku_properties: z.string().nullable().optional(),
										unit_price: z.number(),
										quantity: z.number(),
										total_price: z.number(),
										currency: z.string().optional(),
										created_at: z.string().optional(),
									})
								),
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
		const { orderId } = data.params;

		// Retrieve order details
		const { order, error: orderError } = await supabase.getOrderByIdOrNumber(session.phone, orderId);
		if (orderError || !order) {
			return c.json(
				{
					success: false,
					error: orderError || `Order '${orderId}' not found.`,
				},
				404
			);
		}

		return c.json({
			success: true,
			result: {
				order: {
					id: order.id,
					order_number: order.order_number,
					status: order.status,
					total_amount: order.total_amount,
					currency: order.currency,
					payment_method: order.payment_method ?? null,
					payment_status: order.payment_status,
					payment_reference: order.payment_reference ?? null,
					shipping_address: order.shipping_address,
					aliexpress_order_id: order.aliexpress_order_id ?? null,
					tracking_number: order.tracking_number ?? null,
					notes: order.notes ?? null,
					created_at: order.created_at,
					updated_at: order.updated_at,
					items: order.items.map((item) => ({
						id: item.id,
						order_id: item.order_id,
						product_id: item.product_id,
						product_title: item.product_title,
						product_image: item.product_image ?? null,
						product_detail_url: item.product_detail_url ?? null,
						sku_id: item.sku_id ?? null,
						sku_properties: item.sku_properties ?? null,
						unit_price: item.unit_price,
						quantity: item.quantity,
						total_price: item.total_price,
						currency: item.currency,
						created_at: item.created_at,
					})),
				},
			},
		});
	}
}
