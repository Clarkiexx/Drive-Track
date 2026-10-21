import { z } from "zod";
import api, { type ApiEnvelope } from "@/lib/axios";
import { isRole, type Role } from "@/constants/roles";
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
  middleInitial?: string | null;
  licenseNumber?: string;
  address?: string | null;
  contactNumber?: string | null;
  /** Backend-relative path of the driver's uploaded avatar, if any. */
  profilePhotoPath?: string | null;
  /** Admin-set explanation shown to flagged / revoked / suspended drivers. */
  statusReason?: string | null;
  /**
   * Enforcer-only identity fields. authController.enforcerLogin already
   * returns both, so keeping them on the session lets the profile screen
   * show badge and station without a second fetch (drivers cannot read
   * /enforcers/:id and enforcers cannot either — both are admin-only — so
   * there is no endpoint to re-fetch from).
   */
  badgeNumber?: string | null;
  station?: string | null;
}

export interface AuthSession {
  token: string;
  mustChangePassword: boolean;
  user: AuthUser;
}

/* ----------------------------------------------------------------- zod in */

/**
 * The unified sign-in the PWA posts to /auth/login: one identifier + password,
 * no role picker. Drivers type their full name, staff their username — the
 * backend detects which account matches and answers with `role`.
 */
export const unifiedLoginSchema = z.object({
  identifier: z.string().trim().min(1, "Full name or username is required"),
  password: z.string().min(1, "Password is required"),
});
export type UnifiedLoginInput = z.infer<typeof unifiedLoginSchema>;

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
  /** Present on the unified /auth/login response — the detected account role. */
  role?: Role;
  mustChangePassword?: boolean;
  driver?: {
    driverId: number;
    firstName: string;
    middleInitial?: string | null;
    lastName: string;
    verificationStatus?: string;
    licenseNumber?: string;
    address?: string | null;
    contactNumber?: string | null;
    statusReason?: string | null;
    profilePhotoPath?: string | null;
  };
  enforcer?: {
    enforcerId: number;
    firstName: string;
    lastName: string;
    badgeNumber?: string | null;
    station?: string | null;
  };
  admin?: {
    adminId: number;
    firstName: string;
    lastName: string;
  };
}

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
        ...(driver.middleInitial ? { middleInitial: driver.middleInitial } : {}),
        lastName: driver.lastName,
        mustChangePassword,
        ...(status ? { verificationStatus: status } : {}),
        // Carried straight from the login payload so /home/profile can render
        // them without re-fetching the driver record.
        ...(driver.licenseNumber ? { licenseNumber: driver.licenseNumber } : {}),
        ...(driver.address ? { address: driver.address } : {}),
        ...(driver.contactNumber ? { contactNumber: driver.contactNumber } : {}),
        ...(driver.statusReason ? { statusReason: driver.statusReason } : {}),
        ...(driver.profilePhotoPath ? { profilePhotoPath: driver.profilePhotoPath } : {}),
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
        // Carried straight from the login payload so /enforcer/profile can
        // render badge and station without re-fetching (mirrors the driver
        // branch above).
        ...(enforcer.badgeNumber ? { badgeNumber: enforcer.badgeNumber } : {}),
        ...(enforcer.station ? { station: enforcer.station } : {}),
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
  /**
   * POST /auth/login — the unified sign-in. The backend detects which role
   * the identifier + password belong to and answers with an explicit `role`;
   * the payload is then mapped with the same per-role toSession() the
   * per-role logins always used. The per-role endpoints remain for the
   * native apps (driver-app / enforcer-app) and the Vite admin dashboard.
   */
  login: async (credentials: UnifiedLoginInput): Promise<AuthSession> => {
    const body = unifiedLoginSchema.parse(credentials);
    const res = await api.post<ApiEnvelope<LoginPayload>>("/auth/login", body);
    const payload = res.data?.data;
    if (!isRole(payload?.role)) {
      throw new Error("Malformed login response: missing role");
    }
    return toSession(payload.role, payload);
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
   * POST /auth/driver/forgot-password — resets the password only when the
   * full name and license number match an account. A mismatch rejects with
   * the backend's 404 message, so callers should surface the error.
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
