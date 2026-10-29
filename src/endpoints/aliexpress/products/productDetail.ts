import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawProductDetailResponse {
	result?: {
		aeop_a_e_multimedia?: {
			aeop_a_e_videos?: Array<{ media_url?: string; poster_url?: string }>;
		};
		aeop_ae_product_s_k_us?: {
			aeop_ae_product_sku?: Array<{
				id?: string;
				sku_id?: string;
				sku_price?: string;
				offer_sale_price?: string;
				sku_stock?: boolean;
				ipm_sku_stock?: number;
				currency_code?: string;
				sku_code?: string;
				aeop_s_k_u_property?: Array<{
					sku_property_id?: number;
					sku_property_name?: string;
					property_value_id?: number;
					property_value_definition_name?: string;
					sku_image?: string;
				}>;
			}>;
		};
		detail?: string;
		item_status?: string;
		product_id?: number | string;
		subject?: string;
		owner_member_id?: string;
		ws_offline_date?: string;
		package_info?: {
			gross_weight?: string;
			package_height?: number;
			package_length?: number;
			package_width?: number;
		};
	};
}

/**
 * GET /aliexpress/products/:productId
 * Retrieve detailed item information including pricing, stock, SKUs, and variations.
 *
 * Method: aliexpress.ds.product.get
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressProductDetail extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Products"],
		summary: "Get product details by ID",
		description:
			"Retrieves full product details including title, images, specifications, variations, SKU pricing, and inventory.",
		request: {
			params: z.object({
				productId: z.string().describe("AliExpress Product ID (e.g., 1005001234567890)"),
			}),
			query: z.object({
				ship_to_country: z
					.string()
					.optional()
					.default("US")
					.describe("Destination country code (e.g. 'US')"),
				target_currency: z
					.string()
					.optional()
					.default("USD")
					.describe("Currency code (e.g. 'USD')"),
				target_language: z
					.string()
					.optional()
					.default("EN")
					.describe("Language code (e.g. 'EN')"),
				user_id: z
					.string()
					.optional()
					.describe("Optional seller user_id to use session token"),
			}),
		},
		responses: {
			"200": {
				description: "Product details retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							product_id: z.string(),
							title: z.string().optional(),
							status: z.string().optional(),
							skus: z
								.array(
									z.object({
										sku_id: z.string().optional(),
										price: z.string().optional(),
										sale_price: z.string().optional(),
										stock: z.number().optional(),
										currency: z.string().optional(),
										sku_code: z.string().optional(),
										properties: z
											.array(
												z.object({
													name: z.string().optional(),
													value: z.string().optional(),
													image: z.string().optional(),
												})
											)
											.optional(),
									})
								)
								.optional(),
							raw_detail: z.record(z.unknown()).optional(),
						}),
					})
				),
			},
			"400": {
				description: "Failed to retrieve product details",
				...contentJson(
					z.object({
						success: z.boolean(),
						error: z.string(),
						errorCode: z.string().optional(),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const productId = data.params.productId;
		const query = data.query;

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		let sessionToken: string | undefined;
		const repo = new TokenRepository(c.env.DB);
		if (query.user_id) {
			const record = await repo.findByUserId(query.user_id);
			if (record && !repo.isAccessTokenExpired(record)) {
				sessionToken = record.access_token;
			}
		} else {
			const latest = await repo.getLatestToken();
			if (latest && !repo.isAccessTokenExpired(latest)) {
				sessionToken = latest.access_token;
			}
		}

		const apiResponse = await callAliExpressApi<RawProductDetailResponse>(
			config,
			"aliexpress.ds.product.get",
			{
				product_id: productId,
				ship_to_country: query.ship_to_country || "US",
				target_currency: query.target_currency || "USD",
				target_language: query.target_language || "EN",
			},
			sessionToken
		);

		if (!apiResponse.success || !apiResponse.data) {
			return c.json(
				{
					success: false,
					error: apiResponse.error ?? "Failed to fetch product details from AliExpress",
					errorCode: apiResponse.errorCode,
				},
				400
			);
		}

		const detail = apiResponse.data.result;
		const rawSkus = detail?.aeop_ae_product_s_k_us?.aeop_ae_product_sku || [];

		const skus = rawSkus.map((s) => ({
			sku_id: s.sku_id || s.id,
			price: s.sku_price,
			sale_price: s.offer_sale_price || s.sku_price,
			stock: s.ipm_sku_stock,
			currency: s.currency_code || query.target_currency || "USD",
			sku_code: s.sku_code,
			properties: s.aeop_s_k_u_property?.map((prop) => ({
				name: prop.sku_property_name,
				value: prop.property_value_definition_name,
				image: prop.sku_image,
			})),
		}));

		return c.json({
			success: true,
			result: {
				product_id: String(detail?.product_id ?? productId),
				title: detail?.subject,
				status: detail?.item_status,
				skus,
				raw_detail: detail as unknown as Record<string, unknown>,
			},
		});
	}
}

