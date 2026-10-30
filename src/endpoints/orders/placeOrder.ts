import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import { getUserFromSession } from "../../lib/supabase-client";

const OrderItemSchema = z.object({
	product_id: z.string().describe("AliExpress product ID"),
	product_title: z.string().describe("Product name / title"),
	product_image: z.string().optional().describe("Product thumbnail URL"),
	product_detail_url: z.string().optional().describe("AliExpress product page URL"),
	sku_id: z.string().optional().describe("Selected SKU variant ID"),
	sku_properties: z.string().optional().describe("Selected SKU variant description (e.g. 'Color:Red,Size:M')"),
	unit_price: z.number().positive().describe("Unit price in the given currency"),
	quantity: z.number().int().positive().default(1).describe("Quantity ordered"),
	total_price: z.number().positive().optional().describe("Line total (unit_price × quantity)"),
	currency: z.string().default("LKR").optional().describe("Currency code (default 'LKR')"),
});

const ShippingAddressSchema = z.object({
	full_name: z.string().optional().describe("Recipient full name"),
	phone: z.string().optional().describe("Recipient contact phone"),
	address_line1: z.string().describe("Primary street address"),
	address_line2: z.string().optional().describe("Apartment, suite, unit, etc."),
	city: z.string().describe("City / Town"),
	state_province: z.string().optional().describe("State or Province"),
	postal_code: z.string().optional().describe("Postal / ZIP code"),
	country: z.string().default("LK").optional().describe("ISO country code (default 'LK')"),
});

/**
 * POST /orders
 * Place a new dropshipping order for the authenticated customer.
 */
export class PlaceOrder extends OpenAPIRoute {
	public schema = {
		tags: ["Customer Orders"],
		summary: "Place a new order",
		description:
			"Creates a new dropshipping order with one or more line items for the authenticated customer. " +
			"Authenticates via Bearer session token and persists the order + items in Supabase.",
		request: {
			headers: z.object({
				authorization: z
					.string()
					.optional()
					.describe("Bearer <session_token> obtained from OTP verification"),
			}),
			body: contentJson(
				z.object({
					items: z.array(OrderItemSchema).min(1).describe("List of order line items"),
					shipping_address: ShippingAddressSchema.describe("Delivery address for this order"),
					payment_method: z
						.string()
						.optional()
						.default("cod")
						.describe("Payment method (e.g. 'cod', 'card'). Defaults to 'cod'"),
					notes: z.string().optional().describe("Optional order notes or special instructions"),
					currency: z
						.string()
						.optional()
						.default("LKR")
						.describe("Order currency code (default 'LKR')"),
				})
			),
		},
		responses: {
			"201": {
				description: "Order placed successfully",
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
								payment_method: z.string().nullable().optional(),
								payment_status: z.string(),
								shipping_address: z.record(z.unknown()),
								notes: z.string().nullable().optional(),
								created_at: z.string(),
								items: z.array(
									z.object({
										id: z.string().optional(),
										product_id: z.string(),
										product_title: z.string(),
										product_image: z.string().nullable().optional(),
										unit_price: z.number(),
										quantity: z.number(),
										total_price: z.number(),
										currency: z.string().optional(),
									})
								),
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
				description: "Bad Request – order creation failed",
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
		const { session, profile, error: authError, supabase } = await getUserFromSession(c);
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

		// Ensure total_price is computed and shipping details default cleanly
		const normalizedItems = body.items.map((item) => {
			const qty = item.quantity || 1;
			const total = item.total_price || Math.round(item.unit_price * qty * 100) / 100;
			return {
				...item,
				quantity: qty,
				total_price: total,
				currency: item.currency || body.currency || "LKR",
			};
		});

		const shippingAddress = {
			...body.shipping_address,
			full_name: body.shipping_address.full_name || profile?.full_name || undefined,
			phone: body.shipping_address.phone || session.phone,
			country: body.shipping_address.country || profile?.country || "LK",
		};

		// Create order in Supabase
		const { order, error: orderError } = await supabase.createOrder({
			userPhone: session.phone,
			items: normalizedItems,
			shippingAddress,
			paymentMethod: body.payment_method,
			notes: body.notes,
			currency: body.currency,
		});

		if (orderError || !order) {
			return c.json(
				{
					success: false,
					error: orderError || "Failed to place order.",
				},
				400
			);
		}

		return c.json(
			{
				success: true,
				message: "Order placed successfully.",
				result: {
					order: {
						id: order.id,
						order_number: order.order_number,
						status: order.status,
						total_amount: order.total_amount,
						currency: order.currency,
						payment_method: order.payment_method ?? null,
						payment_status: order.payment_status,
						shipping_address: order.shipping_address,
						notes: order.notes ?? null,
						created_at: order.created_at,
						items: order.items.map((item) => ({
							id: item.id,
							product_id: item.product_id,
							product_title: item.product_title,
							product_image: item.product_image ?? null,
							unit_price: item.unit_price,
							quantity: item.quantity,
							total_price: item.total_price,
							currency: item.currency,
						})),
					},
				},
			},
			201
		);
	}
}

