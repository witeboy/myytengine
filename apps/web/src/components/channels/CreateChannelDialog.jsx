import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { getAllNiches, getNicheDefaults } from './NicheCard';

export default function CreateChannelDialog({ open, onOpenChange, onCreated }) {
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [shortsPerDay, setShortsPerDay] = useState(5);
  const [longformPerWeek, setLongformPerWeek] = useState(3);
  const [creating, setCreating] = useState(false);
  const niches = getAllNiches();

  const handleCreate = async () => {
    if (!name.trim() || !niche) return;
    setCreating(true);
    const defaults = getNicheDefaults(niche);
    const channel = await base44.entities.Channels.create({
      name: name.trim(),
      niche,
      niche_label: defaults.label,
      icon_emoji: defaults.emoji,
      color: defaults.color,
      shorts_per_day: shortsPerDay,
      longform_per_week: longformPerWeek,
      short_form_word_limit: 200,
      long_form_duration_minutes: 15,
      status: 'active',
    });

    // Fire-and-forget niche strategy research
    base44.functions.invoke('researchNicheStrategy', { channel_id: channel.id }).catch(() => {});

    setCreating(false);
    setName('');
    setNiche('');
    onOpenChange(false);
    onCreated?.(channel);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create YouTube Channel</DialogTitle>
          <DialogDescription>Set up a new channel with niche, name, and posting schedule.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Channel Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Money Mindset TV"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Niche</Label>
            <Select value={niche} onValueChange={setNiche}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a niche..." />
              </SelectTrigger>
              <SelectContent>
                {niches.map(n => (
                  <SelectItem key={n.key} value={n.key}>
                    {n.emoji} {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Shorts / Day</Label>
              <Input
                type="number" min={0} max={20}
                value={shortsPerDay}
                onChange={e => setShortsPerDay(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Long-form / Week</Label>
              <Input
                type="number" min={0} max={14}
                value={longformPerWeek}
                onChange={e => setLongformPerWeek(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim() || !niche} className="bg-blue-600 hover:bg-blue-700">
            {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Create Channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}