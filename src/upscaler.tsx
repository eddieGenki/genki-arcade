// WebGL video upscaler — renders the source video at 2x its native resolution
// through a sharpening pass. Intended as a pluggable pipeline; the current
// shader is a simple 5-tap unsharp mask (visible improvement over plain
// browser bilinear at minimal cost). Will be swapped for FSR EASU once we
// validate the rest of the integration.
//
// Layout: this component renders a <canvas> that visually replaces the raw
// <video> when upscaling is enabled. Mirror + image-adjustment CSS still
// apply via className/inline style on the canvas.

import { useEffect, useRef } from 'react';

const VERT_SRC = /* glsl */ `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  // a_pos is in [-1, 1]; map to [0, 1] uv with Y flipped (texImage2D
  // uploads video flipped by default).
  v_uv = (a_pos + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// 5-tap unsharp-mask sharpen on top of GL_LINEAR sampling. Cheap, stable,
// noticeably crisper than plain bilinear. ~30 µs per frame on integrated
// GPUs at 4K. BCS uniforms applied last so the user's color sliders bake
// into the canvas pixels (recording / screenshot pipelines sample those
// pixels directly, and ctx.filter on canvas-source drawImage isn't a
// reliable cross-browser path).
const FRAG_SRC = /* glsl */ `
precision mediump float;
uniform sampler2D u_video;
uniform vec2 u_pixelSize;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
varying vec2 v_uv;
void main() {
  vec2 d = u_pixelSize;
  vec4 c = texture2D(u_video, v_uv);
  vec4 n = texture2D(u_video, v_uv + vec2(0.0, -d.y));
  vec4 s = texture2D(u_video, v_uv + vec2(0.0,  d.y));
  vec4 w = texture2D(u_video, v_uv + vec2(-d.x, 0.0));
  vec4 e = texture2D(u_video, v_uv + vec2( d.x, 0.0));
  // Strength 0.5 sharpening kernel: center 1.5, neighbours -0.125 each.
  vec4 sharpened = c * 1.5 - 0.125 * (n + s + w + e);
  vec3 color = clamp(sharpened.rgb, 0.0, 1.0);

  // BCS — same order as a CSS filter chain.
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

export interface UpscaleCanvasProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  className?: string;
  style?: React.CSSProperties;
  /** Output multiplier on top of source resolution. 2 = 2× upscale. */
  scale?: number;
  /** Optional outbound ref so the parent can read the upscaled canvas
   * (e.g. to route recording / screenshots through it). */
  canvasRef?: React.MutableRefObject<HTMLCanvasElement | null>;
  /** Color slider values baked into the shader so the canvas pixels
   * reflect them — see comment in crt.tsx for the ctx.filter rationale. */
  brightness?: number;
  contrast?: number;
  saturation?: number;
}

export function UpscaleCanvas({
  videoRef,
  className,
  style,
  scale = 2,
  canvasRef: externalCanvasRef,
  brightness = 1,
  contrast = 1,
  saturation = 1,
}: UpscaleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const brightnessRef = useRef(brightness);
  const contrastRef = useRef(contrast);
  const saturationRef = useRef(saturation);
  useEffect(() => {
    brightnessRef.current = brightness;
    contrastRef.current = contrast;
    saturationRef.current = saturation;
  }, [brightness, contrast, saturation]);

  // Mirror the internal canvas ref out to the parent if requested.
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

    // preserveDrawingBuffer: true keeps the rendered frame readable until
    // the next render call. Without it, drawImage(canvas) at screenshot
    // time can capture a cleared framebuffer (blank screenshot bug).
    // Small performance cost; well worth it for correct screenshots.
    const gl = canvas.getContext('webgl', {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      console.warn('Upscaler: WebGL not available, falling back.');
      return;
    }

    let program: WebGLProgram;
    try {
      program = buildProgram(gl);
    } catch (e) {
      console.warn('Upscaler: shader build failed, falling back.', e);
      return;
    }
    gl.useProgram(program);

    // Full-screen quad
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

    // Texture from video — linear sampling for bilinear within taps
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uVideo = gl.getUniformLocation(program, 'u_video');
    const uPixel = gl.getUniformLocation(program, 'u_pixelSize');
    const uBrightness = gl.getUniformLocation(program, 'u_brightness');
    const uContrast = gl.getUniformLocation(program, 'u_contrast');
    const uSaturation = gl.getUniformLocation(program, 'u_saturation');
    gl.uniform1i(uVideo, 0);

    // Cap output dimensions at 4K (3840×2160). Upscaling beyond 4K is
    // wasted work — consumer displays cap there, and quadruple-resolution
    // canvas allocations (8K from 4K source) blow up GPU memory + draw
    // time for zero visible win. At 4K source the pass still runs, just at
    // 1× scale, so users keep the unsharp-mask sharpening without the
    // 8K render.
    const MAX_W = 3840;
    const MAX_H = 2160;

    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      const vEl = videoRef.current;
      if (!vEl) return;
      const vw = vEl.videoWidth;
      const vh = vEl.videoHeight;
      if (!vw || !vh) return;

      const cappedScale = Math.max(
        1,
        Math.min(scale, MAX_W / vw, MAX_H / vh),
      );
      const targetW = Math.round(vw * cappedScale);
      const targetH = Math.round(vh * cappedScale);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      gl.viewport(0, 0, targetW, targetH);

      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vEl);
        gl.uniform2f(uPixel, 1 / vw, 1 / vh);
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
  }, [videoRef, scale]);

  return <canvas ref={canvasRef} className={className} style={style} />;
}
