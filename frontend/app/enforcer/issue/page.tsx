"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  FileText,
  LoaderCircle,
  MapPin,
  Search,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import AppBar from "@/components/common/AppBar";
import BottomNav from "@/components/common/BottomNav";
import ChipRow from "@/components/common/ChipRow";
import DriverResultCard from "@/components/common/DriverResultCard";
import EmptyState from "@/components/common/EmptyState";
import EvidencePhotos, { type EvidencePhoto } from "@/components/common/EvidencePhotos";
import FilterBar from "@/components/common/FilterBar";
import FormField from "@/components/common/FormField";
import GpsBox from "@/components/common/GpsBox";
import NoticeBox from "@/components/common/NoticeBox";
import OptionCard, { SegmentedOptions } from "@/components/common/OptionCard";
import PageBody from "@/components/common/PageBody";
import WizardFooter from "@/components/common/WizardFooter";
import WizardProgress from "@/components/common/WizardProgress";
import useClientNow from "@/components/common/useClientNow";
import { getApiErrorMessage } from "@/lib/axios";
import useGeolocation from "@/lib/useGeolocation";
import {
  citationService,
  type CitationCreatePayload,
} from "@/services/citation.service";
import { driverService, type DriverRecord } from "@/services/driver.service";
import {
  formatPenaltyRange,
  violationTypeService,
  type ViolationTypeRecord,
} from "@/services/violation-type.service";

/**
 * The 4-step issue-citation wizard — the web port of
 * enforcer-app/src/screens/IssueCitationScreen.js (703 lines, the largest
 * screen in the migration).
 *
 * Deliberately a faithful port, not a redesign. The step order, every field,
 * every validation message, the placeholders and the submit payload all match
 * the RN screen. Where the platform forced a change (GPS permissions,
 * expo-image-picker, React Navigation) the change is called out at the point it
 * happens and repeated in the header comment below.
 */

const TOTAL_STEPS = 4;

/** WizardProgress dot labels. Order matches the RN step order exactly. */
const STEP_LABELS = ["Driver", "Vehicle", "Violations", "Documentation"];

/**
 * Citation or Warning. constants/violations.ts records that the Prisma enum
 * also has "violation", but citationController only accepts these two, so the
 * toggle offers only these two.
 */
type RecordTypeChoice = "citation" | "warning";

/**
 * RN's "non_moving" category key, kept verbatim. The chip label is what the
 * officer reads; the value is what the API field holds.
 */
type CategoryFilter = "all" | "moving" | "non_moving";

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "moving", label: "Moving" },
  { value: "non_moving", label: "Non-moving" },
];

/** Evidence-photo cap. Mirrors EvidencePhotos' default and multer's `files: 5`. */
const MAX_PHOTOS = 5;

/** File types the backend's multer fileFilter accepts (jpeg/png/webp only). */
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

/** multer's `fileSize: 8 * 1024 * 1024` per file. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * A picked file plus the object URL EvidencePhotos renders. EvidencePhotos
 * takes a `url`, not a `File`, so the page owns both halves: the preview URL and
 * the bytes that go into the multipart body.
 */
type PickedPhoto = {
  file: File;
  url: string;
};

export default function IssueCitationPage() {
  return (
    // Next 16 bails a static prerender out to the client at the first
    // useSearchParams() call, and the production build fails without a boundary
    // above it. Same shape as app/(auth)/login/page.tsx.
    <Suspense fallback={<WizardSkeleton />}>
      <IssueCitationWizard />
    </Suspense>
  );
}

function IssueCitationWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // /enforcer/search lands here as `?driverId=<id>`. The RN screen received
  // the whole driver object through route.params; the web passes only an id, so
  // the record is resolved here.
  const driverIdParam = searchParams.get("driverId");

  const [driver, setDriver] = useState<DriverRecord | null>(null);
  const [driverLoadError, setDriverLoadError] = useState("");

  // Embedded license search for the no-driver guard below. Same service and
  // privacy rule as /enforcer/search (license number only) — this only
  // discovers the driver; selecting a hit links into the wizard's existing
  // `?driverId=` resolution, so there is still exactly one driver-loading
  // path and one submission flow.
  const [searchLicense, setSearchLicense] = useState("");
  const [searchResults, setSearchResults] = useState<DriverRecord[] | null>(null);
  const [didSearch, setDidSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  async function handleEmbeddedSearch() {
    setSearchError("");

    if (!searchLicense.trim()) {
      setSearchError(
        "Enter the License No. from the physical license to search. Name search is disabled for privacy."
      );
      return;
    }

    setIsSearching(true);
    setDidSearch(false);

    try {
      setSearchResults(
        await driverService.searchDrivers({ licenseNumber: searchLicense.trim() })
      );
      setDidSearch(true);
    } catch (error) {
      setSearchError(getApiErrorMessage(error, "Search failed. Please try again."));
    } finally {
      setIsSearching(false);
    }
  }

  const [step, setStep] = useState(1);
  const [recordType, setRecordType] = useState<RecordTypeChoice>("citation");

  // Step 1
  const [driverAddress, setDriverAddress] = useState("");

  // Step 2
  const [vehicleUnitType, setVehicleUnitType] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [registeredOwner, setRegisteredOwner] = useState("");

  // Step 3
  const [violationTypes, setViolationTypes] = useState<ViolationTypeRecord[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState(true);
  const [violationLoadError, setViolationLoadError] = useState("");
  const [violationQuery, setViolationQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedViolationIds, setSelectedViolationIds] = useState<number[]>([]);
  const [otherViolation, setOtherViolation] = useState("");
  const [placeOfViolation, setPlaceOfViolation] = useState("");

  // Step 4
  const { location, error: locationError, isLocating, capture } = useGeolocation();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [driverUnderProtest, setDriverUnderProtest] = useState<boolean | null>(null);

  const [stepError, setStepError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hidden <input type="file"> elements. EvidencePhotos renders the visible
  // buttons and calls onCapture / onPick, which here just click these inputs —
  // the web equivalent of expo-image-picker's camera and library launchers.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  /**
   * WHY a ref and not the picked files: revoking an object URL frees the blob
   * the <img> is still pointing at, which leaves a broken thumbnail. So the
   * URL is revoked only where the photo actually leaves the list — on remove,
   * on a rejected overflow, and on unmount.
   */
  const photosRef = useRef<PickedPhoto[]>([]);
  // Written in an Effect rather than during render, so the ref always holds the
  // committed list by the time addPhotos reads it. Same treatment as
  // components/common/useFocusRefresh.ts.
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, []);

  /**
   * WHY derived rather than a state flag: with no `?driverId=` there is nothing
   * to wait for, and writing that from inside the Effect would be a cascading
   * setState on every render of the no-driver path.
   */
  const isResolvingDriver =
    driverIdParam !== null && driver === null && driverLoadError === "";

  // Resolve the driver passed in from /enforcer/search. Without it the wizard
  // cannot render or submit — see the guard near the bottom of this component.
  useEffect(() => {
    if (!driverIdParam) return;

    let cancelled = false;

    driverService
      .getDriver(driverIdParam)
      .then((record) => {
        if (cancelled) return;
        setDriver(record);
        // RN seeds the address from the driver and leaves it editable.
        setDriverAddress(record.address || "");
      })
      .catch((error: unknown) => {
        // Skipped when cancelled: the effect was torn down, so there is no
        // longer a caller to report to. Both settled paths clear
        // isResolvingDriver on their own — a success sets `driver`, a failure
        // sets `driverLoadError`.
        if (cancelled) return;
        setDriverLoadError(
          getApiErrorMessage(error, "Unable to load that driver. Go back and search again.")
        );
      });

    return () => {
      cancelled = true;
    };
  }, [driverIdParam]);

  // Violation types: GET /violation-types?active=true. Only active rows may be
  // cited, which is why this is listActive() and not list().
  useEffect(() => {
    let cancelled = false;

    violationTypeService
      .listActive()
      .then((rows) => {
        if (!cancelled) setViolationTypes(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // RN wrote this into the shared stepError slot, which meant the very
        // next validateStep() wiped it. Held in its own state here so the
        // message survives until the officer fixes the connection, and shown
        // above the (necessarily empty) picker it explains.
        setViolationLoadError(
          getApiErrorMessage(error, "Unable to load violation types. Check your connection.")
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingViolations(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * WHY capture on step 4 rather than on mount: the RN screen pulled the fix in
   * an effect keyed on `step`, so the browser permission prompt appears when
   * the officer reaches the documentation step — not three screens earlier,
   * where they would not know what is being asked for.
   */
  useEffect(() => {
    if (step === 4 && !location) capture();
  }, [step, location, capture]);

  const toggleViolation = useCallback((id: number) => {
    setSelectedViolationIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }, []);

  /**
   * WHY the file is checked here and not by the input alone: `accept` is only
   * a hint — a desktop browser will happily hand over anything. Multer rejects
   * a non-jpeg/png/webp or an oversized file and fails the WHOLE request, so an
   * officer who attached six photos would lose the whole citation.
   */
  function addPhotos(incoming: FileList | null, source: "camera" | "gallery") {
    if (!incoming || incoming.length === 0) return;

    const accepted: PickedPhoto[] = [];
    let overflow = 0;
    let rejectedType = 0;
    let rejectedSize = 0;

    Array.from(incoming).forEach((file) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        rejectedType += 1;
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        rejectedSize += 1;
        return;
      }
      if (photosRef.current.length + accepted.length >= MAX_PHOTOS) {
        overflow += 1;
        return;
      }
      accepted.push({ file, url: URL.createObjectURL(file) });
    });

    if (accepted.length > 0) {
      setPhotos((prev) => [...prev, ...accepted]);
    }

    // One message per distinct problem, so the officer is not told three times
    // about the same cap.
    if (overflow > 0) {
      toast.error(
        `Limit reached — you can attach up to ${MAX_PHOTOS} photos per citation.`
      );
    }
    if (rejectedType > 0) {
      toast.error("Photos must be JPEG, PNG or WEBP.");
    }
    if (rejectedSize > 0) {
      toast.error("Each photo must be 8 MB or smaller.");
    }

    // Cleared so picking the same file twice in a row still fires `change`.
    const input = source === "camera" ? cameraInputRef.current : galleryInputRef.current;
    if (input) input.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, position) => position !== index);
    });
  }

  /**
   * RN's validateStep(), rule for rule and message for message. Each `if` is a
   * hard block on advancing, exactly as in the RN screen.
   */
  function validateStep(): boolean {
    setStepError("");

    if (step === 1) {
      if (!driverAddress.trim()) {
        setStepError("Driver address is required.");
        return false;
      }
    }

    if (step === 2) {
      if (!plateNumber.trim()) {
        setStepError("Plate number is required.");
        return false;
      }
      if (!registeredOwner.trim()) {
        setStepError("Registered owner is required.");
        return false;
      }
      if (!vehicleUnitType.trim()) {
        setStepError("Vehicle unit type is required.");
        return false;
      }
    }

    if (step === 3) {
      if (selectedViolationIds.length === 0) {
        setStepError("Select at least one violation.");
        return false;
      }
      if (!placeOfViolation.trim()) {
        setStepError("Place of violation is required.");
        return false;
      }
    }

    if (step === 4) {
      if (!location) {
        setStepError(
          locationError || "GPS coordinates are required. Wait for location capture or tap Retry."
        );
        return false;
      }
      if (driverUnderProtest === null) {
        setStepError("Please indicate whether the driver is under protest.");
        return false;
      }
    }

    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  function goBack() {
    setStepError("");
    if (step === 1) {
      router.push("/enforcer/search?mode=issueCitation");
      return;
    }
    setStep((current) => current - 1);
  }

  async function handleSubmit() {
    if (!driver || !validateStep()) return;

    // validateStep() returned true, which means both of these are non-null —
    // but TypeScript cannot see through the call, and the payload types them as
    // required. Capturing them here narrows both without a non-null assertion.
    const gps = location!;
    const underProtest = driverUnderProtest;
    if (!gps || underProtest === null) return;

    setIsSubmitting(true);
    try {
      const payload: CitationCreatePayload = {
        driverId: driver.driverId,
        recordType,
        address: driverAddress,
        vehicleUnitType,
        plateNumber,
        registeredOwner,
        // The service JSON.stringifies this and the backend JSON.parses it.
        violationTypeIds: selectedViolationIds,
        otherViolation,
        placeOfViolation,
        latitude: gps.latitude,
        longitude: gps.longitude,
        driverUnderProtest: underProtest,
      };

      const created = await citationService.createCitation(
        payload,
        photos.map((photo) => photo.file)
      );

      // RN did navigation.replace('CitationSuccess') followed by a
      // navigation.reset on the success screen's Dashboard button. The web has
      // one target, so `replace` does the work of both: it swaps this entry out
      // of the history stack, so Back cannot return the officer to a wizard
      // that has already been filed.
      //
      // `?justFiled=1` switches the receipt into its confirmation mode, which
      // is what RN's screen actually was — the receipt the officer had just
      // been handed. The same route is the detail view for older citations
      // without the flag.
      router.replace(`/enforcer/citations/${created.citationId}?justFiled=1`);
    } catch (error) {
      setStepError(getApiErrorMessage(error, "Unable to submit citation. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  // The violation picker filters the same two ways the RN screen did: by
  // category, then by a free-text match across articleSection + description.
  const filteredViolations = useMemo(() => {
    const trimmed = violationQuery.trim();
    const needle = trimmed.toLowerCase();

    return violationTypes.filter((violation) => {
      if (category !== "all" && violation.category !== category) return false;
      if (!needle) return true;
      return `${violation.articleSection} ${violation.description}`
        .toLowerCase()
        .includes(needle);
    });
  }, [violationTypes, category, violationQuery]);

  /**
   * Guard sits after all hooks so hook order never changes. Without a driver
   * the wizard cannot render or submit — RN showed a fallback with a back
   * button, and so does this.
   */
  if (!driver) {
    if (isResolvingDriver) return <ResolvingDriver />;

    return (
      <>
        <AppBar title="Issue Citation" backHref="/enforcer/search?mode=issueCitation" />
        <PageBody>
          <div className="mt-6 text-center">
            <h2 className="font-display text-[20px] font-semibold tracking-tight text-ink">
              Search Driver
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              License No. only — protects driver privacy
            </p>
          </div>

          {driverLoadError ? (
            <div role="alert" className="mt-4">
              <NoticeBox tone="danger" className="text-[13px]">
                {driverLoadError}
              </NoticeBox>
            </div>
          ) : null}

          <section className="rise mt-5 rounded-[14px] border border-hairline bg-surface p-5">
            <FormField
              label="Driver's License Number"
              required
              placeholder="e.g. G-75-45-571924"
              value={searchLicense}
              onChange={(event) => setSearchLicense(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleEmbeddedSearch();
              }}
              autoCapitalize="characters"
              autoComplete="off"
            />

            <p className="mt-2 text-[11px] leading-snug text-muted">
              Enter the exact License No. from the physical license, then pick
              the driver to start the citation.
            </p>

            {searchError ? (
              <div role="alert" className="mt-3">
                <NoticeBox tone="danger" className="text-[13px]">
                  {searchError}
                </NoticeBox>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleEmbeddedSearch()}
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
                  Search Records
                </>
              )}
            </button>
          </section>

          {didSearch && searchResults !== null ? (
            searchResults.length > 0 ? (
              <section className="mt-6">
                <h3 className="mb-2.5 text-[13px] text-muted">
                  {searchResults.length} result(s) found — pick a driver to continue
                </h3>

                <ul>
                  {searchResults.map((hit) => (
                    <li key={hit.driverId} className="mb-2.5">
                      <DriverResultCard
                        firstName={hit.firstName}
                        lastName={hit.lastName}
                        licenseNumber={hit.licenseNumber}
                        href={`/enforcer/issue?driverId=${hit.driverId}`}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <div className="mt-2">
                <EmptyState title="No driver found for that search." />
              </div>
            )
          ) : null}

          <button
            type="button"
            onClick={() => router.push("/enforcer/search?mode=issueCitation")}
            className="mx-auto mt-4 flex items-center gap-1.5 rounded-[10px] border border-hairline bg-surface px-5 py-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-sunken"
          >
            ← Back to Search
          </button>
        </PageBody>
        <BottomNav />
      </>
    );
  }

  const driverFullName = `${driver.firstName} ${driver.lastName}`;
  const licenseNumber = driver.licenseNumber || "";

  return (
    <>
      <AppBar title="Issue Citation" backHref="/enforcer/search?mode=issueCitation" />

      <WizardProgress step={step} total={TOTAL_STEPS} labels={STEP_LABELS} />

      {/* Step 1 opens with the record-type choice, as in RN, where the toggle
          sat above the body and only on step 1. */}
      {step === 1 ? (
        <div className="px-5 pt-3.5">
          <SegmentedOptions
            label="Record type"
            value={recordType}
            onChange={(value) => setRecordType(value)}
            options={[
              { value: "citation", label: "Citation", Icon: FileText },
              { value: "warning", label: "Warning", Icon: TriangleAlert },
            ]}
          />
        </div>
      ) : null}

      <PageBody withNav={false} className="pb-2">
        {step === 1 ? (
          <StepDriverInfo
            fullName={driverFullName}
            address={driverAddress}
            onAddressChange={setDriverAddress}
            licenseNumber={licenseNumber}
          />
        ) : null}

        {step === 2 ? (
          <StepVehicleInfo
            unitType={vehicleUnitType}
            onUnitTypeChange={setVehicleUnitType}
            plateNumber={plateNumber}
            onPlateNumberChange={setPlateNumber}
            registeredOwner={registeredOwner}
            onRegisteredOwnerChange={setRegisteredOwner}
          />
        ) : null}

        {step === 3 ? (
          <StepViolationDetails
            violationTypes={violationTypes}
            filtered={filteredViolations}
            isLoading={isLoadingViolations}
            query={violationQuery}
            onQueryChange={setViolationQuery}
            category={category}
            onCategoryChange={setCategory}
            loadError={violationLoadError}
            selectedIds={selectedViolationIds}
            onToggle={toggleViolation}
            otherViolation={otherViolation}
            onOtherViolationChange={setOtherViolation}
            placeOfViolation={placeOfViolation}
            onPlaceChange={setPlaceOfViolation}
            recordType={recordType}
          />
        ) : null}

        {step === 4 ? (
          <StepDocumentation
            location={location}
            locationError={locationError}
            isLocating={isLocating}
            onRetryLocation={capture}
            photos={photos}
            onCapture={() => cameraInputRef.current?.click()}
            onPick={() => galleryInputRef.current?.click()}
            onRemovePhoto={removePhoto}
            driverUnderProtest={driverUnderProtest}
            onDriverUnderProtestChange={setDriverUnderProtest}
          />
        ) : null}
      </PageBody>

      {/* The two file inputs EvidencePhotos' buttons drive. Hidden rather than
          display:none so the mobile pickers still open from a real click. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        capture="environment"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => addPhotos(event.target.files, "camera")}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => addPhotos(event.target.files, "gallery")}
      />

      <WizardFooter
        onBack={goBack}
        onNext={step < TOTAL_STEPS ? goNext : undefined}
        onSubmit={step < TOTAL_STEPS ? undefined : handleSubmit}
        isSubmitting={isSubmitting}
        error={stepError || null}
        bottomInset="nav"
      />

      <BottomNav />
    </>
  );
}

/** Shown while the driver behind `?driverId=` is still being fetched. */
function ResolvingDriver() {
  return (
    <>
      <AppBar title="Issue Citation" backHref="/enforcer/search?mode=issueCitation" />
      <PageBody>
        <div
          role="status"
          className="flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <LoaderCircle
            size={24}
            strokeWidth={2.2}
            className="animate-spin text-brand-500"
            aria-hidden
          />
          <p className="text-[13px] font-semibold text-muted">Loading driver record…</p>
        </div>
      </PageBody>
      <BottomNav />
    </>
  );
}

/** Suspense fallback — the AppBar is a server component, so it stays. */
function WizardSkeleton() {
  return (
    <>
      <AppBar title="Issue Citation" backHref="/enforcer/search?mode=issueCitation" />
      <div aria-hidden className="px-5 pt-6">
        <div className="breathe h-3 w-32 rounded-full bg-surface-sunken" />
        <div className="breathe mt-3 h-10 w-full rounded-[10px] bg-surface-sunken" />
        <div className="breathe mt-4 h-24 w-full rounded-[10px] bg-surface-sunken" />
      </div>
    </>
  );
}

/** Step heading. The RN screens used an 18px bold title above every step. */
function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-display text-[18px] font-bold tracking-tight text-ink">
      {children}
    </h2>
  );
}

type StepDriverInfoProps = {
  fullName: string;
  address: string;
  onAddressChange: (value: string) => void;
  licenseNumber: string;
};

/**
 * Step 1. Name and licence are fixed — they came off the driver's record and
 * RN rendered both as `editable={false}` inputs, so they are read-only here
 * rather than being dropped.
 */
function StepDriverInfo({
  fullName,
  address,
  onAddressChange,
  licenseNumber,
}: StepDriverInfoProps) {
  return (
    <section className="rise pt-5">
      <StepTitle>Driver Information</StepTitle>

      <FormField label="Driver Full Name" value={fullName} readOnly />

      <FormField
        label="Driver Address"
        className="mt-3.5"
        value={address}
        onChange={(event) => onAddressChange(event.target.value)}
        placeholder="e.g., 123 Rizal St., Manila"
      />

      <FormField label="License Number" className="mt-3.5" value={licenseNumber} readOnly />
    </section>
  );
}

type StepVehicleInfoProps = {
  unitType: string;
  onUnitTypeChange: (value: string) => void;
  plateNumber: string;
  onPlateNumberChange: (value: string) => void;
  registeredOwner: string;
  onRegisteredOwnerChange: (value: string) => void;
};

/** Step 2. All three fields are required, and the backend re-validates them. */
function StepVehicleInfo({
  unitType,
  onUnitTypeChange,
  plateNumber,
  onPlateNumberChange,
  registeredOwner,
  onRegisteredOwnerChange,
}: StepVehicleInfoProps) {
  return (
    <section className="rise pt-5">
      <StepTitle>Vehicle Information</StepTitle>

      <FormField
        label="Unit Type"
        required
        value={unitType}
        onChange={(event) => onUnitTypeChange(event.target.value)}
        placeholder="e.g., Sedan, Motorcycle"
      />

      <FormField
        label="Plate Number"
        required
        className="mt-3.5"
        value={plateNumber}
        onChange={(event) => onPlateNumberChange(event.target.value)}
        placeholder="e.g., ABC 1234"
        autoCapitalize="characters"
        autoComplete="off"
      />

      <FormField
        label="Registered Owner"
        required
        className="mt-3.5"
        value={registeredOwner}
        onChange={(event) => onRegisteredOwnerChange(event.target.value)}
        placeholder="e.g., Maria Santos"
      />
    </section>
  );
}

type StepViolationDetailsProps = {
  violationTypes: ViolationTypeRecord[];
  filtered: ViolationTypeRecord[];
  isLoading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  category: CategoryFilter;
  onCategoryChange: (value: CategoryFilter) => void;
  /** Non-empty when the picker could not be fetched. */
  loadError: string;
  selectedIds: number[];
  onToggle: (id: number) => void;
  otherViolation: string;
  onOtherViolationChange: (value: string) => void;
  placeOfViolation: string;
  onPlaceChange: (value: string) => void;
  recordType: RecordTypeChoice;
};

/** Step 3 — the searchable, category-filtered, multi-select violation picker. */
function StepViolationDetails({
  violationTypes,
  filtered,
  isLoading,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  loadError,
  selectedIds,
  onToggle,
  otherViolation,
  onOtherViolationChange,
  placeOfViolation,
  onPlaceChange,
  recordType,
}: StepViolationDetailsProps) {
  return (
    <section className="rise pt-5">
      <StepTitle>Violation Details</StepTitle>

      {loadError ? (
        <NoticeBox tone="danger" className="mb-3">
          {loadError}
        </NoticeBox>
      ) : null}

      <p aria-live="polite" className="mb-2 text-[12px] font-bold text-brand-700">
        Selected: {selectedIds.length}
      </p>

      {recordType === "warning" ? (
        <NoticeBox className="mb-4">
          This will be issued as a Warning — no fine will be charged, but it&apos;s still
          recorded on the driver&apos;s history.
        </NoticeBox>
      ) : null}

      {/* FilterBar is the white strip the RN violation lists used; here it wraps
          the search field and category chips so the two read as one control. */}
      <FilterBar>
        <div className="relative">
          <Search
            size={16}
            strokeWidth={2.2}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search violations…"
            aria-label="Search violations"
            className="dt-input pl-9"
          />
        </div>

        <ChipRow
          label="Filter by category"
          variant="outline"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(value) => onCategoryChange(value as CategoryFilter)}
        />
      </FilterBar>

      {isLoading ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 py-6 text-muted"
        >
          <LoaderCircle
            size={18}
            strokeWidth={2.2}
            className="animate-spin text-brand-500"
            aria-hidden
          />
          <span className="text-[12px]">Loading violations…</span>
        </div>
      ) : violationTypes.length === 0 ? (
        <p className="py-5 text-[13px] text-muted">
          No active violation types are available. Ask an administrator to add them.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-5 text-[13px] leading-relaxed text-muted">
          No violations match “{query}”. Try another keyword or use Other Violations below.
        </p>
      ) : (
        // Capped like the RN list's maxHeight:320 — the picker must not push the
        // free-text and place fields off the bottom of a phone screen.
        <ul className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-0.5">
          {filtered.map((violation) => (
            <li key={violation.violationTypeId}>
              <OptionCard
                selected={selectedIds.includes(violation.violationTypeId)}
                onSelect={() => onToggle(violation.violationTypeId)}
                trailing={formatPenaltyRange(violation)}
              >
                <span className="font-semibold">
                  {violation.articleSection} | {violation.description}
                </span>
              </OptionCard>
            </li>
          ))}
        </ul>
      )}

      <FormField
        label="Other Violations"
        className="mt-4"
        value={otherViolation}
        onChange={(event) => onOtherViolationChange(event.target.value)}
        placeholder="Specify other violations…"
      />

      <FormField
        label="Place of Violation"
        required
        className="mt-3.5"
        value={placeOfViolation}
        onChange={(event) => onPlaceChange(event.target.value)}
        placeholder="e.g., EDSA-Ortigas Intersection"
      />

      <OccurredAtBox />
    </section>
  );
}

/**
 * The date and time box. RN froze `occurredAt` at the moment the wizard opened
 * and only ever displayed it — the backend stamps its own occurredAt on create.
 *
 * WHY useClientNow(): a real timestamp rendered on the server bakes the
 * server's clock into the HTML and hydration then disagrees. The hook returns
 * null until the client has painted, which keeps the two first renders equal.
 */
function OccurredAtBox() {
  const now = useClientNow();

  return (
    <div className="mt-4 rounded-[10px] bg-field-muted p-3.5">
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        <CalendarClock size={14} strokeWidth={2.2} aria-hidden />
        Date &amp; Time
      </p>
      <p className="tabular mt-0.5 text-[14px] font-semibold text-ink">
        {now === null ? (
          <span className="text-muted">Recording when you submit…</span>
        ) : (
          <>
            {new Date(now).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            at{" "}
            {new Date(now).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </>
        )}
      </p>
    </div>
  );
}

type StepDocumentationProps = {
  location: { latitude: number; longitude: number } | null;
  locationError: string | null;
  isLocating: boolean;
  onRetryLocation: () => void;
  photos: PickedPhoto[];
  onCapture: () => void;
  onPick: () => void;
  onRemovePhoto: (index: number) => void;
  driverUnderProtest: boolean | null;
  onDriverUnderProtestChange: (value: boolean) => void;
};

/**
 * Step 4 — GPS, photo evidence and the protest declaration.
 *
 * RN's photo permissions were an expo-image-picker concern. On the web the
 * browser asks for camera and file access when the officer picks, so the
 * permission alerts have no equivalent here — that is the one RN behaviour with
 * no faithful port, and it is intentional.
 */
function StepDocumentation({
  location,
  locationError,
  isLocating,
  onRetryLocation,
  photos,
  onCapture,
  onPick,
  onRemovePhoto,
  driverUnderProtest,
  onDriverUnderProtestChange,
}: StepDocumentationProps) {
  return (
    <section className="rise pt-5">
      <StepTitle>Documentation</StepTitle>

      <GpsBox
        location={location}
        error={locationError}
        onRetry={onRetryLocation}
        isLocating={isLocating}
      />

      <div className="mt-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <MapPin size={14} strokeWidth={2.2} aria-hidden />
          Photo Evidence
        </p>

        <EvidencePhotos
          photos={photos.map<EvidencePhoto>((photo) => ({
            url: photo.url,
            name: photo.file.name,
          }))}
          onRemove={onRemovePhoto}
          onCapture={onCapture}
          onPick={onPick}
          max={MAX_PHOTOS}
        />
      </div>

      <div className="mt-5">
        <p className="mb-1.5 text-[13px] font-semibold text-ink">
          Driver Under Protest <span className="text-signal-stop">*</span>
        </p>
        <SegmentedOptions
          label="Is the driver under protest?"
          value={driverUnderProtest}
          onChange={(value) => onDriverUnderProtestChange(value)}
          options={[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ]}
        />
      </div>
    </section>
  );
}