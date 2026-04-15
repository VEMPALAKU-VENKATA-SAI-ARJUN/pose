import { useState } from "react";
import { Target, Bone, User, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DIFFICULTY_COLOR = {
  beginner:     { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  intermediate: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
  advanced:     { bg: "#fff1f2", color: "#be123c", border: "#fecdd3" },
};

const GENDER_ICON = {
  male:    <User size={11} />,
  female:  <User size={11} />,
  neutral: <Users size={11} />,
};

export default function PoseCard({ pose, onClick }) {
  const [imgError, setImgError] = useState(false);
  const navigate = useNavigate();

  const diff = DIFFICULTY_COLOR[pose.difficulty] || DIFFICULTY_COLOR.beginner;

  const handleAction = (e, path) => {
    e.stopPropagation();
    // Persist to localStorage so the pose survives a page refresh
    localStorage.setItem("selectedPose", JSON.stringify(pose));
    // Pass via router state (primary) — instant, no serialisation overhead
    navigate(path, { state: { pose } });
  };

  return (
    <article
      className="pl-card"
      onClick={() => onClick(pose)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick(pose)}
    >
      <div className="pl-card-img-wrap">
        {imgError ? (
          <div className="pl-card-img-fallback"><span>🧍</span></div>
        ) : (
          <img
            src={pose.imageUrl}
            alt={pose.title}
            className="pl-card-img"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
        <span className="pl-card-gender" data-gender={pose.gender}>
          {GENDER_ICON[pose.gender]}
          {pose.gender}
        </span>
      </div>

      <div className="pl-card-body">
        <p className="pl-card-title">{pose.title}</p>

        <div className="pl-card-meta">
          <span
            className="pl-card-diff"
            style={{ background: diff.bg, color: diff.color, border: `1px solid ${diff.border}` }}
          >
            {pose.difficulty}
          </span>
          {pose.cameraAngle && (
            <span className="pl-card-angle">{pose.cameraAngle}</span>
          )}
        </div>

        {pose.tags?.length > 0 && (
          <div className="pl-card-tags">
            {pose.tags.slice(0, 3).map(t => (
              <span key={t} className="pl-tag">#{t}</span>
            ))}
          </div>
        )}

        <div className="pl-card-actions">
          <button
            className="pl-action-btn"
            title="Open in Practice Mode"
            onClick={e => handleAction(e, "/practice")}
          >
            <Target size={13} /> Practice
          </button>
          <button
            className="pl-action-btn"
            title="Open in Anatomy Breakdown"
            onClick={e => handleAction(e, "/anatomy")}
          >
            <Bone size={13} /> Anatomy
          </button>
        </div>
      </div>
    </article>
  );
}
