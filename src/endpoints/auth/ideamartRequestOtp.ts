import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import {
	requestIdeamartOtp,
	getApplicationId,
	normalizePhone,
	IdeamartConfig,
} from "../../lib/ideamart-client";

/**
 * POST /auth/ideamart/otp/request
 * Request an OTP PIN via Ideamart AppZone service for mobile app authentication.
 */
export class IdeamartRequestOtp extends OpenAPIRoute {
	public schema = {
		tags: ["Mobile App Auth - Ideamart"],
		summary: "Request OTP via Ideamart AppZone",
		description:
			"Sends an OTP verification PIN to the subscriber's Sri Lankan mobile number. Automatically routes to APP_007258 (Mobitel prefixes 9471, 9470, 071, 070) or APP_067413 (all other operators).",
		request: {
			body: contentJson(
				z.object({
					phone: z
						.string()
						.min(9)
						.describe("Subscriber phone number (e.g. '0712345678', '94771234567', '+94712345678')"),
					device: z
						.string()
						.optional()
						.default("android")
						.describe("Device type (e.g. 'android', 'ios')"),
					os: z
						.string()
						.optional()
						.default("android")
						.describe("Operating system (e.g. 'android', 'ios')"),
					appCode: z
						.string()
						.optional()
						.default("op")
						.describe("Application code (defaults to 'op')"),
					applicationId: z
						.string()
						.optional()
						.describe("Explicit applicationId override (optional; automatically determined from phone prefix)"),
				})
			),
		},
		responses: {
			"200": {
				description: "OTP requested successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						statusCode: z.string(),
						referenceNo: z.string().optional(),
						applicationId: z.string(),
						phone: z.string(),
						message: z.string(),
					})
				),
			},
			"400": {
				description: "Failed to request OTP",
				...contentJson(
					z.object({
						success: z.boolean(),
						statusCode: z.string(),
						applicationId: z.string().optional(),
						phone: z.string().optional(),
						message: z.string(),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const body = data.body;

		const config: IdeamartConfig = {
			requestUrl: c.env.IDEAMART_REQUEST_URL,
			verifyUrl: c.env.IDEAMART_VERIFY_URL,
			appCode: c.env.IDEAMART_APP_CODE,
			appIdMobitel: c.env.APP_ID_MOBITEL,
			appIdOther: c.env.APP_ID_OTHER,
		};

		const result = await requestIdeamartOtp(
			{
				phone: body.phone,
				device: body.device,
				os: body.os,
				appCode: body.appCode,
				applicationId: body.applicationId,
			},
			config
		);

		if (!result.success) {
			return c.json(
				{
					success: false,
					statusCode: result.statusCode,
					applicationId: result.applicationId,
					phone: result.phone,
					message: result.message,
				},
				400
			);
		}

		return c.json({
			success: true,
			statusCode: result.statusCode,
			referenceNo: result.referenceNo,
			applicationId: result.applicationId,
			phone: result.phone,
			message: result.message,
		});
	}
}

