import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { getUserFromSession } from "../../lib/supabase-client";

/**
 * GET /orders
 * Returns a paginated list of orders for the authenticated customer.
 */
export class GetOrderList extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Orders"],
		summary: "Get order list",
		description:
			"Returns a paginated list of orders (with line items) for the authenticated customer. " +
			"Optionally filter by order status. Authenticates via Bearer session token.",
		request: {
			headers: z.object({
				authorization: z
					.string()
					.optional()
					.describe("Bearer <session_token> obtained from OTP verification"),
			}),
			query: z.object({
				page_no: z
					.string()
					.optional()
					.transform((v) => (v ? Math.max(1, parseInt(v, 10)) : 1))
					.describe("Page number (default: 1)"),
				page_size: z
					.string()
					.optional()
					.transform((v) => (v ? Math.min(50, Math.max(1, parseInt(v, 10))) : 20))
					.describe("Results per page (default: 20, max: 50)"),
				status: z
					.enum(["pending", "paid", "processing", "shipped", "delivered", "cancelled"])
					.optional()
					.describe("Filter orders by status"),
			}),
		},
		responses: {
			"200": {
				description: "Order list retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							orders: z.array(
								z.object({
									id: z.string(),
									order_number: z.string(),
									status: z.string(),
									total_amount: z.number(),
									currency: z.string(),
									payment_method: z.string().nullable().optional(),
									payment_status: z.string(),
									shipping_address: z.record(z.unknown()),
									aliexpress_order_id: z.string().nullable().optional(),
									tracking_number: z.string().nullable().optional(),
									notes: z.string().nullable().optional(),
									created_at: z.string(),
									updated_at: z.string(),
									items: z.array(
										z.object({
											id: z.string().optional(),
											product_id: z.string(),
											product_title: z.string(),
											product_image: z.string().nullable().optional(),
											sku_id: z.string().nullable().optional(),
											sku_properties: z.string().nullable().optional(),
											unit_price: z.number(),
											quantity: z.number(),
											total_price: z.number(),
											currency: z.string().optional(),
										})
									),
								})
							),
							total: z.number(),
							page_no: z.number(),
							page_size: z.number(),
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
				description: "Bad Request – failed to fetch orders",
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
		const { page_no, page_size, status } = data.query;

		// Fetch orders from Supabase
		const { orders, total, error: fetchError } = await supabase.getOrdersByPhone(session.phone, {
			pageNo: page_no,
			pageSize: page_size,
			status,
		});

		if (fetchError) {
			return c.json(
				{
					success: false,
					error: fetchError,
				},
				400
			);
		}

		return c.json({
			success: true,
			result: {
				orders: orders.map((o) => ({
					id: o.id,
					order_number: o.order_number,
					status: o.status,
					total_amount: o.total_amount,
					currency: o.currency,
					payment_method: o.payment_method ?? null,
					payment_status: o.payment_status,
					shipping_address: o.shipping_address,
					aliexpress_order_id: o.aliexpress_order_id ?? null,
					tracking_number: o.tracking_number ?? null,
					notes: o.notes ?? null,
					created_at: o.created_at,
					updated_at: o.updated_at,
					items: o.items.map((item) => ({
						id: item.id,
						product_id: item.product_id,
						product_title: item.product_title,
						product_image: item.product_image ?? null,
						sku_id: item.sku_id ?? null,
						sku_properties: item.sku_properties ?? null,
						unit_price: item.unit_price,
						quantity: item.quantity,
						total_price: item.total_price,
						currency: item.currency,
					})),
				})),
				total,
				page_no,
				page_size,
			},
		});
	}
}

