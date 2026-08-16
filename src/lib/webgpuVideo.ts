/**
 * Track 2: WebGPU frame renderer.
 *
 * Uploads raw frames into GPU textures and draws a fullscreen quad whose
 * fragment shader does the cover/contain fit (plus chroma-key alpha) in one
 * pass. Two transports are supported:
 *   - "rgba": single rgba8unorm texture (fallback path).
 *   - "nv12": Y + interleaved UV textures converted to RGB in the shader
 *     (BT.709 limited range) — 1.5 bytes/pixel so 1080p fits the IPC budget.
 *
 * The GPU objects are typed as `any` on purpose: the DOM lib for this TS
 * target may not ship WebGPU types, and the API surface we use is tiny.
 */

const BUF_UNIFORM = 0x40;
const BUF_COPY_DST = 0x08;
const TEX_COPY_DST = 0x02;
const TEX_BINDING = 0x04;
const STAGE_FRAGMENT = 0x02;
const STAGE_VERTEX = 0x01;
const STAGE_VERTEX_FRAGMENT = STAGE_VERTEX | STAGE_FRAGMENT;

const WGSL_RGBA = /* wgsl */ `
struct Uniforms {
  rect: vec4<f32>,
  chroma: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  )[vi];
  var out: VSOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  let f01 = p * 0.5 + vec2<f32>(0.5, 0.5);
  out.uv = (f01 - u.rect.xy) / u.rect.zw;
  // WebGPU texture origin is top-left; NDC y=-1 is the bottom of the viewport,
  // so mirror V to keep the image upright.
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  if (in.uv.x < 0.0 || in.uv.x > 1.0 || in.uv.y < 0.0 || in.uv.y > 1.0) {
    discard;
  }
  let c = textureSample(tex, samp, in.uv);
  let alpha = select(1.0, c.a, u.chroma > 0.5);
  return vec4<f32>(c.rgb * alpha, alpha);
}
`;

const WGSL_NV12 = /* wgsl */ `
struct Uniforms {
  rect: vec4<f32>,
  chroma: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var texY: texture_2d<f32>;
@group(0) @binding(2) var texUV: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  )[vi];
  var out: VSOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  let f01 = p * 0.5 + vec2<f32>(0.5, 0.5);
  out.uv = (f01 - u.rect.xy) / u.rect.zw;
  // WebGPU texture origin is top-left; mirror V to keep the image upright.
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  if (in.uv.x < 0.0 || in.uv.x > 1.0 || in.uv.y < 0.0 || in.uv.y > 1.0) {
    discard;
  }
  // BT.709 limited range (16-235 -> 0-1).
  let y = textureSample(texY, samp, in.uv).r;
  let uv = textureSample(texUV, samp, in.uv).rg;
  let yv = y - 16.0 / 255.0;
  let uu = uv.r - 0.5;
  let vv = uv.g - 0.5;
  let r = 1.164 * yv + 1.793 * vv;
  let g = 1.164 * yv - 0.213 * uu - 0.533 * vv;
  let b = 1.164 * yv + 2.112 * uu;
  var c = vec4<f32>(r, g, b, 1.0);
  if (u.chroma > 0.5) {
    // Green-key the RGB output (approximation; tuned for common key screens).
    let dist = length(c.rgb - vec3<f32>(0.0, 1.0, 0.0));
    let a = clamp((dist - 0.12) / 0.28, 0.0, 1.0);
    return vec4<f32>(c.rgb * a, a);
  }
  return c;
}
`;

const WGSL_EXTERNAL = /* wgsl */ `
struct Uniforms {
  rect: vec4<f32>,
  chroma: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var tex: texture_external;
@group(0) @binding(2) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  )[vi];
  var out: VSOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  let f01 = p * 0.5 + vec2<f32>(0.5, 0.5);
  out.uv = (f01 - u.rect.xy) / u.rect.zw;
  // WebGPU texture origin is top-left; mirror V to keep the image upright.
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  if (in.uv.x < 0.0 || in.uv.x > 1.0 || in.uv.y < 0.0 || in.uv.y > 1.0) {
    discard;
  }
  var c = textureSampleBaseClampToEdge(tex, samp, in.uv);
  if (u.chroma > 0.5) {
    let dist = length(c.rgb - vec3<f32>(0.0, 1.0, 0.0));
    let a = clamp((dist - 0.12) / 0.28, 0.0, 1.0);
    return vec4<f32>(c.rgb * a, a);
  }
  return c;
}
`;

function fitRect(
  cw: number,
  ch: number,
  sw: number,
  sh: number,
  cover: boolean,
): { dw: number; dh: number } {
  const scale = cover
    ? Math.max(cw / sw, ch / sh)
    : Math.min(cw / sw, ch / sh);
  return { dw: sw * scale, dh: sh * scale };
}

export class WebGpuVideoRenderer {
  private canvas: HTMLCanvasElement;
  private device: any = null;
  private ctx: any = null;
  private pipeline: any = null;
  private nv12Pipeline: any = null;
  private extPipeline: any = null;
  private bindGroup: any = null;
  private nv12BindGroup: any = null;
  private extBindGroup: any = null;
  private texture: any = null;
  private texY: any = null;
  private texUV: any = null;
  private extTexture: any = null;
  private sampler: any = null;
  private uniformBuf: any = null;
  private fmt = "bgra8unorm";
  private texW = 0;
  private texH = 0;
  onUncapturedError: ((msg: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** Create a renderer bound to `canvas`, or null when WebGPU is unavailable.
   * `onFail` receives a short reason string for diagnostics. */
  static async create(
    canvas: HTMLCanvasElement,
    onFail?: (reason: string) => void,
  ): Promise<WebGpuVideoRenderer | null> {
    const fail = (r: string) => {
      onFail?.(r);
      return null;
    };
    const gpu = (navigator as any).gpu;
    if (!gpu?.requestAdapter) return fail("no navigator.gpu");
    try {
      let adapter = await gpu.requestAdapter();
      if (!adapter) {
        adapter = await gpu.requestAdapter({
          powerPreference: "high-performance",
        });
      }
      if (!adapter) return fail("no adapter");
      const device = await adapter.requestDevice();
      if (!device) return fail("no device");
      const ctx = canvas.getContext("webgpu");
      if (!ctx) return fail("canvas webgpu context null (already 2d?)");
      const r = new WebGpuVideoRenderer(canvas);
      r.device = device;
      r.ctx = ctx;
      if (typeof device.addEventListener === "function") {
        device.addEventListener("uncapturederror", (e: any) => {
          r.onUncapturedError?.(
            `uncaptured: ${String(e?.error?.message ?? e)}`,
          );
        });
      }
      r.fmt = gpu.getPreferredCanvasFormat
        ? gpu.getPreferredCanvasFormat()
        : "bgra8unorm";
      r.initPipeline();
      r.configureCanvas();
      return r;
    } catch (e) {
      return fail(`throw: ${String(e)}`);
    }
  }

  private initPipeline() {
    const dev = this.device;

    const rgbaModule = dev.createShaderModule({ code: WGSL_RGBA });
    const rgbaBgl = dev.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: STAGE_VERTEX_FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: STAGE_FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 2,
          visibility: STAGE_FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    const nv12Module = dev.createShaderModule({ code: WGSL_NV12 });
    const nv12Bgl = dev.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: STAGE_VERTEX_FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: STAGE_FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 2,
          visibility: STAGE_FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 3,
          visibility: STAGE_FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    const targets = [
      {
        format: this.fmt,
        blend: {
          color: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
        },
      },
    ];

    this.sampler = dev.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    this.uniformBuf = dev.createBuffer({
      size: 32,
      usage: BUF_UNIFORM | BUF_COPY_DST,
    });

    this.pipeline = dev.createRenderPipeline({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [rgbaBgl] }),
      vertex: { module: rgbaModule, entryPoint: "vs" },
      fragment: { module: rgbaModule, entryPoint: "fs", targets },
      primitive: { topology: "triangle-list" },
    });
    const nv12Pipeline = dev.createRenderPipeline({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [nv12Bgl] }),
      vertex: { module: nv12Module, entryPoint: "vs" },
      fragment: { module: nv12Module, entryPoint: "fs", targets },
      primitive: { topology: "triangle-list" },
    });

    const extModule = dev.createShaderModule({ code: WGSL_EXTERNAL });
    const extBgl = dev.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: STAGE_VERTEX_FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: STAGE_FRAGMENT,
          externalTexture: {},
        },
        {
          binding: 2,
          visibility: STAGE_FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });
    this.extPipeline = dev.createRenderPipeline({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [extBgl] }),
      vertex: { module: extModule, entryPoint: "vs" },
      fragment: { module: extModule, entryPoint: "fs", targets },
      primitive: { topology: "triangle-list" },
    });
  }

  private configureCanvas() {
    this.ctx.configure({
      device: this.device,
      format: this.fmt,
      alphaMode: "premultiplied",
    });
  }

  /** Upload a raw frame (starting at `offset` in `buf`) and draw it.
   * `fmt` is "rgba" or "nv12". Synchronous (queues GPU work). */
  present(
    buf: ArrayBuffer,
    offset: number,
    sw: number,
    sh: number,
    cover: boolean,
    chroma: boolean,
    fmt: string,
  ): void {
    const dev = this.device;
    if (!dev) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    const pw = Math.max(1, Math.round(cw * dpr));
    const ph = Math.max(1, Math.round(ch * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.configureCanvas();
    }

    const upload = (bytes: Uint8Array, swr: number, spr: number) => {
      // bytesPerRow for WebGPU must be a multiple of 256; pad rows when not.
      const need = Math.ceil(spr / 256) * 256;
      let data = bytes;
      if (need !== spr) {
        const padded = new Uint8Array(need * swr);
        for (let y = 0; y < swr; y++) {
          padded.set(bytes.subarray(y * spr, (y + 1) * spr), y * need);
        }
        data = padded;
      }
      return { data, bpr: need };
    };

    if (fmt === "nv12") {
      const uvW = Math.floor(sw / 2);
      const uvH = Math.floor(sh / 2);
      const yLen = sw * sh;
      if (!this.texY || this.texW !== sw || this.texH !== sh) {
        this.texY?.destroy?.();
        this.texUV?.destroy?.();
        this.texY = dev.createTexture({
          size: [sw, sh, 1],
          format: "r8unorm",
          usage: TEX_BINDING | TEX_COPY_DST,
        });
        this.texUV = dev.createTexture({
          size: [uvW, uvH, 1],
          format: "rg8unorm",
          usage: TEX_BINDING | TEX_COPY_DST,
        });
        this.texW = sw;
        this.texH = sh;
        this.nv12BindGroup = dev.createBindGroup({
          layout: this.nv12Pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.uniformBuf } },
            { binding: 1, resource: this.texY.createView() },
            { binding: 2, resource: this.texUV.createView() },
            { binding: 3, resource: this.sampler },
          ],
        });
      }
      const yBytes = new Uint8Array(buf, offset, yLen);
      const uvBytes = new Uint8Array(buf, offset + yLen, uvW * uvH * 2);
      const yUp = upload(yBytes, sh, sw);
      dev.queue.writeTexture(
        { texture: this.texY },
        yUp.data,
        { bytesPerRow: yUp.bpr, rowsPerImage: sh },
        { width: sw, height: sh, depthOrArrayLayers: 1 },
      );
      const uvUp = upload(uvBytes, uvH, sw);
      dev.queue.writeTexture(
        { texture: this.texUV },
        uvUp.data,
        { bytesPerRow: uvUp.bpr, rowsPerImage: uvH },
        { width: uvW, height: uvH, depthOrArrayLayers: 1 },
      );
    } else {
      if (!this.texture || this.texW !== sw || this.texH !== sh) {
        this.texture?.destroy?.();
        this.texture = dev.createTexture({
          size: [sw, sh, 1],
          format: "rgba8unorm",
          usage: TEX_BINDING | TEX_COPY_DST,
        });
        this.texW = sw;
        this.texH = sh;
        this.bindGroup = dev.createBindGroup({
          layout: this.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.uniformBuf } },
            { binding: 1, resource: this.texture.createView() },
            { binding: 2, resource: this.sampler },
          ],
        });
      }
      const up = upload(new Uint8Array(buf, offset, sw * sh * 4), sh, sw * 4);
      dev.queue.writeTexture(
        { texture: this.texture },
        up.data,
        { bytesPerRow: up.bpr, rowsPerImage: sh },
        { width: sw, height: sh, depthOrArrayLayers: 1 },
      );
    }

    const fit = fitRect(cw, ch, sw, sh, cover);
    const imgW = fit.dw / cw;
    const imgH = fit.dh / ch;
    const u = new ArrayBuffer(32);
    new Float32Array(u, 0, 4).set([
      0.5 - imgW / 2,
      0.5 - imgH / 2,
      imgW,
      imgH,
    ]);
    new Float32Array(u, 16)[0] = chroma ? 1 : 0;
    dev.queue.writeBuffer(this.uniformBuf, 0, new Uint8Array(u));

    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(fmt === "nv12" ? this.nv12Pipeline : this.pipeline);
    pass.setBindGroup(
      0,
      fmt === "nv12" ? this.nv12BindGroup : this.bindGroup,
    );
    pass.draw(3, 1, 0, 0);
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  /** Track 3: draw a browser-decoded VideoFrame via GPUExternalTexture (zero
   *  copy when hardware-decoded; the driver converts YUV->RGB). The caller
   *  owns the VideoFrame and must close it after this returns. */
  presentVideoFrame(
    vf: any,
    cover: boolean,
    chroma: boolean,
  ): void {
    const dev = this.device;
    if (!dev) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    const pw = Math.max(1, Math.round(cw * dpr));
    const ph = Math.max(1, Math.round(ch * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.configureCanvas();
    }
    const sw = vf.displayWidth || vf.videoWidth || vf.codedWidth || 0;
    const sh = vf.displayHeight || vf.videoHeight || vf.codedHeight || 0;
    if (sw <= 0 || sh <= 0) return;

    // Import a fresh external texture every frame; prior external textures
    // become invalid once a new one is imported from the same source.
    let ext: any;
    try {
      ext = dev.importExternalTexture({ source: vf });
    } catch {
      return;
    }
    this.extTexture = ext;
    this.extBindGroup = dev.createBindGroup({
      layout: this.extPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: ext },
        { binding: 2, resource: this.sampler },
      ],
    });

    const fit = fitRect(cw, ch, sw, sh, cover);
    const imgW = fit.dw / cw;
    const imgH = fit.dh / ch;
    const u = new ArrayBuffer(32);
    new Float32Array(u, 0, 4).set([
      0.5 - imgW / 2,
      0.5 - imgH / 2,
      imgW,
      imgH,
    ]);
    new Float32Array(u, 16)[0] = chroma ? 1 : 0;
    dev.queue.writeBuffer(this.uniformBuf, 0, new Uint8Array(u));

    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: this.ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(this.extPipeline);
    pass.setBindGroup(0, this.extBindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
    dev.queue.submit([enc.finish()]);
  }

  destroy(): void {
    try {
      this.texture?.destroy?.();
      this.texY?.destroy?.();
      this.texUV?.destroy?.();
      this.uniformBuf?.destroy?.();
    } catch {
      // ignore
    }
    this.device = null;
    this.texture = null;
    this.texY = null;
    this.texUV = null;
    this.extTexture = null;
    this.bindGroup = null;
    this.nv12BindGroup = null;
    this.extBindGroup = null;
    this.pipeline = null;
    this.nv12Pipeline = null;
    this.extPipeline = null;
    this.uniformBuf = null;
  }
}
