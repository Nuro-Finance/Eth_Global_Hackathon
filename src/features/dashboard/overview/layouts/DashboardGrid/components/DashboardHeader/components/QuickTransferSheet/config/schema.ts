import { z } from "zod";

export const quickTransferSchema = z.object({
    recipient: z.string().min(2, "Recipient name must be at least 2 characters"),
    accountNumber: z
        .string()
        .regex(/^\d{10,20}$/, "Account number must be 10-20 digits"),
    amount: z
        .number()
        .min(1, "Amount must be greater than 0")
        .max(1000000, "Amount too large"),
    currency: z.enum(["USD", "GBP", "JPY"]).optional(),
    transferDate: z.date().optional(),
    description: z
        .string()
        .max(200, "Description must be less than 200 characters")
        .optional(),
});

export type QuickTransferFormData = z.infer<typeof quickTransferSchema>;
