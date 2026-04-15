import { Router, Request, Response } from "express";
import { AuthController } from "../controllers/authController";

const router = Router();
const authController = new AuthController();

router.post("/login", (req: Request, res: Response) =>
  authController.login(req.body).then(result => res.json(result))
);

export default router;