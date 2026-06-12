import { z } from "zod";

export const loginSchema = z.object({
    email: z
        .string()
        .min(1, "REQUIRED")
        .email("INVALID"),
    password: z.string().min(6, "atleast 6 characters"),
    rememberMe: z.boolean(),
});

import { DEMO_CREDENTIALS } from "../DemoCredentialsCard/config";

export const DEFAULT_CREDENTIALS =
    process.env.NODE_ENV === "development"
        ? {
              email: DEMO_CREDENTIALS.email,
              password: DEMO_CREDENTIALS.password,
              rememberMe: false,
          }
        : {
              email: "",
              password: "",
              rememberMe: false,
          };
