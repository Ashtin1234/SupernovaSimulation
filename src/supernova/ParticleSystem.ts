import * as THREE from 'three';
import type { SimulationPhase } from './types';

// Particle data stored outside BufferGeometry attributes for CPU-side updates
interface ParticleData {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  originalVelocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
  type: 'ejecta' | 'neutrino' | 'debris';
}

const PARTICLE_TEXTURE_SIZE = 128;

function createGlowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = PARTICLE_TEXTURE_SIZE;
  canvas.height = PARTICLE_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(
    PARTICLE_TEXTURE_SIZE / 2,
    PARTICLE_TEXTURE_SIZE / 2,
    0,
    PARTICLE_TEXTURE_SIZE / 2,
    PARTICLE_TEXTURE_SIZE / 2,
    PARTICLE_TEXTURE_SIZE / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1.0)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PARTICLE_TEXTURE_SIZE, PARTICLE_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class ParticleSystem {
  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private particles: ParticleData[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private texture: THREE.Texture;
  private maxParticles: number;

  constructor(maxParticles = 30000) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);
    this.alphas = new Float32Array(maxParticles);

    // Initialize all alphas to 0 (invisible)
    for (let i = 0; i < maxParticles; i++) {
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geometry.setDrawRange(0, maxParticles);

    this.texture = createGlowTexture();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: this.texture },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;

        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, tex.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  get object(): THREE.Object3D {
    return this.points;
  }

  get particleCount(): number {
    return this.particles.length;
  }

  /** Generate a directional vector with random spread */
  private randomDirection(spread = 1): THREE.Vector3 {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const sinPhi = Math.sin(phi);
    return new THREE.Vector3(
      sinPhi * Math.cos(theta) * spread,
      sinPhi * Math.sin(theta) * spread,
      Math.cos(phi) * spread
    );
  }

  /** Spawn particles in a burst from center */
  burst(
    count: number,
    speed: number,
    color: THREE.Color,
    sizeRange: [number, number],
    lifeRange: [number, number],
    type: ParticleData['type'] = 'ejecta',
    directionBias?: THREE.Vector3,
    spread = 1.0
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;

      const dir = this.randomDirection(spread);
      if (directionBias) {
        dir.add(directionBias.clone().multiplyScalar(0.3));
        dir.normalize();
      }

      const speedVar = speed * (0.5 + Math.random() * 0.8);
      const vel = dir.multiplyScalar(speedVar);
      const colorVar = color.clone();
      // Add slight color variation
      colorVar.offsetHSL(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.2
      );

      const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);

      this.particles.push({
        position: new THREE.Vector3(0, 0, 0),
        velocity: vel,
        originalVelocity: vel.clone(),
        color: colorVar,
        size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
        life: 0,
        maxLife: life,
        type,
      });
    }
  }

  /** Spawn particles along a spherical shell (for shockwave ejecta) */
  shellBurst(
    count: number,
    radius: number,
    speed: number,
    color: THREE.Color,
    sizeRange: [number, number],
    lifeRange: [number, number]
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;

      const dir = this.randomDirection(1);
      const pos = dir.clone().multiplyScalar(radius);
      const vel = dir.clone().multiplyScalar(speed * (0.7 + Math.random() * 0.6));

      const colorVar = color.clone();
      colorVar.offsetHSL(
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.25
      );

      const life = lifeRange[0] + Math.random() * (lifeRange[1] - lifeRange[0]);

      this.particles.push({
        position: pos,
        velocity: vel,
        originalVelocity: vel.clone(),
        color: colorVar,
        size: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
        life: 0,
        maxLife: life,
        type: 'debris',
      });
    }
  }

  /** Clear all particles instantly */
  clear(): void {
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }
    (this.points.geometry.attributes['aAlpha'] as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes['aSize'] as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Fade out all particles gradually */
  fadeAll(rate: number): void {
    for (const p of this.particles) {
      p.maxLife = Math.min(p.maxLife, p.life + 0.5);
    }
  }

  update(dt: number, phase: SimulationPhase, drag: number): void {
    const n = this.particles.length;

    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      p.life += dt;

      // Apply drag (simulates interaction with interstellar medium)
      p.velocity.multiplyScalar(Math.max(0, 1 - drag * dt));

      // Update position
      p.position.addScaledVector(p.velocity, dt);

      // Calculate alpha based on life
      const lifeRatio = p.life / p.maxLife;
      let alpha: number;
      if (lifeRatio < 0.1) {
        alpha = lifeRatio / 0.1; // Fade in
      } else if (lifeRatio < 0.7) {
        alpha = 1.0;
      } else {
        alpha = Math.max(0, 1 - (lifeRatio - 0.7) / 0.3); // Fade out
      }

      // Color shift: cool down over time (blue/red shift)
      const coolFactor = Math.min(1, lifeRatio * 1.5);
      if (p.type === 'ejecta' || p.type === 'debris') {
        p.color.offsetHSL(0, -dt * 0.02, -dt * 0.05 * coolFactor);
      }

      // Size grows slightly then shrinks
      const sizeMultiplier = lifeRatio < 0.3 ? 1 + lifeRatio * 2 : Math.max(0.3, 2 - lifeRatio);

      // Write to buffers
      this.positions[i * 3] = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;
      this.colors[i * 3] = p.color.r;
      this.colors[i * 3 + 1] = p.color.g;
      this.colors[i * 3 + 2] = p.color.b;
      this.sizes[i] = p.size * sizeMultiplier;
      this.alphas[i] = alpha;
    }

    // Remove dead particles
    this.particles = this.particles.filter((p) => p.life < p.maxLife);

    // Clear unused slots
    const newN = this.particles.length;
    for (let i = newN; i < Math.max(n, newN); i++) {
      this.alphas[i] = 0;
      this.sizes[i] = 0;
    }

    this.points.geometry.setDrawRange(0, Math.max(newN, 1));

    const posAttr = this.points.geometry.attributes['position'] as THREE.BufferAttribute;
    const colAttr = this.points.geometry.attributes['aColor'] as THREE.BufferAttribute;
    const sizeAttr = this.points.geometry.attributes['aSize'] as THREE.BufferAttribute;
    const alphaAttr = this.points.geometry.attributes['aAlpha'] as THREE.BufferAttribute;

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
