import React from 'react';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';

export default function ActGroupHeader({ actName, sceneCount, collapsed, onToggle }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
      onClick={onToggle}
    >
      {collapsed ? (
        <ChevronRight className="w-4 h-4 text-blue-600" />
      ) : (
        <ChevronDown className="w-4 h-4 text-blue-600" />
      )}
      <FolderOpen className="w-4 h-4 text-blue-600" />
      <span className="font-semibold text-sm text-blue-900">{actName}</span>
      <Badge variant="secondary" className="text-xs ml-auto">
        {sceneCount} scene{sceneCount !== 1 ? 's' : ''}
      </Badge>
    </div>
  );
}