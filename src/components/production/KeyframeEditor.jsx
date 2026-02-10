import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Film } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function KeyframeEditor({ 
  blockId, 
  keyframes = [], 
  blockDuration,
  onKeyframesChange 
}) {
  const [selectedProperty, setSelectedProperty] = useState('opacity');
  const [keyframeTime, setKeyframeTime] = useState(0);
  const [keyframeValue, setKeyframeValue] = useState(1);

  const parsedKeyframes = typeof keyframes === 'string' ? 
    (keyframes ? JSON.parse(keyframes) : []) : 
    (keyframes || []);

  const handleAddKeyframe = () => {
    const newKeyframe = {
      time: Math.min(keyframeTime, blockDuration),
      property: selectedProperty,
      value: selectedProperty === 'opacity' ? 
        Math.max(0, Math.min(1, keyframeValue)) :
        keyframeValue
    };

    const updated = [...parsedKeyframes, newKeyframe].sort((a, b) => a.time - b.time);
    onKeyframesChange(JSON.stringify(updated));
  };

  const handleRemoveKeyframe = (index) => {
    const updated = parsedKeyframes.filter((_, i) => i !== index);
    onKeyframesChange(JSON.stringify(updated));
  };

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-purple-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="w-5 h-5" />
          Keyframe Animation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Keyframe Controls */}
        <div className="space-y-3 bg-white p-4 rounded-lg border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1">Property</label>
              <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opacity">Opacity</SelectItem>
                  <SelectItem value="scale">Scale</SelectItem>
                  <SelectItem value="position">Position</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Time (s)</label>
              <Input
                type="number"
                min="0"
                max={blockDuration}
                value={keyframeTime}
                onChange={(e) => setKeyframeTime(Number(e.target.value))}
                className="text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">
              {selectedProperty === 'opacity' ? 'Opacity (0-1)' : 'Value'}
            </label>
            <Input
              type="number"
              min={selectedProperty === 'opacity' ? 0 : -10}
              max={selectedProperty === 'opacity' ? 1 : 10}
              step="0.1"
              value={keyframeValue}
              onChange={(e) => setKeyframeValue(Number(e.target.value))}
              className="text-sm"
            />
          </div>

          <Button
            onClick={handleAddKeyframe}
            className="w-full bg-blue-600 hover:bg-blue-700"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Keyframe
          </Button>
        </div>

        {/* Keyframe List */}
        {parsedKeyframes.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Keyframes ({parsedKeyframes.length})</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {parsedKeyframes.map((kf, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-white p-2 rounded border text-xs"
                >
                  <span>
                    <strong>{kf.time.toFixed(1)}s</strong> - {kf.property}: {
                      typeof kf.value === 'number' ? kf.value.toFixed(2) : JSON.stringify(kf.value)
                    }
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => handleRemoveKeyframe(idx)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {parsedKeyframes.length === 0 && (
          <p className="text-xs text-gray-500 text-center py-4">No keyframes added yet</p>
        )}
      </CardContent>
    </Card>
  );
}