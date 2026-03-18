import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Pencil, Check, X } from 'lucide-react';

export default function EditableTopicTitle({ topic, onUpdated, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(topic.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === topic.title) {
      setValue(topic.title);
      setEditing(false);
      return;
    }
    await base44.entities.ChannelTopics.update(topic.id, { title: trimmed });
    // Also update the project name if one exists
    if (topic.project_id) {
      try { await base44.entities.Projects.update(topic.project_id, { name: trimmed }); } catch (_) {}
    }
    setEditing(false);
    onUpdated?.();
  };

  const cancel = () => {
    setValue(topic.title);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          onBlur={save}
          className="flex-1 min-w-0 text-sm border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
        />
        <button onClick={save} className="p-0.5 rounded hover:bg-green-100 text-green-600 flex-shrink-0">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={cancel} className="p-0.5 rounded hover:bg-red-100 text-red-600 flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 flex-1 min-w-0 group/title ${className}`}>
      <span className="text-sm text-gray-800 truncate">{topic.title}</span>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="p-0.5 rounded hover:bg-gray-200 text-gray-400 opacity-0 group-hover/title:opacity-100 transition-opacity flex-shrink-0"
        title="Edit title"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}