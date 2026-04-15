/**
 * PoseLibrary.jsx — Static Pose Library Mode
 * Uses local poseLibraryData.js (images from /public/pose-library/).
 * All filtering and search is done client-side — no backend required.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, X } from "lucide-react";
import poseLibraryData from "../../data/poseLibraryData";
import SearchBar from "./SearchBar";
import FilterSidebar from "./FilterSidebar";
import PoseCard from "./PoseCard";
import "./PoseLibrary.css";

const DEFAULT_FILTERS = {
  gender: "", category: "", difficulty: "", cameraAngle: "", bodyType: "",
};

const PAGE_SIZE = 24;

// ── Client-side filter + search ───────────────────────────────────────────────
function applyFilters(data, filters, query) {
  let result = data;

  if (filters.gender && filters.gender !== "all") {
    if (filters.gender === "male")
      result = result.filter(p => p.gender === "male"   || p.gender === "neutral");
    else if (filters.gender === "female")
      result = result.filter(p => p.gender === "female" || p.gender === "neutral");
    else
      result = result.filter(p => p.gender === filters.gender);
  }

  if (filters.category)
    result = result.filter(p => p.category === filters.category);

  if (filters.difficulty)
    result = result.filter(p => p.difficulty === filters.difficulty);

  if (filters.cameraAngle)
    result = result.filter(p => p.cameraAngle === filters.cameraAngle);

  if (filters.bodyType && filters.bodyType !== "any")
    result = result.filter(p => p.bodyType === filters.bodyType || p.bodyType === "any");

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  return result;
}

// ── Similar poses (shared tags) ───────────────────────────────────────────────
function getSimilar(pose, all) {
  return all
    .filter(p => p.id !== pose.id && p.tags.some(t => pose.tags.includes(t)))
    .slice(0, 4);
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function PoseDetailModal({ pose, onClose }) {
  const navigate = useNavigate();
  const similar = useMemo(() => getSimilar(pose, poseLibraryData), [pose]);

  const goTo = (path) => {
    localStorage.setItem("selectedPose", JSON.stringify(pose));
    navigate(path, { state: { pose } });
  };

  // Close on Escape
  useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div className="pl-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={pose.title}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <button className="pl-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="pl-modal-inner">
          <div className="pl-modal-img-wrap">
            <img src={pose.imageUrl} alt={pose.title} className="pl-modal-img"
              onError={e => { e.target.style.display = "none"; }} />
          </div>
          <div className="pl-modal-info">
            <h2 className="pl-modal-title">{pose.title}</h2>
            <div className="pl-modal-badges">
              <span className="pl-badge pl-badge-gender" data-gender={pose.gender}>{pose.gender}</span>
              <span className="pl-badge pl-badge-diff">{pose.difficulty}</span>
              {pose.cameraAngle && <span className="pl-badge pl-badge-angle">{pose.cameraAngle}</span>}
              {pose.category    && <span className="pl-badge pl-badge-cat">{pose.category}</span>}
            </div>
            {pose.tags?.length > 0 && (
              <div className="pl-modal-tags">
                {pose.tags.map(t => <span key={t} className="pl-tag">#{t}</span>)}
              </div>
            )}
            <div className="pl-modal-actions">
              <button className="pl-modal-btn primary" onClick={() => goTo("/practice")}>
                Practice
              </button>
              <button className="pl-modal-btn" onClick={() => goTo("/anatomy")}>
                Anatomy Breakdown
              </button>
            </div>
            {similar.length > 0 && (
              <div className="pl-modal-similar">
                <p className="pl-filter-label">Similar Poses</p>
                <div className="pl-similar-grid">
                  {similar.map(s => (
                    <img key={s.id} src={s.imageUrl} alt={s.title} className="pl-similar-thumb"
                      title={s.title} onClick={() => onClose(s)}
                      onError={e => { e.target.style.display = "none"; }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PoseLibrary() {
  const [filters,     setFilters]     = useState(DEFAULT_FILTERS);
  const [query,       setQuery]       = useState("");
  const [debouncedQ,  setDebouncedQ]  = useState("");
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const debounceRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [filters]);

  const filtered = useMemo(
    () => applyFilters(poseLibraryData, filters, debouncedQ),
    [filters, debouncedQ]
  );

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (query ? 1 : 0);

  // Handle clicking a similar pose in the modal
  const handleModalClose = (nextPose) => {
    if (nextPose && nextPose.id) setSelected(nextPose);
    else setSelected(null);
  };

  return (
    <div className="pl-root">
      {/* Navbar */}
      <nav className="pl-nav">
        <Link to="/" className="pl-nav-back"><ArrowLeft size={16} /> Dashboard</Link>
        <div className="pl-nav-title">
          <BookOpen size={18} />
         Pose <span className="pl-title"> Library</span>
        </div>
        <span className="pl-nav-count">{filtered.length} / {poseLibraryData.length} poses</span>
      </nav>

      <div className="pl-layout">
        {/* Sidebar overlay backdrop on mobile */}
        {sidebarOpen && (
          <div className="pl-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        )}

        <div className={`pl-sidebar-wrap${sidebarOpen ? " open" : ""}`}>
          <FilterSidebar filters={filters} onChange={setFilters} onReset={resetFilters} />
        </div>

        <main className="pl-main">
          <div className="pl-toolbar">
            <SearchBar value={query} onChange={setQuery} />
            <button
              className={`pl-filter-toggle${activeFilterCount ? " has-filters" : ""}`}
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle filters"
            >
              Filters {activeFilterCount > 0 && <span className="pl-filter-badge">{activeFilterCount}</span>}
            </button>
          </div>

          {filtered.length === 0 && (
            <div className="pl-empty">
              <span>🔍</span>
              <p>No poses match your filters.</p>
              <button className="pl-reset-link" onClick={resetFilters}>Clear filters</button>
            </div>
          )}

          <div className="pl-grid">
            {visible.map(pose => (
              <PoseCard key={pose.id} pose={pose} onClick={setSelected} />
            ))}
          </div>

          {hasMore && (
            <div className="pl-load-more">
              <button className="pl-load-btn" onClick={() => setPage(p => p + 1)}>
                Load more ({filtered.length - visible.length} remaining)
              </button>
            </div>
          )}
        </main>
      </div>

      {selected && (
        <PoseDetailModal pose={selected} onClose={handleModalClose} />
      )}
    </div>
  );
}
