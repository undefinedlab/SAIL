"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  CLEAR_HEX,
  COL_DARK,
  COL_LIGHT,
  DOT_SIZE_CSS,
  MAX_PIXEL_RATIO,
  makeBayerTextureFloat,
} from "./bayerDitherShared";

/** Water height → luminance before Bayer (motion-driven ripples only) */
const WATER_LUMA_SCALE = 1.65;
/** Damping per step — ripples decay after motion stops */
const WAVE_DAMPING = 0.975;
/** Min pointer speed (CSS px / frame) to inject */
const RIPPLE_VEL_THRESHOLD = 0.02;
/** Max simulation cells (performance) */
const MAX_SIM_CELLS = 480_000;
/** Gaussian injection blur (sim cells) — wider = smoother, less “ring” */
const INJECT_SIGMA = 1.65;
const INJECT_RADIUS = 4;
/** Sample stroke every ~this many CSS px so fast moves stay one continuous wave */
const STROKE_SAMPLE_PX = 16;
const STROKE_MAX_SAMPLES = 36;

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform sampler2D uPhoto;
  uniform sampler2D uBayer;
  uniform sampler2D uWater;
  uniform vec2 uResolution;
  uniform float uDotSizePx;
  uniform vec3 uColorDark;
  uniform vec3 uColorBright;
  uniform float uTime;
  uniform vec2 uWaterGridFull;

  varying vec2 vUv;

  float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  void main() {
    vec2 px = vUv * uResolution;
    float cell = max(uDotSizePx, 1.0);
    vec2 cellId = floor(px / cell);
    vec2 cellCenter = cellId * cell + 0.5 * cell;
    vec2 cellUv = cellCenter / uResolution;

    vec3 photo = texture2D(uPhoto, cellUv).rgb;
    float lum = luma(photo);

    float layer = clamp(floor(lum * 4.0), 0.0, 3.0);
    float phase = layer * 1.57079633;
    float spd;
    float ampB;
    if (layer < 0.5) { spd = 0.5; ampB = 0.06; }
    else if (layer < 1.5) { spd = 0.7; ampB = 0.055; }
    else if (layer < 2.5) { spd = 0.4; ampB = 0.065; }
    else { spd = 0.6; ampB = 0.052; }

    float drift = sin(cellId.x * 0.014 + uTime * 0.055) * cos(cellId.y * 0.011 - uTime * 0.042)
      + 0.55 * sin((cellId.x + cellId.y) * 0.0095 + uTime * 0.032)
      + 0.35 * sin(cellId.x * 0.007 - cellId.y * 0.008 + uTime * 0.028);
    float breathe = ampB * sin(uTime * spd + phase + drift * 0.45);

    /* Continuous UV → hardware bilinear; avoids blocky “stepped” rings from floor(simId) */
    vec2 waterUv = (cellId + vec2(0.5)) / uWaterGridFull;
    float waterH = texture2D(uWater, waterUv).r * float(${WATER_LUMA_SCALE});

    float lumAdj = lum + breathe + waterH;
    lumAdj = clamp(lumAdj, 0.0, 1.0);
    /* Bright regions get a slight density penalty so highlights show fewer dots. */
    float highlight = smoothstep(0.72, 1.0, lumAdj);
    float dotLum = clamp(lumAdj - (0.18 * highlight), 0.0, 1.0);

    vec2 bayerCoord = mod(cellId, 8.0);
    float threshold = texture2D(uBayer, (bayerCoord + 0.5) / 8.0).r;

    vec3 outCol = dotLum >= threshold ? uColorBright : uColorDark;

    gl_FragColor = vec4(outCol, 1.0);
  }
`;

function makeWaterTexture(
  simW: number,
  simH: number
): { tex: THREE.DataTexture; data: Float32Array } {
  const data = new Float32Array(simW * simH * 4);
  const tex = new THREE.DataTexture(data, simW, simH);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.FloatType;
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, data };
}

function computeSimDims(
  bufW: number,
  bufH: number,
  dotPx: number
): { simW: number; simH: number; fullW: number; fullH: number } {
  const fullW = Math.max(1, Math.ceil(bufW / dotPx));
  const fullH = Math.max(1, Math.ceil(bufH / dotPx));
  let cells = fullW * fullH;
  if (cells <= MAX_SIM_CELLS) {
    return { simW: fullW, simH: fullH, fullW, fullH };
  }
  const scale = Math.sqrt(MAX_SIM_CELLS / cells);
  const simW = Math.max(2, Math.floor(fullW * scale));
  const simH = Math.max(2, Math.floor(fullH * scale));
  return { simW, simH, fullW, fullH };
}

function stepWave(
  src: Float32Array,
  dst: Float32Array,
  simW: number,
  simH: number
): void {
  for (let y = 0; y < simH; y++) {
    for (let x = 0; x < simW; x++) {
      const i = y * simW + x;
      const L = x > 0 ? src[i - 1] : src[i];
      const R = x < simW - 1 ? src[i + 1] : src[i];
      const U = y > 0 ? src[i - simW] : src[i];
      const D = y < simH - 1 ? src[i + simW] : src[i];
      const sum = L + R + U + D;
      dst[i] = (sum * 0.5 - dst[i]) * WAVE_DAMPING;
    }
  }
}

/**
 * Soft Gaussian injection in sim space (matches float UV sampling in the fragment shader).
 */
function injectKernelSoft(
  waveBuf: Float32Array,
  simW: number,
  simH: number,
  fullW: number,
  fullH: number,
  dotPx: number,
  mxBuf: number,
  myBufFromBottom: number,
  strength: number,
  sigma = INJECT_SIGMA,
  radius = INJECT_RADIUS
): void {
  const cxFull = Math.max(0, Math.min(fullW - 1, Math.floor(mxBuf / dotPx)));
  const cyFull = Math.max(0, Math.min(fullH - 1, Math.floor(myBufFromBottom / dotPx)));
  const cx = (cxFull + 0.5) * (simW / fullW) - 0.5;
  const cy = (cyFull + 0.5) * (simH / fullH) - 0.5;

  const s2 = 2 * sigma * sigma;
  const ix0 = Math.floor(cx);
  const iy0 = Math.floor(cy);

  let sumW = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = ix0 + dx;
      const sy = iy0 + dy;
      if (sx < 0 || sx >= simW || sy < 0 || sy >= simH) continue;
      const ddx = sx + 0.5 - cx;
      const ddy = sy + 0.5 - cy;
      sumW += Math.exp(-(ddx * ddx + ddy * ddy) / s2);
    }
  }
  if (sumW <= 0) return;
  const scale = strength / sumW;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = ix0 + dx;
      const sy = iy0 + dy;
      if (sx < 0 || sx >= simW || sy < 0 || sy >= simH) continue;
      const ddx = sx + 0.5 - cx;
      const ddy = sy + 0.5 - cy;
      const w = Math.exp(-(ddx * ddx + ddy * ddy) / s2);
      waveBuf[sy * simW + sx] += scale * w;
    }
  }
}

/** Spread energy along motion so fast swipes read as one wave, not a string of rings. */
function injectMotionStroke(
  waveBuf: Float32Array,
  simW: number,
  simH: number,
  fullW: number,
  fullH: number,
  dotPx: number,
  x0Buf: number,
  y0BufBottom: number,
  x1Buf: number,
  y1BufBottom: number,
  velCss: number
): void {
  const dx = x1Buf - x0Buf;
  const dy = y1BufBottom - y0BufBottom;
  const distBuf = Math.sqrt(dx * dx + dy * dy);
  if (distBuf < 0.25) return;

  const velT = Math.min(velCss, 120);
  const sigmaBoost = 1 + Math.min(velT / 48, 2.4);
  const radiusBoost = Math.min(6, INJECT_RADIUS + Math.floor(velT / 22));
  const sigma = INJECT_SIGMA * sigmaBoost;

  /** Sublinear total energy — fast moves don’t stack huge spikes */
  const strokeEnergy = Math.min(0.48 * Math.sqrt(velT + 0.4), 0.95);

  const steps = Math.max(
    1,
    Math.min(STROKE_MAX_SAMPLES, Math.ceil(distBuf / (STROKE_SAMPLE_PX * 0.85)))
  );
  const per = strokeEnergy / steps;

  for (let s = 0; s < steps; s++) {
    const t = (s + 0.5) / steps;
    const mxBuf = x0Buf + dx * t;
    const myBuf = y0BufBottom + dy * t;
    injectKernelSoft(
      waveBuf,
      simW,
      simH,
      fullW,
      fullH,
      dotPx,
      mxBuf,
      myBuf,
      per,
      sigma,
      radiusBoost
    );
  }
}

function copyHeightsToRGBA(
  src: Float32Array,
  dst: Float32Array,
  len: number
): void {
  for (let i = 0; i < len; i++) {
    const v = src[i];
    const o = i * 4;
    dst[o] = v;
    dst[o + 1] = v;
    dst[o + 2] = v;
    dst[o + 3] = 1.0;
  }
}

export type BayerDitherHeroProps = {
  imageSrc: string;
  className?: string;
};

export function BayerDitherHero({ imageSrc, className }: BayerDitherHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(
      Math.min(
        typeof window !== "undefined" ? window.devicePixelRatio : 1,
        MAX_PIXEL_RATIO
      )
    );
    renderer.setClearColor(CLEAR_HEX, 1);
    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    const bayerTex = makeBayerTextureFloat();
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    let material: THREE.ShaderMaterial | null = null;
    let photoTex: THREE.Texture | null = null;

    let buf0: Float32Array | null = null;
    let buf1: Float32Array | null = null;
    let waterTex: THREE.DataTexture | null = null;
    let waterData: Float32Array | null = null;
    let simW = 0;
    let simH = 0;
    let fullGridW = 1;
    let fullGridH = 1;
    let waveInBuf0 = true;

    /** Last pointer position (CSS px, container-relative) — updated on pointermove */
    const lastPointerCss = { x: 0, y: 0 };
    /** Previous rAF sample — frame-to-frame velocity for visible ripples */
    const prevRafCss = { x: 0, y: 0 };
    let pointerInside = false;

    const syncDotUniform = () => {
      if (!material) return;
      const pr = renderer.getPixelRatio();
      if (container.clientWidth <= 0) return;
      material.uniforms.uDotSizePx.value = DOT_SIZE_CSS * pr;
    };

    const allocWave = () => {
      const pr = renderer.getPixelRatio();
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      const bufW = cssW * pr;
      const bufH = cssH * pr;
      const dotPx = DOT_SIZE_CSS * pr;
      const dims = computeSimDims(bufW, bufH, dotPx);
      simW = dims.simW;
      simH = dims.simH;
      fullGridW = dims.fullW;
      fullGridH = dims.fullH;

      const n = simW * simH;
      buf0 = new Float32Array(n);
      buf1 = new Float32Array(n);

      if (waterTex) {
        waterTex.dispose();
      }
      const { tex, data } = makeWaterTexture(simW, simH);
      waterTex = tex;
      waterData = data;

      if (material) {
        material.uniforms.uWater.value = waterTex;
        material.uniforms.uWaterGridFull.value.set(fullGridW, fullGridH);
      }
      waveInBuf0 = true;
    };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      if (material) {
        material.uniforms.uResolution.value.set(
          w * renderer.getPixelRatio(),
          h * renderer.getPixelRatio()
        );
        syncDotUniform();
      }
      allocWave();
    };

    const readPointer = (e: { clientX: number; clientY: number }) => {
      const rect = container.getBoundingClientRect();
      lastPointerCss.x = e.clientX - rect.left;
      lastPointerCss.y = e.clientY - rect.top;
    };

    /**
     * Track pointer on `window` so ripples still work when fixed nav, overlays,
     * or stacking prevent the canvas container from receiving pointer events.
     */
    const onPointerMoveGlobal = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (inside) {
        if (!pointerInside) {
          pointerInside = true;
          readPointer(e);
          prevRafCss.x = lastPointerCss.x;
          prevRafCss.y = lastPointerCss.y;
        } else {
          readPointer(e);
        }
      } else {
        pointerInside = false;
      }
    };

    const onWindowBlur = () => {
      pointerInside = false;
    };

    const startTime = performance.now();

    loader.load(
      imageSrc,
      (tex) => {
        tex.generateMipmaps = false;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        photoTex = tex;

        allocWave();

        material = new THREE.ShaderMaterial({
          uniforms: {
            uPhoto: { value: tex },
            uBayer: { value: bayerTex },
            uWater: { value: waterTex },
            uResolution: {
              value: new THREE.Vector2(0, 0),
            },
            uDotSizePx: { value: DOT_SIZE_CSS },
            uColorDark: { value: COL_DARK.clone() },
            uColorBright: { value: COL_LIGHT.clone() },
            uTime: { value: 0 },
            uWaterGridFull: { value: new THREE.Vector2(fullGridW, fullGridH) },
          },
          vertexShader,
          fragmentShader,
          depthTest: false,
          depthWrite: false,
        });

        const geo = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geo, material);
        scene.add(mesh);
        resize();
      },
      undefined,
      (err) => console.error("[BayerDitherHero] texture load failed", err)
    );

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const t = (performance.now() - startTime) * 0.001;

      if (material && buf0 && buf1 && waterTex && waterData) {
        material.uniforms.uTime.value = t;

        const src = waveInBuf0 ? buf0 : buf1;
        const dst = waveInBuf0 ? buf1 : buf0;

        if (pointerInside) {
          const mx = lastPointerCss.x;
          const my = lastPointerCss.y;
          const dx = mx - prevRafCss.x;
          const dy = my - prevRafCss.y;
          const vel = Math.sqrt(dx * dx + dy * dy);
          const pr = renderer.getPixelRatio();
          const bufH = container.clientHeight * pr;
          const dotPx = DOT_SIZE_CSS * pr;

          if (vel > RIPPLE_VEL_THRESHOLD) {
            const x0Buf = prevRafCss.x * pr;
            const y0BufBottom = bufH - prevRafCss.y * pr;
            const x1Buf = mx * pr;
            const y1BufBottom = bufH - my * pr;
            injectMotionStroke(
              src,
              simW,
              simH,
              fullGridW,
              fullGridH,
              dotPx,
              x0Buf,
              y0BufBottom,
              x1Buf,
              y1BufBottom,
              vel
            );
          }
          prevRafCss.x = mx;
          prevRafCss.y = my;
        }

        stepWave(src, dst, simW, simH);
        waveInBuf0 = !waveInBuf0;

        const heightBuf = waveInBuf0 ? buf0 : buf1;
        copyHeightsToRGBA(heightBuf, waterData, simW * simH);
        waterTex.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    animate();

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMoveGlobal, { passive: true });
    window.addEventListener("blur", onWindowBlur);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMoveGlobal);
      window.removeEventListener("blur", onWindowBlur);
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      renderer.dispose();
      bayerTex.dispose();
      if (waterTex) waterTex.dispose();
      if (photoTex) photoTex.dispose();
      if (material) material.dispose();
    };
  }, [imageSrc]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ touchAction: "none", pointerEvents: "auto" }}
    />
  );
}
