import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Save, Loader2, CheckCircle2 } from "lucide-react";

export default function SaveInfluencerTemplate({ open, onClose, config, imageUrl, prompt, influencerType }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.InfluencerTemplates.create({
      name: name || `Influencer ${Date.now()}`,
      gender: config.gender || "female",
      age_range: config.ageRange || "24-30",
      ethnicity: config.ethnicity || "",
      skin_tone: config.skinTone || "medium",
      influencer_type: influencerType || "",
      base_image_url: imageUrl || "",
      base_prompt: prompt || "",
      appearance_notes: notes || "",
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Save className="w-4 h-4" /> Save Influencer Template</DialogTitle>
        </DialogHeader>
        {saved ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="text-sm font-medium">Template saved!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {imageUrl && <img src={imageUrl} alt="Influencer" className="w-24 h-24 rounded-lg object-cover mx-auto border" />}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Template Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dark Skin Beauty Creator" className="h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Appearance Notes (for regeneration)</label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Key features to remember: hairstyle, facial features, distinguishing marks..." className="min-h-[80px]" />
            </div>
          </div>
        )}
        {!saved && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="bg-pink-600 hover:bg-pink-700 gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Template
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}