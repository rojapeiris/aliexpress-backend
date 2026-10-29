import type { Context } from "hono";

export interface AppEnv extends Env {
	DB: D1Database;
	ALIEXPRESS_APP_KEY?: string;
	ALIEXPRESS_APP_SECRET?: string;
}

export type AppContext = Context<{ Bindings: AppEnv }>;
export type HandleArgs = [AppContext];

// Default credentials provided by the user
export const DEFAULT_APP_KEY = "556446";
export const DEFAULT_APP_SECRET = "HusiSvXXSceP9mAcOl1317tqPlAPByG7";
