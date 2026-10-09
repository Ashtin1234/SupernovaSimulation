import * as THREE from 'three';

const SHOCKWAVE_SEGMENTS = 128;

export class Shockwave {
  private mesh: THREE.Mesh;
  private geometry: THREE.SphereGeometry;
  private material: THREE.ShaderMaterial;
  private active = false;
  private age = 0;
  private maxAge: number;
  private expansionSpeed: number;
  private currentRadius = 0;
  private baseColor: THREE.Color;

  constructor() {
    this.geometry = new THREE.SphereGeometry(1, SHOCKWAVE_SEGMENTS, SHOCKWAVE_SEGMENTS);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(1, 0.8, 0.4) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
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
        uniform float uTime;
        uniform float uRadius;
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform float uPixelRatio;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec2 vUv;

        // Simple noise function
        float noise(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          // Fresnel for edge glow
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = 1.0 - max(dot(vNormal, viewDir), 0.0);
          fresnel = pow(fresnel, 2.0);

          // Turbulent pattern
          float n1 = noise(vUv * 20.0 + uTime * 0.5);
          float n2 = noise(vUv * 40.0 - uTime * 0.3);
          float turbulence = (n1 + n2) * 0.5;

          // Ring effect — brighter at the leading edge
          float ring = smoothstep(0.3, 0.6, turbulence + fresnel);

          vec3 color = uColor * (0.5 + fresnel * 1.5 + turbulence * 0.5);
          float alpha = (fresnel * 0.6 + ring * 0.4) * uOpacity;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;

    this.maxAge = 10;
    this.expansionSpeed = 15;
    this.baseColor = new THREE.Color(1, 0.8, 0.4);
  }

  get object(): THREE.Object3D {
    return this.mesh;
  }

  get isActive(): boolean {
    return this.active;
  }

  get radius(): number {
    return this.currentRadius;
  }

  launch(speed: number, color: THREE.Color, duration: number): void {
    this.active = true;
    this.age = 0;
    this.currentRadius = 0.5;
    this.expansionSpeed = speed;
    this.maxAge = duration;
    this.baseColor = color.clone();
    this.material.uniforms.uColor.value = color;
    this.mesh.visible = true;
  }

  stop(): void {
    this.active = false;
    this.mesh.visible = false;
  }

  update(dt: number): void {
    if (!this.active) return;

    this.age += dt;
    const lifeRatio = this.age / this.maxAge;

    if (lifeRatio >= 1) {
      this.stop();
      return;
    }

    // Decelerating expansion
    const decel = 1 - lifeRatio * 0.6;
    this.currentRadius += this.expansionSpeed * decel * dt;
    this.mesh.scale.setScalar(this.currentRadius);

    // Opacity fades over time
    let opacity: number;
    if (lifeRatio < 0.1) {
      opacity = lifeRatio / 0.1;
    } else {
      opacity = Math.max(0, 1 - (lifeRatio - 0.1) / 0.9);
    }
    // Also thin as it expands
    opacity *= Math.max(0.2, 1 - this.currentRadius / 200);

    this.material.uniforms.uOpacity.value = opacity;
    this.material.uniforms.uTime.value = this.age;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
