import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface SearchProductItem {
	product_id: number | string;
	product_title: string;
	product_detail_url?: string;
	product_main_image_url?: string;
	sale_price?: string;
	target_sale_price?: string;
	original_price?: string;
	target_sale_price_currency?: string;
	app_sale_price_currency?: string;
	discount?: string;
	volume?: number | string;
	evaluation_rate?: string;
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
			products?: SearchProductItem[];
		};
	};
	// Fallback response shapes
	result?: {
		products?: {
			traffic_product_d_t_o?: Array<{
				product_id: number | string;
				product_title: string;
				product_main_image_url?: string;
				target_sale_price?: string;
				target_original_price?: string;
				target_sale_price_currency?: string;
				discount?: string;
				evaluate_rate?: string;
				lastest_volume?: number | string;
				product_detail_url?: string;
			}>;
		};
		total_page_no?: number;
		current_page_no?: number;
		total_record_count?: number;
	};
}

/**
 * GET /aliexpress/products/search
 * Search products by name / keywords with category filtering, currency, and pagination.
 *
 * Method: aliexpress.ds.text.search
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressProductSearch extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Products"],
		summary: "Search products by product name / keyword",
		description:
			"Search AliExpress dropshipping catalog by product name or keyword (e.g. 'smart watch', 'wireless earbuds', 'yoga mat'). Supports filtering by category/subcategory ID, sorting, and price localization.",
		request: {
			query: z.object({
				q: z
					.string()
					.min(1)
					.describe("Search query / product name keywords (e.g. 'wireless earbuds')"),
				category_id: z
					.string()
					.optional()
					.describe("Optional category or subcategory ID to constrain the search"),
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
					.describe("Destination country ISO 2-letter code (e.g. 'US')"),
				target_currency: z
					.string()
					.optional()
					.default("USD")
					.describe("Currency code for price fields (e.g. 'USD', 'EUR')"),
				target_language: z
					.string()
					.optional()
					.default("EN")
					.describe("Target language (e.g. 'EN')"),
				sort: z
					.string()
					.optional()
					.describe("Sorting order: SALE_PRICE_ASC, SALE_PRICE_DESC, VOLUME_DESC"),
				user_id: z
					.string()
					.optional()
					.describe("Optional seller user_id to attach session token"),
			}),
		},
		responses: {
			"200": {
				description: "Search results returned successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							query: z.string(),
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
				description: "Search request failed",
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
		const pageNo = parseInt(query.page_no || "1", 10);
		const pageSize = Math.min(parseInt(query.page_size || "20", 10), 50);

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Check session token
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

		// Prepare search parameters for aliexpress.ds.text.search
		const searchParams: Record<string, string | number> = {
			keywords: query.q,
			page_no: pageNo,
			page_size: pageSize,
			countryCode: query.country || "US",
			currency: query.target_currency || "USD",
			locale: (query.target_language || "EN").toLowerCase(),
		};

		if (query.category_id) {
			searchParams.category_id = query.category_id;
		}
		if (query.sort) {
			searchParams.sort = query.sort;
		}

		// Call primary dropshipping search API: aliexpress.ds.text.search
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
					original_price: p.original_price,
					currency: p.target_sale_price_currency || p.app_sale_price_currency || query.target_currency || "USD",
					discount: p.discount,
					rating: p.evaluation_rate,
					volume: p.volume !== undefined ? String(p.volume) : undefined,
					detail_url: p.product_detail_url,
					category_id: p.first_level_category_id,
					subcategory_id: p.second_level_category_id,
				}));

				return c.json({
					success: true,
					result: {
						query: query.q,
						current_page: respResult?.current_page_no ?? pageNo,
						page_size: pageSize,
						total_pages: respResult?.total_page_count,
						total_count: respResult?.total_record_count,
						products,
					},
				});
			}
		}

		// Fallback to aliexpress.ds.recommend.feed.get if text.search isn't available or fails
		const fallbackParams: Record<string, string | number> = {
			feed_name: "DS bestseller",
			page_no: pageNo,
			page_size: pageSize,
			country: query.country || "US",
			target_currency: query.target_currency || "USD",
			target_language: query.target_language || "EN",
		};
		if (query.category_id) {
			fallbackParams.category_id = query.category_id;
		}

		const fallbackResponse = await callAliExpressApi<RawTextSearchResponse>(
			config,
			"aliexpress.ds.recommend.feed.get",
			fallbackParams,
			sessionToken
		);

		if (!fallbackResponse.success || !fallbackResponse.data) {
			return c.json(
				{
					success: false,
					error:
						apiResponse.error ??
						fallbackResponse.error ??
						"Failed to search products on AliExpress",
					errorCode: apiResponse.errorCode ?? fallbackResponse.errorCode,
				},
				400
			);
		}

		const feedData = fallbackResponse.data.result;
		const rawFeedProducts = feedData?.products?.traffic_product_d_t_o || [];

		// Filter by keywords on fallback if needed
		const lowerKeyword = query.q.toLowerCase();
		const matchedProducts = rawFeedProducts.filter(
			(p) => !query.q || p.product_title.toLowerCase().includes(lowerKeyword)
		);
		const selectedProducts = matchedProducts.length > 0 ? matchedProducts : rawFeedProducts;

		const products = selectedProducts.map((p) => ({
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
		}));

		return c.json({
			success: true,
			result: {
				query: query.q,
				current_page: feedData?.current_page_no ?? pageNo,
				page_size: pageSize,
				total_pages: feedData?.total_page_no,
				total_count: feedData?.total_record_count,
				products,
			},
		});
	}
}

