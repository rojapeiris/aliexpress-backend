import { Hono } from "hono";
import { fromHono } from "chanfana";
import { GetOrderList } from "./getOrderList";
import { PlaceOrder } from "./placeOrder";
import { GetOrderDetail } from "./getOrderDetail";
import { CancelOrder } from "./cancelOrder";
import { GetOrderStats } from "./getOrderStats";

export const ordersRouter = fromHono(new Hono());

// Order collection & placement
ordersRouter.get("/", GetOrderList);
ordersRouter.post("/", PlaceOrder);

// Order summary metrics (defined before /:orderId to avoid route collision)
ordersRouter.get("/stats", GetOrderStats);

// Individual order inspection & cancellation
ordersRouter.get("/:orderId", GetOrderDetail);
ordersRouter.post("/:orderId/cancel", CancelOrder);

