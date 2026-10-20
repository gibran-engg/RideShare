import type { NextFunction, Request, Response } from "express";
import { AppError, tokens, users } from "@rideshare/shared";
import type { Role } from "@rideshare/shared";

/** Bearer-token authentication for /api routes. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const userId = tokens.verify(token);
    const user = userId ? users.getById(userId) : null;
    if (!user || !token) return next(new AppError("UNAUTHENTICATED", "Please sign in again."));
    if (user.status === "suspended") return next(new AppError("ACCOUNT_SUSPENDED", "Your account is suspended."));
    req.user = user;
    req.token = token;
    next();
}

/** Riders and drivers must finish onboarding (drivers must be approved) first. */
export function requireReady(role?: Role) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const user = req.user!;
        if (users.onboardingStep(user) !== "ready")
            return next(new AppError("ONBOARDING_INCOMPLETE", "Finish setting up your account first."));
        if (role && user.role !== role) return next(new AppError("FORBIDDEN", `Only ${role}s can do that.`));
        next();
    };
}
