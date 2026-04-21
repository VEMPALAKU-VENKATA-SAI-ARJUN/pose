# P.O.S.E — AI-Powered Pose Learning Platform for Beginner Artists

---

## Abstract

P.O.S.E (Pose-Oriented Sketch Evaluator) is an AI-assisted web application designed to help beginner artists learn human figure drawing through interactive pose analysis, guided practice, and anatomical education. The system integrates a MediaPipe-based pose detection pipeline with a multi-engine AI service to analyze both photographs and hand-drawn sketches, providing real-time feedback on joint angles, limb proportions, symmetry, and balance. The platform offers six distinct learning modes — Pose Library, Anatomy Breakdown, Comparison Mode, Reference Mode, Practice Mode, and Gesture Mode — each targeting a different aspect of figure drawing skill development. Built on a three-tier architecture (React frontend, Express.js backend, Flask AI service), P.O.S.E bridges the gap between traditional art instruction and modern AI tooling, making anatomical feedback accessible to artists at any skill level.

---

## 1. Introduction

Learning to draw the human figure is one of the most challenging skills in visual art. Beginners frequently struggle with understanding body proportions, joint angles, and the spatial relationships between body parts. Traditional learning methods — anatomy books, life drawing classes, and video tutorials — are valuable but lack the ability to give immediate, personalized feedback on a student's specific drawing.

P.O.S.E addresses this gap by acting as an intelligent art coach. A student can upload their drawing alongside a reference pose and receive a detailed breakdown of what is anatomically correct, what deviates from the reference, and how to correct it. Beyond comparison, the platform provides structured practice sessions, a curated pose library, an interactive 3D pose viewer, a gesture drawing trainer, and an anatomy explorer — forming a complete self-study environment for figure drawing.

The name P.O.S.E reflects the platform's core focus: every feature is built around understanding, analyzing, and practicing human poses.

---

## 2. Motivation

Several observations motivated the development of P.O.S.E:

- **Lack of immediate feedback**: Art students typically receive feedback only during class critiques or from peers, which is infrequent and subjective. An automated system can provide instant, objective feedback at any time.
- **Anatomy is intimidating**: Many beginners avoid studying anatomy because it feels overly technical. An interactive, visual approach lowers the barrier to entry.
- **Reference pose access**: Finding good reference poses in the right angle, category, and difficulty level is time-consuming. A curated, filterable library saves time and keeps students focused on drawing.
- **Gesture drawing is underserved**: Timed gesture drawing is a well-known technique for building speed and visual memory, but most tools are passive timers. P.O.S.E adds an active reconstruction component that tests recall.
- **Sketches are hard to analyze**: Existing pose analysis tools work only on photographs. P.O.S.E includes a dedicated sketch preprocessing pipeline so that pencil and ink drawings can be analyzed directly.

---

## 3. Literature Review

### 3.1 Human Pose Estimation

Human pose estimation has advanced significantly with deep learning. MediaPipe BlazePose (Bazaeva et al., 2020) introduced a lightweight, real-time 33-keypoint body landmark model suitable for browser and mobile deployment. It forms the detection backbone of P.O.S.E. Earlier work such as OpenPose (Cao et al., 2017) established the multi-person, part-affinity-field approach, while HRNet (Sun et al., 2019) demonstrated high-resolution representation learning for more accurate keypoint localization.

### 3.2 Anatomical Proportion Systems

The classical 7.5-head canon, documented in Bridgman's "Constructive Anatomy" (1920) and Loomis's "Figure Drawing for All It's Worth" (1943), defines ideal limb-to-torso ratios used widely in art education. P.O.S.E encodes these ratios as thresholds in its analysis engine, flagging deviations that would appear anatomically incorrect to a viewer.

### 3.3 Sketch Recognition and Preprocessing

Sketch-based interfaces have been studied extensively (Sezgin & Stahovich, 2001). For pose detection from sketches, the challenge is that line drawings lack the texture and color cues that neural networks rely on. Techniques such as histogram equalization, CLAHE (Contrast Limited Adaptive Histogram Equalization), and adaptive thresholding (Otsu, 1979) are used to convert sketches into photo-like images that pose detectors can process.

### 3.4 AI in Art Education

Prior work on AI art feedback includes systems for perspective correction (Huang et al., 2019) and style transfer for learning (Gatys et al., 2015). Gesture drawing platforms such as Line of Action and SenshiStock provide timed reference images but no automated feedback. P.O.S.E extends this space by adding quantitative pose evaluation.

### 3.5 3D Pose Visualization

Three.js and WebGL have enabled interactive 3D content in the browser without plugins. React Three Fiber (Drcmda, 2019) provides a declarative React wrapper around Three.js, making it practical to build interactive 3D pose viewers as React components. Forward kinematics (FK) — computing world-space joint positions from a chain of local rotations — is the standard technique used in animation software and is applied here for the stick figure projection system.

---

## 4. Technologies Used

### 4.1 Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.2 | UI component framework |
| React Router | 7.13 | Client-side routing between modes |
| Vite | Latest | Build tool and dev server |
| Three.js | Latest | 3D rendering engine |
| @react-three/fiber | Latest | React bindings for Three.js |
| MediaPipe Tasks Vision | 0.10+ | In-browser pose detection (Gesture Mode) |
| Lucide React | Latest | Icon library |
| Axios | Latest | HTTP client for API calls |

### 4.2 Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js / Express | 4.18 | REST API server and proxy |
| Mongoose | 9.3 | MongoDB object modeling |
| Multer | 1.4 | Multipart file upload handling |
| CORS | Latest | Cross-origin request support |

### 4.3 AI Service

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Runtime |
| Flask | 3.0+ | REST API framework |
| MediaPipe | 0.10+ | Pose landmark detection (33 keypoints) |
| OpenCV | 4.9+ | Image preprocessing and contour analysis |
| NumPy | 1.26+ | Numerical computation for geometry |

### 4.4 Database

| Technology | Purpose |
|---|---|
| MongoDB | Storing analysis history and pose metadata |

### 4.5 Architecture Overview

```
Browser (React + Vite)
        │
        │  HTTP (REST)
        ▼
Express.js Backend (Node.js)
        │
        │  HTTP (proxy)
        ▼
Flask AI Service (Python)
        │
        ▼
MediaPipe Pose Landmarker (.task model)
```

---

## 5. Modules Present

The project is organized into three tiers, each containing focused modules:

### 5.1 Frontend Modules

| Module | Path | Responsibility |
|---|---|---|
| Dashboard | `src/components/Dashboard.jsx` | Landing page with mode navigation cards |
| App Router | `src/App.jsx` | Route definitions and top-level state |
| Pose Library | `src/components/pose-library/` | Browsable pose reference library |
| Anatomy Breakdown | `src/components/anatomy/` | Interactive skeleton and muscle explorer |
| Comparison Mode | `src/App.jsx` (compare view) | Upload and compare reference vs drawing |
| Reference Mode | `src/components/reference/` | 3D interactive pose viewer |
| Practice Mode | `src/components/PracticePage.jsx` | Timed drawing practice sessions |
| Gesture Mode | `src/components/gesture/` | Timed study + skeleton reconstruction |
| Canvas Viewer | `src/components/CanvasViewer.jsx` | Skeleton overlay rendering |
| Overlay Canvas | `src/components/OverlayCanvas.jsx` | Comparison skeleton overlay |
| Upload Panel | `src/components/UploadPanel.jsx` | Image upload UI |
| Recommend Panel | `src/components/RecommendPanel.jsx` | Similar pose suggestions |
| Pose Data | `src/data/poseLibraryData.js` | 64-pose static dataset |
| Pose Rules | `src/data/poseRules.js` | Natural language → joint angle rules |
| Reference Poses | `src/data/referencePoses.js` | Preset 3D pose configurations |
| Joint Constraints | `src/data/jointConstraints.js` | Valid angle ranges per joint |

### 5.2 Backend Modules

| Module | Path | Responsibility |
|---|---|---|
| Server | `backend/server.js` | Express app, proxy routes, static serving |
| Analysis Route | `backend/routes/analysisRoute.js` | Disk storage + MongoDB persistence |
| Poses Route | `backend/routes/posesRoute.js` | Pose dataset serving |
| Pose AI Route | `backend/routes/poseAIRoute.js` | AI-generated pose endpoint |
| Pose Library Route | `backend/routes/poseLibraryRoute.js` | Static pose library serving |
| Analysis Model | `backend/models/Analysis.js` | MongoDB schema for analysis records |
| Pose Model | `backend/models/Pose.js` | MongoDB schema for pose records |

### 5.3 AI Service Modules

| Module | Path | Responsibility |
|---|---|---|
| App | `ai-service/app.py` | Flask API, endpoint routing, detection case logic |
| Pose Detection | `ai-service/pose_detection.py` | MediaPipe keypoint detection + sketch preprocessing |
| Analysis Engine | `ai-service/analysis_engine.py` | Angles, proportions, symmetry, error detection |
| Comparison Engine | `ai-service/comparison_engine.py` | Priority-based pose comparison and scoring |
| Correction Engine | `ai-service/correction_engine.py` | Reference-based and anatomy-based corrections |
| Fallback Engine | `ai-service/fallback_engine.py` | Pose estimation when drawing detection fails |
| Recommender | `ai-service/recommender.py` | Cosine-similarity pose recommendation |

---

## 6. Working of Each Mode

### 6.1 Pose Library

**Purpose**: Provide a curated, searchable collection of reference poses for artists to study and use as starting points for other modes.

**How it works**:

The Pose Library is entirely client-side. The dataset (`poseLibraryData.js`) contains metadata for 64 reference poses, each with fields for title, category, difficulty, gender, camera angle, body type, and tags. The 64 corresponding images are stored in `public/pose-library/`.

When the user opens the library, all poses are loaded into state. A filter panel allows narrowing by gender, category (standing, sitting, action, etc.), difficulty (beginner/intermediate/advanced), and camera angle (front, side, three-quarter). A search bar matches against title, tags, and category fields. All filtering is performed in-memory with no backend calls.

Clicking a pose card opens a detail modal showing the full image, metadata, and a list of similar poses (computed by matching category and difficulty). From the modal, the user can send the pose directly to Practice Mode or Anatomy Mode, which stores the selection in `localStorage` and navigates to the target route.

**Key components**: `PoseLibrary.jsx`, `PoseCard.jsx`, `poseLibraryData.js`

---

### 6.2 Anatomy Breakdown

**Purpose**: Give beginners an interactive way to explore the human skeleton and muscle groups, building the anatomical vocabulary needed for accurate figure drawing.

**How it works**:

The Anatomy Breakdown mode renders an interactive 3D model of the human skeleton using Three.js via React Three Fiber. Users can rotate the model, click on individual bones or muscle groups to highlight them, and read descriptive labels explaining each structure's role in pose and movement.

The mode is designed as a reference tool rather than an exercise. It complements the other modes by giving context to the feedback they produce — when Comparison Mode flags "left elbow angle deviation," the student can visit Anatomy Breakdown to understand which muscles control elbow flexion and why the angle matters for a natural-looking pose.

**Key components**: `src/components/anatomy/`

---

### 6.3 Comparison Mode

**Purpose**: Allow artists to upload a reference pose alongside their own drawing and receive a quantitative, visual breakdown of how closely the drawing matches the reference.

**How it works**:

The user uploads two images: a reference (photograph or reference art) and their drawing. Both are sent to the Express backend, which proxies them to the Flask AI service's `POST /compare` endpoint.

The AI service handles four detection cases:

- **Case 1 — Both detected**: Normal comparison. Both poses are normalized (centered, rotated to vertical, scaled to unit torso height) and compared joint-by-joint.
- **Case 2 — Only reference detected**: The fallback engine estimates the drawing's pose by detecting the drawing's bounding box via contour analysis and scaling/translating the reference keypoints to fit. The result carries a 0.6× confidence penalty.
- **Case 3 — Only drawing detected**: Anatomy mode. The drawing is compared against an ideal anatomical model rather than the reference, checking whether the drawn pose is anatomically plausible.
- **Case 4 — Neither detected**: A hard error is returned and the user is offered a manual annotation mode.

The comparison engine uses a three-priority system:
1. **Primary — Joint angles** (threshold: 10°): Flags elbows, knees, and shoulders where the angle difference exceeds 10 degrees.
2. **Secondary — Limb proportions** (threshold: 15%): Flags limbs whose length ratio deviates by more than 15%, only for joints not already caught by angle errors.
3. **Tertiary — Symmetry** (threshold: 12% of torso height): Reports left/right imbalances as informational feedback.

A similarity score (0–100%) is computed from the weighted sum of angle differences. The correction engine then generates corrected keypoints by blending the drawing's joints 75% toward the reference. The frontend renders a normalized skeleton overlay on both images, highlights flagged joints in red, and displays directional correction arrows.

**Key components**: `App.jsx` (compare view), `CanvasViewer.jsx`, `OverlayCanvas.jsx`, `comparison_engine.py`, `correction_engine.py`

---

### 6.4 Reference Mode

**Purpose**: Provide an interactive 3D pose viewer that artists can use to generate custom reference poses at any angle, with full joint control and natural language input.

**How it works**:

Reference Mode renders a 3D articulated figure using Three.js and React Three Fiber. The scene (`PoseScene.jsx`) contains a skeletal rig with 18 controllable joints: head, neck, spine segments, left/right shoulders, elbows, wrists, hips, knees, and ankles.

Joint state is stored as `jointAngles` — a map from bone name to `{x, y, z}` rotation in degrees. The user can manipulate joints in two ways:

1. **Joint sliders**: A collapsible panel exposes a slider for each joint axis. Changes update `jointAngles` in real time and the 3D scene re-renders immediately.
2. **Natural language prompts**: The user types a description such as "raise right arm" or "bend left knee 90 degrees." The `parseTextToJoints()` function in `poseRules.js` matches the input against a rule set and returns a partial `jointAngles` update. Unrecognized inputs fall back to an AI-assisted parser.

Four camera presets (front, side, top, low angle) reposition the Three.js camera. A library of preset poses (standing, walking, running, jumping, martial arts, dance, yoga) can be loaded with one click, setting all joint angles simultaneously.

The export button captures the canvas as a PNG, which the user can save and use as a drawing reference.

A planned extension — Stick Figure Mode — will add a 2D canvas overlay that projects the 3D joint positions onto a flat plane using forward kinematics, rendering a clean stick figure with configurable simplification levels, line-of-action overlay, and center-of-gravity marker.

**Key components**: `ReferenceMode.jsx`, `PoseScene.jsx`, `poseRules.js`, `referencePoses.js`

---

### 6.5 Practice Mode

**Purpose**: Build drawing accuracy through structured, timed exercises where the student studies a reference pose and then submits their drawing for automated scoring.

**How it works**:

The user selects a timer duration (2, 5, 15, 30, or 60 minutes) and starts a session. A reference pose is displayed for the full duration. When the timer expires (or the user chooses to submit early), the reference is hidden and the user uploads their drawing — either from a file or via webcam capture.

The drawing is sent to the backend's `POST /api/compare` endpoint alongside the reference image. The full comparison pipeline runs (pose detection, normalization, angle/proportion/symmetry comparison, correction generation) and returns a result.

The results screen shows:
- A circular score ring displaying the similarity percentage.
- A skeleton overlay on both the reference and the drawing, with flagged joints highlighted.
- A list of improvement suggestions ordered by priority.
- A "Try Again" button to repeat the same pose or a "Next Pose" button to advance.

Session data (score, pose, duration) is tracked locally. A streak counter increments each day the user completes at least one session, encouraging consistent practice.

**Key components**: `PracticePage.jsx`, `PracticePage.css`, `CanvasViewer.jsx`

---

### 6.6 Gesture Mode

**Purpose**: Train visual memory and drawing speed by having the student study a pose for a short time and then reconstruct it by placing joints on a canvas — testing recall rather than copying.

**How it works**:

The user configures a study time (30 seconds to 5 minutes), category, and difficulty level. A reference pose is displayed for the study period. When the timer ends, the reference disappears and the student is presented with a blank canvas and a skeleton builder interface.

The `SkeletonBuilder` component (`SkeletonBuilder.jsx`) renders an interactive canvas. The student clicks to place joints and drags to adjust their positions, building a stick-figure skeleton from memory. The builder enforces a logical joint hierarchy — placing the torso first, then limbs — and provides visual guides for joint placement.

When the student submits their reconstruction, the `compareJoints()` function computes the angle at each joint in both the reference and the reconstruction, then calculates the mean absolute angle difference. This produces a score (0–100%) and a list of flagged joints where the recall was inaccurate.

The results screen shows the reference pose alongside the student's reconstruction, with color-coded joints indicating accuracy. Feedback messages explain which joints were off and in which direction.

A daily streak counter tracks consecutive days of completed gesture sessions, reinforcing the habit of regular practice.

**Key components**: `GestureMode.jsx`, `SkeletonBuilder.jsx`, `SkeletonBuilderTest.jsx`

---

## 7. Design and Implementation

### 7.1 System Architecture

P.O.S.E follows a three-tier architecture:

**Tier 1 — Frontend (React + Vite)**
The frontend is a single-page application with client-side routing. Each mode is a separate route rendered by React Router. The frontend communicates with the backend exclusively via REST API calls using Axios. No AI computation runs in the browser except for the in-browser MediaPipe instance used in Gesture Mode for optional live detection.

**Tier 2 — Backend (Express.js)**
The Express server acts as a proxy and persistence layer. It receives file uploads via Multer, forwards them to the Flask AI service, and returns the results to the frontend. For analysis history, it persists results to MongoDB via Mongoose. Static uploaded images are served from the `/uploads` directory.

**Tier 3 — AI Service (Flask + Python)**
The Flask service contains all AI and numerical computation. It is stateless — each request is fully self-contained. The service exposes three endpoints: `/analyze` (single image), `/compare` (two images), and `/recommend` (pose similarity).

### 7.2 Pose Detection Pipeline

The detection pipeline in `pose_detection.py` handles both photographs and sketches:

1. Raw image bytes are decoded with OpenCV.
2. `is_sketch()` classifies the image using Canny edge density. If edge density exceeds 0.15, the image is treated as a sketch.
3. For sketches, `preprocess_image()` runs an 8-step pipeline: grayscale → histogram equalization → CLAHE → adaptive thresholding → inversion → Gaussian blur → divide blend → dilation → smoothing. This converts line art into a photo-like image that MediaPipe can process.
4. The preprocessed image is passed to the MediaPipe Pose Landmarker model, which returns 33 body landmarks with visibility scores.
5. Landmarks with visibility below 0.20 (sketches) or 0.50 (photos) are discarded. If mean visibility falls below 0.40, the detection is rejected entirely.

### 7.3 Analysis Engine

`analysis_engine.py` computes four categories of metrics from detected keypoints:

- **Joint angles**: Computed using the dot-product formula at each joint vertex. Compared against acceptable ranges (e.g., torso lean: 0–20°).
- **Proportions**: Limb lengths normalized by torso height, compared against the 7.5-head canon ideal ranges.
- **Symmetry**: Left/right height and length differences as a fraction of torso height, flagged if above 15%.
- **Center of gravity**: Weighted average of body segment positions, classified as balanced or unbalanced.

Before comparison, keypoints are normalized: translated so the hip midpoint is the origin, rotated to align the torso vertically, and scaled so torso height equals 1. This eliminates size, position, and tilt differences between images.

### 7.4 Comparison and Correction

The comparison engine applies a priority-ordered flagging system to avoid redundant feedback. Joint angle errors (primary) are the most actionable for a beginner, so they are checked first. Proportion errors (secondary) are only reported for joints not already flagged by angle errors. Symmetry issues (tertiary) are always informational.

The correction engine operates in two modes:
- **Reference mode**: Each flagged joint in the drawing is moved 75% of the way toward the corresponding reference joint position.
- **Anatomy mode** (when no reference is available): Limbs are rebuilt using ideal anatomical ratios and the detected joint angles, producing a corrected skeleton that is anatomically plausible.

### 7.5 3D Pose Viewer

The Reference Mode 3D viewer uses a bone hierarchy that mirrors standard animation rigs. Joint rotations are stored as Euler angles and applied to Three.js `Object3D` nodes. The natural language parser maps text patterns to joint rotation deltas using a rule table in `poseRules.js`, covering common artistic instructions ("raise arm," "bend knee," "twist torso"). Unmatched inputs are passed to an AI fallback.

### 7.6 Data Flow — Comparison Mode (End to End)

```
User uploads reference + drawing
        │
        ▼
Express /api/compare
  → Multer reads both files into memory
  → Builds multipart FormData
  → Forwards to Flask /compare
        │
        ▼
Flask /compare
  → _safe_detect(reference) → keypoints_ref
  → _safe_detect(drawing)   → keypoints_draw
  → Determine detection case (1/2/3/4)
  → analyze(keypoints_ref)  → analysis_ref
  → analyze(keypoints_draw) → analysis_draw
  → compare_poses(ref, draw) → comparison + score
  → generate_corrected_pose(draw, ref) → corrected_kp
  → recommend(draw_kp) → similar poses
  → Return JSON
        │
        ▼
Express returns JSON to frontend
        │
        ▼
React renders:
  - Score ring
  - Skeleton overlay (CanvasViewer)
  - Flagged joints (red highlights)
  - Correction arrows (OverlayCanvas)
  - Suggestions list
  - Similar pose recommendations (RecommendPanel)
```

### 7.7 Database Schema

**Analysis** (`Analysis.js`):
- `imageUrl` (String) — path to uploaded image
- `keypoints` (Array) — detected landmark array
- `analysis` (Object) — angles, proportions, symmetry, errors
- `correctedKeypoints` (Object) — correction output
- `createdAt` (Date) — timestamp

**Pose** (`Pose.js`):
- `title` (String)
- `category` (String)
- `difficulty` (String)
- `imageUrl` (String)
- `keypoints` (Array)
- `tags` (Array of String)

---

## 8. References

1. Bazaeva, V., et al. (2020). *BlazePose: On-device Real-time Body Pose Tracking*. Google Research.
2. Cao, Z., et al. (2017). *Realtime Multi-Person 2D Pose Estimation using Part Affinity Fields*. CVPR 2017.
3. Sun, K., et al. (2019). *Deep High-Resolution Representation Learning for Visual Recognition*. CVPR 2019.
4. Bridgman, G. B. (1920). *Constructive Anatomy*. Dover Publications.
5. Loomis, A. (1943). *Figure Drawing for All It's Worth*. Viking Press.
6. Sezgin, T. M., & Stahovich, T. (2001). *Sketch Based Interfaces: Early Processing for Sketch Understanding*. PUI 2001.
7. Otsu, N. (1979). *A Threshold Selection Method from Gray-Level Histograms*. IEEE Transactions on Systems, Man, and Cybernetics.
8. Huang, Z., et al. (2019). *Learning to Paint with Model-based Deep Reinforcement Learning*. ICCV 2019.
9. Gatys, L. A., et al. (2015). *A Neural Algorithm of Artistic Style*. arXiv:1508.06576.
10. Drcmda (2019). *React Three Fiber — A React renderer for Three.js*. GitHub: pmndrs/react-three-fiber.
11. MediaPipe Team (2023). *MediaPipe Solutions Guide*. Google for Developers. https://developers.google.com/mediapipe
12. Ruchikachorn, P., & Mueller, K. (2015). *Learning Visualizations by Analogy: Promoting Visual Literacy through Visualization Morphing*. IEEE Transactions on Visualization and Computer Graphics.
