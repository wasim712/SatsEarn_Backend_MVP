import { Router } from "express";
import { UserController } from "../user/user.controller";

const router = Router()
router.get('/announcements/active', UserController.activeAnnouncement);
export default router