// extract_mesh.js
// run: node extract_mesh.js
// package.json must have: "type": "module"
// npm i @vladmandic/human @tensorflow/tfjs-node canvas

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createCanvas, loadImage, Canvas, Image, ImageData } from 'canvas';
import { Human, env } from '@vladmandic/human';

// ---- wire Node canvas so Human recognizes images in Node
env.Canvas = Canvas;
env.Image = Image;
env.ImageData = ImageData;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- I/O
const IMAGE_ROOT = path.join(__dirname, 'images');
const OUT_DIR = path.join(__dirname, 'out');
const OUT_PATH = path.join(OUT_DIR, 'meshes.jsonl');

// accept both lowercase and TitleCase folder names
const LABELS = new Set(['anger', 'disgust', 'fear', 'happiness', 'sadness', 'surprise']);

// point Human at its packaged models
const modelsDir = path.join(process.cwd(), 'node_modules', '@vladmandic', 'human', 'models');
const modelBasePath = pathToFileURL(modelsDir).href;

// ---- base Human config; we will mutate the detector.model and reload when needed
const baseConfig = {
  backend: 'tensorflow',                 // change to 'wasm' if you did not install tfjs-node
  modelBasePath,
  debug: false,
  filter: { enabled: true, equalization: true }, // helps grayscale/flat images
  face: {
    enabled: true,
    detector: {
      enabled: true,
      rotation: false,                   // Ekman faces are upright
      minConfidence: 0.1,                // loosen thresholds
      iou: 0.1,
      maxDetected: 1
    },
    mesh: { enabled: true },             // 468-pt mesh
    iris: { enabled: false },
    description: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    attention: { enabled: false }
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false }
};

// create Human with a specific detector model
async function makeHuman(detectorModel) {
  const cfg = JSON.parse(JSON.stringify(baseConfig));
  // available values seen in the distributed model list:
  // 'blazeface', 'faceboxes', 'facemesh-detection-short', 'facemesh-detection-full'
  cfg.face.detector.model = detectorModel;
  const h = new Human(cfg);
  await h.load();
  try { await h.warmup(); } catch {}
  return h;
}

// list images inside label subfolders
function listImages(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const dirs = fs.readdirSync(rootDir).filter((d) => {
    try { return fs.statSync(path.join(rootDir, d)).isDirectory(); } catch { return false; }
  });

  const rows = [];
  for (const labelRaw of dirs) {
    const label = String(labelRaw).toLowerCase();
    if (!LABELS.has(label)) continue;
    const d = path.join(rootDir, labelRaw);
    for (const f of fs.readdirSync(d)) {
      if (/\.(jpg|jpeg|png|bmp|webp)$/i.test(f)) rows.push({ filePath: path.join(d, f), label });
    }
  }
  return rows;
}

// preprocess: letterbox to a square canvas and upscale — helps detectors a lot
function prepImage(img, target = 640, padFrac = 0.12) {
  // compute scale so the long edge fits target * (1 - 2*padFrac)
  const inner = Math.round(target * (1 - 2 * padFrac));
  const r = Math.max(img.width, img.height);
  const scale = inner / r;

  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = createCanvas(target, target);
  const ctx = canvas.getContext('2d');

  // white letterbox background to give context
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target, target);

  const x = Math.round((target - w) / 2);
  const y = Math.round((target - h) / 2);
  ctx.drawImage(img, x, y, w, h);

  return canvas;
}

async function detectWithFallbacks(filePath, humans) {
  const img = await loadImage(filePath);
  const canvas = prepImage(img);

  for (const h of humans) {
    const res = await h.detect(canvas);
    const face = res.face && res.face[0] ? res.face[0] : null;
    if (face && face.meshRaw && face.meshRaw.length) {
      // keep x,y only
      const meshXY = face.meshRaw.map((p) => [p[0], p[1]]);
      return {
        file: path.basename(filePath),
        width: img.width,
        height: img.height,
        mesh: meshXY,
        rotation: face.rotation ?? null,
        detector: h.config.face.detector.model
      };
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Try several detectors in order
  const humanBF  = await makeHuman('blazeface');
  const humanFBx = await makeHuman('faceboxes');
  const humanMP  = await makeHuman('facemesh-detection-short'); // MediaPipe short-range

  const items = listImages(IMAGE_ROOT);
  if (items.length === 0) {
    console.error('No images found under', IMAGE_ROOT);
    return;
  }

  const ws = fs.createWriteStream(OUT_PATH, { flags: 'w' });
  let saved = 0, failed = 0;

  for (const it of items) {
    try {
      const det = await detectWithFallbacks(it.filePath, [humanBF, humanFBx, humanMP]);
      if (det) {
        det.label = it.label;
        ws.write(JSON.stringify(det) + '\n');
        saved += 1;
      } else {
        failed += 1;
        console.error('no face for', it.filePath);
      }
    } catch (e) {
      failed += 1;
      console.error('error on', it.filePath, e?.message || e);
    }
  }

  ws.end();
  console.log('done', { saved, failed, out: OUT_PATH });
}

main().catch((e) => console.error('fatal', e?.message || e));
