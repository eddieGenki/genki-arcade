// WebGL CRT mode — renders the source video through a fragment shader that
// approximates a curved Trinitron-style CRT: scanlines, RGB slot mask,
// vignette, slight curvature, gentle gamma. Mutually exclusive with the
// 4K upscaler — both write to the same on-stage canvas slot, and stacking
// "sharpened scanlines" looks weird anyway.
//
// Tuning knobs are at the top of the fragment shader as constants. Default
// values lean toward "stylized CRT vibe" rather than period-accurate
// emulation — won't fool a CRT-shader purist (look at CRT-Royale or
// CRT-Geom for that), but reads instantly as "playing on an old TV."

import { useEffect, useRef } from 'react';

const VERT_SRC = /* glsl */ `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = /* glsl */ `
precision mediump float;
uniform sampler2D u_video;
uniform vec2 u_resolution;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
varying vec2 v_uv;

const float CURVATURE = 0.04;       // 0 = flat, 0.1 = obvious bend
const float SCANLINE_DARK = 0.72;   // alternate-row brightness multiplier
const float MASK_R = 1.10;
const float MASK_G = 1.10;
const float MASK_B = 1.10;
const float MASK_DARK = 0.82;       // off-channel brightness in the triad
const float VIGNETTE_STRENGTH = 0.45;
const float GAMMA = 0.95;           // <1 lifts midtones a touch (CRT phosphor look)

void main() {
  // Slight barrel curvature — bend the UV outward so corners pull in.
  vec2 uv = v_uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) * CURVATURE;
  uv = uv + uv * offset * offset;
  uv = uv * 0.5 + 0.5;

  // Out-of-bounds after the curve = black bezel
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 color = texture2D(u_video, uv).rgb;

  // RGB slot mask — every output column gets one channel boosted, the
  // other two slightly attenuated. The triad pattern reads as "phosphor
  // dots" without being aggressive enough to harm legibility.
  float maskCol = mod(gl_FragCoord.x, 3.0);
  vec3 mask;
  if (maskCol < 1.0)      mask = vec3(MASK_R, MASK_DARK, MASK_DARK);
  else if (maskCol < 2.0) mask = vec3(MASK_DARK, MASK_G, MASK_DARK);
  else                    mask = vec3(MASK_DARK, MASK_DARK, MASK_B);
  color *= mask;

  // Scanlines — every other output row darkened. Pattern scales naturally
  // when the canvas is upscaled by the browser to fill the viewport, so it
  // reads as denser scanlines on smaller displays and chunkier ones on 4K.
  float scanline = mod(gl_FragCoord.y, 2.0);
  if (scanline < 1.0) color *= SCANLINE_DARK;

  // Soft circular vignette toward the corners.
  vec2 vUv = v_uv - 0.5;
  float vignette = 1.0 - dot(vUv, vUv) * VIGNETTE_STRENGTH;
  color *= vignette;

  // Mild gamma curve — lifts midtones, deepens darks. CRTs felt warmer.
  color = pow(color, vec3(GAMMA));

  // User color sliders. Applied last so they layer on top of all the
  // CRT character — that way "saturation 0.5" still leaves the scanlines
  // and slot mask intact, just desaturated. Order matches CSS filter:
  // brightness (multiply), contrast (around 0.5 midpoint), saturation
  // (mix toward luma).
  color *= u_brightness;
  color = (color - 0.5) * u_contrast + 0.5;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(lum), color, u_saturation);

  gl_FragColor = vec4(color, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'shader compile error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'program link error';
    gl.deleteProgram(program);
    throw new Error(info);
  }
  return program;
}

export interface CRTCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  className?: string;
  style?: React.CSSProperties;
  /** Outbound ref so the parent (recording / screenshot pipeline) can read
   * pixels from the post-CRT canvas. */
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  /** Color sliders. Baked into the shader so the canvas pixels reflect
   * them, which is critical for recording — ctx.filter on canvas-source
   * drawImage isn't reliable across browsers, so we apply BCS in-shader
   * and the canvas pixels are correct everywhere they're sampled. */
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export function CRTCanvas({
  videoRef,
  className,
  style,
  canvasRef: externalCanvasRef,
  brightness = 1,
  contrast = 1,
  saturation = 1,
}: CRTCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  // Mirror BCS into refs so the long-lived render loop can read latest
  // values without being torn down/rebuilt on every slider drag.
  const brightnessRef = useRef(brightness);
  const contrastRef = useRef(contrast);
  const saturationRef = useRef(saturation);
  useEffect(() => {
    brightnessRef.current = brightness;
    contrastRef.current = contrast;
    saturationRef.current = saturation;
  }, [brightness, contrast, saturation]);

  useEffect(() => {
    if (externalCanvasRef) externalCanvasRef.current = canvasRef.current;
    return () => {
      if (externalCanvasRef) externalCanvasRef.current = null;
    };
  }, [externalCanvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const videoEl = videoRef.current;
    if (!canvas || !videoEl) return;

    // preserveDrawingBuffer: true so screenshot's drawImage() can read the
    // last rendered frame instead of a cleared buffer. See same comment in
    // upscaler.tsx — same WebGL gotcha, same fix.
    const gl = canvas.getContext('webgl', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      console.warn('CRT: WebGL not available, falling back.');
      return;
    }

    let program: WebGLProgram;
    try {
      program = buildProgram(gl);
    } catch (e) {
      console.warn('CRT: shader build failed, falling back.', e);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uVideo = gl.getUniformLocation(program, 'u_video');
    const uResolution = gl.getUniformLocation(program, 'u_resolution');
    const uBrightness = gl.getUniformLocation(program, 'u_brightness');
    const uContrast = gl.getUniformLocation(program, 'u_contrast');
    const uSaturation = gl.getUniformLocation(program, 'u_saturation');
    gl.uniform1i(uVideo, 0);

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      const vEl = videoRef.current;
      if (!vEl) return;
      const vw = vEl.videoWidth;
      const vh = vEl.videoHeight;
      if (!vw || !vh) return;

      // Render at native source resolution — the scanline pattern scales
      // naturally with the browser's display upscale. No 2× cost like the
      // sharpener needed.
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }
      gl.viewport(0, 0, vw, vh);

      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vEl);
        gl.uniform2f(uResolution, vw, vh);
        gl.uniform1f(uBrightness, brightnessRef.current);
        gl.uniform1f(uContrast, contrastRef.current);
        gl.uniform1f(uSaturation, saturationRef.current);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } catch {
        // Some browsers throw if the video frame isn't ready yet — skip frame.
      }
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [videoRef]);

  return <canvas ref={canvasRef} className={className} style={style} />;
}
