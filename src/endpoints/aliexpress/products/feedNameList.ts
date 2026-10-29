import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawFeedNameItem {
	promo_name: string;
	promo_desc?: string;
	product_num?: number;
}

interface RawFeedNameResponse {
	resp_result?: {
		result?: {
			current_record_count?: number;
			promos?: {
				promo?: RawFeedNameItem[];
			};
		};
	};
}

/**
 * GET /aliexpress/feeds
 * List all available recommendation feed names that can be used with GET /aliexpress/products
 *
 * Method: aliexpress.ds.feedname.get
 */
export class AliExpressFeedNameList extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Products"],
		summary: "List available product feed names",
		description:
			"Returns all valid feed names for use with the product list endpoint (GET /aliexpress/products). Feed names identify curated product collections like bestsellers, new arrivals, category-specific lists, and regional selections.",
		request: {
			query: z.object({
				user_id: z
					.string()
					.optional()
					.describe("Optional seller user_id to use their session token"),
			}),
		},
		responses: {
			"200": {
				description: "Feed names retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							total_count: z.number(),
							feeds: z.array(
								z.object({
									name: z.string(),
									description: z.string().optional(),
									product_count: z.number().optional(),
								})
							),
						}),
					})
				),
			},
			"400": {
				description: "Failed to retrieve feed names",
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

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		let sessionToken: string | undefined;
		const repo = new TokenRepository(c.env.DB);
		if (data.query.user_id) {
			const record = await repo.findByUserId(data.query.user_id);
			if (record && !repo.isAccessTokenExpired(record)) {
				sessionToken = record.access_token;
			}
		} else {
			const latest = await repo.getLatestToken();
			if (latest && !repo.isAccessTokenExpired(latest)) {
				sessionToken = latest.access_token;
			}
		}

		const apiResponse = await callAliExpressApi<RawFeedNameResponse>(
			config,
			"aliexpress.ds.feedname.get",
			{},
			sessionToken
		);

		if (!apiResponse.success || !apiResponse.data) {
			return c.json(
				{
					success: false,
					error: apiResponse.error ?? "Failed to fetch feed names from AliExpress",
					errorCode: apiResponse.errorCode,
				},
				400
			);
		}

		const promos =
			apiResponse.data.resp_result?.result?.promos?.promo || [];

		const feeds = promos.map((p) => ({
			name: p.promo_name,
			description: p.promo_desc,
			product_count: p.product_num,
		}));

		return c.json({
			success: true,
			result: {
				total_count: feeds.length,
				feeds,
			},
		});
	}
}
