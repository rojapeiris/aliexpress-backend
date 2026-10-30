import { Hono } from "hono";
import { fromHono } from "chanfana";
import { ProfileGet } from "./profileGet";
import { ProfileUpdate } from "./profileUpdate";

export const profileRouter = fromHono(new Hono());

profileRouter.get("/", ProfileGet);
profileRouter.patch("/", ProfileUpdate);
profileRouter.put("/", ProfileUpdate);

