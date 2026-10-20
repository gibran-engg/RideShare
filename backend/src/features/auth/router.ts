import { z } from "zod";
import { AppError, security, tokens, users } from "@rideshare/shared";
import { createModule } from "../../core/route.ts";
import { Ok } from "../../core/schemas.ts";
import { User, toUser } from "../users/schemas.ts";

/** Step 3 of sign-in (see sign-in.ts): the app swaps its one-time code for a bearer token. */
const { router, add } = createModule();
const tags = ["Auth"];

add(
    {
        method: "post",
        path: "/auth/exchange",
        summary: "Swap a one-time sign-in code for a bearer token",
        tags,
        auth: false,
        before: [security.rateLimit({ windowMs: 60 * 1000, max: 20 })],
        body: z.object({ code: z.string({ message: "Sign-in link expired. Please try again." }).min(10).max(200) }),
        response: z.object({ token: z.string(), user: User }),
        errors: [429]
    },
    ({ body }) => {
        const result = tokens.exchangeLoginCode(body.code);
        if (!result) throw new AppError("BAD_REQUEST", "Sign-in link expired. Please try again.");
        return { token: result.token, user: toUser(users.getById(result.userId)) };
    }
);

add({ method: "post", path: "/auth/logout", summary: "Revoke the current token", tags, response: Ok }, ({ user }, req) => {
    users.signOut(user.id, req.token!);
    return { ok: true };
});

export default router;
