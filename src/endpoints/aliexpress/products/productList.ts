import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawProductItem {
	product_id: number | string;
	product_title: string;
	product_main_image_url?: string;
	product_small_image_urls?: { string?: string[] };
	target_sale_price?: string;
	target_original_price?: string;
	target_sale_price_currency?: string;
	discount?: string;
	evaluate_rate?: string;
	lastest_volume?: number | string;
	product_detail_url?: string;
	ship_to_days?: string;
	shop_id?: number | string;
	shop_url?: string;
}

interface RawFeedResponse {
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
 * GET /aliexpress/products
 * Get dropshipping recommended products list (bestsellers, trending items, by category).
 *
 * Method: aliexpress.ds.recommend.feed.get
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressProductList extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Products"],
		summary: "Get dropshipping product list",
		description:
			"Fetches a curated feed of dropshipping products from the AliExpress Dropshipping Center. Supports filtering by category_id, feed type (e.g., 'DS bestseller'), target destination country, and currency.",
		request: {
			query: z.object({
				feed_name: z
					.string()
					.optional()
					.default("DS_Home&Kitchen_bestsellers")
					.describe("Recommendation feed name. Use GET /aliexpress/feeds to list valid names (e.g. 'DS_Home&Kitchen_bestsellers', 'DS_NewArrivals', 'DS_ConsumerElectronics_bestsellers')"),
				category_id: z
					.string()
					.optional()
					.describe("Optional category ID to filter products"),
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
					.describe("Target destination country ISO 2-letter code (e.g. 'US', 'GB')"),
				target_currency: z
					.string()
					.optional()
					.default("USD")
					.describe("Currency code for price fields (e.g. 'USD', 'EUR')"),
				target_language: z
					.string()
					.optional()
					.default("EN")
					.describe("Target language (e.g. 'EN', 'ES', 'FR')"),
				sort: z
					.string()
					.optional()
					.describe("Sorting order: SALE_PRICE_ASC, SALE_PRICE_DESC, VOLUME_DESC, etc."),
				user_id: z
					.string()
					.optional()
					.describe("Seller user_id in database to provide OAuth session token"),
			}),
		},
		responses: {
			"200": {
				description: "Product list returned successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							feed_name: z.string(),
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
				description: "Failed to retrieve products",
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

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Retrieve or automatically refresh session token
		const repo = new TokenRepository(c.env.DB);
		const sessionToken = await repo.getValidAccessToken(query.user_id, config);

		const params: Record<string, string | number> = {
			feed_name: query.feed_name || "DS_Home&Kitchen_bestsellers",
			page_no: parseInt(query.page_no || "1", 10),
			page_size: Math.min(parseInt(query.page_size || "20", 10), 50),
			country: query.country || "US",
			target_currency: query.target_currency || "USD",
			target_language: query.target_language || "EN",
		};

		if (query.category_id) {
			params.category_id = query.category_id;
		}
		if (query.sort) {
			params.sort = query.sort;
		}

		const apiResponse = await callAliExpressApi<RawFeedResponse>(
			config,
			"aliexpress.ds.recommend.feed.get",
			params,
			sessionToken
		);

		if (!apiResponse.success || !apiResponse.data) {
			return c.json(
				{
					success: false,
					error: apiResponse.error ?? "Failed to fetch products from AliExpress",
					errorCode: apiResponse.errorCode,
				},
				400
			);
		}

		const feedData = apiResponse.data.result;
		const rawProducts = feedData?.products?.traffic_product_d_t_o || [];

		const products = rawProducts.map((p) => ({
			product_id: String(p.product_id),
			title: p.product_title,
			main_image_url: p.product_main_image_url,
			sale_price: p.target_sale_price,
			original_price: p.target_original_price,
			currency: p.target_sale_price_currency || query.target_currency || "USD",
			discount: p.discount,
			rating: p.evaluate_rate,
			volume: p.lastest_volume ? String(p.lastest_volume) : undefined,
			detail_url: p.product_detail_url,
		}));

		return c.json({
			success: true,
			result: {
				feed_name: query.feed_name || "DS_Home&Kitchen_bestsellers",
				current_page: feedData?.current_page_no ?? parseInt(query.page_no || "1", 10),
				page_size: parseInt(query.page_size || "20", 10),
				total_pages: feedData?.total_page_no,
				total_count: feedData?.total_record_count,
				products,
			},
		});
	}
}

