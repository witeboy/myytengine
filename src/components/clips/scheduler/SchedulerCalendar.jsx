import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';

const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const STATUS_COLORS = {
  scheduled: 'bg-blue-500',
  publishing: 'bg-amber-500',
  published: 'bg-emerald-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-300',
  ready_to_post: 'bg-purple-500',
};

export default function SchedulerCalendar({ posts, onDayClick, selectedDate }) {
  const [viewDate, setViewDate] = useState(() => {
    if (posts.length > 0) return new Date(posts[0].scheduled_at);
    return new Date();
  });

  // Map of "YYYY-MM-DD" -> posts[]
  const postsByDay = useMemo(() => {
    const map = {};
    posts.forEach((p) => {
      if (!p.scheduled_at) return;
      const d = new Date(p.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [posts]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const selectedKey = selectedDate
    ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`
    : null;

  const goPrev = () => setViewDate(new Date(year, month - 1, 1));
  const goNext = () => setViewDate(new Date(year, month + 1, 1));
  const goToday = () => setViewDate(new Date());

  // Build cells (empty leading cells + days)
  const cells = [];
  for (let i = 0; i < startDayOfWeek; i++) cells.push({ empty: true, key: `empty-${i}` });
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`;
    const dayPosts = postsByDay[key] || [];
    cells.push({
      day,
      key,
      posts: dayPosts,
      isToday: key === todayKey,
      isSelected: key === selectedKey,
      date: new Date(year, month, day),
    });
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[120px] text-center">{monthName}</span>
          <button onClick={goNext} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={goToday}
          className="text-[10px] uppercase tracking-wider font-medium text-gray-500 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
        >
          Today
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {DAYS_OF_WEEK.map((d, i) => (
          <div key={i} className="text-[10px] text-center font-medium text-gray-400 uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1 p-2">
        {cells.map((cell) => {
          if (cell.empty) return <div key={cell.key} className="aspect-square" />;

          const hasClips = cell.posts.length > 0;
          const topClip = cell.posts[0];

          return (
            <button
              key={cell.key}
              onClick={() => hasClips && onDayClick(cell.date)}
              disabled={!hasClips}
              className={`
                aspect-square rounded-lg relative flex flex-col items-center justify-start p-1.5 transition-all
                ${cell.isSelected
                  ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1'
                  : cell.isToday
                    ? 'bg-blue-50 border border-blue-300'
                    : hasClips
                      ? 'hover:bg-gray-100 border border-gray-100 cursor-pointer'
                      : 'border border-transparent cursor-default'}
              `}
            >
              <span className={`text-xs font-medium ${cell.isSelected ? 'text-white' : cell.isToday ? 'text-blue-700 font-bold' : 'text-gray-700'}`}>
                {cell.day}
              </span>

              {hasClips && (
                <>
                  {/* Dot indicators per clip (max 4) */}
                  <div className="flex gap-0.5 mt-auto mb-0.5 flex-wrap justify-center">
                    {cell.posts.slice(0, 4).map((p, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[p.status] || 'bg-gray-400'}`}
                      />
                    ))}
                  </div>

                  {/* Clip count badge */}
                  <div className={`absolute top-0.5 right-0.5 text-[8px] font-bold px-1 rounded ${
                    cell.isSelected ? 'bg-white text-gray-900' : 'bg-gray-900 text-white'
                  }`}>
                    {cell.posts.length}
                  </div>

                  {/* Virality flame for hot days */}
                  {topClip.virality_score >= 85 && (
                    <Flame className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 ${cell.isSelected ? 'text-orange-300' : 'text-orange-500'}`} />
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-gray-100 text-[10px] text-gray-500">
        <span className="font-medium uppercase tracking-wider">Legend:</span>
        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" />Scheduled</span>
        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" />Publishing</span>
        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Published</span>
        <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500" />Failed</span>
      </div>
    </div>
  );
}