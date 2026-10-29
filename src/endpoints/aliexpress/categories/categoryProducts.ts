import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawProductItem {
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
}

interface RawCategoryProductsResponse {
	result?: {
		products?: {
			traffic_product_d_t_o?: RawProductItem[];
		};
		total_page_no?: number;
		current_page_no?: number;
		total_record_count?: number;
		current_record_count?: number;
	};
}

/**
 * GET /aliexpress/categories/:categoryId/products
 * Get product list filtered by a specific category or subcategory ID.
 *
 * Method: aliexpress.ds.recommend.feed.get with category_id
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressCategoryProducts extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Categories"],
		summary: "Get products by category or subcategory ID",
		description:
			"Fetches dropshipping products matching a specific category or subcategory ID. Supports pagination, currency localization, destination country filtering, and optional keyword refinement.",
		request: {
			params: z.object({
				categoryId: z
					.string()
					.describe("Category or subcategory ID (e.g. 509 for Phones, or child category ID)"),
			}),
			query: z.object({
				q: z
					.string()
					.optional()
					.describe("Optional keyword filter within this category"),
				feed_name: z
					.string()
					.optional()
					.default("DS_Home&Kitchen_bestsellers")
					.describe("Feed type. Use GET /aliexpress/feeds for valid names (e.g. 'DS_Home&Kitchen_bestsellers', 'DS_NewArrivals')"),
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
					.describe("Currency code for price fields (e.g. 'USD', 'EUR')"),
				target_language: z
					.string()
					.optional()
					.default("EN")
					.describe("Target language (e.g. 'EN')"),
				sort: z
					.string()
					.optional()
					.describe("Sorting order (e.g. SALE_PRICE_ASC, SALE_PRICE_DESC, VOLUME_DESC)"),
				user_id: z
					.string()
					.optional()
					.describe("Seller user_id to attach session token"),
			}),
		},
		responses: {
			"200": {
				description: "Products for this category returned successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							category_id: z.string(),
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
								})
							),
						}),
					})
				),
			},
			"400": {
				description: "Failed to retrieve products for category",
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
		const categoryId = data.params.categoryId;
		const query = data.query;
		const pageNo = parseInt(query.page_no || "1", 10);
		const pageSize = Math.min(parseInt(query.page_size || "20", 10), 50);

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

		const params: Record<string, string | number> = {
			feed_name: query.feed_name || "DS_Home&Kitchen_bestsellers",
			category_id: categoryId,
			page_no: pageNo,
			page_size: pageSize,
			country: query.country || "US",
			target_currency: query.target_currency || "USD",
			target_language: query.target_language || "EN",
		};

		if (query.sort) {
			params.sort = query.sort;
		}

		const apiResponse = await callAliExpressApi<RawCategoryProductsResponse>(
			config,
			"aliexpress.ds.recommend.feed.get",
			params,
			sessionToken
		);

		if (!apiResponse.success || !apiResponse.data) {
			return c.json(
				{
					success: false,
					error:
						apiResponse.error ??
						`Failed to fetch products for category ID: ${categoryId}`,
					errorCode: apiResponse.errorCode,
				},
				400
			);
		}

		const feedData = apiResponse.data.result;
		let rawProducts = feedData?.products?.traffic_product_d_t_o || [];

		// If a keyword filter was provided, filter matching titles
		if (query.q) {
			const lowerQ = query.q.toLowerCase();
			rawProducts = rawProducts.filter((p) =>
				p.product_title.toLowerCase().includes(lowerQ)
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
		}));

		return c.json({
			success: true,
			result: {
				category_id: categoryId,
				current_page: feedData?.current_page_no ?? pageNo,
				page_size: pageSize,
				total_pages: feedData?.total_page_no,
				total_count: feedData?.total_record_count,
				products,
			},
		});
	}
}

