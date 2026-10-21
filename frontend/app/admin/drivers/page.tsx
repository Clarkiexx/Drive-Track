"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCw, Search, Users } from "lucide-react";

import DriverAvatar from "@/components/common/DriverAvatar";
import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import StatusChip from "@/components/common/StatusChip";
import { formatPeso, formatShortDate, formatShortDateManila } from "@/components/common/dates";
import {
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUSES,
  type VerificationStatus,
} from "@/constants/violations";
import { getApiErrorMessage, getStoredToken } from "@/lib/axios";
import { fetchProtectedImageUrl } from "@/lib/media";
import {
  driverService,
  type DriverPayload,
  type DriverRecord,
} from "@/services/driver.service";
import type { CitationRecord } from "@/services/citation.service";

/** Rows per drivers page — matches the backend default page size. */
const PAGE_LIMIT = 8;

type StatusFilter = VerificationStatus | "all";

const STATUS_TONE: Record<VerificationStatus, string> = {
  pending: "bg-warn-soft text-signal-hold",
  verified: "bg-go-soft text-go-ink",
  flagged: "bg-danger-soft text-signal-stop",
  revoked: "bg-chip-neutral text-muted",
  suspended: "bg-danger-soft text-signal-stop",
};

function toNumber(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(
    async (page: number, searchValue: string, statusValue: StatusFilter) => {
      setIsLoading(true);
      setLoadError("");
      try {
        const result = await driverService.listDriversPage({
          page,
          limit: PAGE_LIMIT,
          ...(searchValue.trim() ? { search: searchValue.trim() } : {}),
          ...(statusValue !== "all" ? { status: statusValue } : {}),
        });
        setDrivers(result.drivers);
        setPagination(result.pagination);
      } catch (err) {
        setDrivers([]);
        setLoadError(getApiErrorMessage(err, "Unable to load drivers."));
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(1, search, status), 0);
    return () => window.clearTimeout(timer);
  }, [load, search, status]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold tracking-[0.18em] text-brand-600 uppercase">
            Drivers
          </p>
          <h2 className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">
            Driver register
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-console-muted">
            Review verification status, edit records, and add drivers. Status
            changes take effect at the driver&apos;s next login — flagged,
            suspended and revoked accounts cannot sign in.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-console-rail-deep"
          >
            <Users size={14} strokeWidth={2.3} aria-hidden />
            Add Driver
          </button>
          <button
            type="button"
            onClick={() => void load(pagination.page, search, status)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-console transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-60"
          >
            <RotateCw
              size={14}
              strokeWidth={2.3}
              className={isLoading ? "animate-spin" : undefined}
              aria-hidden
            />
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="rise flex gap-2"
        role="search"
        aria-label="Search drivers"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-console-muted"
          />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name or license number…"
            aria-label="Search by name or license number"
            className="dt-input pr-3 pl-10"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-[10px] bg-console-rail px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-console-rail-deep disabled:opacity-60"
          disabled={isLoading}
        >
          Search
        </button>
      </form>

      <div
        className="rise mt-3 flex flex-wrap gap-2"
        style={{ animationDelay: "60ms" }}
        role="tablist"
        aria-label="Filter drivers by verification status"
      >
        {(["all", ...VERIFICATION_STATUSES] as const).map((entry) => {
          const isActive = status === entry;
          return (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setStatus(entry)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                isActive
                  ? "border-console-rail bg-console-rail text-white"
                  : "border-console-line bg-surface text-ink hover:border-brand-300 hover:bg-brand-soft"
              }`}
            >
              {entry === "all" ? "All" : VERIFICATION_STATUS_LABELS[entry]}
            </button>
          );
        })}
      </div>

      <section
        className="rise mt-4 overflow-hidden rounded-2xl border border-console-line bg-surface shadow-console"
        style={{ animationDelay: "120ms" }}
        aria-live="polite"
      >
        <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
          <Users size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display text-[15px] leading-none font-semibold tracking-tight text-ink">
            Drivers
          </h3>
          <p className="ml-auto shrink-0 text-[11.5px] leading-none text-console-muted">
            {pagination.total} on record
          </p>
        </header>

        {isLoading ? (
          <ul aria-hidden className="divide-y divide-console-line/70">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="flex items-center gap-3 px-5 py-4">
                <div className="breathe h-3 w-28 rounded-full bg-console-canvas" />
                <div className="breathe h-3 w-40 rounded-full bg-console-canvas [animation-delay:120ms]" />
                <div className="breathe ml-auto h-5 w-20 rounded-full bg-console-canvas [animation-delay:200ms]" />
              </li>
            ))}
          </ul>
        ) : loadError ? (
          <div className="p-5">
            <NoticeBox tone="danger" className="text-[13px]">
              {loadError}
            </NoticeBox>
          </div>
        ) : drivers.length === 0 ? (
          <EmptyState title="No drivers found">
            Nothing matches this filter. Drivers appear here once they register or
            an enforcer creates their record on the spot.
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left">
                <caption className="sr-only">Drivers matching the current filter</caption>
                <thead>
                  <tr className="border-b border-console-line bg-console-canvas/70 text-[10.5px] tracking-[0.14em] text-console-muted uppercase">
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Driver
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Contact
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Violations
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-2.5 font-bold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((driver) => (
                    <tr
                      key={driver.driverId}
                      className="border-b border-console-line/70 transition-colors last:border-0 hover:bg-brand-50/70"
                    >
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex items-center gap-2.5">
                          <DriverAvatar
                            firstName={driver.firstName}
                            lastName={driver.lastName}
                            photoPath={driver.profilePhotoPath}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-ink">
                              {driver.lastName}, {driver.firstName}
                              {driver.middleInitial ? ` ${driver.middleInitial}` : ""}
                            </p>
                            <p className="tabular mt-1 text-[11.5px] leading-none text-console-muted">
                              {driver.licenseNumber}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        {driver.contactNumber || "—"}
                        {driver.address ? (
                          <span className="mt-0.5 block max-w-52 truncate text-[12px] text-console-muted">
                            {driver.address}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 align-top text-[13px] text-ink/80">
                        <span className="tabular font-bold text-ink">
                          {driver.totalViolations ?? "—"}
                        </span>{" "}
                        total
                        {(driver.unsettledViolations ?? 0) > 0 ? (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-warn-soft px-2 py-[2px] text-[11px] font-bold text-signal-hold">
                            {driver.unsettledViolations} unsettled
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold ${driver.verificationStatus ? STATUS_TONE[driver.verificationStatus] : STATUS_TONE.pending}`}
                        >
                          {driver.verificationStatus
                            ? VERIFICATION_STATUS_LABELS[driver.verificationStatus]
                            : "Pending"}
                        </span>
                        {driver.statusReason ? (
                          <span className="mt-1 block max-w-48 truncate text-[11.5px] text-console-muted">
                            {driver.statusReason}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedDriverId(driver.driverId)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-console-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-console-line px-5 py-3.5">
              <p className="text-[12px] text-console-muted">
                Showing page {pagination.page} of {Math.max(pagination.totalPages, 1)} (
                {pagination.total} results)
              </p>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || isLoading}
                  onClick={() => void load(pagination.page - 1, search, status)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || isLoading}
                  onClick={() => void load(pagination.page + 1, search, status)}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-soft disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {selectedDriverId !== null ? (
        <DriverDetailDialog
          driverId={selectedDriverId}
          onClose={() => setSelectedDriverId(null)}
          onChanged={() => void load(pagination.page, search, status)}
        />
      ) : null}

      {showAdd ? (
        <DriverFormDialog
          title="Add driver"
          submitLabel="Create Driver"
          onClose={() => setShowAdd(false)}
          onSubmit={async (payload) => {
            await driverService.createDriver(payload);
            setShowAdd(false);
            setSearch("");
            setSearchInput("");
            setStatus("all");
            await load(1, "", "all");
          }}
        />
      ) : null}
    </div>
  );
}

function DriverDetailDialog({
  driverId,
  onClose,
  onChanged,
}: {
  driverId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [citations, setCitations] = useState<CitationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [showPhotoZoom, setShowPhotoZoom] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [statusValue, setStatusValue] = useState<VerificationStatus>("verified");
  const [statusReason, setStatusReason] = useState("");
  const [statusError, setStatusError] = useState("");

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    const [driverResult, citationsResult] = await Promise.allSettled([
      driverService.getDriver(driverId),
      driverService.getDriverCitations(driverId),
    ]);
    if (driverResult.status === "fulfilled") {
      setDriver(driverResult.value);
    } else {
      setDriver(null);
      setErrorMessage(getApiErrorMessage(driverResult.reason, "Unable to load this driver."));
    }
    setCitations(citationsResult.status === "fulfilled" ? citationsResult.value : []);
    setIsLoading(false);
  }, [driverId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  // License photos live behind authenticate+allowRoles('admin'), so a plain
  // <img src> can never load them — fetch with the admin JWT into an object
  // URL instead (mirrors admin-dashboard fetchProtectedImageUrl).
  useEffect(() => {
    if (!driver?.licensePhotoPath) {
      const timer = window.setTimeout(() => {
        setPhotoUrl("");
        setPhotoError("");
        setShowPhotoZoom(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let revoked = false;
    let objectUrl = "";
    const timer = window.setTimeout(() => setPhotoError(""), 0);
    fetchProtectedImageUrl(driver.licensePhotoPath, getStoredToken("admin"))
      .then((url) => {
        if (revoked) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPhotoUrl(url);
      })
      .catch((err: unknown) => {
        if (!revoked) setPhotoError(err instanceof Error ? err.message : "Unable to load photo.");
      });
    return () => {
      window.clearTimeout(timer);
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [driver?.licensePhotoPath]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Zoom closes first so Escape never dismisses the whole dialog
      // from under an enlarged photo.
      if (showPhotoZoom) {
        setShowPhotoZoom(false);
        return;
      }
      if (!showEdit && !showStatus) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, showEdit, showStatus, showPhotoZoom]);

  async function handleStatusSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatusError("");
    // A reason documents every restrictive action for the driver and the audit trail.
    if (["flagged", "suspended", "revoked"].includes(statusValue) && !statusReason.trim()) {
      setStatusError("A reason is required when flagging, suspending, or revoking an account.");
      return;
    }
    if (isActing) return;
    setIsActing(true);
    try {
      await driverService.updateDriverStatus(driverId, {
        status: statusValue,
        ...(statusReason.trim() ? { reason: statusReason.trim() } : {}),
      });
      setShowStatus(false);
      setStatusReason("");
      setActionNotice(`Driver status set to ${VERIFICATION_STATUS_LABELS[statusValue]}.`);
      setActionError("");
      await reload();
      onChanged();
    } catch (err) {
      setStatusError(getApiErrorMessage(err, "Unable to update status."));
    } finally {
      setIsActing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={driver ? `Driver ${driver.firstName} ${driver.lastName}` : "Driver details"}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-console-line bg-surface shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-2.5 border-b border-console-line px-5 py-3.5">
          <Users size={16} strokeWidth={2.1} className="shrink-0 text-brand-600" aria-hidden />
          <h3 className="font-display min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
            {driver ? `${driver.lastName}, ${driver.firstName}` : "Driver details"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close driver details"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-console-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="px-5 py-4">
          {isLoading ? (
            <div className="space-y-2 py-4" aria-hidden>
              <div className="breathe h-3 w-40 rounded-full bg-console-canvas" />
              <div className="breathe h-3 w-64 rounded-full bg-console-canvas [animation-delay:120ms]" />
              <div className="breathe h-24 rounded-xl bg-console-canvas [animation-delay:200ms]" />
            </div>
          ) : errorMessage || !driver ? (
            <NoticeBox tone="danger" className="text-[13px]">
              {errorMessage || "Driver not found."}
            </NoticeBox>
          ) : (
            <>
              {actionError ? (
                <NoticeBox tone="danger" className="mb-3 text-[13px]">
                  {actionError}
                </NoticeBox>
              ) : null}
              {actionNotice ? (
                <NoticeBox tone="success" className="mb-3 text-[13px]">
                  {actionNotice}
                </NoticeBox>
              ) : null}

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <h4 className="text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Profile
                  </h4>
                  <dl className="mt-1.5 space-y-1 text-[13px] text-ink/80">
                    <div className="flex justify-between gap-3">
                      <dt className="text-console-muted">License</dt>
                      <dd className="tabular text-right font-semibold text-ink">
                        {driver.licenseNumber}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-console-muted">Address</dt>
                      <dd className="text-right">{driver.address || "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-console-muted">Contact</dt>
                      <dd className="text-right">{driver.contactNumber || "—"}</dd>
                    </div>
                    {driver.dateOfBirth ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Born</dt>
                        <dd className="text-right">{formatShortDate(driver.dateOfBirth)}</dd>
                      </div>
                    ) : null}
                    {driver.sex ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Sex</dt>
                        <dd className="text-right">{driver.sex}</dd>
                      </div>
                    ) : null}
                    {driver.nationality ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Nationality</dt>
                        <dd className="text-right">{driver.nationality}</dd>
                      </div>
                    ) : null}
                    {driver.bloodType ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Blood type</dt>
                        <dd className="text-right">{driver.bloodType}</dd>
                      </div>
                    ) : null}
                    {driver.eyeColor ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Eye color</dt>
                        <dd className="text-right">{driver.eyeColor}</dd>
                      </div>
                    ) : null}
                    {driver.heightM !== null && driver.heightM !== undefined ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Height</dt>
                        <dd className="tabular text-right">{String(driver.heightM)} m</dd>
                      </div>
                    ) : null}
                    {driver.weightKg !== null && driver.weightKg !== undefined ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Weight</dt>
                        <dd className="tabular text-right">{String(driver.weightKg)} kg</dd>
                      </div>
                    ) : null}
                    {driver.issueDate ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">License issued</dt>
                        <dd className="text-right">{formatShortDate(driver.issueDate)}</dd>
                      </div>
                    ) : null}
                    {driver.expirationDate ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">License expires</dt>
                        <dd className="text-right">{formatShortDate(driver.expirationDate)}</dd>
                      </div>
                    ) : null}
                    {driver.dlCodes ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Restrictions (DL codes)</dt>
                        <dd className="text-right">{driver.dlCodes}</dd>
                      </div>
                    ) : null}
                    {driver.condition ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Conditions</dt>
                        <dd className="text-right">{driver.condition}</dd>
                      </div>
                    ) : null}
                    {driver.agencyCode ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-console-muted">Agency code</dt>
                        <dd className="text-right">{driver.agencyCode}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <h4 className="mt-4 text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Verification
                  </h4>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-[3px] text-[11px] leading-tight font-bold ${driver.verificationStatus ? STATUS_TONE[driver.verificationStatus] : STATUS_TONE.pending}`}
                    >
                      {driver.verificationStatus
                        ? VERIFICATION_STATUS_LABELS[driver.verificationStatus]
                        : "Pending"}
                    </span>
                  </div>
                  {driver.statusReason ? (
                    <p className="mt-1 text-[12.5px] text-console-muted">{driver.statusReason}</p>
                  ) : null}
                  <p className="mt-1 text-[12px] text-console-muted">
                    Flagged, suspended and revoked accounts are blocked at login.
                  </p>
                </div>

                <div>
                  <h4 className="text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Profile photo
                  </h4>
                  <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-console-line bg-console-canvas/60 p-3">
                    <DriverAvatar
                      firstName={driver.firstName}
                      lastName={driver.lastName}
                      photoPath={driver.profilePhotoPath}
                      size="lg"
                    />
                    <p className="min-w-0 text-[12.5px] leading-relaxed text-console-muted">
                      {driver.profilePhotoPath
                        ? "Chosen by the driver in My Profile. Updates when the driver changes their picture."
                        : "No profile photo set. The driver can add one from My Profile."}
                    </p>
                  </div>

                  <h4 className="mt-4 text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    License photo
                  </h4>
                  <div className="mt-1.5 overflow-hidden rounded-xl border border-console-line bg-console-canvas/60">
                    {driver.licensePhotoPath ? (
                      photoError ? (
                        <p className="px-3 py-6 text-center text-[12.5px] text-signal-stop">
                          {photoError}
                        </p>
                      ) : photoUrl ? (
                        <button
                          type="button"
                          onClick={() => setShowPhotoZoom(true)}
                          title="Click to enlarge"
                          aria-label="Enlarge license photo"
                          className="block w-full cursor-zoom-in"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoUrl} alt="Driver license photo" className="max-h-56 w-full object-contain" />
                        </button>
                      ) : (
                        <p className="breathe px-3 py-6 text-center text-[12.5px] text-console-muted">
                          Loading photo…
                        </p>
                      )
                    ) : (
                      <p className="px-3 py-6 text-center text-[12.5px] text-console-muted">
                        No license photo on file.
                      </p>
                    )}
                  </div>

                  {/* Enlarged view reuses the already-fetched object URL — no
                      second request, same revoke lifecycle as the thumbnail. */}
                  {showPhotoZoom && photoUrl ? (
                    <div
                      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-[2px]"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Enlarged license photo"
                      onClick={() => setShowPhotoZoom(false)}
                    >
                      <div
                        className="relative max-w-3xl"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl}
                          alt="Driver license photo enlarged"
                          className="max-h-[85dvh] w-auto max-w-full rounded-xl object-contain shadow-float"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPhotoZoom(false)}
                          aria-label="Close enlarged photo"
                          className="absolute -top-3 -right-3 grid size-9 place-items-center rounded-full bg-surface text-ink shadow-float transition-colors hover:bg-surface-sunken"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <h4 className="mt-4 text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
                    Citation history
                    <span className="tabular ml-2 rounded-full bg-surface-sunken px-2 py-[2px] text-[11px] font-bold text-ink normal-case">
                      {citations.length}
                    </span>
                  </h4>
                  {citations.length === 0 ? (
                    <p className="mt-1.5 text-[13px] text-console-muted">
                      No citations on record for this driver.
                    </p>
                  ) : (
                    <ul className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto">
                      {citations.map((citation) => (
                        <li
                          key={citation.citationId}
                          className="flex items-center gap-2 rounded-lg border border-console-line/70 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="tabular-nums truncate text-[12.5px] font-bold text-ink">
                              {citation.citationNumber}
                            </p>
                            <p className="text-[11.5px] text-console-muted">
                              {formatShortDateManila(citation.occurredAt)} •{" "}
                              {formatPeso(toNumber(citation.fineAmount))}
                            </p>
                          </div>
                          <StatusChip status={citation.settlementStatus} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {showStatus ? (
                <form
                  onSubmit={handleStatusSubmit}
                  className="mt-4 rounded-xl border border-console-line bg-console-canvas/60 p-4"
                >
                  <h4 className="text-[13px] font-bold text-ink">Change verification status</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="driver-status"
                        className="mb-1.5 block text-[13px] font-semibold text-ink"
                      >
                        Status
                      </label>
                      <select
                        id="driver-status"
                        value={statusValue}
                        onChange={(event) => setStatusValue(event.target.value as VerificationStatus)}
                        className="dt-input"
                      >
                        {VERIFICATION_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {VERIFICATION_STATUS_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <FormField
                      label="Reason"
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                      placeholder="e.g. License needs re-check"
                      hint="Required for flagged, suspended, revoked."
                    />
                  </div>
                  {statusError ? (
                    <NoticeBox tone="danger" className="mt-3 text-[13px]">
                      {statusError}
                    </NoticeBox>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowStatus(false)}
                      className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isActing}
                      className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
                    >
                      {isActing ? "Saving…" : "Save Status"}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-console-line pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setStatusValue(driver.verificationStatus ?? "verified");
                    setStatusReason("");
                    setShowStatus((open) => !open);
                    setShowEdit(false);
                  }}
                  className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
                >
                  Change Status
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEdit((open) => !open);
                    setShowStatus(false);
                  }}
                  className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep"
                >
                  Edit Details
                </button>
              </div>

              {showEdit ? (
                <div className="mt-4">
                  <DriverFormDialog
                    inline
                    title="Edit driver"
                    submitLabel="Save Changes"
                    initial={driver}
                    onClose={() => setShowEdit(false)}
                    onSubmit={async (payload) => {
                      try {
                        const updated = await driverService.updateDriver(driverId, payload);
                        setDriver(updated);
                        setActionNotice("Driver updated.");
                        setActionError("");
                        await reload();
                        onChanged();
                        setShowEdit(false);
                      } catch (err) {
                        const message = getApiErrorMessage(err, "Unable to update driver.");
                        setActionError(message);
                        // Rethrow so the inline form shows the message too —
                        // otherwise it would unstick with no visible error.
                        throw err instanceof Error ? err : new Error(message);
                      }
                    }}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DriverFormDialog({
  title,
  submitLabel,
  initial,
  inline,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: DriverRecord | null;
  inline?: boolean;
  onClose: () => void;
  onSubmit: (payload: DriverPayload) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [middleInitial, setMiddleInitial] = useState(initial?.middleInitial ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [licenseNumber, setLicenseNumber] = useState(initial?.licenseNumber ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [contactNumber, setContactNumber] = useState(initial?.contactNumber ?? "");
  const [sex, setSex] = useState(initial?.sex ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initial?.dateOfBirth ?? "");
  const [nationality, setNationality] = useState(initial?.nationality ?? "");
  const [bloodType, setBloodType] = useState(initial?.bloodType ?? "");
  const [eyeColor, setEyeColor] = useState(initial?.eyeColor ?? "");
  const [weightKg, setWeightKg] = useState(
    initial?.weightKg === null || initial?.weightKg === undefined ? "" : String(initial.weightKg)
  );
  const [heightM, setHeightM] = useState(
    initial?.heightM === null || initial?.heightM === undefined ? "" : String(initial.heightM)
  );
  const [expirationDate, setExpirationDate] = useState(initial?.expirationDate ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? "");
  const [agencyCode, setAgencyCode] = useState(initial?.agencyCode ?? "");
  const [dlCodes, setDlCodes] = useState(initial?.dlCodes ?? "");
  const [condition, setCondition] = useState(initial?.condition ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim() || !licenseNumber.trim()) {
      setError("First name, last name, and license number are required.");
      return;
    }
    // Height/weight travel as Prisma Decimals: reject non-numeric input here
    // with a field-specific message instead of a bare server 422.
    const parsedWeightKg = weightKg.trim() ? Number(weightKg.trim()) : null;
    if (parsedWeightKg !== null && !Number.isFinite(parsedWeightKg)) {
      setError("Weight must be a number in kilograms.");
      return;
    }
    const parsedHeightM = heightM.trim() ? Number(heightM.trim()) : null;
    if (parsedHeightM !== null && !Number.isFinite(parsedHeightM)) {
      setError("Height must be a number in meters.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        firstName: firstName.trim(),
        ...(middleInitial.trim() ? { middleInitial: middleInitial.trim() } : {}),
        lastName: lastName.trim(),
        licenseNumber: licenseNumber.trim(),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(contactNumber.trim() ? { contactNumber: contactNumber.trim() } : {}),
        ...(sex ? { sex } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(nationality.trim() ? { nationality: nationality.trim() } : {}),
        ...(bloodType ? { bloodType } : {}),
        ...(eyeColor.trim() ? { eyeColor: eyeColor.trim() } : {}),
        ...(parsedWeightKg !== null ? { weightKg: parsedWeightKg } : {}),
        ...(parsedHeightM !== null ? { heightM: parsedHeightM } : {}),
        ...(expirationDate ? { expirationDate } : {}),
        ...(issueDate ? { issueDate } : {}),
        ...(agencyCode.trim() ? { agencyCode: agencyCode.trim() } : {}),
        ...(dlCodes.trim() ? { dlCodes: dlCodes.trim() } : {}),
        ...(condition.trim() ? { condition: condition.trim() } : {}),
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "Unable to save driver."));
    } finally {
      // Always release the button: the edit parent swallows failures into
      // its own notice instead of rethrowing, so without this the form
      // would sit on "Saving…" forever after a failed save.
      setIsSubmitting(false);
    }
  }

  const form = (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Juan" />
        <FormField label="M.I." value={middleInitial} onChange={(e) => setMiddleInitial(e.target.value)} placeholder="A" />
        <FormField label="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Dela Cruz" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="License number" required value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="e.g. N01-23-456789" />
        <FormField label="Contact number" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="+63 912 345 6789" />
      </div>
      <FormField label="Address" as="textarea" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Purok, Barangay, Cordova, Cebu" />
      <div className="rounded-xl border border-console-line bg-console-canvas/60 p-3.5">
        <p className="text-[12px] font-bold tracking-[0.12em] text-console-muted uppercase">
          License details
        </p>
        <p className="mt-1 text-[11.5px] text-console-muted">
          Copy exactly as shown on the physical Philippine driver&apos;s license. Leave any
          field blank when it does not apply — blank fields stay empty.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink">Sex</label>
            <select
              className="dt-input"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
            >
              <option value="">—</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <FormField label="Date of birth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          <FormField label="Nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. PHL" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink">Blood type</label>
            <select
              className="dt-input"
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value)}
            >
              <option value="">—</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <FormField label="Eye color" value={eyeColor} onChange={(e) => setEyeColor(e.target.value)} placeholder="e.g. Brown" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Height (m)" inputMode="decimal" value={heightM} onChange={(e) => setHeightM(e.target.value)} placeholder="1.65" />
            <FormField label="Weight (kg)" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder="60" />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FormField label="Issue date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          <FormField label="Expiry date" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
          <FormField label="Agency code" value={agencyCode} onChange={(e) => setAgencyCode(e.target.value)} placeholder="e.g. G33" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField label="Restrictions (DL codes)" value={dlCodes} onChange={(e) => setDlCodes(e.target.value)} placeholder="e.g. 1, 2" hint="Restriction codes printed on the license." />
          <FormField label="Conditions" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. None" />
        </div>
      </div>
      {error ? (
        <NoticeBox tone="danger" className="text-[13px]">
          {error}
        </NoticeBox>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-console-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink hover:bg-brand-soft"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-console-rail px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-console-rail-deep disabled:opacity-60"
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );

  if (inline) {
    return (
      <div className="rounded-xl border border-console-line bg-console-canvas/60 p-4">
        <h4 className="text-[13px] font-bold text-ink">{title}</h4>
        {form}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-console-line bg-surface p-5 shadow-float"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="font-display text-[15px] font-semibold tracking-tight text-ink">{title}</h4>
        <p className="mt-1 text-[12.5px] text-console-muted">
          Admin-created records start verified with the license number as the initial
          password (change required on first login).
        </p>
        {form}
      </div>
    </div>
  );
}
