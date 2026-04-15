import { SlidersHorizontal, RotateCcw } from "lucide-react";

const CATEGORIES = ["standing", "sitting", "walking", "running", "jumping", "interaction", "environment"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const GENDERS = [
  { value: "all",    label: "All" },
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" },
  { value: "neutral",label: "Neutral" },
];
const ANGLES = ["front", "side", "top", "low"];
const BODY_TYPES = [
  { value: "any",      label: "Any" },
  { value: "slim",     label: "Slim" },
  { value: "muscular", label: "Muscular" },
  { value: "heavy",    label: "Heavy" },
];

function FilterGroup({ label, children }) {
  return (
    <div className="pl-filter-group">
      <p className="pl-filter-label">{label}</p>
      {children}
    </div>
  );
}

function ChipSet({ options, value, onChange }) {
  return (
    <div className="pl-chips">
      {options.map(opt => {
        const v = typeof opt === "string" ? opt : opt.value;
        const l = typeof opt === "string" ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt.label;
        return (
          <button
            key={v}
            className={`pl-chip${value === v ? " active" : ""}`}
            onClick={() => onChange(value === v ? "" : v)}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

export default function FilterSidebar({ filters, onChange, onReset }) {
  const set = (key) => (val) => onChange({ ...filters, [key]: val });

  return (
    <aside className="pl-sidebar">
      <div className="pl-sidebar-header">
        <SlidersHorizontal size={15} />
        <span>Filters</span>
        <button className="pl-reset-btn" onClick={onReset} title="Reset filters">
          <RotateCcw size={13} />
        </button>
      </div>

      <FilterGroup label="Gender">
        <ChipSet options={GENDERS} value={filters.gender} onChange={set("gender")} />
      </FilterGroup>

      <FilterGroup label="Category">
        <ChipSet options={CATEGORIES} value={filters.category} onChange={set("category")} />
      </FilterGroup>

      <FilterGroup label="Difficulty">
        <ChipSet options={DIFFICULTIES} value={filters.difficulty} onChange={set("difficulty")} />
      </FilterGroup>

      <FilterGroup label="Camera Angle">
        <ChipSet options={ANGLES} value={filters.cameraAngle} onChange={set("cameraAngle")} />
      </FilterGroup>

      <FilterGroup label="Body Type">
        <ChipSet options={BODY_TYPES} value={filters.bodyType} onChange={set("bodyType")} />
      </FilterGroup>
    </aside>
  );
}
