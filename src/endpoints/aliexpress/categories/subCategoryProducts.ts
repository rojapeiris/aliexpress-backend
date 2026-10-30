import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";
import { fetchCategoryProducts } from "../../../lib/aliexpress-category-helper";

/**
 * GET /aliexpress/categories/:parentId/subcategories/:subcategoryId/products
 * Get dropshipping products directly by parent Category ID and Subcategory ID.
 *
 * Uses a multi-strategy approach:
 *   1. aliexpress.ds.text.search with resolved category name as keywords + subcategoryId
 *   2. Category-specific bestseller feed (from CATEGORY_MAP, keyed on parentId)
 *   3. High-volume generic feeds: DS_NewArrivals, DS_Sports&Outdoors_bestsellers, etc.
 *   4. Broad fallback keyword text search
 */
export class AliExpressSubCategoryProducts extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Categories"],
		summary: "Get products by category and subcategory IDs",
		description:
			"Fetches dropshipping products for a specific subcategory within a parent category. " +
			"Uses the subcategory ID to query AliExpress products with pagination, currency localization, and optional keyword filtering.",
		request: {
			params: z.object({
				parentId: z
					.string()
					.describe("Parent category ID (e.g. '509' for Phones & Telecommunications)"),
				subcategoryId: z
					.string()
					.describe("Subcategory ID (e.g. '200002167' for Mobile Phone Cables)"),
			}),
			query: z.object({
				q: z
					.string()
					.optional()
					.describe("Optional keyword / product name search within this subcategory"),
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
					.describe("Sorting order: SALE_PRICE_ASC, SALE_PRICE_DESC, VOLUME_DESC"),
				user_id: z
					.string()
					.optional()
					.describe("Seller user_id to provide OAuth session token"),
			}),
		},
		responses: {
			"200": {
				description: "Products for this subcategory returned successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							category_id: z.string(),
							subcategory_id: z.string(),
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
				description: "Failed to fetch subcategory products",
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
		const { parentId, subcategoryId } = data.params;
		const query = data.query;
		const pageNo = parseInt(query.page_no || "1", 10);
		const pageSize = Math.min(parseInt(query.page_size || "20", 10), 50);

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Retrieve or automatically refresh session token
		const repo = new TokenRepository(c.env.DB);
		const sessionToken = await repo.getValidAccessToken(query.user_id, config);

		// Delegate to multi-strategy helper (parentId drives CATEGORY_MAP lookup, subcategoryId used as target)
		const result = await fetchCategoryProducts({
			categoryId: parentId,
			subcategoryId,
			q: query.q,
			pageNo,
			pageSize,
			country: query.country || "US",
			currency: query.target_currency || "USD",
			language: query.target_language || "EN",
			sort: query.sort,
			config,
			sessionToken,
		});

		return c.json({
			success: true,
			result: {
				category_id: parentId,
				subcategory_id: subcategoryId,
				current_page: result.currentPage,
				page_size: result.pageSize,
				total_pages: result.totalPages,
				total_count: result.totalCount,
				products: result.products,
			},
		});
	}
}
