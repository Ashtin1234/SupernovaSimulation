import * as THREE from 'three';
import { Starfield } from './Starfield';
import { ParticleSystem } from './ParticleSystem';
import { Shockwave } from './Shockwave';
import { StellarCore } from './StellarCore';
import {
  PHASES,
  PHASE_ORDER,
  getRemnantForMass,
  type SimulationPhase,
  type SimulationParams,
  type RemnantType,
} from './types';

export interface SimulationCallbacks {
  onPhaseChange?: (phase: SimulationPhase, phaseInfo: typeof PHASES[SimulationPhase]) => void;
  onProgress?: (phase: SimulationPhase, phaseProgress: number, totalProgress: number) => void;
  onStats?: (stats: {
    particleCount: number;
    shockwaveRadius: number;
    fps: number;
    elapsedTime: number;
  }) => void;
  onRemnantChange?: (remnant: RemnantType) => void;
}

export class SupernovaSimulation {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock = new THREE.Clock();

  private starfield: Starfield;
  private particleSystem: ParticleSystem;
  private shockwave: Shockwave;
  private stellarCore: StellarCore;

  // Neutron star remnant
  private neutronStar: THREE.Mesh;
  private neutronStarMaterial: THREE.ShaderMaterial;
  private neutronStarRings: THREE.Mesh[] = [];

  // Black hole remnant
  private blackHole: THREE.Mesh;
  private blackHoleMaterial: THREE.ShaderMaterial;
  private accretionDisk: THREE.Mesh;
  private accretionDiskMaterial: THREE.ShaderMaterial;

  // Magnetar beams
  private magnetarBeams: THREE.Mesh[] = [];

  // Flash light
  private flashLight: THREE.PointLight;
  private ambientLight: THREE.AmbientLight;

  private currentPhaseIndex = 0;
  private currentPhase: SimulationPhase = 'stable';
  private phaseTime = 0;
  private totalTime = 0;
  private running = true;
  private params: SimulationParams;
  private callbacks: SimulationCallbacks;
  private currentRemnant: RemnantType = 'pulsar';

  // Camera orbit
  private cameraAngle = 0;
  private cameraDistance = 60;
  private cameraHeight = 20;
  private cameraTargetAngle = 0;
  private autoRotate = true;
  private userInteracting = false;

  // FPS tracking
  private frameCount = 0;
  private fpsTimer = 0;
  private currentFps = 60;

  // Flash effect
  private flashIntensity = 0;

  constructor(
    canvas: HTMLCanvasElement,
    params: SimulationParams,
    callbacks: SimulationCallbacks
  ) {
    this.params = params;
    this.callbacks = callbacks;
    this.currentRemnant = getRemnantForMass(params.coreMass);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000005, 0.0008);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.updateCameraPosition();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000005, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Lighting
    this.ambientLight = new THREE.AmbientLight(0x222244, 0.5);
    this.scene.add(this.ambientLight);

    this.flashLight = new THREE.PointLight(0xffffff, 0, 200, 2);
    this.flashLight.position.set(0, 0, 0);
    this.scene.add(this.flashLight);

    // Starfield
    this.starfield = new Starfield(8000, 600);
    this.scene.add(this.starfield.object);

    // Stellar core
    this.stellarCore = new StellarCore();
    this.scene.add(this.stellarCore.object);

    // Particle system
    this.particleSystem = new ParticleSystem(this.params.particleCount);
    this.scene.add(this.particleSystem.object);

    // Shockwave
    this.shockwave = new Shockwave();
    this.scene.add(this.shockwave.object);

    // --- Neutron star (pulsar/magnetar) ---
    this.neutronStarMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color(0.4, 0.6, 1.0) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColor;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
          fresnel = pow(fresnel, 1.5);

          float pulse = sin(uTime * 3.0) * 0.3 + 0.7;
          vec3 color = uColor * pulse;
          color += vec3(0.8, 0.9, 1.0) * fresnel * 1.5;

          gl_FragColor = vec4(color, uIntensity * (0.6 + fresnel * 0.4));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.neutronStar = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 32, 32),
      this.neutronStarMaterial
    );
    this.neutronStar.visible = false;
    this.scene.add(this.neutronStar);

    // Accretion-like rings around neutron star
    for (let i = 0; i < 2; i++) {
      const ringGeo = new THREE.TorusGeometry(2 + i * 1.5, 0.15, 8, 64);
      const ringMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uColor: { value: new THREE.Color(0.3, 0.5, 1.0) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uIntensity;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float a = sin(vUv.x * 30.0 + uTime * 2.0) * 0.5 + 0.5;
            gl_FragColor = vec4(uColor, a * uIntensity * 0.4);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + (i % 2) * 0.3;
      ring.rotation.z = (i % 2) * 0.5;
      ring.visible = false;
      this.neutronStarRings.push(ring);
      this.scene.add(ring);
    }

    // --- Magnetar beams — twin cones of radiation ---
    for (let i = 0; i < 2; i++) {
      const beamGeo = new THREE.ConeGeometry(3, 25, 32, 1, true);
      const beamMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vDist;
          void main() {
            vUv = uv;
            vDist = position.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uIntensity;
          varying vec2 vUv;
          varying float vDist;
          void main() {
            float fade = 1.0 - abs(vDist) / 12.5;
            float pulse = sin(uTime * 4.0) * 0.3 + 0.7;
            float swirl = sin(vUv.x * 20.0 + uTime * 3.0) * 0.5 + 0.5;
            vec3 color = vec3(0.2, 0.4, 1.0);
            gl_FragColor = vec4(color, fade * pulse * swirl * uIntensity * 0.15);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.visible = false;
      if (i === 1) beam.rotation.x = Math.PI;
      this.magnetarBeams.push(beam);
      this.scene.add(beam);
    }

    // --- Black hole ---
    this.blackHoleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
          fresnel = pow(fresnel, 0.5);

          // Event horizon — pure black with thin photon ring
          vec3 ringColor = vec3(1.0, 0.6, 0.2);
          vec3 color = ringColor * fresnel * 2.0;

          gl_FragColor = vec4(color, uIntensity * fresnel);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.blackHole = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 32, 32),
      this.blackHoleMaterial
    );
    this.blackHole.visible = false;
    this.scene.add(this.blackHole);

    // Accretion disk for black hole
    this.accretionDiskMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vPos;

        void main() {
          float angle = atan(vPos.z, vPos.x);
          float dist = length(vec2(vPos.x, vPos.z));

          // Doppler-shifted ring pattern
          float ring = sin(dist * 3.0 - uTime * 2.0) * 0.5 + 0.5;
          float spiral = sin(angle * 5.0 + dist * 2.0 - uTime * 1.5) * 0.5 + 0.5;

          // Color: hot inner (white-orange) to cool outer (red)
          float heat = 1.0 - dist / 8.0;
          vec3 inner = vec3(1.0, 0.9, 0.7);
          vec3 outer = vec3(1.0, 0.3, 0.1);
          vec3 color = mix(outer, inner, heat);

          float alpha = (ring * 0.5 + spiral * 0.3 + 0.2) * uIntensity;
          alpha *= smoothstep(1.8, 3.0, dist) * smoothstep(10.0, 7.0, dist);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.accretionDisk = new THREE.Mesh(
      new THREE.RingGeometry(2, 9, 128, 1),
      this.accretionDiskMaterial
    );
    this.accretionDisk.rotation.x = Math.PI / 2 - 0.2;
    this.accretionDisk.visible = false;
    this.scene.add(this.accretionDisk);

    // Set initial phase
    this.setPhase('stable');

    // Event listeners
    window.addEventListener('resize', this.onResize);
    this.setupMouseControls(canvas);
  }

  private setupMouseControls(canvas: HTMLCanvasElement): void {
    let mouseDown = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
      mouseDown = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.userInteracting = true;
    });

    window.addEventListener('mouseup', () => {
      mouseDown = false;
      setTimeout(() => {
        this.userInteracting = false;
      }, 2000);
    });

    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      this.cameraTargetAngle += dx * 0.005;
      this.cameraHeight = Math.max(-40, Math.min(60, this.cameraHeight - dy * 0.3));
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(
        15,
        Math.min(300, this.cameraDistance + e.deltaY * 0.05)
      );
    });

    // Touch controls
    let touchLastX = 0;
    let touchLastY = 0;
    let touchDist = 0;

    canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          touchLastX = e.touches[0].clientX;
          touchLastY = e.touches[0].clientY;
          this.userInteracting = true;
        } else if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          touchDist = Math.sqrt(dx * dx + dy * dy);
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
          const dx = e.touches[0].clientX - touchLastX;
          const dy = e.touches[0].clientY - touchLastY;
          touchLastX = e.touches[0].clientX;
          touchLastY = e.touches[0].clientY;
          this.cameraTargetAngle += dx * 0.005;
          this.cameraHeight = Math.max(-40, Math.min(60, this.cameraHeight - dy * 0.3));
        } else if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const newDist = Math.sqrt(dx * dx + dy * dy);
          const delta = newDist - touchDist;
          this.cameraDistance = Math.max(
            15,
            Math.min(300, this.cameraDistance - delta * 0.1)
          );
          touchDist = newDist;
        }
      },
      { passive: false }
    );

    canvas.addEventListener('touchend', () => {
      setTimeout(() => {
        this.userInteracting = false;
      }, 2000);
    });
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private updateCameraPosition(): void {
    this.camera.position.x = Math.cos(this.cameraAngle) * this.cameraDistance;
    this.camera.position.z = Math.sin(this.cameraAngle) * this.cameraDistance;
    this.camera.position.y = this.cameraHeight;
    this.camera.lookAt(0, 0, 0);
  }

  private getMassScale(): number {
    // Scale the star's visual size with mass (logarithmic)
    return 0.6 + Math.log(this.params.coreMass / 8) * 0.35;
  }

  private getMassEnergyMultiplier(): number {
    // Higher mass = more violent explosion
    return 0.5 + this.params.coreMass / 20;
  }

  private setPhase(phase: SimulationPhase): void {
    if (this.currentPhase === phase) return;
    this.forceSetPhase(phase);
  }

  private forceSetPhase(phase: SimulationPhase): void {
    this.currentPhase = phase;
    this.phaseTime = 0;
    this.stellarCore.setPhase(phase);

    const phaseInfo = PHASES[phase];
    this.callbacks.onPhaseChange?.(phase, phaseInfo);

    const massScale = this.getMassScale();
    const massEnergy = this.getMassEnergyMultiplier();

    // Phase-specific actions
    switch (phase) {
      case 'stable':
        this.particleSystem.clear();
        this.stellarCore.setScale(massScale);
        this.hideAllRemnants();
        break;

      case 'collapse':
        this.particleSystem.clear();
        break;

      case 'ignition': {
        // Massive neutrino burst — scales with mass
        this.particleSystem.burst(
          Math.floor(5000 * massEnergy),
          40 * this.params.explosionEnergy * massEnergy,
          new THREE.Color(0.9, 0.95, 1.0),
          [2, 5],
          [1.5, 3],
          'neutrino'
        );
        this.shockwave.launch(
          25 * this.params.explosionEnergy * massEnergy,
          new THREE.Color(1, 0.95, 0.8),
          12
        );
        this.flashIntensity = 1.0;
        this.flashLight.color = new THREE.Color(1, 0.95, 0.9);
        break;
      }

      case 'explosion': {
        const energy = this.params.explosionEnergy * massEnergy;
        this.particleSystem.burst(
          Math.floor(8000 * energy),
          35 * energy,
          new THREE.Color(1.0, 0.5, 0.15),
          [3, 8],
          [4, 8],
          'ejecta'
        );
        this.particleSystem.burst(
          Math.floor(4000 * energy),
          25 * energy,
          new THREE.Color(1.0, 0.8, 0.3),
          [2, 5],
          [3, 6],
          'debris'
        );
        this.shockwave.launch(
          20 * energy,
          new THREE.Color(1.0, 0.4, 0.1),
          15
        );
        this.flashIntensity = 1.5;
        this.flashLight.color = new THREE.Color(1, 0.5, 0.2);
        break;
      }

      case 'expansion': {
        const energy = this.params.explosionEnergy * massEnergy;
        this.particleSystem.shellBurst(
          Math.floor(6000 * energy),
          8 * massScale,
          20 * energy,
          new THREE.Color(0.7, 0.3, 0.9),
          [2, 6],
          [6, 12]
        );
        this.particleSystem.burst(
          Math.floor(3000 * energy),
          15 * energy,
          new THREE.Color(0.5, 0.2, 0.8),
          [2, 4],
          [5, 10],
          'debris'
        );
        this.flashIntensity = 0.3;
        break;
      }

      case 'remnant':
        // Determine remnant type based on current mass
        this.currentRemnant = getRemnantForMass(this.params.coreMass);
        this.callbacks.onRemnantChange?.(this.currentRemnant);
        this.showRemnant(this.currentRemnant);
        this.stellarCore.setOpacity(0.3);
        this.flashIntensity = 0;
        break;
    }
  }

  private hideAllRemnants(): void {
    this.neutronStar.visible = false;
    this.neutronStarMaterial.uniforms.uIntensity.value = 0;
    this.neutronStarRings.forEach((r) => (r.visible = false));
    this.magnetarBeams.forEach((b) => (b.visible = false));
    this.blackHole.visible = false;
    this.blackHoleMaterial.uniforms.uIntensity.value = 0;
    this.accretionDisk.visible = false;
    this.accretionDiskMaterial.uniforms.uIntensity.value = 0;
  }

  private showRemnant(remnant: RemnantType): void {
    this.hideAllRemnants();

    switch (remnant) {
      case 'pulsar':
        this.neutronStar.visible = true;
        this.neutronStarMaterial.uniforms.uColor.value = new THREE.Color(0.4, 0.6, 1.0);
        this.neutronStarRings.forEach((r) => {
          r.visible = true;
          (r.material as THREE.ShaderMaterial).uniforms.uColor.value = new THREE.Color(0.3, 0.5, 1.0);
        });
        break;

      case 'magnetar':
        this.neutronStar.visible = true;
        this.neutronStarMaterial.uniforms.uColor.value = new THREE.Color(0.6, 0.3, 1.0);
        this.neutronStarRings.forEach((r) => {
          r.visible = true;
          (r.material as THREE.ShaderMaterial).uniforms.uColor.value = new THREE.Color(0.5, 0.2, 0.9);
        });
        this.magnetarBeams.forEach((b) => (b.visible = true));
        break;

      case 'blackhole':
        this.blackHole.visible = true;
        this.accretionDisk.visible = true;
        break;
    }
  }

  jumpToPhase(targetIndex: number): void {
    const clamped = Math.max(0, Math.min(PHASE_ORDER.length - 1, targetIndex));

    // Clean up current state
    this.particleSystem.clear();
    this.shockwave.stop();
    this.hideAllRemnants();
    this.stellarCore.setScale(this.getMassScale());
    this.stellarCore.setOpacity(1);
    this.flashIntensity = 0;

    this.currentPhaseIndex = clamped;
    this.phaseTime = 0;
    this.forceSetPhase(PHASE_ORDER[clamped]);
  }

  private advancePhase(): void {
    this.currentPhaseIndex++;
    if (this.currentPhaseIndex >= PHASE_ORDER.length) {
      this.currentPhaseIndex = 0;
    }
    this.setPhase(PHASE_ORDER[this.currentPhaseIndex]);
  }

  reset(): void {
    this.currentPhaseIndex = 0;
    this.phaseTime = 0;
    this.totalTime = 0;
    this.flashIntensity = 0;
    this.particleSystem.clear();
    this.shockwave.stop();
    this.hideAllRemnants();
    this.stellarCore.setScale(this.getMassScale());
    this.stellarCore.setOpacity(1);
    this.forceSetPhase('stable');
  }

  setRunning(running: boolean): void {
    this.running = running;
  }

  setAutoRotate(auto: boolean): void {
    this.autoRotate = auto;
  }

  isRunning(): boolean {
    return this.running;
  }

  setParams(params: Partial<SimulationParams>): void {
    const massChanged = params.coreMass !== undefined && params.coreMass !== this.params.coreMass;
    this.params = { ...this.params, ...params };

    if (massChanged) {
      // Update remnant type for new mass
      const newRemnant = getRemnantForMass(this.params.coreMass);
      if (newRemnant !== this.currentRemnant) {
        this.currentRemnant = newRemnant;
        this.callbacks.onRemnantChange?.(newRemnant);
        // If already in remnant phase, swap the visual
        if (this.currentPhase === 'remnant') {
          this.showRemnant(newRemnant);
        }
      }
      // Update star scale live during stable phase
      if (this.currentPhase === 'stable') {
        this.stellarCore.setScale(this.getMassScale());
      }
    }
  }

  getParams(): SimulationParams {
    return { ...this.params };
  }

  getPhase(): SimulationPhase {
    return this.currentPhase;
  }

  getRemnant(): RemnantType {
    return this.currentRemnant;
  }

  getTotalElapsed(): number {
    return this.totalTime;
  }

  private updatePhase(dt: number): void {
    this.phaseTime += dt * this.params.timeScale;
    this.totalTime += dt * this.params.timeScale;

    const phaseInfo = PHASES[this.currentPhase];
    const phaseProgress = Math.min(1, this.phaseTime / phaseInfo.duration);

    // Total progress across all phases
    let totalElapsed = 0;
    let totalDuration = 0;
    for (const p of PHASE_ORDER) {
      totalDuration += PHASES[p].duration;
    }
    for (let i = 0; i < this.currentPhaseIndex; i++) {
      totalElapsed += PHASES[PHASE_ORDER[i]].duration;
    }
    totalElapsed += this.phaseTime;
    const totalProgress = Math.min(1, totalElapsed / totalDuration);

    this.callbacks.onProgress?.(this.currentPhase, phaseProgress, totalProgress);

    const massScale = this.getMassScale();

    // Phase-specific continuous updates
    switch (this.currentPhase) {
      case 'stable':
        if (Math.random() < 0.3 * this.params.timeScale) {
          this.particleSystem.burst(
            3,
            3,
            new THREE.Color(1, 0.7, 0.3),
            [1, 3],
            [2, 4],
            'debris'
          );
        }
        break;

      case 'collapse':
        this.stellarCore.setCollapseProgress(phaseProgress);
        this.stellarCore.setScale(massScale * (1 - phaseProgress * 0.5));
        if (Math.random() < 0.5 * this.params.timeScale) {
          this.particleSystem.shellBurst(
            5,
            6 * massScale - phaseProgress * 3,
            2,
            new THREE.Color(0.8, 0.2, 0.05),
            [1, 2],
            [1, 2]
          );
        }
        break;

      case 'ignition': {
        const flashCurve =
          phaseProgress < 0.3 ? phaseProgress / 0.3 : 1 - (phaseProgress - 0.3) / 0.7;
        this.stellarCore.setFlashIntensity(flashCurve);
        this.stellarCore.setScale(massScale * (0.5 + flashCurve * 1.5));
        this.flashIntensity = flashCurve * 2;
        break;
      }

      case 'explosion': {
        const expScale = massScale * (1 + phaseProgress * 4);
        this.stellarCore.setScale(expScale);
        if (phaseProgress > 0.3) {
          this.stellarCore.setOpacity(Math.max(0, 1 - (phaseProgress - 0.3) / 0.5));
        }
        this.flashIntensity = Math.max(0, this.flashIntensity - dt * 2);
        break;
      }

      case 'expansion':
        this.stellarCore.setOpacity(0.05);
        this.flashIntensity = 0;
        break;

      case 'remnant': {
        const nsIntensity = Math.min(1, phaseProgress * 2);
        if (this.currentRemnant === 'pulsar' || this.currentRemnant === 'magnetar') {
          this.neutronStarMaterial.uniforms.uIntensity.value = nsIntensity;
          this.neutronStarRings.forEach((r) => {
            (r.material as THREE.ShaderMaterial).uniforms.uIntensity.value = nsIntensity;
          });
          if (this.currentRemnant === 'magnetar') {
            this.magnetarBeams.forEach((b) => {
              (b.material as THREE.ShaderMaterial).uniforms.uIntensity.value = nsIntensity;
            });
          }
        } else if (this.currentRemnant === 'blackhole') {
          this.blackHoleMaterial.uniforms.uIntensity.value = nsIntensity;
          this.accretionDiskMaterial.uniforms.uIntensity.value = nsIntensity * 0.8;
        }
        this.stellarCore.setOpacity(0.1);
        break;
      }
    }

    if (phaseProgress >= 1) {
      this.advancePhase();
    }
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.05, this.clock.getDelta());

    // FPS tracking
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.currentFps = Math.round(this.frameCount / this.fpsTimer);
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    if (this.running) {
      this.updatePhase(dt);
    }

    // Update systems
    this.starfield.update(dt);
    this.stellarCore.update(dt);
    this.shockwave.update(dt);

    const drag = this.currentPhase === 'remnant' ? 0.05 : 0.02;
    this.particleSystem.update(dt, this.currentPhase, drag);

    // Flash light
    this.flashLight.intensity = this.flashIntensity * 5;
    this.flashIntensity = Math.max(0, this.flashIntensity - dt * 0.5);

    // Neutron star / magnetar update
    if (this.neutronStar.visible) {
      this.neutronStarMaterial.uniforms.uTime.value = this.totalTime;
      this.neutronStar.rotation.y += dt * (this.currentRemnant === 'magnetar' ? 5 : 2);
      this.neutronStarRings.forEach((r, i) => {
        const mat = r.material as THREE.ShaderMaterial;
        mat.uniforms.uTime.value = this.totalTime;
        r.rotation.z += dt * (0.5 + i * 0.3);
      });
      if (this.currentRemnant === 'magnetar') {
        // Beams rotate with the star
        this.magnetarBeams.forEach((b) => {
          const mat = b.material as THREE.ShaderMaterial;
          mat.uniforms.uTime.value = this.totalTime;
          b.rotation.y = this.neutronStar.rotation.y;
          b.rotation.z = Math.sin(this.totalTime * 0.5) * 0.2;
        });
      }
    }

    // Black hole update
    if (this.blackHole.visible) {
      this.blackHoleMaterial.uniforms.uTime.value = this.totalTime;
      this.accretionDiskMaterial.uniforms.uTime.value = this.totalTime;
      this.accretionDisk.rotation.z += dt * 0.8;
    }

    // Camera auto-rotate
    if (this.autoRotate && !this.userInteracting) {
      this.cameraTargetAngle += dt * 0.02;
    }
    this.cameraAngle += (this.cameraTargetAngle - this.cameraAngle) * 0.05;
    this.updateCameraPosition();

    this.renderer.render(this.scene, this.camera);

    this.callbacks.onStats?.({
      particleCount: this.particleSystem.particleCount,
      shockwaveRadius: this.shockwave.radius,
      fps: this.currentFps,
      elapsedTime: this.totalTime,
    });
  };

  start(): void {
    this.clock.start();
    this.animate();
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.starfield.dispose();
    this.particleSystem.dispose();
    this.shockwave.dispose();
    this.stellarCore.dispose();
    this.neutronStar.geometry.dispose();
    this.neutronStarMaterial.dispose();
    this.neutronStarRings.forEach((r) => {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    });
    this.magnetarBeams.forEach((b) => {
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    });
    this.blackHole.geometry.dispose();
    this.blackHoleMaterial.dispose();
    this.accretionDisk.geometry.dispose();
    this.accretionDiskMaterial.dispose();
    this.renderer.dispose();
  }
}
