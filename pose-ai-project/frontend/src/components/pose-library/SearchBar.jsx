import { Search, X } from "lucide-react";

export default function SearchBar({ value, onChange }) {
  return (
    <div className="pl-search-wrap">
      <Search size={15} className="pl-search-icon" />
      <input
        className="pl-search-input"
        type="text"
        placeholder="Search poses, tags, categories…"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button className="pl-search-clear" onClick={() => onChange("")} aria-label="Clear search">
          <X size={13} />
        </button>
      )}
    </div>
  );
}
