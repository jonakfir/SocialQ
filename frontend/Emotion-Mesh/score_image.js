// score_image.js
// Usage: node score_image.js /absolute/or/relative/path/to/image.jpg
// Requires: run `python build_avg_distance_matrices.py` first (creates out/avg_dist_*.csv)

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createCanvas, loadImage, Canvas, Image, ImageData } from 'canvas';
import { Human, env } from '@vladmandic/human';

// Wire Node canvas into Human
env.Canvas = Canvas;
env.Image = Image;
env.ImageData = ImageData;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- config
const OUT_DIR  = path.join(__dirname, 'out');
const EMOTIONS = ['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise'];

const TARGET   = 640;   // match your extractor
const PAD_FRAC = 0.12;

// ---- weighting controls (tune these)
const WEIGHTING = {
  mode: 'variance',   // 'variance' or 'none'
  gamma: 15,          // amplify differences: 1.0=no change, >1.0 = stronger emphasis
  topPct: 0.20,       // keep top 20% most discriminative pairs; set 0 to disable
  minWeight: 0.10,    // weight used for non-top pairs when topPct>0
};

// ---- Human.js emotion prior blend (tune these)
const HUMAN_BLEND = {
  enabled: true,
  lambda: 0,                 // 0 = ignore Human prior in blending
  classBoost: {              // extra weight for certain classes in Human prior
    disgust: 2.5,
    sadness: 2.0,
    // others default to 1.0
  },
  eps: 1e-12,
};

// ---- HARD OVERRIDE thresholds (applied to *boosted* Human prior)
const OVERRIDE_THRESH = {
  disgust: 0.23,  // if boosted Human prior for disgust >= 18% -> force disgust
  sadness: 0.25,  // if boosted Human prior for sadness >= 25% -> force sadness
};

// ---- FINAL-PROBABILITY OVERRIDE (what you asked for)
const FINAL_PROB_OVERRIDE = {
  disgust: 0.23,  // if final classifier prob for disgust >= 18% -> force disgust
};

const modelsDir     = path.join(process.cwd(), 'node_modules', '@vladmandic', 'human', 'models');
const modelBasePath = pathToFileURL(modelsDir).href;

const baseCfg = {
  backend: 'tensorflow', // change to 'wasm' if you didn't install tfjs-node
  modelBasePath,
  debug: false,
  filter: { enabled: true, equalization: true },
  face: {
    enabled: true,
    detector: { enabled: true, rotation: false, minConfidence: 0.1, iou: 0.1, maxDetected: 1 },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: false },
    emotion: { enabled: true },   // we need Human prior
    antispoof: { enabled: false },
    liveness: { enabled: false },
    attention: { enabled: false },
  },
  body: { enabled: false }, hand: { enabled: false }, object: { enabled: false },
  gesture: { enabled: false }, segmentation: { enabled: false },
};

// --- Human init
async function makeHuman(detectorModel) {
  const cfg = JSON.parse(JSON.stringify(baseCfg));
  cfg.face.detector.model = detectorModel;
  const h = new Human(cfg);
  await h.load();
  try { await h.warmup(); } catch {}
  return h;
}

// --- image prep (same as extractor)
function prepImage(img, target = TARGET, padFrac = PAD_FRAC) {
  const inner = Math.round(target * (1 - 2 * padFrac));
  const r = Math.max(img.width, img.height);
  const scale = inner / r;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = createCanvas(target, target);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target, target);
  const x = Math.round((target - w) / 2);
  const y = Math.round((target - h) / 2);
  ctx.drawImage(img, x, y, w, h);
  return canvas;
}

// --- geometry helpers
function centerScale(X) {
  const N = X.length;
  let mx = 0, my = 0;
  for (let i = 0; i < N; i++) { mx += X[i][0]; my += X[i][1]; }
  mx /= N; my /= N;
  const Y = new Array(N);
  let ss = 0;
  for (let i = 0; i < N; i++) {
    const x = X[i][0] - mx, y = X[i][1] - my;
    Y[i] = [x, y];
    ss += x*x + y*y;
  }
  const s = Math.sqrt(ss) + 1e-12;
  for (let i = 0; i < N; i++) { Y[i][0] /= s; Y[i][1] /= s; }
  return Y;
}

function pairwiseMatrix(X) {
  const N = X.length;
  const D = Array.from({ length: N }, () => new Float32Array(N));
  for (let i = 0; i < N; i++) {
    D[i][i] = 0;
    for (let j = i + 1; j < N; j++) {
      const dx = X[i][0] - X[j][0];
      const dy = X[i][1] - X[j][1];
      const d = Math.hypot(dx, dy);
      D[i][j] = d;
      D[j][i] = d;
    }
  }
  return D;
}

function upperTriWeightedMSE(A, B, W) {
  const N = A.length;
  let s = 0, c = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const w = W ? W[i][j] : 1.0;
      const d = A[i][j] - B[i][j];
      s += w * d * d;
      c++;
    }
  }
  return s / (c || 1);
}

// --- CSV loader (handles pandas CSV with row index + BOM)
function loadCSVMatrix(csvPath) {
  let text = fs.readFileSync(csvPath, 'utf8');
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error(`CSV empty: ${csvPath}`);
  const header = lines[0].split(',');
  const hasIndex = header[0] === '' || header[0].toLowerCase().includes('unnamed') || header[0] === header[1];

  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const parts = lines[li].split(',');
    const nums = hasIndex ? parts.slice(1) : parts;
    rows.push(Float32Array.from(nums.map(Number)));
  }
  return rows.map(r => Array.from(r)); // nested plain arrays
}

// Build weights W(i,j) from variance across per-emotion averages.
function buildWeightsFromMats(mats, emotions) {
  const names = Object.keys(mats);
  const N = mats[names[0]].length;

  if (WEIGHTING.mode === 'none' || names.length < 2) {
    return Array.from({ length: N }, () => new Float32Array(N).fill(1));
  }

  const W = Array.from({ length: N }, () => new Float32Array(N).fill(1));
  const upperVals = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const vals = names.map(e => mats[e][i][j]);
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const v = vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length;
      W[i][j] = W[j][i] = v;
      upperVals.push(v);
    }
  }
  // normalize mean ~1
  const mean = (upperVals.reduce((a, b) => a + b, 0) / Math.max(1, upperVals.length)) + 1e-12;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { W[i][j] = W[j][i] = W[i][j] / mean; }

  // amplify differences
  const gamma = Math.max(WEIGHTING.gamma, 1.0);
  if (gamma !== 1.0) {
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        W[i][j] = W[j][i] = Math.pow(W[i][j], gamma);
      }
    }
  }

  // keep only top P% if requested, then re-normalize mean ~1
  const keepP = Math.max(0, Math.min(1, WEIGHTING.topPct));
  if (keepP > 0) {
    const flat = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) flat.push(W[i][j]);
    flat.sort((a, b) => a - b);
    const thr = flat[Math.floor((1 - keepP) * (flat.length - 1))];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        if (W[i][j] < thr) W[i][j] = W[j][i] = WEIGHTING.minWeight;
      }
    }
    const upper = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) upper.push(W[i][j]);
    const mean2 = (upper.reduce((a, b) => a + b, 0) / Math.max(1, upper.length)) + 1e-12;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { W[i][j] = W[j][i] = W[i][j] / mean2; }
  }

  return W;
}

function loadEmotionMatrices(outDir) {
  const mats = {};
  for (const e of EMOTIONS) {
    const p = path.join(outDir, `avg_dist_${e}.csv`);
    if (fs.existsSync(p)) mats[e] = loadCSVMatrix(p);
  }
  const emotions = Object.keys(mats);
  if (emotions.length === 0) throw new Error('No avg_dist_*.csv found. Run build_avg_distance_matrices.py first.');

  const weights = buildWeightsFromMats(mats, emotions);
  return { mats, emotions, weights };
}

// --- parse Human emotion predictions -> map over our six emotions (handles synonyms)
function parseHumanEmotion(face) {
  // Human returns: [{ emotion:'angry'|'disgusted'|'fearful'|'happy'|'sad'|'surprised'|'neutral', score:... }, ...]
  const MAP = {
    angry: 'anger', anger: 'anger',
    disgust: 'disgust', disgusted: 'disgust',
    fear: 'fear', fearful: 'fear',
    happy: 'happiness', happiness: 'happiness',
    sad: 'sadness', sadness: 'sadness',
    surprise: 'surprise', surprised: 'surprise',
    neutral: 'neutral',
  };

  const out = { anger: 0, disgust: 0, fear: 0, happiness: 0, sadness: 0, surprise: 0 };
  const arr = face?.emotion || face?.emotions || [];
  if (!arr || !arr.length) return null;

  for (const it of arr) {
    const raw = String(it.emotion || it.label || '').toLowerCase();
    const key = MAP[raw];
    if (key && key !== 'neutral' && key in out) {
      const v = Number(it.score ?? it.probability ?? 0);
      if (v > out[key]) out[key] = v; // keep max per class
    }
  }

  // renormalize over our six emotions; if all zero, give tiny uniform mass
  let sum = 0;
  for (const k in out) sum += out[k];
  if (sum <= 0) {
    const eps = 1e-6;
    for (const k in out) out[k] = eps;
    sum = eps * 6;
  }
  for (const k in out) out[k] /= sum;
  return out;
}

// apply disgust/sadness boost, renormalize
function boostHumanPrior(prior) {
  if (!prior) return null;
  const boosted = {};
  let sum = 0;
  for (const e of EMOTIONS) {
    const w = HUMAN_BLEND.classBoost[e] ?? 1.0;
    boosted[e] = prior[e] * w;
    sum += boosted[e];
  }
  if (sum <= 0) return null;
  for (const e of EMOTIONS) boosted[e] /= sum;
  return boosted;
}

// --- detection: return mesh AND human emotion prior (if available)
async function detectMeshAndPrior(imagePath, humans) {
  const img = await loadImage(imagePath);
  const canvas = prepImage(img);
  for (const h of humans) {
    const res = await h.detect(canvas);
    const face = res.face?.[0];
    if (face?.meshRaw?.length) {
      const prior = parseHumanEmotion(face);
      return { meshXY: face.meshRaw.map(p => [p[0], p[1]]), humanPrior: prior };
    }
  }
  return { meshXY: null, humanPrior: null };
}

// --- main
async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: node score_image.js /path/to/image.jpg');
    process.exit(1);
  }
  if (!fs.existsSync(imagePath)) {
    console.error('Image not found:', imagePath);
    process.exit(1);
  }

  const { mats, emotions, weights } = loadEmotionMatrices(OUT_DIR);

  const humanBF  = await makeHuman('blazeface');
  const humanFBx = await makeHuman('faceboxes');
  const humanMP  = await makeHuman('facemesh-detection-short');

  const { meshXY, humanPrior } = await detectMeshAndPrior(imagePath, [humanBF, humanFBx, humanMP]);
  if (!meshXY) {
    console.error('No face / mesh detected.');
    process.exit(2);
  }

  // distance matrix for this image (geometry)
  const Xn = centerScale(meshXY);
  const D  = pairwiseMatrix(Xn);

  // per-emotion weighted MSE (geometry)
  const results = [];
  for (const e of emotions) {
    const M = mats[e];
    const wmse = upperTriWeightedMSE(D, M, weights);
    results.push({ emotion: e, wmse });
  }

  // ---- adaptive softmax over negative wmse -> base geometry logits
  const wmses = results.map(r => r.wmse);
  const minW  = Math.min(...wmses);
  const maxW  = Math.max(...wmses);
  const range = Math.max(maxW - minW, 1e-12);
  const beta  = 5.0 / range; // auto-sharpness per image

  const baseLogits = results.map(r => -beta * r.wmse);

  // ---- Human prior (boosted + renormalized)
  let priorBoosted = null;
  if (HUMAN_BLEND.enabled && humanPrior) {
    priorBoosted = boostHumanPrior(humanPrior);
  }

  // (Record Human-prior override intent; actual winner will be set after we compute final probs)
  let forcedByPrior = null;
  if (priorBoosted) {
    const dP = priorBoosted.disgust ?? 0;
    const sP = priorBoosted.sadness ?? 0;
    const dHit = dP >= OVERRIDE_THRESH.disgust;
    const sHit = sP >= OVERRIDE_THRESH.sadness;
    if (dHit || sHit) {
      if (dHit && sHit) {
        forcedByPrior = dP >= sP ? { emotion: 'disgust', prob: dP } : { emotion: 'sadness', prob: sP };
      } else if (dHit) {
        forcedByPrior = { emotion: 'disgust', prob: dP };
      } else {
        forcedByPrior = { emotion: 'sadness', prob: sP };
      }
    }
  }

  // ---- blend with Human prior (log-space) for probabilities
  let finalLogits = [...baseLogits];
  let usedPrior = false;
  if (HUMAN_BLEND.enabled && priorBoosted) {
    usedPrior = true;
    const lam = Math.max(0, Math.min(1, HUMAN_BLEND.lambda));
    for (let i = 0; i < results.length; i++) {
      const e = results[i].emotion;
      const p = Math.max(priorBoosted[e] ?? 0, HUMAN_BLEND.eps);
      finalLogits[i] = (1 - lam) * baseLogits[i] + lam * Math.log(p);
    }
  }

  // final probs from blended logits
  const maxLogit = Math.max(...finalLogits);
  const exps     = finalLogits.map(z => Math.exp(z - maxLogit));
  const sumExp   = exps.reduce((a, b) => a + b, 0) + 1e-12;
  const finalProbs = exps.map(v => v / sumExp);

  // attach probs back to results
  for (let i = 0; i < results.length; i++) results[i].prob = finalProbs[i];

  // default winner/runners from probs
  const byProb = [...results].sort((a, b) => b.prob - a.prob);
  let winner   = byProb[0];
  let runnerUp = byProb[1];

  // ---- NEW: FINAL-PROBABILITY OVERRIDE FOR DISGUST (takes precedence)
  let overrideMsg = null;
  const disgustFinal = results.find(r => r.emotion === 'disgust');
  if (disgustFinal && disgustFinal.prob >= FINAL_PROB_OVERRIDE.disgust) {
    winner = disgustFinal;
    runnerUp = byProb.find(r => r.emotion !== 'disgust') || runnerUp;
    overrideMsg = `OVERRIDE: final classifier disgust prob ${(disgustFinal.prob*100).toFixed(1)}% ≥ ${(FINAL_PROB_OVERRIDE.disgust*100).toFixed(0)}%`;
  } else if (forcedByPrior) {
    // fallback: prior-based overrides if final-prob override didn't trigger
    const forcedIdx = results.findIndex(r => r.emotion === forcedByPrior.emotion);
    winner = results[forcedIdx];
    runnerUp = byProb.find(r => r.emotion !== forcedByPrior.emotion) || runnerUp;
    overrideMsg = `OVERRIDE: Human prior (boosted) ${forcedByPrior.emotion}=${(forcedByPrior.prob*100).toFixed(1)}% ` +
                  `(threshold ${OVERRIDE_THRESH[forcedByPrior.emotion]*100}%)`;
  }

  // quality scores for thresholding (based on blended probs/logits)
  const strength = winner.prob;
  const margin   = winner.prob - (runnerUp?.prob ?? 0);
  const sortedIdx = finalLogits.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  const logitRange = Math.max(sortedIdx[0].v - sortedIdx.at(-1).v, 1e-12);
  const clarity    = (sortedIdx[0].v - sortedIdx[1].v) / logitRange;

  console.log(
    `\nWeighting: mode=${WEIGHTING.mode} gamma=${WEIGHTING.gamma} topPct=${WEIGHTING.topPct} minWeight=${WEIGHTING.minWeight}`
  );
  console.log(`Final-prob override for disgust: ${(FINAL_PROB_OVERRIDE.disgust*100).toFixed(0)}%`);
  if (overrideMsg) console.log(overrideMsg);

  console.log('\nImage:', imagePath);
  console.log(
    `Prediction: ${winner.emotion}  ` +
    `(strength=${strength.toFixed(3)}, margin=${margin.toFixed(3)}, clarity=${clarity.toFixed(3)}, wmse=${winner.wmse.toExponential(6)})`
  );

  console.log('\nScores (higher is better):');
  for (const r of byProb) {
    console.log(`  ${r.emotion.padEnd(10)} prob=${r.prob.toFixed(6)}  wmse=${r.wmse.toExponential(6)}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err && err.stack ? err.stack : (err?.message || err));
  process.exit(99);
});
