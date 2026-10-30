import { Hono } from "hono";
import { fromHono } from "chanfana";
import { IdeamartRequestOtp } from "./ideamartRequestOtp";
import { IdeamartVerifyOtp } from "./ideamartVerifyOtp";
import { AuthMe } from "./me";
import { AuthLogout } from "./logout";

export const mobileAuthRouter = fromHono(new Hono());

// Ideamart OTP authentication endpoints
mobileAuthRouter.post("/ideamart/otp/request", IdeamartRequestOtp);
mobileAuthRouter.post("/ideamart/otp/verify", IdeamartVerifyOtp);

// Session management
mobileAuthRouter.get("/me", AuthMe);
mobileAuthRouter.post("/logout", AuthLogout);

