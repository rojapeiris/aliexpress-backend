/**
 * AliExpress Open Platform API Client
 * Compatible with Cloudflare Workers / Web Crypto API
 * Gateway: https://api-sg.aliexpress.com
 * Docs: https://openservice.aliexpress.com/
 */

import { DEFAULT_APP_KEY, DEFAULT_APP_SECRET } from "../types";

export const ALIEXPRESS_GATEWAY = "https://api-sg.aliexpress.com";
export const ALIEXPRESS_AUTH_URL = "https://api-sg.aliexpress.com/oauth/authorize";

export interface AliExpressClientConfig {
	appKey?: string;
	appSecret?: string;
}

export interface AliExpressRequestParams {
	[key: string]: string | number | boolean | undefined | null;
}

export interface AliExpressResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	errorCode?: string;
}

/**
 * Returns formatted timestamp in GMT+8 (Asia/Shanghai) timezone: "YYYY-MM-DD HH:MM:SS"
 */
export function getAliexpressTimestamp(): string {
	const date = new Date();
	const formatter = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});

	const parts = formatter.formatToParts(date);
	const val = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

	return `${val("year")}-${val("month")}-${val("day")} ${val("hour")}:${val("minute")}:${val("second")}`;
}

/**
 * Generate HMAC-SHA256 signature for AliExpress IOP / TOP gateway.
 *
 * Algorithm:
 *  1. Sort all parameter keys alphabetically (ASCII order), excluding 'sign'.
 *  2. Concatenate: {apiPath}{key1}{value1}{key2}{value2}...
 *  3. HMAC-SHA256 with appSecret, formatted as uppercase Hex.
 */
export async function generateSign(
	params: Record<string, string>,
	apiPath: string,
	appSecret: string
): Promise<string> {
	const sortedKeys = Object.keys(params)
		.filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== null)
		.sort();

	let baseString = apiPath;
	for (const key of sortedKeys) {
		baseString += `${key}${params[key]}`;
	}

	const encoder = new TextEncoder();
	const keyData = encoder.encode(appSecret);
	const msgData = encoder.encode(baseString);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		keyData,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);

	const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);

	return Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase();
}

/**
 * Resolve client configuration with fallback to default credentials.
 */
export function resolveConfig(config?: AliExpressClientConfig): {
	appKey: string;
	appSecret: string;
} {
	return {
		appKey: config?.appKey || DEFAULT_APP_KEY,
		appSecret: config?.appSecret || DEFAULT_APP_SECRET,
	};
}

/**
 * Call system-level authentication APIs:
 *  - /auth/token/create
 *  - /auth/token/refresh
 */
export async function callAuthApi<T = unknown>(
	config: AliExpressClientConfig | undefined,
	action: "/auth/token/create" | "/auth/token/refresh",
	params: Record<string, string>
): Promise<AliExpressResponse<T>> {
	const { appKey, appSecret } = resolveConfig(config);
	const timestamp = getAliexpressTimestamp();

	const allParams: Record<string, string> = {
		app_key: appKey,
		timestamp,
		sign_method: "sha256",
		...params,
	};

	const sign = await generateSign(allParams, action, appSecret);
	allParams["sign"] = sign;

	const qs = new URLSearchParams(allParams).toString();
	const url = `${ALIEXPRESS_GATEWAY}${action}?${qs}`;

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		});

		const json = (await response.json()) as Record<string, unknown>;

		if (!response.ok) {
			return {
				success: false,
				error: (json["message"] as string) || `HTTP ${response.status}: ${response.statusText}`,
				errorCode: String(response.status),
			};
		}

		const errorResponse = json["error_response"] as
			| { code: string; msg: string; sub_code?: string; sub_msg?: string }
			| undefined;

		if (errorResponse) {
			return {
				success: false,
				error: errorResponse.sub_msg || errorResponse.msg,
				errorCode: errorResponse.sub_code || errorResponse.code,
			};
		}

		return { success: true, data: json as T };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "Unknown network error",
		};
	}
}

/**
 * Execute AliExpress Open Platform business API calls:
 *  - aliexpress.category.redefining.getchildrenpostcategorybyid
 *  - aliexpress.ds.recommend.feed.get
 *  - aliexpress.ds.product.get
 * Uses POST /sync endpoint or direct method invocation.
 */
export async function callAliExpressApi<T = unknown>(
	config: AliExpressClientConfig | undefined,
	method: string,
	apiParams: AliExpressRequestParams = {},
	accessToken?: string
): Promise<AliExpressResponse<T>> {
	const { appKey, appSecret } = resolveConfig(config);
	const timestamp = getAliexpressTimestamp();
	const apiPath = "/sync";

	const allParams: Record<string, string> = {
		app_key: appKey,
		method,
		sign_method: "sha256",
		timestamp,
		format: "json",
		v: "2.0",
		...(accessToken ? { session: accessToken } : {}),
	};

	for (const [k, v] of Object.entries(apiParams)) {
		if (v !== undefined && v !== null) {
			allParams[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
		}
	}

	const sign = await generateSign(allParams, apiPath, appSecret);
	allParams["sign"] = sign;

	const body = new URLSearchParams(allParams);

	try {
		const response = await fetch(`${ALIEXPRESS_GATEWAY}${apiPath}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
				Accept: "application/json",
			},
			body: body.toString(),
		});

		const json = (await response.json()) as Record<string, unknown>;

		if (!response.ok) {
			return {
				success: false,
				error: (json["message"] as string) || `HTTP ${response.status}: ${response.statusText}`,
				errorCode: String(response.status),
			};
		}

		// Check for error_response from AliExpress gateway
		const errorResponse = json["error_response"] as
			| { code: string; msg: string; sub_code?: string; sub_msg?: string }
			| undefined;

		if (errorResponse) {
			return {
				success: false,
				error: errorResponse.sub_msg || errorResponse.msg,
				errorCode: errorResponse.sub_code || errorResponse.code,
			};
		}

		// Response key pattern: method name with dots replaced by underscores + "_response"
		const responseKey = method.replace(/\./g, "_") + "_response";
		const data = (json[responseKey] ?? json) as T;

		return { success: true, data };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : "Unknown error",
		};
	}
}
