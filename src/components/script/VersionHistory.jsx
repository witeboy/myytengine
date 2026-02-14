import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, Eye } from 'lucide-react';
import { format } from 'date-fns';

export default function VersionHistory({ scripts, currentScriptId, onSelect }) {
  // Only show if there are edited versions (more than one script)
  if (!scripts || scripts.length <= 1) return null;

  const sorted = [...scripts].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
  // Show max 10 most recent versions
  const display = sorted.slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4" /> Version History ({sorted.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {display.map((script, idx) => (
            <div
              key={script.id}
              className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
                script.id === currentScriptId ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Badge variant={script.id === currentScriptId ? 'default' : 'outline'} className="text-xs">
                  {script.version}
                </Badge>
                <div>
                  <p className="font-medium">{idx === 0 ? 'Current' : `v${sorted.length - idx}`}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(script.created_date), 'MMM d, h:mm a')} · {script.word_count?.toLocaleString()} words
                  </p>
                </div>
              </div>
              {script.id !== currentScriptId && (
                <Button variant="ghost" size="sm" onClick={() => onSelect(script)}>
                  <Eye className="w-3.5 h-3.5 mr-1" /> View
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}