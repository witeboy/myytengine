import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

export default function VoiceSelector({ voices, selectedVoice, onVoiceSelect, onGenerateAudio, isGenerating, isChecking }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice Selection & Audio Generation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Select Voice</label>
          <Select value={selectedVoice || ''} onValueChange={onVoiceSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a voice..." />
            </SelectTrigger>
            <SelectContent>
              {voices.map(voice => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name} - {voice.accent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onGenerateAudio}
          disabled={!selectedVoice || isGenerating || isChecking}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {isGenerating || isChecking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {isGenerating ? 'Generating Audio...' : 'Checking status...'}
            </>
          ) : (
            'Generate Voiceover Audio'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}