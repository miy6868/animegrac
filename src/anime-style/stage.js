// AnimeStage: renderer + camera + key light + seamless floor wired to an AnimeStyle.
// Use it as-is for demos/videos, or copy the few lines you need into your game.
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  DirectionalLight,
  Mesh,
  PlaneGeometry,
  Vector3,
  Box3,
  Sphere,
  PCFSoftShadowMap,
  Color,
  Clock,
} from 'three';

const _box = new Box3();
const _sphere = new Sphere();
const _v = new Vector3();

export class AnimeStage {
  /**
   * @param {object} o
   *   style       AnimeStyle (required)
   *   canvas      existing canvas (optional)
   *   container   element to append the canvas to and to fit (optional)
   *   width, height  fixed size in CSS px (otherwise fits the container / window)
   *   aspect      lock the canvas aspect (e.g. 9/16) inside the container
   *   pixelRatio  default devicePixelRatio (capped at 2)
   *   fov         vertical fov in degrees (default 22: long lens = flatter, more illustrative)
   *   shadowMapSize default 2048
   */
  constructor(o = {}) {
    if (!o.style) throw new Error('AnimeStage needs { style }');
    this.style = o.style;
    this.container = o.container || null;
    this.fixedSize = o.width && o.height ? { w: o.width, h: o.height } : null;
    this.aspectLock = o.aspect || null;

    this.renderer = new WebGLRenderer({
      canvas: o.canvas,
      antialias: true,
      preserveDrawingBuffer: !!o.preserveDrawingBuffer,
    });
    this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    if (this.container && !o.canvas) this.container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = new Color();
    this.camera = new PerspectiveCamera(o.fov ?? 22, 1, 0.05, 200);
    this.target = new Vector3(0, 1, 0);

    // Key light: only used for cast shadows. Cel shading reads style.lightDirection.
    this.keyLight = new DirectionalLight(0xffffff, 1);
    this.keyLight.castShadow = true;
    const sm = o.shadowMapSize ?? 2048;
    this.keyLight.shadow.mapSize.set(sm, sm);
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.012;
    this.keyLight.shadow.radius = 3;
    this.scene.add(this.keyLight, this.keyLight.target);
    this.shadowRadius = 3;

    // Seamless floor: same color as the background, only shows cast shadows.
    this.ground = new Mesh(new PlaneGeometry(400, 400));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.name = 'ground';
    this.style.stylize(this.ground, { kind: 'ground', color: 'auto', followBackground: true });
    this.ground.receiveShadow = true;
    this.ground.castShadow = false;
    this.scene.add(this.ground);

    this.clock = new Clock();
    this.time = 0;
    this._onFrame = null;
    this._unsub = this.style.onChange(() => this._applyStyle());
    this._applyStyle();

    if (!this.fixedSize) {
      this._resize = () => this.resize();
      if (this.container && globalThis.ResizeObserver) {
        this._ro = new ResizeObserver(this._resize);
        this._ro.observe(this.container);
      } else globalThis.addEventListener?.('resize', this._resize);
    }
    this.resize();
  }

  get canvas() {
    return this.renderer.domElement;
  }

  _applyStyle() {
    const p = this.style.params;
    this.style.backgroundColorObject(this.scene.background);
    this.ground.visible = p.ground.visible;
    this.keyLight.castShadow = p.light.castShadows;
  }

  resize() {
    let w;
    let h;
    if (this.fixedSize) ({ w, h } = this.fixedSize);
    else if (this.container) {
      w = this.container.clientWidth;
      h = this.container.clientHeight;
    } else {
      w = globalThis.innerWidth;
      h = globalThis.innerHeight;
    }
    if (this.aspectLock) {
      if (w / h > this.aspectLock) w = Math.round(h * this.aspectLock);
      else h = Math.round(w / this.aspectLock);
    }
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setSize(w, h) {
    this.fixedSize = { w, h };
    this.resize();
  }

  /**
   * Orbit-style framing.
   *   target    point to look at (Vector3 or [x,y,z])
   *   distance  metres from target
   *   yaw       degrees around Y (0 = camera on +Z looking at -Z)
   *   pitch     degrees (+ = camera above target, looking down)
   *   fov       vertical fov
   *   shiftY    vertical lens shift as a fraction of the frame height (+ = subject moves down,
   *             leaving sky above, like a poster composition)
   */
  frame({ target, distance = 5, yaw = 0, pitch = 0, fov, shiftY = 0 } = {}) {
    if (target) this.target.copy(Array.isArray(target) ? _v.fromArray(target) : target);
    if (fov) this.camera.fov = fov;
    const y = (yaw * Math.PI) / 180;
    const p = (pitch * Math.PI) / 180;
    this.camera.position.set(
      this.target.x + Math.sin(y) * Math.cos(p) * distance,
      this.target.y + Math.sin(p) * distance,
      this.target.z + Math.cos(y) * Math.cos(p) * distance,
    );
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.shiftY = shiftY;
    this._applyShift();
    return this;
  }

  _applyShift() {
    const c = this.camera;
    c.updateProjectionMatrix();
    if (this.shiftY) c.projectionMatrix.elements[9] += this.shiftY * 2;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
  }

  /**
   * Frame an object's bounding box (any model size).
   *   yaw, pitch   degrees, as in frame()
   *   fill         fraction of the frame height the object should occupy (default 0.7)
   *   anchor       0..1 vertical position of the object's center in the frame (0.5 = centered,
   *                0.6 = lower, leaving sky above)
   */
  frameObject(object, { yaw = 20, pitch = 4, fill = 0.7, anchor = 0.58, fov } = {}) {
    _box.setFromObject(object, true);
    const size = _box.getSize(new Vector3());
    const center = _box.getCenter(new Vector3());
    if (fov) this.camera.fov = fov;
    const h = Math.max(size.y, size.x / Math.max(0.3, this.camera.aspect) * 0.9, 1e-3);
    const vfov = (this.camera.fov * Math.PI) / 180;
    const distance = h / fill / (2 * Math.tan(vfov / 2));
    this.frame({ target: center, distance, yaw, pitch, shiftY: anchor - 0.5 });
    this.fitShadowTo(object);
    return this;
  }

  /** Fit the shadow camera tightly around objects (call after building the scene). */
  fitShadowTo(...objects) {
    _box.makeEmpty();
    for (const o of objects) _box.expandByObject(o);
    _box.getBoundingSphere(_sphere);
    this._shadowSphere = _sphere.clone();
    this._placeLight();
    return this;
  }

  _placeLight() {
    const s = this._shadowSphere || new Sphere(this.target.clone(), 2);
    const dir = this.style.lightDirection;
    const r = s.radius * 1.05;
    this.keyLight.position.copy(s.center).addScaledVector(dir, r * 3);
    this.keyLight.target.position.copy(s.center);
    const cam = this.keyLight.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = r * 0.5;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
    this.keyLight.shadow.radius = this.shadowRadius;
  }

  /**
   * Deterministic render for video: sets the clock to `time` (seconds), calls the
   * onFrame callback with the fixed dt, renders. Use with a fixed fps.
   */
  renderAt(time, dt = 1 / 30) {
    this.time = time - dt;
    this.render(dt);
  }

  /** Render one frame. dt in seconds (default: real time). */
  render(dt) {
    const d = dt ?? this.clock.getDelta();
    this.time += d;
    if (this.aspectLock || this.shiftY) this._applyShift();
    this.style.update(this.renderer, this.camera, {
      time: this.time,
      focusDistance: this.camera.position.distanceTo(this.target),
    });
    this._placeLight();
    if (this._onFrame) this._onFrame(d, this.time);
    this.renderer.render(this.scene, this.camera);
  }

  /** Start a render loop. onFrame(dt, time) is called before each render. */
  start(onFrame) {
    this._onFrame = onFrame || null;
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.render());
    return this;
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  /** PNG data URL of the current view (renders a fresh frame first). */
  capture(type = 'image/png') {
    this.render(0);
    return this.renderer.domElement.toDataURL(type);
  }

  dispose() {
    this.stop();
    this._unsub?.();
    this._ro?.disconnect();
    if (this._resize) globalThis.removeEventListener?.('resize', this._resize);
    this.renderer.dispose();
  }
}
