import { Ui } from '../../i18n/Ui';
import { CalendarDays, Check, ChevronDown, ChevronRight, Circle, X } from 'lucide-react'
import { useState } from 'react'
import type { TimeTreeResponse } from '../../lib/types'

export type ManagementRange = {
  startDate: string
  endDate: string
  label: string
}

type Props = {
  data: TimeTreeResponse
  selectedLabel: string | null
  onSelect: (start: string, end: string, label: string) => void
  onClear?: () => void
  managementRange: ManagementRange | null
  onManagementRangeChange: (range: ManagementRange | null) => void
}

function ManagementControl({ range, selected, onSelect }: {
  range: ManagementRange
  selected: boolean
  onSelect: (range: ManagementRange) => void
}) {
  return <Ui as="button"
    className={`time-manage-select${selected ? ' selected' : ''}`}
    type="button"
    aria-label={`选择${range.label}作为操作范围`}
    aria-pressed={selected}
    onClick={() => onSelect(range)}
  >{selected ? <Check size={11} /> : <Circle size={11} />}</Ui>
}

function matches(left: ManagementRange | null, right: ManagementRange) {
  return left?.startDate === right.startDate && left.endDate === right.endDate
}

export function TimeTree({ data, selectedLabel, onSelect, onClear, managementRange, onManagementRangeChange }: Props) {
  const firstYear = data.years[0]
  const firstMonth = firstYear?.months[0]
  const [openYears, setOpenYears] = useState(() => new Set(firstYear ? [firstYear.year] : []))
  const [openMonths, setOpenMonths] = useState(() => new Set(firstYear && firstMonth ? [`${firstYear.year}-${firstMonth.month}`] : []))
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(() => new Set())
  const toggle = <T,>(source: Set<T>, value: T, setter: (next: Set<T>) => void) => {
    const next = new Set(source)
    if (next.has(value)) next.delete(value); else next.add(value)
    setter(next)
  }
  return <Ui as="aside" className="time-tree" aria-label="发布时间导航">
    <Ui as="div" className="time-tree-heading"><Ui as="div"><CalendarDays size={17} /><Ui as="strong">发布时间</Ui></Ui>{selectedLabel && onClear ? <Ui as="button" type="button" onClick={onClear} aria-label="清除时间筛选"><X size={15} /></Ui> : null}</Ui>
    {selectedLabel ? <Ui as="p" className="time-selection">筛选：{selectedLabel}</Ui> : null}
    {managementRange ? <Ui as="div" className="management-selection"><Ui as="span">待操作：{managementRange.label}</Ui><Ui as="button" type="button" aria-label="清除待操作范围" onClick={() => onManagementRangeChange(null)}><X size={12} /></Ui></Ui> : null}
    <Ui as="div" className="time-tree-scroll">{data.years.map((year) => {
      const yearOpen = openYears.has(year.year)
      const yearRange = { startDate: `${year.year}-01-01`, endDate: `${year.year}-12-31`, label: `${year.year}年` }
      return <Ui as="div" className="time-node year-node" key={year.year}>
        <Ui as="div" className="time-node-row"><Ui as="button" className="time-node-main" type="button" aria-label={`${year.year}年，${year.count}篇`} onClick={() => { toggle(openYears, year.year, setOpenYears); onSelect(yearRange.startDate, yearRange.endDate, yearRange.label) }}>{yearOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<Ui as="span">{year.year}年</Ui><Ui as="small">{year.count}</Ui></Ui><ManagementControl range={yearRange} selected={matches(managementRange, yearRange)} onSelect={onManagementRangeChange} /></Ui>
        {yearOpen ? <Ui as="div" className="time-children">{year.months.map((month) => {
          const monthKey = `${year.year}-${month.month}`
          const monthOpen = openMonths.has(monthKey)
          const start = `${year.year}-${String(month.month).padStart(2, '0')}-01`
          const end = new Date(Date.UTC(year.year, month.month, 0)).toISOString().slice(0, 10)
          const monthRange = { startDate: start, endDate: end, label: `${year.year}年${month.month}月` }
          return <Ui as="div" className="time-node month-node" key={monthKey}>
            <Ui as="div" className="time-node-row"><Ui as="button" className="time-node-main" type="button" aria-label={`${month.month}月，${month.count}篇`} onClick={() => { toggle(openMonths, monthKey, setOpenMonths); onSelect(start, end, monthRange.label) }}>{monthOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Ui as="span">{month.month}月</Ui><Ui as="small">{month.count}</Ui></Ui><ManagementControl range={monthRange} selected={matches(managementRange, monthRange)} onSelect={onManagementRangeChange} /></Ui>
            {monthOpen ? <Ui as="div" className="time-children">{month.weeks.map((week) => {
              const weekKey = `${week.iso_year}-${week.week}`
              const weekOpen = openWeeks.has(weekKey)
              const weekRange = { startDate: week.start_date, endDate: week.end_date, label: week.label }
              return <Ui as="div" className="time-node week-node" key={weekKey}>
                <Ui as="div" className="time-node-row"><Ui as="button" className="time-node-main" type="button" aria-label={`${week.label}，${week.count}篇`} onClick={() => { toggle(openWeeks, weekKey, setOpenWeeks); onSelect(week.start_date, week.end_date, week.label) }}>{weekOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Ui as="span">{week.label}</Ui><Ui as="small">{week.count}</Ui></Ui><ManagementControl range={weekRange} selected={matches(managementRange, weekRange)} onSelect={onManagementRangeChange} /></Ui>
                {weekOpen ? <Ui as="div" className="time-children">{week.days.map((day) => {
                  const local = new Date(`${day.date}T00:00:00`)
                  const label = `${local.getMonth() + 1}月${local.getDate()}日`
                  const fullLabel = `${local.getFullYear()}年${label}`
                  const dayRange = { startDate: day.date, endDate: day.date, label: fullLabel }
                  return <Ui as="div" className="time-node-row day-row" key={day.date}><Ui as="button" className="day-node time-node-main" type="button" aria-label={`${label}，${day.count}篇`} onClick={() => onSelect(day.date, day.date, fullLabel)}><Ui as="span">{label}</Ui><Ui as="small">{day.count}</Ui></Ui><ManagementControl range={dayRange} selected={matches(managementRange, dayRange)} onSelect={onManagementRangeChange} /></Ui>
                })}</Ui> : null}
              </Ui>
            })}</Ui> : null}
          </Ui>
        })}</Ui> : null}
      </Ui>
    })}</Ui>
  </Ui>
}
