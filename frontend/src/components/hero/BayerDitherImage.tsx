"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  CLEAR_HEX,
  COL_DARK,
  COL_LIGHT,
  DOT_SIZE_CSS,
  fragmentShaderStaticDither,
  makeBayerTextureFloat,
  MAX_PIXEL_RATIO,
  vertexShaderQuad,
} from "./bayerDitherShared";

export type BayerDitherImageProps = {
  src: string;
  alt?: string;
  className?: string;
};

/**
 * Inline image with the same ordered Bayer dither + layered breathing as the hero
 * (no water, no cursor). Fills its positioned parent.
 */
export function BayerDitherImage({ src, alt, className }: BayerDitherImageProps) {
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
    if (alt) canvas.setAttribute("aria-label", alt);
    else canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const bayerTex = makeBayerTextureFloat();
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    let material: THREE.ShaderMaterial | null = null;
    let photoTex: THREE.Texture | null = null;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h, false);
      if (material) {
        const pr = renderer.getPixelRatio();
        material.uniforms.uResolution.value.set(w * pr, h * pr);
        material.uniforms.uDotSizePx.value = DOT_SIZE_CSS * pr;
      }
    };

    const startTime = performance.now();

    loader.load(
      src,
      (tex) => {
        tex.generateMipmaps = false;
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        photoTex = tex;

        const pr = renderer.getPixelRatio();
        const w = container.clientWidth;
        const h = container.clientHeight;

        const tw = Math.max(1, tex.image.width);
        const th = Math.max(1, tex.image.height);

        material = new THREE.ShaderMaterial({
          uniforms: {
            uPhoto: { value: tex },
            uBayer: { value: bayerTex },
            uResolution: {
              value: new THREE.Vector2(w * pr, h * pr),
            },
            uTexSize: { value: new THREE.Vector2(tw, th) },
            uDotSizePx: { value: DOT_SIZE_CSS * pr },
            uColorDark: { value: COL_DARK.clone() },
            uColorBright: { value: COL_LIGHT.clone() },
            uTime: { value: 0 },
          },
          vertexShader: vertexShaderQuad,
          fragmentShader: fragmentShaderStaticDither,
          depthTest: false,
          depthWrite: false,
        });

        const geo = new THREE.PlaneGeometry(2, 2);
        const mesh = new THREE.Mesh(geo, material);
        scene.add(mesh);
        resize();
      },
      undefined,
      () => {}
    );

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      if (material) {
        material.uniforms.uTime.value = (performance.now() - startTime) * 0.001;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      renderer.dispose();
      bayerTex.dispose();
      if (photoTex) photoTex.dispose();
      if (material) material.dispose();
    };
  }, [src]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ touchAction: "none" }}
    />
  );
}
