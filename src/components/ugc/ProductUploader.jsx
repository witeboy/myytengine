import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Upload, Smartphone, Package, X, Loader2, Image as ImageIcon } from "lucide-react";

const HOLD_MODES = [
  { value: "product_review", label: "Holding Product (review style)", desc: "Casually holding a physical product, slightly angled, natural grip" },
  { value: "phone_app", label: "Holding Phone (showing app screen)", desc: "Holding phone toward camera, app screen visible, natural selfie grip" },
  { value: "product_unbox", label: "Unboxing Product", desc: "Mid-unbox, product partially out of packaging, excited expression" },
  { value: "product_table", label: "Product on Table (pointing)", desc: "Product placed on desk/table, creator pointing or gesturing toward it" },
  { value: "none", label: "No Product", desc: "Creator only, no product in frame" },
];

export default function ProductUploader({ holdMode, onHoldModeChange, productImageUrl, onProductImageChange, productDescription, onProductDescriptionChange }) {
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onProductImageChange(file_url);
    setUploading(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-medium text-gray-600 mb-1 block">Product Placement Style</label>
        <Select value={holdMode || "product_review"} onValueChange={onHoldModeChange}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {HOLD_MODES.map(m => (
              <SelectItem key={m.value} value={m.value}>
                <div className="flex items-center gap-2">
                  {m.value === "phone_app" ? <Smartphone className="w-3 h-3" /> : m.value === "none" ? null : <Package className="w-3 h-3" />}
                  {m.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-400 mt-0.5">{HOLD_MODES.find(m => m.value === holdMode)?.desc || ""}</p>
      </div>

      {holdMode !== "none" && (
        <>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              {holdMode === "phone_app" ? "Upload App Screenshot" : "Upload Product Image"} (reference)
            </label>
            <div className="flex items-center gap-2">
              <label className="flex-1 cursor-pointer">
                <div className={`border-2 border-dashed rounded-lg p-3 text-center hover:border-pink-400 transition-colors ${productImageUrl ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                  {uploading ? (
                    <div className="flex items-center justify-center gap-2 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                    </div>
                  ) : productImageUrl ? (
                    <div className="flex items-center justify-center gap-2 text-green-700 text-xs">
                      <ImageIcon className="w-4 h-4" /> Image uploaded ✓
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
                      <Upload className="w-4 h-4" /> Click to upload {holdMode === "phone_app" ? "app screenshot" : "product photo"}
                    </div>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              {productImageUrl && (
                <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={() => onProductImageChange("")}>
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            {productImageUrl && (
              <img src={productImageUrl} alt="Product" className="w-20 h-20 rounded-md object-contain border mt-2 bg-white" />
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              {holdMode === "phone_app" ? "App Name & Description" : "Product Name & Description"}
            </label>
            <Input
              value={productDescription || ""}
              onChange={e => onProductDescriptionChange(e.target.value)}
              placeholder={holdMode === "phone_app" ? "e.g. Fitness tracking app with dark UI, green accent" : "e.g. White wireless earbuds in matte case"}
              className="h-9"
            />
          </div>
        </>
      )}
    </div>
  );
}

export { HOLD_MODES };