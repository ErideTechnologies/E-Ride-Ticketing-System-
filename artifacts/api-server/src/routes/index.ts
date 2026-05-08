import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supportRouter from "./support";
import authRouter from "./auth";
import { supportAuthGuard, supportPermissionGuard } from "../lib/supportAuth";

const router: IRouter = Router();

router.use(healthRouter);
// Auth endpoints are themselves whitelisted in supportAuthGuard, but mount
// them before the guard so login/logout/me always run unconditionally.
router.use(authRouter);
router.use(supportAuthGuard);
router.use(supportPermissionGuard);
router.use(supportRouter);

export default router;
