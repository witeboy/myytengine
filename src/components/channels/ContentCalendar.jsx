import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ContentCalendar({ topics, channel, onDateClick }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const days = useMemo(() => getMonthDays(year, month), [year, month]);

  const topicsByDate = useMemo(() => {
    const map = {};
    (topics || []).forEach(t => {
      if (t.scheduled_date) {
        if (!map[t.scheduled_date]) map[t.scheduled_date] = [];
        map[t.scheduled_date].push(t);
      }
    });
    return map;
  }, [topics]);

  const goBack = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const goForward = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={goBack}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-lg font-bold text-gray-800">{MONTHS[month]} {year}</h3>
        <Button variant="ghost" size="icon" onClick={goForward}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-[10px] font-semibold text-gray-400 text-center py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} />;
          const dateStr = formatDate(year, month, day);
          const dayTopics = topicsByDate[dateStr] || [];
          const shorts = dayTopics.filter(t => t.format === 'short');
          const longs = dayTopics.filter(t => t.format === 'long');
          const isToday = dateStr === todayStr;
          const hasContent = dayTopics.length > 0;

          return (
            <button
              key={day}
              onClick={() => onDateClick?.(dateStr)}
              className={`min-h-[80px] rounded-lg border p-1.5 text-left transition-all hover:shadow-md hover:border-blue-300 ${
                isToday ? 'border-blue-500 bg-blue-50/50' : hasContent ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/50'
              }`}
            >
              <span className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>{day}</span>
              <div className="mt-1 space-y-0.5">
                {shorts.length > 0 && (
                  <Badge className="text-[8px] px-1 py-0 bg-amber-100 text-amber-700 w-full justify-center cursor-pointer hover:bg-amber-200"
                    onClick={(e) => { e.stopPropagation(); onDateClick?.(dateStr); }}>
                    {shorts.length}S
                  </Badge>
                )}
                {longs.length > 0 && (
                  <Badge className="text-[8px] px-1 py-0 bg-purple-100 text-purple-700 w-full justify-center cursor-pointer hover:bg-purple-200"
                    onClick={(e) => { e.stopPropagation(); onDateClick?.(dateStr); }}>
                    {longs.length}L
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-amber-400" /> Short-form
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-purple-400" /> Long-form
        </span>
        <span className="ml-auto">{channel?.shorts_per_day || 5} shorts/day · {channel?.longform_per_week || 3} long/week</span>
      </div>
    </div>
  );
}