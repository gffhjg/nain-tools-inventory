import React from 'react';
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Globe,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import {
  type PeriodFilter,
  type PeriodFilterMode,
  getTodayISO,
  getCurrentMonthISO,
  getCurrentYearISO,
  shiftISODate,
  shiftISOMonth,
  shiftISOYear,
  formatFriendlyDate,
  formatFriendlyMonth,
  getPeriodFilterLabel,
  money,
} from '@/utils/analytics';

export interface TimelineFilterProps {
  title?: string;
  entityName?: string;
  entitySingular?: string;
  filter: PeriodFilter;
  onChange: (filter: PeriodFilter) => void;
  count: number;
  total: number;
  allTimeTotal?: number;
  latestDate?: string | null;
  isOpen: boolean;
  onToggleOpen: () => void;
  availableYears?: string[];
  themeColor?: 'brand' | 'indigo';
}

export default function TimelineFilter({
  title = 'Timeline Filter',
  entityName = 'invoices',
  entitySingular = 'invoice',
  filter,
  onChange,
  count,
  total,
  allTimeTotal,
  latestDate,
  isOpen,
  onToggleOpen,
  availableYears,
  themeColor = 'brand',
}: TimelineFilterProps) {
  const today = getTodayISO();
  const currentMonth = getCurrentMonthISO();
  const currentYear = getCurrentYearISO();

  // Generate fallback list of years if not supplied
  const yearOptions = React.useMemo(() => {
    if (availableYears && availableYears.length > 0) return availableYears;
    const list: string[] = [];
    const curY = parseInt(currentYear, 10);
    for (let y = curY; y >= curY - 5; y--) {
      list.push(String(y));
    }
    return list;
  }, [availableYears, currentYear]);

  const activeLabel = getPeriodFilterLabel(filter);

  const handleModeChange = (mode: PeriodFilterMode) => {
    onChange({
      ...filter,
      mode,
      date: filter.date || today,
      month: filter.month || currentMonth,
      year: filter.year || currentYear,
    });
  };

  const handleDateChange = (newDate: string) => {
    onChange({
      ...filter,
      mode: 'date',
      date: newDate,
    });
  };

  const handleMonthChange = (newMonth: string) => {
    onChange({
      ...filter,
      mode: 'month',
      month: newMonth,
    });
  };

  const handleYearChange = (newYear: string) => {
    onChange({
      ...filter,
      mode: 'year',
      year: newYear,
    });
  };

  const isTodayActive = filter.mode === 'date' && filter.date === today;
  const isCurrentMonthActive = filter.mode === 'month' && filter.month === currentMonth;
  const isCurrentYearActive = filter.mode === 'year' && filter.year === currentYear;

  const badgeBg = themeColor === 'indigo'
    ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
    : 'bg-brand-100 text-brand-800 border-brand-200';

  const iconBg = themeColor === 'indigo' ? 'bg-indigo-600' : 'bg-brand-600';

  return (
    <div className="w-full">
      {!isOpen ? (
        /* Collapsed Minimalist Bar */
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-xs shadow-2xs gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${iconBg} text-white shadow-2xs`}>
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <span className="font-bold text-xs text-slate-800">
              {title}:
            </span>
            <span className={`px-2.5 py-0.5 rounded-lg font-extrabold text-xs border ${badgeBg}`}>
              {activeLabel}
            </span>
            <span className="text-xs text-slate-500 font-semibold">
              · <strong className="text-slate-800">{count} {entityName}</strong> ({money(total)})
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {filter.mode !== 'all' && (
              <button
                type="button"
                onClick={() => handleModeChange('all')}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-brand-600 hover:bg-slate-100 transition flex items-center gap-1"
                title="Reset to All Time"
              >
                <Globe className="w-3 h-3 text-slate-400" />
                <span>Show All Time</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleOpen}
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition flex items-center gap-1.5 cursor-pointer"
              title="Expand date & timeframe filter"
            >
              <SlidersHorizontal className="w-3 h-3 text-slate-500" />
              <span>Change Date / Period</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>
      ) : (
        /* Expanded Full Filter Panel */
        <div className="rounded-2xl border border-brand-200/90 bg-gradient-to-br from-brand-50/40 via-white to-slate-50/60 p-4 shadow-xs space-y-3.5">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg} text-white shadow-xs shrink-0`}>
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                    {title}
                  </h3>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold border ${badgeBg}`}>
                    {activeLabel}
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-500 font-medium mt-0.5">
                  Filtered to <strong className="text-slate-800">{count} {entityName}</strong> ({money(total)})
                  {allTimeTotal !== undefined && filter.mode !== 'all' && (
                    <span className="text-slate-400 ml-1.5">· All-time: {money(allTimeTotal)}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {filter.mode !== 'all' && (
                <button
                  type="button"
                  onClick={() => handleModeChange('all')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 hover:text-brand-600 hover:bg-white border border-slate-200 transition shadow-2xs flex items-center gap-1"
                >
                  <Globe className="w-3 h-3 text-slate-400" />
                  <span>Show All Time</span>
                </button>
              )}
              <button
                type="button"
                onClick={onToggleOpen}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition shadow-2xs flex items-center gap-1 cursor-pointer"
                title="Collapse filter"
              >
                <span>Collapse</span>
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Segmented Mode Selector: 1. Date | 2. Month | 3. Year | All Time */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="inline-flex rounded-xl p-1 bg-slate-100/90 border border-slate-200/90 text-xs font-bold gap-1 self-start">
              <button
                type="button"
                onClick={() => handleModeChange('date')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  filter.mode === 'date'
                    ? 'bg-brand-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>1. Date (Day)</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('month')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  filter.mode === 'month'
                    ? 'bg-brand-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                <span>2. Month</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('year')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  filter.mode === 'year'
                    ? 'bg-brand-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>3. Year</span>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('all')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  filter.mode === 'all'
                    ? 'bg-slate-800 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>All Time</span>
              </button>
            </div>

            {/* Quick Mode Status / Hint */}
            <div className="text-[11.5px] text-slate-500 font-medium">
              {filter.mode === 'date' && 'Filter by a specific day (type or pick from calendar)'}
              {filter.mode === 'month' && 'Filter by calendar month'}
              {filter.mode === 'year' && 'Filter by calendar / fiscal year'}
              {filter.mode === 'all' && 'Showing entire historical database'}
            </div>
          </div>

          {/* Active Mode Specific Controls Panel */}
          <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-2">
            {/* 1. DATE MODE CONTROLS */}
            {filter.mode === 'date' && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Prev Day */}
                  <button
                    type="button"
                    onClick={() => handleDateChange(shiftISODate(filter.date, -1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                    title="Previous Day"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Date Input with Calendar Picker and Typed Text support */}
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={filter.date}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-brand-600 focus:ring-1 focus:ring-brand-500 shadow-2xs cursor-pointer"
                      title="Click calendar icon or type date in YYYY-MM-DD format"
                    />
                  </div>

                  {/* Next Day */}
                  <button
                    type="button"
                    onClick={() => handleDateChange(shiftISODate(filter.date, 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                    title="Next Day"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Quick Shortcuts */}
                  <div className="flex items-center gap-1.5 ml-1">
                    <button
                      type="button"
                      onClick={() => handleDateChange(today)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                        isTodayActive
                          ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDateChange(shiftISODate(today, -1))}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition"
                    >
                      Yesterday
                    </button>
                    {latestDate && latestDate !== today && latestDate !== filter.date && (
                      <button
                        type="button"
                        onClick={() => handleDateChange(latestDate)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition flex items-center gap-1 shadow-2xs"
                        title="Jump to the most recent recorded invoice in the database"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Jump to Latest ({latestDate})</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-xs font-bold text-slate-700">
                  <span>Viewing: </span>
                  <span className="text-brand-700 underline decoration-brand-300 underline-offset-2">
                    {formatFriendlyDate(filter.date)}
                  </span>
                </div>
              </div>
            )}

            {/* 2. MONTH MODE CONTROLS */}
            {filter.mode === 'month' && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Prev Month */}
                  <button
                    type="button"
                    onClick={() => handleMonthChange(shiftISOMonth(filter.month, -1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Month Input Picker */}
                  <input
                    type="month"
                    value={filter.month}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-brand-600 focus:ring-1 focus:ring-brand-500 shadow-2xs cursor-pointer"
                    title="Select Month and Year"
                  />

                  {/* Next Month */}
                  <button
                    type="button"
                    onClick={() => handleMonthChange(shiftISOMonth(filter.month, 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Quick Shortcut */}
                  <button
                    type="button"
                    onClick={() => handleMonthChange(currentMonth)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                      isCurrentMonthActive
                        ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    This Month
                  </button>
                </div>

                <div className="text-xs font-bold text-slate-700">
                  <span>Month: </span>
                  <span className="text-brand-700 underline decoration-brand-300 underline-offset-2">
                    {formatFriendlyMonth(filter.month)}
                  </span>
                </div>
              </div>
            )}

            {/* 3. YEAR MODE CONTROLS */}
            {filter.mode === 'year' && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Prev Year */}
                  <button
                    type="button"
                    onClick={() => handleYearChange(shiftISOYear(filter.year, -1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                    title="Previous Year"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Year Dropdown */}
                  <select
                    value={filter.year}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-brand-600 focus:ring-1 focus:ring-brand-500 shadow-2xs cursor-pointer"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        Year {y}
                      </option>
                    ))}
                  </select>

                  {/* Next Year */}
                  <button
                    type="button"
                    onClick={() => handleYearChange(shiftISOYear(filter.year, 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                    title="Next Year"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Quick Shortcut */}
                  <button
                    type="button"
                    onClick={() => handleYearChange(currentYear)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                      isCurrentYearActive
                        ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    This Year ({currentYear})
                  </button>
                </div>

                <div className="text-xs font-bold text-slate-700">
                  <span>Year: </span>
                  <span className="text-brand-700 underline decoration-brand-300 underline-offset-2">
                    {filter.year}
                  </span>
                </div>
              </div>
            )}

            {/* 4. ALL TIME MODE CONTROLS */}
            {filter.mode === 'all' && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <Globe className="w-4 h-4 text-brand-600" />
                  <span>Showing all records across all years and dates in your database.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleModeChange('date')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition"
                >
                  Switch back to Today
                </button>
              </div>
            )}
          </div>

          {/* Helpful banner when 0 records match in Date/Month/Year */}
          {filter.mode !== 'all' && count === 0 && (
            <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-900 shadow-2xs">
              <div className="space-y-0.5">
                <p className="font-extrabold text-amber-950 flex items-center gap-1.5">
                  <span>No {entityName} recorded for {activeLabel}.</span>
                </p>
                {latestDate && (
                  <p className="text-[11px] text-amber-800">
                    Your most recent recorded {entitySingular} is on <strong>{latestDate}</strong>.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {latestDate && (
                  <button
                    type="button"
                    onClick={() => handleDateChange(latestDate)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-2xs transition"
                  >
                    View Date ({latestDate})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleModeChange('all')}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border border-amber-300 shadow-2xs transition"
                >
                  Show All Time
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
