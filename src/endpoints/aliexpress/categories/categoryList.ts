import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext, DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../../../types";
import { callAliExpressApi, AliExpressClientConfig } from "../../../lib/aliexpress-client";
import { TokenRepository } from "../../../lib/token-repository";

interface RawCategoryDto {
	id: number;
	isleaf: boolean;
	level: number;
	names?: string | Record<string, string>;
}

interface RawCategoryResponse {
	result?: {
		aeop_post_category_list?: {
			aeop_post_category_dto?: RawCategoryDto[];
		};
		success?: boolean;
		error_message?: string;
	};
}

export function parseCategoryDto(dto: RawCategoryDto) {
	let parsedNames: Record<string, string> = {};
	if (typeof dto.names === "string") {
		try {
			parsedNames = JSON.parse(dto.names);
		} catch {
			parsedNames = { en: dto.names };
		}
	} else if (typeof dto.names === "object" && dto.names !== null) {
		parsedNames = dto.names;
	}

	return {
		id: dto.id,
		name: parsedNames["en"] || Object.values(parsedNames)[0] || `Category ${dto.id}`,
		names: parsedNames,
		is_leaf: Boolean(dto.isleaf),
		level: dto.level,
	};
}

/**
 * GET /aliexpress/categories
 * Retrieve root categories or child categories by parent_id.
 *
 * Method: aliexpress.category.redefining.getchildrenpostcategorybyid
 * Docs: https://openservice.aliexpress.com/
 */
export class AliExpressCategoryList extends OpenAPIRoute {
	public schema = {
		tags: ["AliExpress - Categories"],
		summary: "Get categories (root or by parent_id)",
		description:
			"Retrieves categories from AliExpress. Pass parent_id=0 (or omit it) to get top-level (root) categories. Pass a valid category ID to get its child subcategories.",
		request: {
			query: z.object({
				parent_id: z
					.string()
					.optional()
					.default("0")
					.describe("Parent category ID. Use 0 for top-level/root categories."),
				user_id: z
					.string()
					.optional()
					.describe("Optional seller user_id to use their session token (if required)"),
			}),
		},
		responses: {
			"200": {
				description: "List of categories retrieved successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							parent_id: z.number(),
							categories: z.array(
								z.object({
									id: z.number(),
									name: z.string(),
									names: z.record(z.string()),
									is_leaf: z.boolean(),
									level: z.number(),
								})
							),
							count: z.number(),
						}),
					})
				),
			},
			"400": {
				description: "Failed to fetch categories",
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
		const parentId = parseInt(data.query.parent_id || "0", 10) || 0;

		const config: AliExpressClientConfig = {
			appKey: c.env.ALIEXPRESS_APP_KEY || DEFAULT_APP_KEY,
			appSecret: c.env.ALIEXPRESS_APP_SECRET || DEFAULT_APP_SECRET,
		};

		// Fetch optional session token if available
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

		// Call aliexpress.category.redefining.getchildrenpostcategorybyid with param0
		const apiResponse = await callAliExpressApi<RawCategoryResponse>(
			config,
			"aliexpress.category.redefining.getchildrenpostcategorybyid",
			{ param0: parentId },
			sessionToken
		);

		if (!apiResponse.success || !apiResponse.data) {
			return c.json(
				{
					success: false,
					error: apiResponse.error ?? "Failed to fetch categories from AliExpress",
					errorCode: apiResponse.errorCode,
				},
				400
			);
		}

		const categoryList =
			apiResponse.data.result?.aeop_post_category_list?.aeop_post_category_dto || [];

		const formatted = categoryList.map(parseCategoryDto);

		return c.json({
			success: true,
			result: {
				parent_id: parentId,
				categories: formatted,
				count: formatted.length,
			},
		});
	}
}

