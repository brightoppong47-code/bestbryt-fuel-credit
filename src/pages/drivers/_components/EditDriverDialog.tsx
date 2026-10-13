/**
 * Edit Driver Dialog — owner-only form to update all editable customer profile fields,
 * including profile photo (3:4 crop/resize) and branch assignment.
 */

import { useState, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
  Loader2, User, Phone, Car, MapPin, FileText, Camera, Upload,
  Building2, X, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

type Driver = {
  _id: Id<"drivers">;
  fullName: string;
  phone: string;
  address: string;
  vehicleType: string;
  vehiclePlate: string;
  branchId: Id<"branches">;
  gpsLatitude: number;
  gpsLongitude: number;
  gpsAddress?: string | null;
  photoUrl?: string | null;
  witnessName?: string | null;
  witnessPhone?: string | null;
  notes?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver;
};

// ── Photo helpers (same crop logic as registration form) ──────────────────────

function resizeToPortrait(file: File): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const TARGET_W = 480;
        const TARGET_H = 640;
        const canvas = document.createElement("canvas");
        canvas.width = TARGET_W;
        canvas.height = TARGET_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }

        const srcRatio = img.width / img.height;
        const targetRatio = TARGET_W / TARGET_H;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (srcRatio > targetRatio) {
          sw = img.height * targetRatio;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetRatio;
          sy = (img.height - sh) * 0.2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, TARGET_W, TARGET_H);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.88
        );
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EditDriverDialog({ open, onOpenChange, driver }: Props) {
  const updateDriver = useMutation(api.drivers.updateDriver);
  const generateUploadUrl = useMutation(api.drivers.generateUploadUrl);
  const branches = useQuery(api.branches.listBranches);

  const [saving, setSaving] = useState(false);

  // Photo state
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  const [form, setForm] = useState({
    fullName: driver.fullName,
    phone: driver.phone,
    address: driver.address,
    vehicleType: driver.vehicleType,
    vehiclePlate: driver.vehiclePlate,
    branchId: driver.branchId as string,
    gpsLatitude: driver.gpsLatitude.toString(),
    gpsLongitude: driver.gpsLongitude.toString(),
    gpsAddress: driver.gpsAddress ?? "",
    witnessName: driver.witnessName ?? "",
    witnessPhone: driver.witnessPhone ?? "",
    notes: driver.notes ?? "",
  });

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const resized = await resizeToPortrait(file);
    setPhotoFile(resized);
    setPhotoPreview(URL.createObjectURL(resized));
    setPhotoRemoved(false);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoRemoved(true);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  // Current display photo: new preview > existing > nothing
  const displayPhoto = photoPreview ?? (photoRemoved ? null : driver.photoUrl ?? null);

  const handleSave = async () => {
    const lat = parseFloat(form.gpsLatitude);
    const lng = parseFloat(form.gpsLongitude);

    if (!form.fullName.trim()) { toast.error("Full name is required."); return; }
    if (!form.phone.trim()) { toast.error("Phone number is required."); return; }
    if (!form.address.trim()) { toast.error("Home address is required."); return; }
    if (!form.vehicleType.trim()) { toast.error("Vehicle type is required."); return; }
    if (!form.vehiclePlate.trim()) { toast.error("Vehicle plate is required."); return; }
    if (!form.branchId) { toast.error("Please select a branch."); return; }
    if (isNaN(lat) || isNaN(lng)) { toast.error("GPS coordinates must be valid numbers."); return; }

    setSaving(true);
    try {
      let photoStorageId: Id<"_storage"> | undefined;

      // Upload new photo if selected
      if (photoFile) {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": photoFile.type },
          body: photoFile,
        });
        if (!res.ok) throw new Error("Photo upload failed");
        const { storageId } = await res.json() as { storageId: Id<"_storage"> };
        photoStorageId = storageId;
      }

      await updateDriver({
        driverId: driver._id,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        vehicleType: form.vehicleType.trim(),
        vehiclePlate: form.vehiclePlate.trim().toUpperCase(),
        branchId: form.branchId as Id<"branches">,
        gpsLatitude: lat,
        gpsLongitude: lng,
        gpsAddress: form.gpsAddress.trim() || undefined,
        ...(photoStorageId ? { photoStorageId } : {}),
        witnessName: form.witnessName.trim() || undefined,
        witnessPhone: form.witnessPhone.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });

      toast.success("Customer profile updated successfully.");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            Edit Customer Profile
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── Photo ─────────────────────────────────────────────────────── */}
          <Section label="Profile Photo" icon={<Camera className="w-3.5 h-3.5" />}>
            <div className="flex items-start gap-4">
              {/* Preview */}
              <div className="relative shrink-0">
                {displayPhoto ? (
                  <>
                    <img
                      src={displayPhoto}
                      alt="Profile"
                      className="w-24 h-32 object-cover object-top rounded-xl border-2 border-border"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-white rounded-full flex items-center justify-center shadow hover:bg-destructive/80 transition-colors"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <div className="w-24 h-32 rounded-xl bg-primary/10 border-2 border-dashed border-primary/30 flex flex-col items-center justify-center gap-1 text-primary/50">
                    <Camera className="w-6 h-6" />
                    <span className="text-xs">No photo</span>
                  </div>
                )}
              </div>

              {/* Upload controls */}
              <div className="flex-1 space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Portrait photo (3:4 ratio). Image will be auto-cropped and resized to 480×640px.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {displayPhoto ? "Change Photo" : "Upload Photo"}
                </Button>
                {photoFile && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    New photo ready to save
                  </p>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>
          </Section>

          {/* ── Branch ────────────────────────────────────────────────────── */}
          <Section label="Branch Assignment" icon={<Building2 className="w-3.5 h-3.5" />}>
            <Field label="Assigned Branch *">
              <Select
                value={form.branchId}
                onValueChange={(v) => setForm((prev) => ({ ...prev, branchId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch…" />
                </SelectTrigger>
                <SelectContent>
                  {(branches ?? []).map((b) => (
                    <SelectItem key={b._id} value={b._id}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          {/* ── Personal ──────────────────────────────────────────────────── */}
          <Section label="Personal Details" icon={<User className="w-3.5 h-3.5" />}>
            <Field label="Full Name *">
              <Input placeholder="John Mensah" {...field("fullName")} />
            </Field>
            <Field label="Phone Number *">
              <Input placeholder="+233 XX XXX XXXX" {...field("phone")} />
            </Field>
            <Field label="Home Address *">
              <Input placeholder="House number, street, area" {...field("address")} />
            </Field>
          </Section>

          {/* ── Vehicle ───────────────────────────────────────────────────── */}
          <Section label="Vehicle Details" icon={<Car className="w-3.5 h-3.5" />}>
            <Field label="Vehicle Type *">
              <Input placeholder="e.g. Trotro, Taxi, Cargo" {...field("vehicleType")} />
            </Field>
            <Field label="Plate Number *">
              <Input placeholder="e.g. GR-1234-22" {...field("vehiclePlate")} />
            </Field>
          </Section>

          {/* ── GPS ───────────────────────────────────────────────────────── */}
          <Section label="GPS Location" icon={<MapPin className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude *">
                <Input placeholder="5.56320" {...field("gpsLatitude")} type="number" step="any" />
              </Field>
              <Field label="Longitude *">
                <Input placeholder="-0.19690" {...field("gpsLongitude")} type="number" step="any" />
              </Field>
            </div>
            <Field label="GPS Address (optional)">
              <Input placeholder="Resolved address or landmark" {...field("gpsAddress")} />
            </Field>
          </Section>

          {/* ── Witness ───────────────────────────────────────────────────── */}
          <Section label="Witness" icon={<Phone className="w-3.5 h-3.5" />}>
            <Field label="Witness Name">
              <Input placeholder="Witness full name" {...field("witnessName")} />
            </Field>
            <Field label="Witness Phone">
              <Input placeholder="+233 XX XXX XXXX" {...field("witnessPhone")} />
            </Field>
          </Section>

          {/* ── Notes ─────────────────────────────────────────────────────── */}
          <Section label="Notes" icon={<FileText className="w-3.5 h-3.5" />}>
            <Field label="Internal Notes (optional)">
              <Textarea
                placeholder="Any additional notes about this customer..."
                rows={3}
                {...field("notes")}
              />
            </Field>
          </Section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, icon, children }: {
  label: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
