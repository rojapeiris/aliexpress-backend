/**
 * Ideamart AppZone OTP Service Client
 * Based on official Ideamart OTP Service Documentation
 *
 * Endpoints:
 *  - Request: https://appzone.lk/api/otp/request
 *  - Verify:  https://appzone.lk/api/otp/verify
 */

export const IDEAMART_REQUEST_URL = "https://appzone.lk/api/otp/request";
export const IDEAMART_VERIFY_URL = "https://appzone.lk/api/otp/verify";

export const DEFAULT_APP_ID_MOBITEL = "APP_005144"; // Prefixes: 9471, 9470, 071, 070
export const DEFAULT_APP_ID_OTHER = "APP_068124";   // All other prefixes (Dialog, Airtel, Hutch)
export const DEFAULT_APP_CODE = "op";

export interface IdeamartConfig {
	requestUrl?: string;
	verifyUrl?: string;
	appCode?: string;
	appIdMobitel?: string;
	appIdOther?: string;
}

export interface IdeamartOtpRequestParams {
	phone: string;
	device?: string;
	os?: string;
	appCode?: string;
	applicationId?: string;
}

export interface IdeamartOtpRequestResult {
	success: boolean;
	statusCode: string;
	referenceNo?: string;
	message: string;
	applicationId: string;
	phone: string;
}

export interface IdeamartOtpVerifyParams {
	otp: string;
	referenceNo: string;
	applicationId?: string;
	phone?: string;
}

export interface IdeamartOtpVerifyResult {
	success: boolean;
	statusCode: string;
	message: string;
	subscriberId?: string;
	subscriptionStatus?: string;
	statusDetail?: string;
	version?: string;
}

/**
 * Normalizes phone numbers (e.g. +94712345678 -> 0712345678 or 94712345678)
 * Strips whitespace, dashes, plus signs.
 */
export function normalizePhone(rawPhone: string): string {
	let cleaned = rawPhone.replace(/[\s\-\(\)\+]/g, "").trim();

	// If starts with 0094, replace with 94
	if (cleaned.startsWith("0094")) {
		cleaned = cleaned.substring(2);
	}

	return cleaned;
}

/**
 * Determines the Ideamart applicationId based on the subscriberId prefix:
 *  - Starts with 9471, 9470, 071, 070: APP_007258
 *  - All other prefixes: APP_067413
 */
export function getApplicationId(phone: string, config?: IdeamartConfig): string {
	const normalized = normalizePhone(phone);

	const isMobitel =
		normalized.startsWith("9471") ||
		normalized.startsWith("9470") ||
		normalized.startsWith("071") ||
		normalized.startsWith("070");

	if (isMobitel) {
		return config?.appIdMobitel || DEFAULT_APP_ID_MOBITEL;
	}

	return config?.appIdOther || DEFAULT_APP_ID_OTHER;
}

/**
 * Friendly error messages for Ideamart Request Status Codes
 */
const REQUEST_STATUS_MESSAGES: Record<string, string> = {
	S1000: "Success",
	E1853: "Maximum number of OTP requests reached. Please try again later.",
	E1856: "Invalid request payload or configuration.",
	E1857: "Ideamart internal server error occurred.",
	E1301: "Please enter a valid mobile number.",
	E1351: "User already registered.",
};

/**
 * Friendly error messages for Ideamart Verify Status Codes
 */
const VERIFY_STATUS_MESSAGES: Record<string, string> = {
	S1000: "Success",
	E1850: "Invalid PIN / OTP code entered.",
	E1856: "Invalid verification request.",
	E1851: "The OTP PIN number has expired. Please request a new one.",
	E1852: "Maximum number of OTP attempts has been reached.",
	E1854: "Could not find OTP for this transaction.",
	E1855: "Invalid reference number.",
	E1857: "Ideamart internal server error occurred.",
	E1301: "Requested ApplicationID is not allowed within the System for unknown operator.",
};

/**
 * Initiates an OTP request via Ideamart AppZone
 *
 * Payload:
 * {
 *   "client": "MOBILEAPP",
 *   "device": "android",
 *   "os": "android",
 *   "appCode": "op",
 *   "applicationId": "APP_007258",
 *   "subscriberId": "0712345678"
 * }
 */
export async function requestIdeamartOtp(
	params: IdeamartOtpRequestParams,
	config?: IdeamartConfig
): Promise<IdeamartOtpRequestResult> {
	const phone = normalizePhone(params.phone);
	const applicationId = params.applicationId || getApplicationId(phone, config);
	const url = config?.requestUrl || IDEAMART_REQUEST_URL;

	const payload = {
		client: "MOBILEAPP",
		device: params.device || "android",
		os: params.os || "android",
		appCode: params.appCode || config?.appCode || DEFAULT_APP_CODE,
		applicationId,
		subscriberId: phone,
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(payload),
		});

		const text = await response.text();
		let json: Record<string, unknown>;

		try {
			json = JSON.parse(text);
		} catch {
			return {
				success: false,
				statusCode: "HTTP_" + response.status,
				message: `Ideamart returned non-JSON response (HTTP ${response.status}): ${text.substring(0, 200)}`,
				applicationId,
				phone,
			};
		}

		const statusCode = String(json["statusCode"] || "");
		const referenceNo = json["referenceNo"] ? String(json["referenceNo"]) : undefined;
		const rawMessage = json["message"] ? String(json["message"]) : "";
		const friendlyMessage = REQUEST_STATUS_MESSAGES[statusCode] || rawMessage || "Unknown response from Ideamart";

		const success = statusCode === "S1000";

		return {
			success,
			statusCode,
			referenceNo,
			message: friendlyMessage,
			applicationId,
			phone,
		};
	} catch (err) {
		return {
			success: false,
			statusCode: "NETWORK_ERROR",
			message: err instanceof Error ? err.message : "Failed to connect to Ideamart OTP service",
			applicationId,
			phone,
		};
	}
}

/**
 * Verifies the OTP PIN entered by the user
 *
 * Payload:
 * {
 *   "otp": "1234",
 *   "applicationId": "APP_007258",
 *   "referenceNo": "ref_12345"
 * }
 */
export async function verifyIdeamartOtp(
	params: IdeamartOtpVerifyParams,
	config?: IdeamartConfig
): Promise<IdeamartOtpVerifyResult> {
	const applicationId =
		params.applicationId ||
		(params.phone ? getApplicationId(params.phone, config) : DEFAULT_APP_ID_OTHER);

	const url = config?.verifyUrl || IDEAMART_VERIFY_URL;

	const payload = {
		otp: params.otp.trim(),
		applicationId,
		referenceNo: params.referenceNo.trim(),
	};

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(payload),
		});

		const text = await response.text();
		let json: Record<string, unknown>;

		try {
			json = JSON.parse(text);
		} catch {
			return {
				success: false,
				statusCode: "HTTP_" + response.status,
				message: `Ideamart returned non-JSON response (HTTP ${response.status}): ${text.substring(0, 200)}`,
			};
		}

		const statusCode = String(json["statusCode"] || "");
		const rawMessage = json["message"] || json["statusDetail"] ? String(json["message"] || json["statusDetail"]) : "";
		const friendlyMessage = VERIFY_STATUS_MESSAGES[statusCode] || rawMessage || "Unknown verification result from Ideamart";

		const success = statusCode === "S1000";
		const subscriberId = json["subscriberId"] ? String(json["subscriberId"]) : undefined;
		const subscriptionStatus = json["subscriptionStatus"] ? String(json["subscriptionStatus"]) : undefined;
		const statusDetail = json["statusDetail"] ? String(json["statusDetail"]) : undefined;
		const version = json["version"] ? String(json["version"]) : undefined;

		return {
			success,
			statusCode,
			message: friendlyMessage,
			subscriberId,
			subscriptionStatus,
			statusDetail,
			version,
		};
	} catch (err) {
		return {
			success: false,
			statusCode: "NETWORK_ERROR",
			message: err instanceof Error ? err.message : "Failed to connect to Ideamart verify service",
		};
	}
}

