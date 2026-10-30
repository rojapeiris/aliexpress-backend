import { AliExpressClientConfig, callAliExpressApi } from "./aliexpress-client";

export interface CategoryMeta {
	name: string;
	feedName: string;
	fallbackKeywords: string;
}

/**
 * Standard AliExpress Dropshipping Root Categories Metadata
 */
export const CATEGORY_MAP: Record<string, CategoryMeta> = {
	"30": {
		name: "Security & Protection",
		feedName: "DS_Security&Protection_bestsellers",
		fallbackKeywords: "Security",
	},
	"509": {
		name: "Cellphones & Telecommunications",
		feedName: "DS_Cellphones&Telecommunications_bestsellers",
		fallbackKeywords: "Phone",
	},
	"1509": {
		name: "Consumer Electronics",
		feedName: "DS_ConsumerElectronics_bestsellers",
		fallbackKeywords: "Electronics",
	},
	"66": {
		name: "Beauty & Health",
		feedName: "DS_Beauty&Health_bestsellers",
		fallbackKeywords: "Beauty",
	},
	"15": {
		name: "Home & Garden",
		feedName: "DS_Home&Kitchen_bestsellers",
		fallbackKeywords: "Home",
	},
	"18": {
		name: "Sports & Entertainment",
		feedName: "DS_Sports&Entertainment_bestsellers",
		fallbackKeywords: "Sports",
	},
	"34": {
		name: "Automobiles & Motorcycles",
		feedName: "DS_Automobiles&Motorcycles_bestsellers",
		fallbackKeywords: "Car",
	},
	"1501": {
		name: "Mother & Kids",
		feedName: "DS_Mother&Kids_bestsellers",
		fallbackKeywords: "Baby",
	},
	"1503": {
		name: "Toys & Hobbies",
		feedName: "DS_Toys&Hobbies_bestsellers",
		fallbackKeywords: "Toys",
	},
	"1420": {
		name: "Tools & Home Improvement",
		feedName: "DS_Tools&HomeImprovement_bestsellers",
		fallbackKeywords: "Tools",
	},
	"1524": {
		name: "Luggage & Bags",
		feedName: "DS_Luggage&Bags_bestsellers",
		fallbackKeywords: "Bag",
	},
	"322": {
		name: "Shoes",
		feedName: "DS_Shoes_bestsellers",
		fallbackKeywords: "Shoes",
	},
	"200000345": {
		name: "Jewelry & Accessories",
		feedName: "DS_Jewelry&Accessories_bestsellers",
		fallbackKeywords: "Jewelry",
	},
	"100003109": {
		name: "Women's Clothing",
		feedName: "DS_Women'sClothing_bestsellers",
		fallbackKeywords: "Women",
	},
	"100003070": {
		name: "Men's Clothing",
		feedName: "DS_Men'sClothing_bestsellers",
		fallbackKeywords: "Men",
	},
	"200000297": {
		name: "Underwear & Sleepwear",
		feedName: "DS_Women'sClothing_bestsellers",
		fallbackKeywords: "Underwear",
	},
	"7": {
		name: "Computer & Office",
		feedName: "DS_ConsumerElectronics_bestsellers",
		fallbackKeywords: "Computer",
	},
	"44": {
		name: "Consumer Electronics",
		feedName: "DS_ConsumerElectronics_bestsellers",
		fallbackKeywords: "Electronics",
	},
};

interface RawTextSearchItem {
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
			products?: RawTextSearchItem[];
		};
	};
	result?: {
		products?: {
			traffic_product_d_t_o?: RawTextSearchItem[];
		};
		total_page_no?: number;
		current_page_no?: number;
		total_record_count?: number;
	};
}

export interface StandardProductItem {
	product_id: string;
	title: string;
	main_image_url?: string;
	sale_price?: string;
	original_price?: string;
	currency?: string;
	discount?: string;
	rating?: string;
	volume?: string;
	detail_url?: string;
	category_id?: number;
	subcategory_id?: number;
}

export interface CategoryFetchParams {
	categoryId?: string;
	subcategoryId?: string;
	q?: string;
	pageNo: number;
	pageSize: number;
	country: string;
	currency: string;
	language: string;
	sort?: string;
	feedName?: string;
	config: AliExpressClientConfig;
	sessionToken?: string;
}

export interface CategoryFetchResult {
	success: boolean;
	products: StandardProductItem[];
	totalCount?: number;
	totalPages?: number;
	currentPage: number;
	pageSize: number;
	error?: string;
	errorCode?: string;
}

/**
 * Resolves the human-readable category name from static dictionary or dynamic category API.
 */
export async function resolveCategoryName(
	categoryId: string,
	config: AliExpressClientConfig,
	sessionToken?: string
): Promise<string | undefined> {
	if (CATEGORY_MAP[categoryId]?.name) {
		return CATEGORY_MAP[categoryId].name;
	}

	try {
		const res = await callAliExpressApi<any>(
			config,
			"aliexpress.ds.category.get",
			{ app_signature: "true" },
			sessionToken
		);
		const categories: Array<{ category_id: number; category_name: string }> =
			res.data?.resp_result?.result?.categories?.category || [];
		const targetIdNum = parseInt(categoryId, 10);
		const found = categories.find((c) => c.category_id === targetIdNum);
		if (found?.category_name) {
			return found.category_name;
		}
	} catch {
		// Ignore fetch error
	}
	return undefined;
}

function mapRawProducts(
	rawItems: RawTextSearchItem[],
	targetCurrency: string,
	categoryId?: string,
	subcategoryId?: string
): StandardProductItem[] {
	return rawItems.map((p) => ({
		product_id: String(p.product_id),
		title: p.product_title,
		main_image_url: p.product_main_image_url,
		sale_price: p.target_sale_price || p.sale_price,
		original_price: p.original_price || p.target_original_price,
		currency:
			p.target_sale_price_currency ||
			p.app_sale_price_currency ||
			targetCurrency ||
			"USD",
		discount: p.discount,
		rating: p.evaluation_rate || p.evaluate_rate,
		volume:
			p.volume !== undefined
				? String(p.volume)
				: p.lastest_volume !== undefined
				? String(p.lastest_volume)
				: undefined,
		detail_url: p.product_detail_url,
		category_id:
			p.first_level_category_id ?? (categoryId ? parseInt(categoryId, 10) : undefined),
		subcategory_id:
			p.second_level_category_id ?? (subcategoryId ? parseInt(subcategoryId, 10) : undefined),
	}));
}

/**
 * Multi-strategy category and subcategory product fetcher.
 * Automatically tries category text search, category-specific bestsellers,
 * and general dropshipping bestsellers to prevent empty result sets.
 */
export async function fetchCategoryProducts(params: CategoryFetchParams): Promise<CategoryFetchResult> {
	const targetCategoryId = params.subcategoryId || params.categoryId;
	if (!targetCategoryId) {
		return {
			success: false,
			products: [],
			currentPage: params.pageNo,
			pageSize: params.pageSize,
			error: "Category ID or Subcategory ID is required.",
		};
	}

	const rootMeta = params.categoryId ? CATEGORY_MAP[params.categoryId] : CATEGORY_MAP[targetCategoryId];

	// Determine keywords to search: user query > category name > fallback keywords
	let keywords = params.q?.trim() || "";
	if (!keywords) {
		const resolvedName = await resolveCategoryName(targetCategoryId, params.config, params.sessionToken);
		keywords = resolvedName || rootMeta?.name || rootMeta?.fallbackKeywords || "";
	}

	// 1. If explicit feedName was passed, query that feed directly
	if (params.feedName) {
		const feedRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.recommend.feed.get",
			{
				feed_name: params.feedName,
				category_id: targetCategoryId,
				page_no: params.pageNo,
				page_size: params.pageSize,
				country: params.country,
				target_currency: params.currency,
				target_language: params.language,
				...(params.sort ? { sort: params.sort } : {}),
			},
			params.sessionToken
		);

		const rawFeed = feedRes.data?.result?.products?.traffic_product_d_t_o || [];
		if (rawFeed.length > 0) {
			const products = mapRawProducts(rawFeed, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: feedRes.data?.result?.current_page_no ?? params.pageNo,
				pageSize: params.pageSize,
				totalPages: feedRes.data?.result?.total_page_no,
				totalCount: feedRes.data?.result?.total_record_count ?? products.length,
			};
		}
	}

	// 2. Strategy A: aliexpress.ds.text.search with keywords + category_id
	if (keywords) {
		const textSearchParams: Record<string, string | number> = {
			category_id: targetCategoryId,
			keywords,
			page_no: params.pageNo,
			page_size: params.pageSize,
			countryCode: params.country,
			currency: params.currency,
			local: params.language.toLowerCase(),
			...(params.sort ? { sort: params.sort } : {}),
		};

		const textRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.text.search",
			textSearchParams,
			params.sessionToken
		);

		const respResult = textRes.data?.resp_result?.result;
		const rawItems = respResult?.products || textRes.data?.result?.products?.traffic_product_d_t_o || [];

		if (rawItems.length > 0) {
			const products = mapRawProducts(rawItems, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: respResult?.current_page_no ?? params.pageNo,
				pageSize: params.pageSize,
				totalPages: respResult?.total_page_count,
				totalCount: respResult?.total_record_count ?? products.length,
			};
		}
	}

	// 3. Strategy B: Category-specific recommendation feed (e.g. DS_Security&Protection_bestsellers for 30)
	const candidateFeeds: string[] = [];
	if (rootMeta?.feedName) {
		candidateFeeds.push(rootMeta.feedName);
	}
	candidateFeeds.push("DS bestseller", "DS_bestseller", "DS_NewArrivals");

	for (const feed of candidateFeeds) {
		const feedRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.recommend.feed.get",
			{
				feed_name: feed,
				category_id: targetCategoryId,
				page_no: params.pageNo,
				page_size: params.pageSize,
				country: params.country,
				target_currency: params.currency,
				target_language: params.language,
				...(params.sort ? { sort: params.sort } : {}),
			},
			params.sessionToken
		);

		const rawFeed = feedRes.data?.result?.products?.traffic_product_d_t_o || [];
		if (rawFeed.length > 0) {
			let selected = rawFeed;
			if (params.q) {
				const lowerQ = params.q.toLowerCase();
				const filtered = rawFeed.filter((p) => p.product_title?.toLowerCase().includes(lowerQ));
				if (filtered.length > 0) selected = filtered;
			}

			const products = mapRawProducts(selected, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: feedRes.data?.result?.current_page_no ?? params.pageNo,
				pageSize: params.pageSize,
				totalPages: feedRes.data?.result?.total_page_no,
				totalCount: feedRes.data?.result?.total_record_count ?? products.length,
			};
		}
	}

	// 4. Strategy C: Text search with broader fallback keyword
	if (rootMeta?.fallbackKeywords && rootMeta.fallbackKeywords !== keywords) {
		const fallbackTextRes = await callAliExpressApi<RawTextSearchResponse>(
			params.config,
			"aliexpress.ds.text.search",
			{
				category_id: targetCategoryId,
				keywords: rootMeta.fallbackKeywords,
				page_no: params.pageNo,
				page_size: params.pageSize,
				countryCode: params.country,
				currency: params.currency,
				local: params.language.toLowerCase(),
			},
			params.sessionToken
		);

		const rawFallback =
			fallbackTextRes.data?.resp_result?.result?.products ||
			fallbackTextRes.data?.result?.products?.traffic_product_d_t_o ||
			[];

		if (rawFallback.length > 0) {
			const products = mapRawProducts(rawFallback, params.currency, params.categoryId, params.subcategoryId);
			return {
				success: true,
				products,
				currentPage: params.pageNo,
				pageSize: params.pageSize,
				totalPages: fallbackTextRes.data?.resp_result?.result?.total_page_count,
				totalCount: fallbackTextRes.data?.resp_result?.result?.total_record_count ?? products.length,
			};
		}
	}

	// If all upstream calls yielded 0 products, return empty result gracefully
	return {
		success: true,
		products: [],
		currentPage: params.pageNo,
		pageSize: params.pageSize,
		totalCount: 0,
		totalPages: 0,
	};
}

