import { z } from "zod";
import api, { type ApiEnvelope } from "@/lib/axios";
import type { Role } from "@/constants/roles";
import { isVerificationStatus, type VerificationStatus } from "@/constants/violations";

/**
 * Auth service — thin wrappers over backend/src/routes/authRoutes.js.
 *
 * Convention shared by every service in this folder:
 *   - input is validated client-side with zod where the backend has rules,
 *   - the call returns the UNWRAPPED `data` field of the backend envelope
 *     ({ success, message, data, errors }),
 *   - failures reject with an AxiosError — use getApiErrorMessage() to read
 *     the backend's `message`.
 */

/* ------------------------------------------------------------------ types */

export interface AuthUser {
  id: number;
  role: Role;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  verificationStatus?: VerificationStatus;
  /**
   * Driver-only profile fields. authController.driverLogin already returns all
   * of these, so keeping them on the session is what lets the profile screen
   * show a driver's licence number and contact details without a second fetch.
   * Enforcers and admins log in through other endpoints that omit them, hence
   * optional.
   */
  licenseNumber?: string;
  address?: string | null;
  contactNumber?: string | null;
  /** Admin-set explanation shown to flagged / revoked / suspended drivers. */
  statusReason?: string | null;
}

export interface AuthSession {
  token: string;
  mustChangePassword: boolean;
  user: AuthUser;
}

/* ----------------------------------------------------------------- zod in */

export const driverLoginSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  password: z.string().min(1, "Password is required"),
});
export type DriverLoginInput = z.infer<typeof driverLoginSchema>;

/** Enforcer and admin logins share the same { username, password } shape. */
export const staffLoginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const forgotPasswordSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  licenseNumber: z.string().trim().min(1, "License number is required"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const changePasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Mirrors the express-validator rules on POST /auth/driver/register. */
export const driverRegisterSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  middleInitial: z.string().trim().max(5).optional(),
  lastName: z.string().trim().min(1, "Last name is required"),
  licenseNumber: z.string().trim().min(1, "License number is required"),
  address: z.string().trim().optional(),
  contactNumber: z.string().trim().optional(),
  // Optional physical-license details accepted by authController.driverRegister.
  nationality: z.string().trim().optional(),
  sex: z.string().trim().optional(),
  dateOfBirth: z.string().trim().optional(),
  weightKg: z.union([z.string(), z.number()]).optional(),
  heightM: z.union([z.string(), z.number()]).optional(),
  expirationDate: z.string().trim().optional(),
  agencyCode: z.string().trim().optional(),
  bloodType: z.string().trim().optional(),
  eyeColor: z.string().trim().optional(),
  dlCodes: z.string().trim().optional(),
  condition: z.string().trim().optional(),
});
export type DriverRegisterInput = z.infer<typeof driverRegisterSchema>;

/* -------------------------------------------------- backend response shape */

interface LoginPayload {
  token: string;
  mustChangePassword?: boolean;
  driver?: {
    driverId: number;
    firstName: string;
    lastName: string;
    verificationStatus?: string;
    licenseNumber?: string;
    address?: string | null;
    contactNumber?: string | null;
    statusReason?: string | null;
  };
  enforcer?: {
    enforcerId: number;
    firstName: string;
    lastName: string;
  };
  admin?: {
    adminId: number;
    firstName: string;
    lastName: string;
  };
}

const LOGIN_PATH: Record<Role, string> = {
  driver: "/auth/driver/login",
  enforcer: "/auth/enforcer/login",
  admin: "/auth/admin/login",
};

function toSession(role: Role, payload: LoginPayload | undefined): AuthSession {
  if (!payload?.token) {
    throw new Error("Malformed login response: missing token");
  }

  if (role === "driver") {
    const driver = payload.driver;
    if (!driver) throw new Error("Malformed login response: missing driver");
    const status = isVerificationStatus(driver.verificationStatus)
      ? driver.verificationStatus
      : undefined;
    const mustChangePassword = payload.mustChangePassword === true;
    return {
      token: payload.token,
      mustChangePassword,
      user: {
        id: driver.driverId,
        role: "driver",
        firstName: driver.firstName,
        lastName: driver.lastName,
        mustChangePassword,
        ...(status ? { verificationStatus: status } : {}),
        // Carried straight from the login payload so /home/profile can render
        // them without re-fetching the driver record.
        ...(driver.licenseNumber ? { licenseNumber: driver.licenseNumber } : {}),
        ...(driver.address ? { address: driver.address } : {}),
        ...(driver.contactNumber ? { contactNumber: driver.contactNumber } : {}),
        ...(driver.statusReason ? { statusReason: driver.statusReason } : {}),
      },
    };
  }

  if (role === "enforcer") {
    const enforcer = payload.enforcer;
    if (!enforcer) throw new Error("Malformed login response: missing enforcer");
    return {
      token: payload.token,
      mustChangePassword: false,
      user: {
        id: enforcer.enforcerId,
        role: "enforcer",
        firstName: enforcer.firstName,
        lastName: enforcer.lastName,
        mustChangePassword: false,
      },
    };
  }

  const admin = payload.admin;
  if (!admin) throw new Error("Malformed login response: missing admin");
  return {
    token: payload.token,
    mustChangePassword: false,
    user: {
      id: admin.adminId,
      role: "admin",
      firstName: admin.firstName,
      lastName: admin.lastName,
      mustChangePassword: false,
    },
  };
}

/* -------------------------------------------------------------- endpoints */

export const authService = {
  /** POST /auth/{driver|enforcer|admin}/login — credential shape depends on role. */
  login: async (role: Role, credentials: DriverLoginInput | StaffLoginInput): Promise<AuthSession> => {
    const body =
      role === "driver"
        ? driverLoginSchema.parse(credentials)
        : staffLoginSchema.parse(credentials);
    const res = await api.post<ApiEnvelope<LoginPayload>>(LOGIN_PATH[role], body);
    return toSession(role, res.data?.data);
  },

  /**
   * POST /auth/driver/register — multipart when a license photo is attached
   * (field name `licensePhoto`, see middleware/uploadLicense.js).
   */
  registerDriver: async (
    input: DriverRegisterInput,
    licensePhoto?: File | Blob | null
  ): Promise<{ driverId: number; username: string }> => {
    const payload = driverRegisterSchema.parse(input);
    if (!licensePhoto) {
      const res = await api.post<ApiEnvelope<{ driverId: number; username: string }>>(
        "/auth/driver/register",
        payload
      );
      if (!res.data?.data) throw new Error("Malformed register response");
      return res.data.data;
    }

    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        form.append(key, String(value));
      }
    });
    form.append("licensePhoto", licensePhoto);

    const res = await api.post<ApiEnvelope<{ driverId: number; username: string }>>(
      "/auth/driver/register",
      form
    );
    if (!res.data?.data) throw new Error("Malformed register response");
    return res.data.data;
  },

  /**
   * POST /auth/driver/forgot-password — always answers 200 with a generic
   * message (no account enumeration), so the caller should show the message
   * as-is instead of assuming the details matched.
   */
  forgotPassword: async (input: ForgotPasswordInput): Promise<{ message: string }> => {
    const body = forgotPasswordSchema.parse(input);
    const res = await api.post<ApiEnvelope<null>>("/auth/driver/forgot-password", body);
    return { message: res.data?.message ?? "Request submitted." };
  },

  /**
   * POST /auth/driver/change-password (driver only, Bearer required).
   * Returns a fresh token whose JWT carries mustChangePassword=false — the
   * old token keeps getting 403s from the auth middleware.
   */
  changePassword: async (input: ChangePasswordInput | string): Promise<{ token: string }> => {
    const body =
      typeof input === "string" ? changePasswordSchema.parse({ newPassword: input }) : changePasswordSchema.parse(input);
    const res = await api.post<ApiEnvelope<{ token: string }>>(
      "/auth/driver/change-password",
      body
    );
    if (!res.data?.data?.token) throw new Error("Malformed change-password response");
    return res.data.data;
  },
};

export type RegisterDriverInput = DriverRegisterInput;
