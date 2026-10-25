import { z } from "zod";

import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES } from "./auth-policy.js";
export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES } from "./auth-policy.js";
const email = z.string().trim().toLowerCase().email().max(254);
export const registrationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .refine(
      (value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES,
      "Das Passwort darf maximal 72 UTF-8-Bytes enthalten.",
    ),
});
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(1024),
});
