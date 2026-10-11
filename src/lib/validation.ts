import { z } from "zod";
import { toCents } from "@/domain/money";
import { PROMO_TYPES } from "@/domain/promo";
import { BET_STATUSES } from "@/domain/pnl";
import { BET_CLASSES } from "@/domain/betClass";
import { BET_TYPES } from "@/db/types";

const moneyString = (message: string) =>
  z.string().refine((v) => toCents(v) > 0, message);

export const bookSchema = z.object({
  name: z.string().trim().min(1, "Give the bookmaker a name"),
  kind: z.enum(["bookmaker", "exchange"]),
  currency: z.string().trim().min(1),
  commissionRate: z
    .string()
    .refine((v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0), {
      message: "Commission must be a number",
    }),
});
export type BookForm = z.infer<typeof bookSchema>;

export const promoSchema = z.object({
  name: z.string().trim().min(1, "Give the promo a name"),
  type: z.enum(PROMO_TYPES as [string, ...string[]]),
  valueType: z.enum(["percent", "fixed"]),
  value: z
    .string()
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, {
      message: "Value must be zero or more",
    }),
  minOdds: z
    .string()
    .refine((v) => v === "" || !Number.isNaN(Number(v)), {
      message: "Minimum odds must be a number",
    }),
  bookId: z.string(),
  notes: z.string(),
});
export type PromoForm = z.infer<typeof promoSchema>;

export const betSchema = z.object({
  bookId: z.number().int().positive("Choose a bookmaker"),
  description: z.string().trim().min(1, "Describe the bet"),
  betType: z.enum(BET_TYPES as [string, ...string[]]),
  betClass: z.enum(BET_CLASSES as [string, ...string[]]),
  stake: moneyString("Stake must be greater than zero"),
  // Closing price is optional, but if given it has to be a real price.
  clv: z
    .string()
    .refine((v) => v.trim() === "" || Number(v) > 1, {
      message: "Closing price must be greater than 1",
    }),
  status: z.enum(BET_STATUSES as [string, ...string[]]),
  placedAt: z.string().min(1, "Choose a date"),
});
