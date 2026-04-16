/**
 * PoseQuiz.jsx
 * Quick understanding check — no drawing required.
 *
 * Question types:
 *   1. center_of_gravity — click on the image where CoG is
 *   2. line_of_action    — multiple choice: which curve matches the pose?
 *   3. joint_count       — how many joints are visible?
 *
 * Props:
 *   pose        — pose object { imageUrl, label, tips, … }
 *   onComplete({ score, answers }) — called when all questions answered
 */

import { useState, useRef, useCallback } from "react";
import { CheckCircle, XCircle, ChevronRight, Target, TrendingUp, Eye } from "lucide-react";

// ── Question generators ───────────────────────────────────────────────────────

function makeCogQuestion(pose) {
  return {
    type:    "center_of_gravity",
    prompt:  "Click where you think the centre of gravity is",
    hint:    "The CoG is usually between the hips and shoulders, near the body's mass centre.",
    // Correct zone: normalised rect { x, y, w, h }
    // We use a generous zone so it feels fair
    correctZone: { x: 0.30, y: 0.35, w: 0.40, h: 0.30 },
  };
}

function makeLineOfActionQuestion() {
  // 4 SVG path descriptions — user picks the one that best describes a flowing pose
  const options = [
    { id: "a", label: "S-curve",       desc: "A flowing S-shape from head to feet",   correct: true  },
    { id: "b", label: "Straight line", desc: "A rigid vertical line",                  correct: false },
    { id: "c", label: "C-curve",       desc: "A gentle arc to one side",               correct: false },
    { id: "d", label: "Z-shape",       desc: "Sharp angular zigzag",                   correct: false },
  ];
  // Shuffle
  const shuffled = [...options].sort(() => Math.random() - 0.5);
  return {
    type:    "line_of_action",
    prompt:  "Which line of action best describes a dynamic, flowing pose?",
    hint:    "A good line of action creates visual energy and movement.",
    options: shuffled,
  };
}

function makeJointQuestion() {
  const correct = 13;
  const options = [
    { id: "a", value: 8,       label: "8"  },
    { id: "b", value: correct, label: "13", correct: true },
    { id: "c", value: 17,      label: "17" },
    { id: "d", value: 21,      label: "21" },
  ].sort(() => Math.random() - 0.5);
  return {
    type:    "joint_count",
    prompt:  "How many major joints does the skeleton builder track?",
    hint:    "Count: head, 2 shoulders, 2 elbows, 2 wrists, 2 hips, 2 knees, 2 ankles.",
    options,
    correct,
  };
}

function buildQuestions(pose) {
  return [
    makeCogQuestion(pose),
    makeLineOfActionQuestion(),
    makeJointQuestion(),
  ];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CogQuestion({ question, imageUrl, onAnswer }) {
  const imgRef    = useRef(null);
  const [click,   setClick]   = useState(null);
  const [result,  setResult]  = useState(null); // "correct" | "wrong"

  const handleClick = useCallback((e) => {
    if (result) return;
    const rect = imgRef.current.getBoundingClientRect();
    const nx   = (e.clientX - rect.left)  / rect.width;
    const ny   = (e.clientY - rect.top)   / rect.height;
    setClick({ x: nx, y: ny });

    const { x, y, w, h } = question.correctZone;
    const correct = nx >= x && nx <= x + w && ny >= y && ny <= y + h;
    setResult(correct ? "correct" : "wrong");
    setTimeout(() => onAnswer(correct ? 1 : 0), 900);
  }, [result, question, onAnswer]);

  return (
    <div className="pq-cog-wrap">
      <div
        className="pq-img-container"
        style={{ position: "relative", cursor: result ? "default" : "crosshair" }}
        onClick={handleClick}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt="pose"
          className="pq-quiz-img"
          draggable={false}
        />

        {/* Correct zone hint (shown after answer) */}
        {result && (
          <div
            className="pq-cog-zone"
            style={{
              left:   `${question.correctZone.x * 100}%`,
              top:    `${question.correctZone.y * 100}%`,
              width:  `${question.correctZone.w * 100}%`,
              height: `${question.correctZone.h * 100}%`,
            }}
          />
        )}

        {/* User click marker */}
        {click && (
          <div
            className={`pq-click-marker pq-click-marker--${result}`}
            style={{
              left: `${click.x * 100}%`,
              top:  `${click.y * 100}%`,
            }}
          />
        )}
      </div>

      {result && (
        <div className={`pq-result pq-result--${result}`}>
          {result === "correct"
            ? <><CheckCircle size={14} /> Correct! The CoG is in the hip-torso region.</>
            : <><XCircle    size={14} /> Not quite — the green zone shows the correct area.</>
          }
        </div>
      )}
    </div>
  );
}

function MultiChoiceQuestion({ question, onAnswer }) {
  const [selected, setSelected] = useState(null);

  const pick = useCallback((opt) => {
    if (selected) return;
    setSelected(opt.id);
    const correct = opt.correct === true;
    setTimeout(() => onAnswer(correct ? 1 : 0), 700);
  }, [selected, onAnswer]);

  return (
    <div className="pq-mc-wrap">
      {question.options.map(opt => {
        const isSelected = selected === opt.id;
        const showResult = selected !== null;
        let cls = "pq-mc-option";
        if (showResult && opt.correct)  cls += " pq-mc-option--correct";
        if (isSelected && !opt.correct) cls += " pq-mc-option--wrong";

        return (
          <button key={opt.id} className={cls} onClick={() => pick(opt)}>
            <span className="pq-mc-label">{opt.label}</span>
            <span className="pq-mc-desc">{opt.desc}</span>
            {showResult && opt.correct  && <CheckCircle size={14} className="pq-mc-icon" />}
            {isSelected && !opt.correct && <XCircle     size={14} className="pq-mc-icon" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PoseQuiz({ pose, onComplete }) {
  const [questions]  = useState(() => buildQuestions(pose));
  const [qIndex,     setQIndex]     = useState(0);
  const [answers,    setAnswers]    = useState([]);
  const [showResult, setShowResult] = useState(false);

  const handleAnswer = useCallback((score) => {
    const updated = [...answers, score];
    setAnswers(updated);

    if (qIndex + 1 >= questions.length) {
      // All done
      const total = updated.reduce((s, v) => s + v, 0);
      const pct   = Math.round((total / questions.length) * 100);
      setTimeout(() => {
        setShowResult(true);
        onComplete?.({ score: pct, answers: updated });
      }, 400);
    } else {
      setTimeout(() => setQIndex(i => i + 1), 600);
    }
  }, [answers, qIndex, questions, onComplete]);

  const q = questions[qIndex];

  if (showResult) {
    const total = answers.reduce((s, v) => s + v, 0);
    const pct   = Math.round((total / questions.length) * 100);
    return (
      <div className="pq-result-screen">
        <div className="pq-result-icon">
          {pct >= 67 ? "🎉" : pct >= 33 ? "👍" : "💪"}
        </div>
        <div className="pq-result-score">{pct}%</div>
        <div className="pq-result-label">
          {pct >= 67 ? "Great understanding!" : pct >= 33 ? "Good start!" : "Keep studying!"}
        </div>
        <p className="pq-result-sub">
          You answered {total} of {questions.length} questions correctly.
        </p>
      </div>
    );
  }

  return (
    <div className="pq-root">
      {/* Progress */}
      <div className="pq-progress">
        {questions.map((_, i) => (
          <div
            key={i}
            className={`pq-progress-dot${i < qIndex ? " done" : i === qIndex ? " active" : ""}`}
          />
        ))}
        <span className="pq-progress-label">
          {qIndex + 1} / {questions.length}
        </span>
      </div>

      {/* Question */}
      <div className="pq-question">
        <div className="pq-question-type">
          {q.type === "center_of_gravity" && <><Target size={13} /> Centre of Gravity</>}
          {q.type === "line_of_action"    && <><TrendingUp size={13} /> Line of Action</>}
          {q.type === "joint_count"       && <><Eye size={13} /> Anatomy Knowledge</>}
        </div>
        <p className="pq-question-prompt">{q.prompt}</p>
        <p className="pq-question-hint">{q.hint}</p>
      </div>

      {/* Question body */}
      {q.type === "center_of_gravity" && (
        <CogQuestion
          question={q}
          imageUrl={pose.imageUrl}
          onAnswer={handleAnswer}
        />
      )}
      {(q.type === "line_of_action" || q.type === "joint_count") && (
        <MultiChoiceQuestion question={q} onAnswer={handleAnswer} />
      )}
    </div>
  );
}
