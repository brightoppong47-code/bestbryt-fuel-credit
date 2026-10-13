import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  MapPin,
  Camera,
  Loader2,
  Navigation,
  Upload,
  CheckCircle,
  X,
  ArrowLeft,
  Hash,
  Building2,
  PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

const schema = z.object({
  fullName: z.string().min(2, "Name is required"),
  phone: z.string().min(9, "Valid phone number required"),
  address: z.string().min(3, "Address is required"),
  vehicleType: z.string().min(2, "Vehicle type is required"),
  vehiclePlate: z.string().min(3, "Plate number is required"),
  witnessName: z.string().optional(),
  witnessPhone: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function AccountNumberPreview({ branchCode, nextSequence }: { branchCode: string; nextSequence: number }) {
  const seq = String(nextSequence).padStart(6, "0");
  return (
    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center gap-3">
      <Hash className="w-4 h-4 text-primary shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">Account Number (auto-generated)</p>
        <p className="font-mono font-bold text-primary tracking-widest text-sm">
          BBV-{branchCode}-{seq}
        </p>
      </div>
    </div>
  );
}

export default function DriverRegistrationForm() {
  const navigate = useNavigate();
  const generateUploadUrl = useMutation(api.drivers.generateUploadUrl);
  const registerDriver = useMutation(api.drivers.registerDriver);
  const branches = useQuery(api.branches.listBranches);
  const currentUser = useQuery(api.users.getCurrentUserData);

  // Branch secretaries are locked to their assigned branch
  const lockedBranchId = currentUser?.role === "branch_secretary" ? (currentUser.branchId as string | undefined) : undefined;

  const [selectedBranchId, setSelectedBranchId] = useState<string>("");

  const [gpsLatitude, setGpsLatitude] = useState<number | null>(null);
  const [gpsLongitude, setGpsLongitude] = useState<number | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const selectedBranch = branches?.find((b) => b._id === (lockedBranchId ?? selectedBranchId));
  // Effective branch id: locked for branch secretaries, chosen otherwise
  const effectiveBranchId = lockedBranchId ?? selectedBranchId;

  const captureGPS = () => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by this browser.");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsLatitude(latitude);
        setGpsLongitude(longitude);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await res.json() as { display_name?: string };
          setGpsAddress(data.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        } catch {
          setGpsAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
        setGpsLoading(false);
      },
      () => {
        setGpsError("Unable to get location. Please allow location access and try again.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Resize and crop the photo to portrait (3:4 ratio, max 480×640px) before upload.
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const TARGET_W = 480;
        const TARGET_H = 640; // 3:4 portrait

        const canvas = document.createElement("canvas");
        canvas.width = TARGET_W;
        canvas.height = TARGET_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fallback: use file as-is
          setPhotoFile(file);
          setPhotoPreview(URL.createObjectURL(file));
          return;
        }

        // Crop to 3:4 from centre of the source image
        const srcRatio = img.width / img.height;
        const targetRatio = TARGET_W / TARGET_H; // 0.75
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) {
          // Wider than portrait — crop sides
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          // Taller than portrait — crop top/bottom (keep top bias for faces)
          sh = img.width / targetRatio;
          sy = (img.height - sh) * 0.2; // 20% offset keeps faces centred
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              setPhotoFile(file);
              setPhotoPreview(URL.createObjectURL(file));
              return;
            }
            const resized = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
              type: "image/jpeg",
            });
            setPhotoFile(resized);
            setPhotoPreview(URL.createObjectURL(resized));
          },
          "image/jpeg",
          0.88
        );
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: FormValues) => {
    if (!effectiveBranchId) {
      toast.error("Please select a branch.");
      return;
    }
    if (!gpsLatitude || !gpsLongitude) {
      toast.error("Please capture the customer's GPS location first.");
      return;
    }
    setUploading(true);
    try {
      let photoStorageId: Id<"_storage"> | undefined;

      if (photoFile) {
        // Step 1: get upload URL
        let uploadUrl: string;
        try {
          uploadUrl = await generateUploadUrl();
        } catch {
          toast.error("Could not prepare photo upload. Check your connection and try again.");
          setUploading(false);
          return;
        }

        // Step 2: upload the file with a 30s timeout
        let uploadResult: Response;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          uploadResult = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": photoFile.type },
            body: photoFile,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (err) {
          const isTimeout = err instanceof Error && err.name === "AbortError";
          toast.error(isTimeout
            ? "Photo upload timed out. Try a smaller image or check your connection."
            : "Photo upload failed. Please try again."
          );
          setUploading(false);
          return;
        }

        if (!uploadResult.ok) {
          toast.error(`Photo upload failed (${uploadResult.status}). Please try again.`);
          setUploading(false);
          return;
        }

        const { storageId } = await uploadResult.json() as { storageId: Id<"_storage"> };
        photoStorageId = storageId;
      }

      // Step 3: save the driver
      await registerDriver({
        ...values,
        branchId: effectiveBranchId as Id<"branches">,
        gpsLatitude,
        gpsLongitude,
        gpsAddress: gpsAddress || undefined,
        photoStorageId,
        witnessName: values.witnessName || undefined,
        witnessPhone: values.witnessPhone || undefined,
      });
      toast.success("Driver registered successfully!");
      navigate("/drivers");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to register driver: ${msg}`);
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const isLoading = isSubmitting || uploading;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/drivers")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">Register New Driver</h1>
          <p className="text-muted-foreground text-sm">Add a new commercial driver to the system</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Branch & Account Number */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Branch & Account Number
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Registering Branch *</Label>
              {branches === undefined ? (
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              ) : branches.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground space-y-2">
                  <p>No branches set up yet.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => navigate("/settings")}>
                    Create a Branch in Settings
                  </Button>
                </div>
              ) : lockedBranchId ? (
                // Branch secretaries see their branch locked
                <div className="flex items-center gap-2 rounded-lg bg-muted/60 border px-3 py-2.5">
                  <Building2 className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm font-medium">
                    {branches.find((b) => b._id === lockedBranchId)?.name ?? "Your Branch"}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">Locked to your branch</span>
                </div>
              ) : (
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.filter((b) => b.isActive).map((b) => (
                      <SelectItem key={b._id} value={b._id}>
                        {b.name} ({b.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedBranch && (
              <AccountNumberPreview
                branchCode={selectedBranch.code}
                nextSequence={selectedBranch.nextSequence}
              />
            )}
          </CardContent>
        </Card>

        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input id="fullName" placeholder="John Mensah" {...register("fullName")} />
              {errors.fullName && <p className="text-destructive text-xs">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone Number *</Label>
              <Input id="phone" placeholder="0244123456" {...register("phone")} />
              {errors.phone && <p className="text-destructive text-xs">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Home Address *</Label>
              <Input id="address" placeholder="Kumasi, Ashanti Region" {...register("address")} />
              {errors.address && <p className="text-destructive text-xs">{errors.address.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vehicleType">Vehicle Type *</Label>
              <Input id="vehicleType" placeholder="Tipper Truck / Mini Bus / Tanker" {...register("vehicleType")} />
              {errors.vehicleType && <p className="text-destructive text-xs">{errors.vehicleType.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehiclePlate">Plate Number *</Label>
              <Input id="vehiclePlate" placeholder="GR 1234-20" {...register("vehiclePlate")} />
              {errors.vehiclePlate && <p className="text-destructive text-xs">{errors.vehiclePlate.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Witness */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Witness Information <span className="text-muted-foreground font-normal text-sm">(optional)</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="witnessName">Witness Name</Label>
              <Input id="witnessName" placeholder="Kofi Asante" {...register("witnessName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="witnessPhone">Witness Phone Number</Label>
              <Input id="witnessPhone" placeholder="0201234567" {...register("witnessPhone")} />
            </div>
          </CardContent>
        </Card>

        {/* GPS Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              GPS Location — Customer's House
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Captured state */}
            {gpsLatitude && gpsLongitude ? (
              <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 space-y-1">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Location captured
                </div>
                {gpsAddress && (
                  <p className="text-xs text-muted-foreground break-words">{gpsAddress}</p>
                )}
                <p className="text-xs text-muted-foreground font-mono">
                  {gpsLatitude.toFixed(6)}, {gpsLongitude.toFixed(6)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setGpsLatitude(null);
                    setGpsLongitude(null);
                    setGpsAddress("");
                    setManualLat("");
                    setManualLng("");
                    setManualMode(false);
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear location
                </button>
              </div>
            ) : manualMode ? (
              /* Manual entry mode */
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Enter the coordinates manually. You can get them from Google Maps by pressing and holding on the customer's house location.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Latitude</Label>
                    <Input
                      placeholder="e.g. 6.68848"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Longitude</Label>
                    <Input
                      placeholder="e.g. -1.62443"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setManualMode(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    onClick={async () => {
                      const lat = parseFloat(manualLat);
                      const lng = parseFloat(manualLng);
                      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                        setGpsError("Please enter valid coordinates.");
                        return;
                      }
                      setGpsLatitude(lat);
                      setGpsLongitude(lng);
                      setGpsError(null);
                      setManualMode(false);
                      // Reverse geocode
                      try {
                        const res = await fetch(
                          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
                        );
                        const data = await res.json() as { display_name?: string };
                        setGpsAddress(data.display_name ?? "");
                      } catch {
                        setGpsAddress("");
                      }
                    }}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Save Coordinates
                  </Button>
                </div>
                {gpsError && <p className="text-destructive text-xs">{gpsError}</p>}
              </div>
            ) : (
              /* Default: auto-detect + manual fallback */
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Visit the customer's house and tap the button to capture their exact GPS coordinates.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={captureGPS}
                    disabled={gpsLoading}
                    className="gap-2"
                  >
                    {gpsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Navigation className="w-4 h-4" />
                    )}
                    {gpsLoading ? "Getting location..." : "Auto-Detect Location"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => { setManualMode(true); setGpsError(null); }}
                    className="gap-2"
                  >
                    <PenLine className="w-4 h-4" />
                    Enter Manually
                  </Button>
                </div>
                {gpsError && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center space-y-2">
                    <p className="text-destructive text-xs font-medium">{gpsError}</p>
                    <p className="text-xs text-muted-foreground">
                      Location access was denied. You can enter the coordinates manually instead.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => { setManualMode(true); setGpsError(null); }}
                      className="gap-1.5"
                    >
                      <PenLine className="w-3.5 h-3.5" />
                      Enter Coordinates Manually
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Photo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              Customer Photo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {photoPreview ? (
              <div className="relative inline-block">
                <img
                  src={photoPreview}
                  alt="Customer preview"
                  className="w-28 h-[148px] object-cover rounded-xl border"
                />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className={cn(
                  "w-28 h-[148px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2",
                  "text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                )}
              >
                <Upload className="w-6 h-6" />
                <span className="text-xs font-medium">Upload Photo</span>
              </button>
            )}
            <input
              type="file"
              accept="image/*"
              ref={photoInputRef}
              onChange={handlePhotoChange}
              className="hidden"
            />
            <p className="text-xs text-muted-foreground mt-2">Take a photo or upload from gallery</p>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Any additional information about this driver..."
              rows={3}
              {...register("notes")}
            />
          </CardContent>
        </Card>

        <Button type="submit" className="w-full gap-2" disabled={isLoading} size="lg">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          {uploading && photoFile ? "Uploading photo..." : isLoading ? "Registering..." : "Register Driver"}
        </Button>
      </form>
    </div>
  );
}
