import { z } from "zod";

export const loginSchema = z.object({
    email: z
        .string()
        .min(1, "REQUIRED")
        .email("INVALID"),
    password: z.string().min(6, "atleast 6 characters"),
    rememberMe: z.boolean(),
});

/** Empty by default - demo prefill only via DemoCredentialsCard when shown. */
export const DEFAULT_CREDENTIALS = {
    email: "",
    password: "",
    rememberMe: false,
};
