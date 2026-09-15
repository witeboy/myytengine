// Export finishing pass: light sharpening and fine film grain, one GPU draw per frame.
//
// AI animations arrive at 864×496 and are enlarged 2–3× at export, so they look soft next
// to the still images. Sharpening restores edge contrast and a little moving grain hides
// the softness. Neither adds real detail — that would take an AI upscaler.
//
// createFinisher returns null when WebGL2 is unavailable; export then runs unfinished.

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // Texture row 0 is the top of the source canvas; clip-space +1 is the top of the output.
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_sharpen;
uniform float u_grain;
uniform uint u_frame;
in vec2 v_uv;
out vec4 outColor;

// pcg3d integer hash: uniform noise without the banding sin()-based hashes show.
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

void main() {
  vec3 c = texture(u_src, v_uv).rgb;
  vec3 blur = (texture(u_src, v_uv + vec2(u_texel.x, 0.0)).rgb +
               texture(u_src, v_uv - vec2(u_texel.x, 0.0)).rgb +
               texture(u_src, v_uv + vec2(0.0, u_texel.y)).rgb +
               texture(u_src, v_uv - vec2(0.0, u_texel.y)).rgb) * 0.25;
  vec3 col = c + u_sharpen * (c - blur);

  // Monochrome grain, strongest in the midtones like film, lighter in deep shadow and highlight.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float mid = 1.0 - pow(abs(lum - 0.5) * 2.0, 2.0);
  float n = float(pcg3d(uvec3(uvec2(gl_FragCoord.xy), u_frame)).x) / 4294967295.0 - 0.5;
  col += n * u_grain * (0.35 + 0.65 * mid);

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const FINISH_DEFAULTS = { sharpen: 0.5, grain: 0.04 };

export function createFinisher(width, height, opts = {}) {
  const sharpen = opts.sharpen ?? FINISH_DEFAULTS.sharpen;
  const grain = opts.grain ?? FINISH_DEFAULTS.grain;
  if (typeof OffscreenCanvas === 'undefined') return null;

  const canvas = new OffscreenCanvas(width, height);
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
    }
    return shader;
  };

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
    }
  } catch (e) {
    console.warn('[Export] Finishing pass disabled:', e.message);
    return null;
  }
  gl.useProgram(program);

  // One oversized triangle covers the viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  // Sample a little wider at higher resolutions so the effect looks the same at any size.
  const radius = Math.max(1, Math.min(width, height) / 1080);
  gl.uniform1i(gl.getUniformLocation(program, 'u_src'), 0);
  gl.uniform2f(gl.getUniformLocation(program, 'u_texel'), radius / width, radius / height);
  gl.uniform1f(gl.getUniformLocation(program, 'u_sharpen'), sharpen);
  gl.uniform1f(gl.getUniformLocation(program, 'u_grain'), grain);
  const uFrame = gl.getUniformLocation(program, 'u_frame');
  gl.viewport(0, 0, width, height);

  return {
    canvas,
    /** Finish one frame. `source` is any texture source the size of the output. */
    apply(source, frameIndex) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform1ui(uFrame, frameIndex >>> 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return canvas;
    },
    dispose() {
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
