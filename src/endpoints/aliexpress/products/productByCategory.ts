import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawProductItem {
	product_id: number | string;
	product_title: string;
	product_main_image_url?: string;
	product_detail_url?: string;
	sale_price?: string;
	target_sale_price?: string;
	original_price?: string;
	target_original_price?: string;
	target_sale_price_currency?: string;
	app_sale_price_currency?: string;
	discount?: string;
	evaluate_rate?: string;
	evaluation_rate?: string;
	volume?: number | string;
	lastest_volume?: number | string;
	first_level_category_id?: number;
	second_level_category_id?: number;
}

interface RawTextSearchResponse {
	resp_result?: {
		resp_code?: number;
		resp_msg?: string;
		result?: {
			current_page_no?: number;
			total_page_count?: number;
			total_record_count?: number;
			products?: RawProductItem[];
		};
	};
	result?: {
		products?: {
			traffic_product_d_t_o?: RawProductItem[];
		};
		total_page_no?: number;
		current_page_no?: number;
		total_record_count?: number;
	};
}

/**
 * GET /aliexpress/products/by-category
 * Get dropshipping products directly filtered by Category and Subcategory.
 *
 * Primary Method: aliexpress.ds.text.search with category_id
 * Fallback Method: aliexpress.ds.recommend.feed.get with category_id
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressProductByCategory extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Products"],
		summary: "Get products by category and subcategory",
		description:
			"Retrieves dropshipping products directly by Category ID and optional Subcategory ID without requiring a feed name. " +
			"Supports pagination, country filtering, currency localization, and optional keyword refinement within the category.",
		request: {
			query: z.object({
				category_id: z
					.string()
					.optional()
					.describe("Parent / Root Category ID (e.g. '509' for Phones & Telecommunications)"),
				subcategory_id: z
					.string()
					.optional()
					.describe("Specific Subcategory ID (e.g. '200002167' for Mobile Phone Cables)"),
				q: z
					.string()
					.optional()
					.describe("Optional keyword / product name search to filter within this category/subcategory"),
				page_no: z
					.string()
					.optional()
					.default("1")
					.describe("Page number (starts at 1)"),
				page_size: z
					.string()
					.optional()
					.default("20")
					.describe("Number of items per page (default 20, max 50)"),
				country: z
					.string()
					.optional()
					.default("US")
					.describe("Destination country ISO 2-letter code (e.g. 'US', 'GB')"),
				target_currency: z
					.string()
					.optional()
					.default("USD")
					.describe("Currency code for price fields (e.g. 'USD', 'EUR', 'LKR')"),
				target_language: z
					.string()
					.optional()
					.default("EN")
					.describe("Target language (e.g. 'EN', 'ES', 'FR')"),
				sort: z
					.string()
					.optional()
					.describe("Sorting order (e.g. SALE_PRICE_ASC, SALE_PRICE_DESC, VOLUME_DESC)"),
				feed_name: z
					.string()
					.optional()
					.describe("Optional recommendation feed name if searching within a specific feed"),
				user_id: z
					.string()
					.optional()
					.describe("Seller user_id to provide OAuth session token"),
			}),
		},
		responses: {
			"200": {
				description: "Products retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							category_id: z.string().optional(),
							subcategory_id: z.string().optional(),
							current_page: z.number(),
							page_size: z.number(),
							total_pages: z.number().optional(),
							total_count: z.number().optional(),
							products: z.array(
								z.object({
									product_id: z.string(),
									title: z.string(),
									main_image_url: z.string().optional(),
									sale_price: z.string().optional(),
									original_price: z.string().optional(),
									currency: z.string().optional(),
									discount: z.string().optional(),
									rating: z.string().optional(),
									volume: z.string().optional(),
									detail_url: z.string().optional(),
									category_id: z.number().optional(),
									subcategory_id: z.number().optional(),
								})
							),
						}),
					})
				),
			},
			"400": {
				description: "Invalid category parameters or request failed",
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
		const query = data.query;

		// Ensure at least one category identifier is supplied
		if (!query.category_id && !query.subcategory_id) {
			return c.json(
				{
					success: false,
					error: "At least one of 'category_id' or 'subcategory_id' must be provided.",
				},
				400
			);
		}

		const pageNo = parseInt(query.page_no || "1", 10);
		const pageSize = Math.min(parseInt(query.page_size || "20", 10), 50);
		const targetCategoryId = query.subcategory_id || query.category_id;

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Retrieve or automatically refresh session token
		const repo = new TokenRepository(c.env.DB);
		const sessionToken = await repo.getValidAccessToken(query.user_id, config);

		// If feed_name is explicitly specified, use aliexpress.ds.recommend.feed.get
		if (query.feed_name) {
			const feedParams: Record<string, string | number> = {
				feed_name: query.feed_name,
				category_id: targetCategoryId!,
				page_no: pageNo,
				page_size: pageSize,
				country: query.country || "US",
				target_currency: query.target_currency || "USD",
				target_language: query.target_language || "EN",
			};
			if (query.sort) {
				feedParams.sort = query.sort;
			}

			const feedResponse = await callAliExpressApi<RawTextSearchResponse>(
				config,
				"aliexpress.ds.recommend.feed.get",
				feedParams,
				sessionToken
			);

			if (feedResponse.success && feedResponse.data) {
				const feedData = feedResponse.data.result;
				let rawProducts = feedData?.products?.traffic_product_d_t_o || [];

				if (query.q) {
					const lq = query.q.toLowerCase();
					rawProducts = rawProducts.filter((p) =>
						p.product_title?.toLowerCase().includes(lq)
					);
				}

				const products = rawProducts.map((p) => ({
					product_id: String(p.product_id),
					title: p.product_title,
					main_image_url: p.product_main_image_url,
					sale_price: p.target_sale_price,
					original_price: p.target_original_price,
					currency: p.target_sale_price_currency || query.target_currency || "USD",
					discount: p.discount,
					rating: p.evaluate_rate,
					volume: p.lastest_volume !== undefined ? String(p.lastest_volume) : undefined,
					detail_url: p.product_detail_url,
					category_id: query.category_id ? parseInt(query.category_id, 10) : undefined,
					subcategory_id: query.subcategory_id ? parseInt(query.subcategory_id, 10) : undefined,
				}));

				return c.json({
					success: true,
					result: {
						category_id: query.category_id,
						subcategory_id: query.subcategory_id,
						current_page: feedData?.current_page_no ?? pageNo,
						page_size: pageSize,
						total_pages: feedData?.total_page_no,
						total_count: feedData?.total_record_count,
						products,
					},
				});
			}
		}

		// Primary: Query via aliexpress.ds.text.search with category_id
		const searchParams: Record<string, string | number> = {
			page_no: pageNo,
			page_size: pageSize,
			countryCode: query.country || "US",
			currency: query.target_currency || "USD",
			local: (query.target_language || "EN").toLowerCase(),
		};

		if (targetCategoryId) {
			searchParams.category_id = targetCategoryId;
		}

		// Pass keywords or empty string
		searchParams.keywords = query.q || "";

		if (query.sort) {
			searchParams.sort = query.sort;
		}

		const apiResponse = await callAliExpressApi<RawTextSearchResponse>(
			config,
			"aliexpress.ds.text.search",
			searchParams,
			sessionToken
		);

		if (apiResponse.success && apiResponse.data) {
			const respResult = apiResponse.data.resp_result?.result;
			const rawItems = respResult?.products || [];

			if (rawItems.length > 0 || respResult) {
				const products = rawItems.map((p) => ({
					product_id: String(p.product_id),
					title: p.product_title,
					main_image_url: p.product_main_image_url,
					sale_price: p.target_sale_price || p.sale_price,
					original_price: p.original_price || p.target_original_price,
					currency:
						p.target_sale_price_currency ||
						p.app_sale_price_currency ||
						query.target_currency ||
						"USD",
					discount: p.discount,
					rating: p.evaluation_rate || p.evaluate_rate,
					volume: p.volume !== undefined ? String(p.volume) : (p.lastest_volume !== undefined ? String(p.lastest_volume) : undefined),
					detail_url: p.product_detail_url,
					category_id: p.first_level_category_id ?? (query.category_id ? parseInt(query.category_id, 10) : undefined),
					subcategory_id: p.second_level_category_id ?? (query.subcategory_id ? parseInt(query.subcategory_id, 10) : undefined),
				}));

				return c.json({
					success: true,
					result: {
						category_id: query.category_id,
						subcategory_id: query.subcategory_id,
						current_page: respResult?.current_page_no ?? pageNo,
						page_size: pageSize,
						total_pages: respResult?.total_page_count,
						total_count: respResult?.total_record_count,
						products,
					},
				});
			}
		}

		// Fallback: Query via aliexpress.ds.recommend.feed.get
		const fallbackParams: Record<string, string | number> = {
			feed_name: "DS_Home&Kitchen_bestsellers",
			page_no: pageNo,
			page_size: pageSize,
			country: query.country || "US",
			target_currency: query.target_currency || "USD",
			target_language: query.target_language || "EN",
		};

		if (targetCategoryId) {
			fallbackParams.category_id = targetCategoryId;
		}

		const fallbackResponse = await callAliExpressApi<RawTextSearchResponse>(
			config,
			"aliexpress.ds.recommend.feed.get",
			fallbackParams,
			sessionToken
		);

		if (fallbackResponse.success && fallbackResponse.data) {
			const feedData = fallbackResponse.data.result;
			let rawProducts = feedData?.products?.traffic_product_d_t_o || [];

			if (query.q) {
				const lq = query.q.toLowerCase();
				rawProducts = rawProducts.filter((p) =>
					p.product_title?.toLowerCase().includes(lq)
				);
			}

			const products = rawProducts.map((p) => ({
				product_id: String(p.product_id),
				title: p.product_title,
				main_image_url: p.product_main_image_url,
				sale_price: p.target_sale_price,
				original_price: p.target_original_price,
				currency: p.target_sale_price_currency || query.target_currency || "USD",
				discount: p.discount,
				rating: p.evaluate_rate,
				volume: p.lastest_volume !== undefined ? String(p.lastest_volume) : undefined,
				detail_url: p.product_detail_url,
				category_id: query.category_id ? parseInt(query.category_id, 10) : undefined,
				subcategory_id: query.subcategory_id ? parseInt(query.subcategory_id, 10) : undefined,
			}));

			return c.json({
				success: true,
				result: {
					category_id: query.category_id,
					subcategory_id: query.subcategory_id,
					current_page: feedData?.current_page_no ?? pageNo,
					page_size: pageSize,
					total_pages: feedData?.total_page_no,
					total_count: feedData?.total_record_count,
					products,
				},
			});
		}

		return c.json(
			{
				success: false,
				error:
					apiResponse.error ??
					fallbackResponse.error ??
					`Failed to retrieve products for category: ${targetCategoryId}`,
				errorCode: apiResponse.errorCode ?? fallbackResponse.errorCode,
			},
			400
		);
	}
}

