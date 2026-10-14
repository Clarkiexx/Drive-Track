"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, LoaderCircle, Search, X } from "lucide-react";
import { toast } from "sonner";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import DriverResultCard from "@/components/common/DriverResultCard";
import EmptyState from "@/components/common/EmptyState";
import FormField from "@/components/common/FormField";
import NoticeBox from "@/components/common/NoticeBox";
import PageBody from "@/components/common/PageBody";
import { getApiErrorMessage } from "@/lib/axios";
import {
  ACCEPTED_IMAGE_TYPES,
  IMAGE_REJECTION_MESSAGE,
  rejectImage,
} from "@/lib/uploadLimits";
import { driverService, type DriverRecord } from "@/services/driver.service";

/**
 * Driver search — the web port of
 * enforcer-app/src/screens/DriverSearchScreen.js, including its inline
 * QuickCreateForm (the same file, ~117 further lines).
 *
 * TWO MODES, from `?mode=`:
 *   - "lookup" (default) — the standalone driver search: picking a driver
 *     opens their record, never the citation wizard.
 *   - "issueCitation" — picking a driver continues into the wizard at
 *     /enforcer/issue?driverId=. Only explicit links from the citation flow
 *     (the issue page's back navigation) use this; every plain link (home
 *     grid, tab bar, More hub) lands in lookup.
 *
 * LICENSE NUMBER ONLY, AND THAT IS A BACKEND RULE, NOT A UI CHOICE:
 * driverController.searchDrivers answers 422 "Search by license number only…"
 * for any enforcer that searches without one (backend/src/controllers/
 * driverController.js ~line 338). RN guarded it client-side by simply never
 * offering a name field; that guard is reproduced here, and the backend's own
 * message still surfaces if it ever fires, so a failure reads as the policy it
 * is rather than as "search failed".
 *
 * The wizard at /enforcer/issue is owned by another lane. This page links into
 * it with `?driverId=`; it does not depend on that page existing for its own
 * render.
 */
export default function DriverSearchPage() {
  return (
    <>
      {/* AppBar and BottomNav sit OUTSIDE the boundary. useSearchParams only
          makes the tree below it client-rendered, so the chrome still ships in
          the prerendered HTML and the page never flashes bare on first paint. */}
      <AppBar title="Driver Search" backHref="/enforcer" />

      <Suspense fallback={<SearchFallback />}>
        <DriverSearchScreen />
      </Suspense>

      <BottomNav />
    </>
  );
}

/** Shown for the single tick before useSearchParams resolves. */
function SearchFallback() {
  return (
    <PageBody>
      <div aria-hidden className="mt-6 space-y-3">
        <div className="breathe mx-auto h-3.5 w-40 rounded-full bg-surface-sunken" />
        <div className="breathe mx-auto h-3 w-56 rounded-full bg-surface-sunken [animation-delay:90ms]" />
        <div className="breathe mt-6 h-32 w-full rounded-[14px] bg-surface-sunken" />
      </div>
    </PageBody>
  );
}

function DriverSearchScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Standalone search is profile-only: only an explicit
  // `?mode=issueCitation` (linked from the citation flow) continues into
  // the wizard.
  const isLookup = searchParams.get("mode") !== "issueCitation";

  const [licenseNumber, setLicenseNumber] = useState("");
  const [results, setResults] = useState<DriverRecord[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showQuickCreate, setShowQuickCreate] = useState(false);

  async function handleSearch() {
    setErrorMessage("");

    if (!licenseNumber.trim()) {
      setErrorMessage(
        "Enter the License No. from the physical license to search. Name search is disabled for privacy."
      );
      return;
    }

    setIsSearching(true);
    setSearched(false);

    try {
      setResults(await driverService.searchDrivers({ licenseNumber: licenseNumber.trim() }));
      setSearched(true);
    } catch (error) {
      // getApiErrorMessage carries the backend's envelope `message`, which for
      // this route is the privacy refusal itself — quoted verbatim, not
      // replaced by a generic string.
      setErrorMessage(getApiErrorMessage(error, "Search failed. Please try again."));
    } finally {
      setIsSearching(false);
    }
  }

  /**
   * RN's handleSelectDriver. The driver object itself is no longer passed
   * through a navigation object, so the wizard receives an id and fetches what
   * it needs — a route can carry a query string, it cannot carry a live record.
   */
  function handleSelectDriver(driver: DriverRecord) {
    if (isLookup) {
      router.push(`/enforcer/record/${driver.driverId}`);
    } else {
      router.push(`/enforcer/issue?driverId=${driver.driverId}`);
    }
  }

  return (
    <PageBody>
      {/* The RN screen's centred title + subtitle above the search card. */}
      <div className="mt-6 text-center">
        <h2 className="font-display text-[20px] font-semibold tracking-tight text-ink">
          Search Driver
        </h2>
        <p className="mt-1 text-[13px] text-muted">License No. only — protects driver privacy</p>
      </div>

      <section className="rise mt-5 rounded-[14px] border border-hairline bg-surface p-5">
        <FormField
          label="Driver's License Number"
          required
          placeholder="e.g. G-75-45-571924"
          value={licenseNumber}
          onChange={(event) => setLicenseNumber(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleSearch();
          }}
          autoCapitalize="characters"
          autoComplete="off"
        />

        <p className="mt-2 text-[11px] leading-snug text-muted">
          For privacy, enforcers can only look up a driver with the exact License No. from the
          physical license.
        </p>

        {errorMessage ? (
          <div role="alert" className="mt-3">
            <NoticeBox tone="danger" className="text-[13px]">
              {errorMessage}
            </NoticeBox>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSearch()}
          disabled={isSearching}
          aria-busy={isSearching}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-brand-500 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {isSearching ? (
            <>
              <LoaderCircle size={16} strokeWidth={2.4} className="animate-spin" aria-hidden />
              Searching…
            </>
          ) : (
            <>
              <Search size={16} strokeWidth={2.4} aria-hidden />
              Search Driver
            </>
          )}
        </button>
      </section>

      {searched && results !== null ? (
        results.length > 0 ? (
          <section className="mt-6">
            <h3 className="mb-2.5 text-[13px] text-muted">{results.length} result(s) found</h3>

            <ul>
              {results.map((driver) => (
                <li key={driver.driverId} className="mb-2.5">
                  <DriverResultCard
                    firstName={driver.firstName}
                    lastName={driver.lastName}
                    licenseNumber={driver.licenseNumber}
                    href={
                      isLookup
                        ? `/enforcer/record/${driver.driverId}`
                        : `/enforcer/issue?driverId=${driver.driverId}`
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="mt-2">
            <EmptyState title="No driver found for that search." />

            {/* Quick-create on a miss in both modes — lookup opens the new
                record, citation mode continues into the wizard (both via
                handleSelectDriver below). */}
            <div className="-mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowQuickCreate(true)}
                className="text-[14px] font-semibold text-brand-500 underline-offset-2 hover:underline"
              >
                + Create a new driver record
              </button>
            </div>
          </div>
        )
      ) : null}

      {showQuickCreate ? (
        <QuickCreateForm
          prefillLicense={licenseNumber}
          onCreated={handleSelectDriver}
          onCancel={() => setShowQuickCreate(false)}
        />
      ) : null}
    </PageBody>
  );
}

type QuickCreateFormProps = {
  /** The license number already typed into the search box. */
  prefillLicense: string;
  onCreated: (driver: DriverRecord) => void;
  onCancel: () => void;
};

/**
 * QuickCreateForm, reproduced field for field from DriverSearchScreen.js.
 *
 * The photo is mandatory in the original and stays mandatory here — RN's copy is
 * explicit that an admin reviews it before the record is usable, so letting a
 * record through without one would create work the officer cannot see. On the
 * web the camera is a file input carrying `capture="environment"`: on a phone
 * that opens the rear camera directly, on a desktop it falls back to a file
 * picker, which is the only thing a browser can offer there.
 */
function QuickCreateForm({ prefillLicense, onCreated, onCancel }: QuickCreateFormProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [middleInitial, setMiddleInitial] = useState("");
  const [lastName, setLastName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState(prefillLicense || "");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [licensePhoto, setLicensePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function pickPhoto(file: File | undefined) {
    if (!file) return;

    // multer rejects unsupported types and >8MB files, and POST /drivers is one
    // multipart request — so a refused licence photo would fail the driver's
    // whole record, not just the attachment. Checked here so the officer sees
    // which photo is at fault instead of a generic submit error.
    const rejection = rejectImage(file);
    if (rejection) {
      toast.error(IMAGE_REJECTION_MESSAGE[rejection]);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    // Object URLs are revoked on replace rather than on unmount so picking a
    // second photo does not leak the first blob.
    if (photoPreview) URL.revokeObjectURL(photoPreview);

    setLicensePhoto(file);
    setPhotoPreview(URL.createObjectURL(file));

    // Clear the input so re-picking the same file still fires a change event.
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleCreate() {
    setErrorMessage("");

    if (!firstName.trim() || !lastName.trim() || !licenseNumber.trim()) {
      setErrorMessage("First name, last name, and license number are required.");
      return;
    }

    if (!licensePhoto) {
      setErrorMessage(
        "A photo of the license is required — this is what the admin will use to verify this record."
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // Empty optional fields are sent as undefined so the multipart body
      // carries only what the officer actually typed.
      const created = await driverService.createDriver(
        {
          firstName: firstName.trim(),
          middleInitial: middleInitial.trim() || undefined,
          lastName: lastName.trim(),
          licenseNumber: licenseNumber.trim(),
          address: address.trim() || undefined,
          contactNumber: contactNumber.trim() || undefined,
        },
        licensePhoto
      );

      onCreated(created);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Unable to create driver record."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rise mt-4 rounded-[14px] border border-hairline bg-surface p-5">
      <h3 className="font-display text-[16px] font-semibold tracking-tight text-ink">
        New Driver Record
      </h3>
      <p className="mt-0.5 text-[12px] text-muted">
        Enter details exactly as shown on the driver&apos;s license.
      </p>

      {/* RN lays First Name and M.I. out side by side (flex 2 / flex 1). */}
      <div className="mt-1 flex gap-2.5">
        <FormField
          className="flex-[2]"
          label="First Name"
          required
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          autoCapitalize="words"
          autoComplete="off"
        />
        <FormField
          className="flex-1"
          label="M.I."
          value={middleInitial}
          onChange={(event) => setMiddleInitial(event.target.value)}
          maxLength={2}
          autoComplete="off"
        />
      </div>

      <FormField
        className="mt-3.5"
        label="Last Name"
        required
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        autoCapitalize="words"
        autoComplete="off"
      />

      <FormField
        className="mt-3.5"
        label="License Number"
        required
        value={licenseNumber}
        onChange={(event) => setLicenseNumber(event.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
      />

      <FormField
        className="mt-3.5"
        label="Address"
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        autoComplete="off"
      />

      <FormField
        className="mt-3.5"
        label="Contact Number"
        type="tel"
        inputMode="tel"
        value={contactNumber}
        onChange={(event) => setContactNumber(event.target.value)}
        autoComplete="off"
      />

      <div className="mt-3.5">
        <p className="mb-1.5 text-[13px] font-semibold text-ink">
          Photo of License <span className="text-signal-stop">*</span>
        </p>
        <p className="mb-2 text-[11px] leading-snug text-muted">
          This is what the admin will review to verify this record.
        </p>

        {photoPreview ? (
          <div>
            <div className="relative">
              {/* Object URL from a local file; the image optimiser cannot take it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Selected driver license photo"
                className="h-[140px] w-full rounded-[10px] border border-hairline object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  if (photoPreview) URL.revokeObjectURL(photoPreview);
                  setLicensePhoto(null);
                  setPhotoPreview(null);
                }}
                aria-label="Remove license photo"
                className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-signal-stop text-white ring-2 ring-surface transition-transform active:scale-90"
              >
                <X size={14} strokeWidth={3} aria-hidden />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-2 rounded-[8px] border border-hairline bg-surface px-4 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
            >
              Retake
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-hairline bg-surface py-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
          >
            <Camera size={16} strokeWidth={2.2} aria-hidden />
            Take Photo of License
          </button>
        )}

        {/* `capture` is what opens the rear camera on a phone; browsers that
            cannot honour it simply show a file picker. */}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          capture="environment"
          className="sr-only"
          aria-label="Take a photo of the driver's license"
          onChange={(event) => pickPhoto(event.target.files?.[0])}
        />
      </div>

      {errorMessage ? (
        <div role="alert" className="mt-3">
          <NoticeBox tone="danger" className="text-[13px]">
            {errorMessage}
          </NoticeBox>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[10px] border border-hairline bg-surface py-3 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="flex-[2] flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <LoaderCircle size={15} strokeWidth={2.4} className="animate-spin" aria-hidden />
              Creating…
            </>
          ) : (
            "Create & Continue"
          )}
        </button>
      </div>
    </section>
  );
}