import { z } from "zod";

export const LIMITS = {
  username: 50,
  password: 128,
  name: 120,
  company: 120,
  phone: 20,
  visitText: 120,
  visitCode: 32,
  agendaText: 120,
  agendaObservation: 1000,
  tvTitle: 120,
};

export function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

export function positiveIntParam(field = "id") {
  return z
    .object({
      [field]: z
        .string()
        .regex(/^[1-9]\d*$/, `${field} inválido`)
        .transform((value) => Number(value))
        .pipe(z.number().int().positive()),
    })
    .strict();
}

export const idParamSchema = positiveIntParam("id");

export function positiveIntBody(message = "ID inválido") {
  return z.number().int(message).positive(message);
}

export function positiveIntQuery(field) {
  return z
    .string()
    .regex(/^[1-9]\d*$/, `${field} inválido`)
    .transform((value) => Number(value))
    .pipe(z.number().int().positive());
}

export const boundedPageQuery = z
  .string()
  .regex(/^[1-9]\d*$/, "page inválida")
  .transform((value) => Number(value))
  .pipe(z.number().int().min(1).max(10000));

export const boundedLimitQuery = (max = 100, defaultValue = 25) =>
  z
    .string()
    .optional()
    .default(String(defaultValue))
    .refine((value) => /^[1-9]\d*$/.test(value), "limit inválido")
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(max));

export function trimmedString(max, message = "Campo inválido") {
  return z.string().trim().min(1, message).max(max, message);
}

export function optionalTrimmedString(max) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      return text ? text : null;
    })
    .pipe(z.string().max(max).nullable());
}

export const cpfSchema = z
  .string()
  .transform(onlyDigits)
  .refine((value) => value.length === 11, "CPF inválido")
  .refine((value) => !/^(\d)\1{10}$/.test(value), "CPF inválido");

export const phoneSchema = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    const digits = onlyDigits(value || "");
    return digits || null;
  })
  .refine((value) => value === null || (value.length >= 10 && value.length <= 11), {
    message: "Telefone inválido",
  });

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usuário deve ter no mínimo 3 caracteres")
  .max(LIMITS.username, "Usuário muito longo")
  .regex(/^[A-Za-z0-9._-]+$/, "Usuário contém caracteres inválidos");

export const passwordSchema = z
  .string()
  .min(6, "Senha deve ter no mínimo 6 caracteres")
  .max(LIMITS.password, "Senha muito longa");

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return (
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  }, "Data inválida");

export const dateTimeSchema = z.string().refine((value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}, "Data inválida");

export const strictBoolean = z.union([z.boolean(), z.literal("true"), z.literal("false")]).transform((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
});

export function zodIssues(err) {
  return err?.issues?.map((issue) => ({
    field: issue.path?.join(".") || "",
    message: issue.message,
  })) || [];
}
