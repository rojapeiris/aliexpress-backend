import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";
import { fetchCategoryProducts } from "../../../lib/aliexpress-category-helper";

/**
 * GET /aliexpress/products/by-category
 * Get dropshipping products directly filtered by Category and Subcategory.
 *
 * Uses a multi-strategy approach:
 *   1. If feed_name is explicitly provided → aliexpress.ds.recommend.feed.get
 *   2. aliexpress.ds.text.search with category name as keywords + category_id
 *   3. Category-specific bestseller feed (e.g. DS_Cellphones&Telecommunications_bestsellers)
 *   4. Generic "DS bestseller" / "DS_NewArrivals" feeds
 *   5. Broad fallback keyword text search
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

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Retrieve or automatically refresh session token
		const repo = new TokenRepository(c.env.DB);
		const sessionToken = await repo.getValidAccessToken(query.user_id, config);

		// Delegate to multi-strategy helper
		const result = await fetchCategoryProducts({
			categoryId: query.category_id,
			subcategoryId: query.subcategory_id,
			q: query.q,
			pageNo,
			pageSize,
			country: query.country || "US",
			currency: query.target_currency || "USD",
			language: query.target_language || "EN",
			sort: query.sort,
			feedName: query.feed_name,
			config,
			sessionToken,
		});

		return c.json({
			success: true,
			result: {
				category_id: query.category_id,
				subcategory_id: query.subcategory_id,
				current_page: result.currentPage,
				page_size: result.pageSize,
				total_pages: result.totalPages,
				total_count: result.totalCount,
				products: result.products,
			},
		});
	}
}
