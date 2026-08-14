import {
  Color,
  DepthTexture,
  Mesh,
  MeshNormalMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type PerspectiveCamera,
  type Scene as WorldScene,
  type WebGLRenderer,
} from 'three'
import { artPalette } from './style'

/**
 * M1.3 — one fullscreen ink pass.
 *
 * The inverted hull can only draw a silhouette. Messenger's printed look is
 * silhouette *and* crease: window frames, roof seams, timber joints. Those are
 * depth and normal discontinuities at a constant screen width, which a
 * per-mesh shell cannot produce.
 *
 * Two extra scene draws (colour+depth, then normals) plus one fullscreen
 * composite. The hulls they replace were a second draw of every outlined mesh;
 * this is a swap, not an addition. `?ink=0` turns it off.
 */
export class InkPass {
  private readonly colorTarget: WebGLRenderTarget
  private readonly normalTarget: WebGLRenderTarget
  private readonly normalMaterial = new MeshNormalMaterial({ fog: false })
  private readonly composite: ShaderMaterial
  private readonly screen = new Scene()
  private readonly screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly quad: Mesh

  constructor() {
    const depthTexture = new DepthTexture(1, 1)
    this.colorTarget = new WebGLRenderTarget(1, 1, { depthTexture })
    this.normalTarget = new WebGLRenderTarget(1, 1)
    this.composite = new ShaderMaterial({
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tDepth: { value: depthTexture },
        tNormal: { value: this.normalTarget.texture },
        resolution: { value: new Vector2(1, 1) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 120 },
        depthScale: { value: 1.35 },
        normalKick: { value: 0.28 },
        inkColor: { value: new Color(artPalette.outline) },
      },
      vertexShader: INK_VERTEX,
      fragmentShader: INK_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite)
    this.quad.frustumCulled = false
    this.screen.add(this.quad)
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(1, Math.floor(width * pixelRatio))
    const h = Math.max(1, Math.floor(height * pixelRatio))
    this.colorTarget.setSize(w, h)
    this.normalTarget.setSize(w, h)
    this.composite.uniforms.resolution.value.set(w, h)
  }

  render(renderer: WebGLRenderer, scene: WorldScene, camera: Camera): void {
    const perspective = camera as PerspectiveCamera
    if (typeof perspective.near === 'number') {
      this.composite.uniforms.cameraNear.value = perspective.near
      this.composite.uniforms.cameraFar.value = perspective.far
    }

    const previousTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.colorTarget)
    renderer.render(scene, camera)

    const previousOverride = scene.overrideMaterial
    scene.overrideMaterial = this.normalMaterial
    camera.layers.disable(1)
    renderer.setRenderTarget(this.normalTarget)
    renderer.render(scene, camera)
    camera.layers.enable(1)
    scene.overrideMaterial = previousOverride

    renderer.setRenderTarget(previousTarget)
    renderer.render(this.screen, this.screenCamera)
  }

  dispose(): void {
    this.colorTarget.dispose()
    this.normalTarget.dispose()
    this.colorTarget.depthTexture?.dispose()
    this.normalMaterial.dispose()
    this.composite.dispose()
    this.quad.geometry.dispose()
  }
}

const INK_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const INK_FRAGMENT = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float depthScale;
uniform float normalKick;
uniform vec3 inkColor;
varying vec2 vUv;

float linearDepth(float raw) {
  float z = raw * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

void main() {
  vec2 texel = 1.0 / resolution;
  vec3 color = texture2D(tColor, vUv).rgb;

  float d = linearDepth(texture2D(tDepth, vUv).x);
  float dX = abs(linearDepth(texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x) - linearDepth(texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x));
  float dY = abs(linearDepth(texture2D(tDepth, vUv + vec2(0.0, texel.y)).x) - linearDepth(texture2D(tDepth, vUv - vec2(0.0, texel.y)).x));
  float depthEdge = clamp(max(dX, dY) * depthScale, 0.0, 1.0);

  vec3 n = texture2D(tNormal, vUv).xyz * 2.0 - 1.0;
  vec3 nX = texture2D(tNormal, vUv + vec2(texel.x, 0.0)).xyz * 2.0 - 1.0;
  vec3 nY = texture2D(tNormal, vUv + vec2(0.0, texel.y)).xyz * 2.0 - 1.0;
  float normalEdge = max(1.0 - dot(n, nX), 1.0 - dot(n, nY));
  normalEdge = smoothstep(normalKick, normalKick + 0.18, normalEdge);

  float fade = 1.0 - smoothstep(26.0, 54.0, d);
  float ink = max(depthEdge, normalEdge) * fade;
  gl_FragColor = vec4(mix(color, inkColor, ink), 1.0);
}
`
