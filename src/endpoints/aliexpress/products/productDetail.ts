import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawProductDetailResponse {
	resp_result?: {
		resp_code?: number;
		resp_msg?: string;
		result?: {
			ae_item_base_info_dto?: {
				subject?: string;
				category_id?: number;
				product_id?: number | string;
				product_status_type?: string;
				detail?: string;
				mobile_detail?: string;
			};
			ae_item_sku_info_dtos?: {
				ae_item_sku_info_d_t_o?: Array<{
					id?: string;
					sku_id?: string;
					sku_price?: string;
					offer_sale_price?: string;
					sku_stock?: boolean;
					ipm_sku_stock?: number;
					currency_code?: string;
					sku_code?: string;
					sku_available_stock?: number;
					ae_sku_property_dtos?: {
						ae_sku_property_d_t_o?: Array<{
							sku_property_id?: number;
							sku_property_name?: string;
							property_value_id?: number;
							property_value_definition_name?: string;
							sku_image?: string;
						}>;
					};
				}>;
			};
			ae_multimedia_info_dto?: {
				image_urls?: string;
				ae_video_dtos?: {
					ae_video_d_t_o?: Array<{ media_url?: string; poster_url?: string }>;
				};
			};
			package_info_dto?: {
				gross_weight?: string;
				package_height?: number;
				package_length?: number;
				package_width?: number;
			};
			logistics_info_dto?: {
				delivery_time?: number;
				ship_to_country?: string;
			};
		};
	};
	// Legacy format fallback
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

		// Retrieve or automatically refresh session token
		const repo = new TokenRepository(c.env.DB);
		const sessionToken = await repo.getValidAccessToken(query.user_id, config);

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

		const data2 = apiResponse.data;

		// Handle new DS response shape (resp_result.result) and legacy shape (result)
		const dsResult = data2.resp_result?.result;
		const legacyDetail = data2.result;

		// Check for DS API error
		if (data2.resp_result && data2.resp_result.resp_code && data2.resp_result.resp_code !== 200) {
			return c.json(
				{
					success: false,
					error: data2.resp_result.resp_msg || "AliExpress product not found",
					errorCode: String(data2.resp_result.resp_code),
				},
				400
			);
		}

		if (dsResult) {
			// New DS format
			const baseInfo = dsResult.ae_item_base_info_dto;
			const rawSkus = dsResult.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o || [];
			const imageUrls = dsResult.ae_multimedia_info_dto?.image_urls?.split(";").filter(Boolean) || [];

			const skus = rawSkus.map((s) => ({
				sku_id: s.sku_id || s.id,
				price: s.sku_price,
				sale_price: s.offer_sale_price || s.sku_price,
				stock: s.ipm_sku_stock ?? s.sku_available_stock,
				currency: s.currency_code || query.target_currency || "USD",
				sku_code: s.sku_code,
				properties: s.ae_sku_property_dtos?.ae_sku_property_d_t_o?.map((prop) => ({
					name: prop.sku_property_name,
					value: prop.property_value_definition_name,
					image: prop.sku_image,
				})),
			}));

			return c.json({
				success: true,
				result: {
					product_id: String(baseInfo?.product_id ?? productId),
					title: baseInfo?.subject,
					status: baseInfo?.product_status_type,
					category_id: baseInfo?.category_id,
					images: imageUrls,
					skus,
					raw_detail: dsResult as unknown as Record<string, unknown>,
				},
			});
		}

		// Legacy format fallback
		const detail = legacyDetail;
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

