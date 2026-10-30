import { OpenAPIRoute, contentJson } from "chanfana";
import { z } from "zod";
import { AppContext } from "../../types";
import {
	verifyIdeamartOtp,
	normalizePhone,
	IdeamartConfig,
} from "../../lib/ideamart-client";
import {
	SupabaseClient,
	hashToken,
	generateSessionToken,
} from "../../lib/supabase-client";

/**
 * POST /auth/ideamart/otp/verify
 * Verify OTP PIN and establish an authenticated app_session in Supabase.
 */
export class IdeamartVerifyOtp extends OpenAPIRoute {
	public schema = {
		tags: ["Mobile App Auth - Ideamart"],
		summary: "Verify OTP and create app session",
		description:
			"Verifies the OTP PIN against Ideamart AppZone. Upon success, creates a secure session record in Supabase 'app_sessions' (id, token_hash, phone, expires_at, created_at) and returns a raw bearer token for subsequent mobile app requests.",
		request: {
			body: contentJson(
				z.object({
					phone: z
						.string()
						.min(9)
						.describe("Subscriber phone number matching the request step"),
					otp: z
						.string()
						.min(4)
						.max(10)
						.describe("Verification code / PIN entered by the user"),
					referenceNo: z
						.string()
						.min(1)
						.describe("Unique reference number received from /auth/ideamart/otp/request"),
					applicationId: z
						.string()
						.optional()
						.describe("Application identifier used during request (optional; auto-derived if omitted)"),
					full_name: z
						.string()
						.optional()
						.describe("Optional user's display/full name to save to their profile"),
				})
			),
		},
		responses: {
			"200": {
				description: "OTP verified and session created successfully",
				...contentJson(
					z.object({
						success: z.boolean(),
						statusCode: z.string(),
						message: z.string(),
						result: z.object({
							token: z.string().describe("Bearer session token to use in Authorization header"),
							phone: z.string(),
							subscriber_id: z.string().optional().describe("Ideamart subscriber identifier (e.g. tel:encrypted_hash)"),
							subscription_status: z.string().optional().describe("Subscription status (e.g. INITIAL_CHARGING_PENDING)"),
							expires_at: z.string(),
							session_id: z.string(),
							profile: z
								.object({
									id: z.string().optional(),
									phone: z.string(),
									subscriber_id: z.string().nullable().optional(),
									full_name: z.string().nullable().optional(),
								})
								.optional(),
						}),
					})
				),
			},
			"400": {
				description: "Verification failed",
				...contentJson(
					z.object({
						success: z.boolean(),
						statusCode: z.string(),
						message: z.string(),
					})
				),
			},
			"500": {
				description: "Database session creation failed",
				...contentJson(
					z.object({
						success: z.boolean(),
						statusCode: z.string().optional(),
						message: z.string(),
						error: z.string().optional(),
					})
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const body = data.body;
		const phone = normalizePhone(body.phone);

		const config: IdeamartConfig = {
			requestUrl: c.env.IDEAMART_REQUEST_URL,
			verifyUrl: c.env.IDEAMART_VERIFY_URL,
			appCode: c.env.IDEAMART_APP_CODE,
			appIdMobitel: c.env.APP_ID_MOBITEL,
			appIdOther: c.env.APP_ID_OTHER,
		};

		// 1. Verify OTP with Ideamart AppZone
		const verifyResult = await verifyIdeamartOtp(
			{
				otp: body.otp,
				referenceNo: body.referenceNo,
				applicationId: body.applicationId,
				phone,
			},
			config
		);

		if (!verifyResult.success) {
			return c.json(
				{
					success: false,
					statusCode: verifyResult.statusCode,
					message: verifyResult.message,
				},
				400
			);
		}

		// 2. Generate secure session token and hash
		const rawToken = generateSessionToken();
		const tokenHash = await hashToken(rawToken);

		// Calculate expiration (default 30 days)
		const ttlDays = parseInt(c.env.SESSION_TTL_DAYS || "30", 10) || 30;
		const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

		// 3. Connect to Supabase
		const supabase = new SupabaseClient({
			url: c.env.SUPABASE_URL,
			key: c.env.SUPABASE_SERVICE_ROLE_KEY || c.env.SUPABASE_KEY,
		});

		// 4. Create record in app_sessions table
		// If profile not found in Supabase, automatically creates a new profile using phone & subscriber_id
		const { session, profile, error: sessionError } = await supabase.createAppSession({
			tokenHash,
			phone,
			expiresAt,
			fullName: body.full_name,
			subscriberId: verifyResult.subscriberId,
		});

		if (sessionError) {
			console.error("[Supabase] Failed to create app session:", sessionError);

			// If Supabase credentials are not configured yet, return session in fallback mode
			if (!supabase.isConfigured()) {
				return c.json({
					success: true,
					statusCode: "S1000",
					message:
						"OTP verified successfully. (Note: Supabase credentials are not configured yet; session created in fallback mode)",
					result: {
						token: rawToken,
						phone,
						subscriber_id: verifyResult.subscriberId,
						subscription_status: verifyResult.subscriptionStatus,
						expires_at: expiresAt.toISOString(),
						session_id: crypto.randomUUID(),
						profile: {
							phone,
							subscriber_id: verifyResult.subscriberId,
							full_name: body.full_name || null,
						},
					},
				});
			}

			return c.json(
				{
					success: false,
					statusCode: "DB_ERROR",
					message: "OTP verified, but failed to persist session in database.",
					error: sessionError,
				},
				500
			);
		}

		// Resolved profile (either retrieved or newly created using phone and subscriber_id)
		const activeProfile = profile || (await supabase.getProfileByPhone(phone)) || {
			id: crypto.randomUUID(),
			phone,
			subscriber_id: verifyResult.subscriberId || null,
			full_name: body.full_name || null,
		};

		return c.json({
			success: true,
			statusCode: "S1000",
			message: "OTP verified and app session created successfully.",
			result: {
				token: rawToken,
				phone,
				subscriber_id: activeProfile.subscriber_id || verifyResult.subscriberId,
				subscription_status: verifyResult.subscriptionStatus,
				expires_at: session?.expires_at || expiresAt.toISOString(),
				session_id: session?.id || "",
				profile: {
					id: activeProfile.id,
					phone: activeProfile.phone,
					subscriber_id: activeProfile.subscriber_id || verifyResult.subscriberId || null,
					full_name: activeProfile.full_name || null,
				},
			},
		});
	}
}

