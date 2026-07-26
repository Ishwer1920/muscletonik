import { Router } from "express";
import { changePassword, changePasswordValidators, forgotPassword, forgotValidators, login, loginValidators, logout, me, register, registerValidators, refresh, resetPasswordHandler, resetValidators, verifyEmailHandler, verifyEmailValidators } from "../controllers/auth.controller.js";
import { updateProfile, updateProfileValidators, uploadAvatar, avatarUploadMiddleware } from "../controllers/account.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/register", registerValidators, register);
authRouter.post("/login", loginValidators, login);
authRouter.post("/logout", logout);
authRouter.post("/refresh", refresh);
authRouter.get("/me", requireAuth, me);
authRouter.post("/forgot-password", forgotValidators, forgotPassword);
authRouter.post("/reset-password", resetValidators, resetPasswordHandler);
authRouter.post("/verify-email", verifyEmailValidators, verifyEmailHandler);
authRouter.post("/change-password", requireAuth, changePasswordValidators, changePassword);

// Customer self-service: update own profile + avatar (auth required).
authRouter.patch("/profile", requireAuth, updateProfileValidators, updateProfile);
authRouter.post("/avatar", requireAuth, avatarUploadMiddleware, uploadAvatar);
