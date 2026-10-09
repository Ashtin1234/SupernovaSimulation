import * as THREE from 'three';
import type { SimulationPhase } from './types';

const LAYER_COUNT = 4;

export class StellarCore {
  private group: THREE.Group;
  private layers: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; baseRadius: number }[] = [];
  private glow: THREE.Mesh;
  private glowMaterial: THREE.ShaderMaterial;
  private corona: THREE.Mesh;
  private coronaMaterial: THREE.ShaderMaterial;
  private currentPhase: SimulationPhase = 'stable';
  private time = 0;
  private pulseIntensity = 0;

  constructor() {
    this.group = new THREE.Group();

    // Inner core layers — concentric glowing spheres
    const layerColors = [
      new THREE.Color(1.0, 0.95, 0.6), // Innermost — white-gold
      new THREE.Color(1.0, 0.7, 0.3), // Yellow-orange
      new THREE.Color(1.0, 0.4, 0.15), // Red-orange
      new THREE.Color(0.8, 0.2, 0.1), // Dark red
    ];

    const baseRadii = [1.5, 3.0, 5.0, 7.5];

    for (let i = 0; i < LAYER_COUNT; i++) {
      const radius = baseRadii[i];
      const geometry = new THREE.IcosahedronGeometry(radius, i < 2 ? 5 : 4);

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: layerColors[i] },
          uDistortion: { value: 0.0 },
          uPulse: { value: 0.0 },
          uOpacity: { value: i === 3 ? 0.5 : 0.85 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uDistortion;
          uniform float uPulse;
          varying vec3 vNormal;
          varying vec3 vPos;
          varying float vDisplacement;

          // 3D simplex noise (simplified)
          vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
          vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
          vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
          vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

          float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
          }

          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPos = position;

            float noiseScale = 2.0;
            float noiseSpeed = 0.5;
            float n1 = snoise(position * noiseScale + uTime * noiseSpeed);
            float n2 = snoise(position * noiseScale * 2.0 - uTime * noiseSpeed * 0.7);

            float displacement = (n1 * 0.5 + n2 * 0.25) * (uDistortion + 0.05);
            displacement += uPulse * sin(uTime * 8.0 + position.x * 3.0) * 0.15;
            vDisplacement = displacement;

            vec3 newPos = position + normal * displacement;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uTime;
          uniform float uPulse;
          uniform float uOpacity;
          varying vec3 vNormal;
          varying vec3 vPos;
          varying float vDisplacement;

          void main() {
            vec3 viewDir = normalize(-vPos);
            float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
            fresnel = pow(fresnel, 1.5);

            // Brighter where displacement is higher (hot spots)
            float heat = 1.0 + vDisplacement * 3.0 + uPulse * 2.0;

            vec3 color = uColor * (0.6 + fresnel * 0.8) * heat;
            color = mix(color, vec3(1.0, 1.0, 0.9), uPulse * 0.5);

            gl_FragColor = vec4(color, uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geometry, material);
      this.group.add(mesh);
      this.layers.push({ mesh, material, baseRadius: baseRadii[i] });
    }

    // Outer glow halo
    const glowGeometry = new THREE.SphereGeometry(12, 64, 64);
    this.glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1, 0.6, 0.3) },
        uIntensity: { value: 0.3 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
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
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
          fresnel = pow(fresnel, 3.0);

          gl_FragColor = vec4(uColor, fresnel * uIntensity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    this.glow = new THREE.Mesh(glowGeometry, this.glowMaterial);
    this.group.add(this.glow);

    // Corona — wispy outer atmosphere
    const coronaGeometry = new THREE.SphereGeometry(10, 64, 64);
    this.coronaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1, 0.5, 0.2) },
        uIntensity: { value: 0.15 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;

        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
          fresnel = pow(fresnel, 1.5);

          float n = noise(vUv * 30.0 + uTime * 0.3);
          float n2 = noise(vUv * 60.0 - uTime * 0.2);
          float wisps = n * 0.5 + n2 * 0.3;

          gl_FragColor = vec4(uColor, fresnel * uIntensity * (0.5 + wisps));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.corona = new THREE.Mesh(coronaGeometry, this.coronaMaterial);
    this.group.add(this.corona);
  }

  get object(): THREE.Object3D {
    return this.group;
  }

  setPhase(phase: SimulationPhase): void {
    if (this.currentPhase === phase) return;
    this.currentPhase = phase;

    switch (phase) {
      case 'stable':
        this.layers.forEach((l, i) => {
          l.material.uniforms.uColor.value = [
            new THREE.Color(1.0, 0.95, 0.6),
            new THREE.Color(1.0, 0.7, 0.3),
            new THREE.Color(1.0, 0.4, 0.15),
            new THREE.Color(0.8, 0.2, 0.1),
          ][i];
          l.material.uniforms.uDistortion.value = 0.05;
          l.material.uniforms.uOpacity.value = i === 3 ? 0.5 : 0.85;
        });
        this.glowMaterial.uniforms.uColor.value = new THREE.Color(1, 0.6, 0.3);
        this.glowMaterial.uniforms.uIntensity.value = 0.3;
        this.coronaMaterial.uniforms.uColor.value = new THREE.Color(1, 0.5, 0.2);
        this.coronaMaterial.uniforms.uIntensity.value = 0.15;
        break;

      case 'collapse':
        // Core getting denser, redder, pulsing
        this.layers.forEach((l, i) => {
          l.material.uniforms.uColor.value = [
            new THREE.Color(1.0, 0.5, 0.2),
            new THREE.Color(0.9, 0.3, 0.1),
            new THREE.Color(0.7, 0.15, 0.05),
            new THREE.Color(0.5, 0.08, 0.02),
          ][i];
          l.material.uniforms.uDistortion.value = 0.12;
        });
        this.glowMaterial.uniforms.uColor.value = new THREE.Color(0.8, 0.2, 0.1);
        this.glowMaterial.uniforms.uIntensity.value = 0.15;
        this.coronaMaterial.uniforms.uIntensity.value = 0.08;
        break;

      case 'ignition':
        // Blinding white-blue flash
        this.layers.forEach((l) => {
          l.material.uniforms.uColor.value = new THREE.Color(0.9, 0.95, 1.0);
          l.material.uniforms.uDistortion.value = 0.25;
          l.material.uniforms.uPulse.value = 1.0;
        });
        this.glowMaterial.uniforms.uColor.value = new THREE.Color(0.8, 0.9, 1.0);
        this.glowMaterial.uniforms.uIntensity.value = 1.0;
        this.coronaMaterial.uniforms.uColor.value = new THREE.Color(0.7, 0.8, 1.0);
        this.coronaMaterial.uniforms.uIntensity.value = 0.6;
        break;

      case 'explosion':
        // Explosive orange-red
        this.layers.forEach((l, i) => {
          l.material.uniforms.uColor.value = new THREE.Color(1.0, 0.3 + i * 0.1, 0.05);
          l.material.uniforms.uDistortion.value = 0.4;
          l.material.uniforms.uPulse.value = 0.8;
        });
        this.glowMaterial.uniforms.uColor.value = new THREE.Color(1.0, 0.3, 0.1);
        this.glowMaterial.uniforms.uIntensity.value = 0.8;
        this.coronaMaterial.uniforms.uColor.value = new THREE.Color(1.0, 0.4, 0.15);
        this.coronaMaterial.uniforms.uIntensity.value = 0.4;
        break;

      case 'expansion':
        // Cooling — violet/magenta
        this.layers.forEach((l, i) => {
          l.material.uniforms.uColor.value = new THREE.Color(0.6 + i * 0.1, 0.3, 0.8);
          l.material.uniforms.uDistortion.value = 0.2;
          l.material.uniforms.uPulse.value = 0.2;
          l.material.uniforms.uOpacity.value = Math.max(0.1, 0.5 - i * 0.1);
        });
        this.glowMaterial.uniforms.uColor.value = new THREE.Color(0.5, 0.3, 0.9);
        this.glowMaterial.uniforms.uIntensity.value = 0.3;
        this.coronaMaterial.uniforms.uColor.value = new THREE.Color(0.5, 0.3, 0.8);
        this.coronaMaterial.uniforms.uIntensity.value = 0.2;
        break;

      case 'remnant':
        // Dim blue — neutron star
        this.layers.forEach((l, i) => {
          l.material.uniforms.uColor.value = new THREE.Color(0.3, 0.5, 1.0);
          l.material.uniforms.uDistortion.value = 0.08;
          l.material.uniforms.uPulse.value = 0.1;
          l.material.uniforms.uOpacity.value = i === 0 ? 0.6 : Math.max(0.05, 0.3 - i * 0.08);
        });
        this.layers[0].material.uniforms.uColor.value = new THREE.Color(0.5, 0.7, 1.0);
        this.glowMaterial.uniforms.uColor.value = new THREE.Color(0.3, 0.5, 1.0);
        this.glowMaterial.uniforms.uIntensity.value = 0.15;
        this.coronaMaterial.uniforms.uColor.value = new THREE.Color(0.3, 0.5, 1.0);
        this.coronaMaterial.uniforms.uIntensity.value = 0.1;
        break;
    }
  }

  /** Shrink the core (during collapse) */
  setCollapseProgress(progress: number): void {
    const scale = 1 - progress * 0.6;
    this.layers.forEach((l) => {
      l.mesh.scale.setScalar(scale);
    });
    this.pulseIntensity = progress;
  }

  /** Flash intensity during ignition */
  setFlashIntensity(intensity: number): void {
    this.layers.forEach((l) => {
      l.material.uniforms.uPulse.value = intensity;
    });
    this.glowMaterial.uniforms.uIntensity.value = 0.3 + intensity * 1.5;
    this.coronaMaterial.uniforms.uIntensity.value = 0.15 + intensity * 0.8;
  }

  /** Scale the entire core */
  setScale(scale: number): void {
    this.group.scale.setScalar(scale);
  }

  /** Set overall opacity (for fading) */
  setOpacity(opacity: number): void {
    this.layers.forEach((l) => {
      l.material.uniforms.uOpacity.value = opacity;
    });
    this.glowMaterial.uniforms.uIntensity.value = opacity * 0.3;
    this.coronaMaterial.uniforms.uIntensity.value = opacity * 0.15;
  }

  update(dt: number): void {
    this.time += dt;

    this.layers.forEach((l) => {
      l.material.uniforms.uTime.value = this.time;
    });
    this.glowMaterial.uniforms.uTime.value = this.time;
    this.coronaMaterial.uniforms.uTime.value = this.time;

    // Gentle rotation
    this.group.rotation.y += dt * 0.05;
  }

  dispose(): void {
    this.layers.forEach((l) => {
      l.mesh.geometry.dispose();
      l.material.dispose();
    });
    this.glow.geometry.dispose();
    this.glowMaterial.dispose();
    this.corona.geometry.dispose();
    this.coronaMaterial.dispose();
  }
}
