import type { Context } from "hono";

export interface AppEnv extends Env {
	DB: D1Database;
	ALIEXPRESS_APP_KEY?: string;
	ALIEXPRESS_APP_SECRET?: string;

	// Supabase Database Configuration
	SUPABASE_URL?: string;
	SUPABASE_KEY?: string;
	SUPABASE_SERVICE_ROLE_KEY?: string;

	// Ideamart AppZone OTP Service Configuration
	IDEAMART_APP_CODE?: string;
	IDEAMART_APP_007258?: string;
	IDEAMART_APP_067413?: string;
	IDEAMART_REQUEST_URL?: string;
	IDEAMART_VERIFY_URL?: string;
	SESSION_TTL_DAYS?: string;
}

export type AppContext = Context<{ Bindings: AppEnv }>;
export type HandleArgs = [AppContext];

// Default credentials provided by the user
export const DEFAULT_APP_KEY = "556446";
export const DEFAULT_APP_SECRET = "HusiSvXXSceP9mAcOl1317tqPlAPByG7";
