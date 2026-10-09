export interface SimulationParams {
  coreMass: number;
  explosionEnergy: number;
  particleCount: number;
  shockwaveSpeed: number;
  timeScale: number;
}

export type SimulationPhase =
  | 'stable'
  | 'collapse'
  | 'ignition'
  | 'explosion'
  | 'expansion'
  | 'remnant';

export type RemnantType = 'pulsar' | 'magnetar' | 'blackhole';

export interface PhaseInfo {
  name: string;
  description: string;
  duration: number; // seconds
  color: string;
}

export interface StarPreset {
  name: string;
  catalog: string;
  mass: number;
  remnant: RemnantType;
  description: string;
}

export const STAR_PRESETS: StarPreset[] = [
  {
    name: 'Betelgeuse',
    catalog: 'α Orionis',
    mass: 15,
    remnant: 'pulsar',
    description:
      'A red supergiant in Orion, one of the largest stars known. When it explodes — perhaps within 100,000 years — it will briefly outshine the full Moon.',
  },
  {
    name: 'Antares',
    catalog: 'α Scorpii',
    mass: 18,
    remnant: 'pulsar',
    description:
      'The heart of the Scorpion. A red supergiant 700 times the Sun\'s diameter. Its supernova will be visible in daylight.',
  },
  {
    name: 'Eta Carinae',
    catalog: 'η Carinae',
    mass: 40,
    remnant: 'magnetar',
    description:
      'A massive binary system prone to violent outbursts. Already surrounded by ejected material from its 1843 eruption. A magnetar awaits.',
  },
  {
    name: 'WR-104',
    catalog: 'Wolf-Rayet 104',
    mass: 30,
    remnant: 'magnetar',
    description:
      'A dying Wolf-Rayet star spinning rapidly and firing gamma-ray beams toward Earth. Its death will forge an ultra-magnetic neutron star.',
  },
  {
    name: 'R136a1',
    catalog: 'RMC 136a1',
    mass: 50,
    remnant: 'blackhole',
    description:
      'The most massive known star — 50 solar masses. Too massive to leave a neutron star. Its core will collapse directly into a black hole.',
  },
  {
    name: 'Sanduleak -69° 202',
    catalog: 'Sk -69° 202',
    mass: 20,
    remnant: 'pulsar',
    description:
      'The progenitor of Supernova 1987A — the closest supernova observed in 400 years. A blue supergiant that surprised astronomers by exploding.',
  },
];

export const REMNANT_INFO: Record<RemnantType, { name: string; description: string }> = {
  pulsar: {
    name: 'Pulsar',
    description:
      'A rapidly rotating neutron star — a city-sized ball of pure nuclear matter spinning hundreds of times per second, sweeping lighthouse beams of radiation across the cosmos.',
  },
  magnetar: {
    name: 'Magnetar',
    description:
      'A neutron star with the most powerful magnetic field in the universe — a trillion times stronger than Earth\'s. It can crack its own crust in starquakes visible across galaxies.',
  },
  blackhole: {
    name: 'Black Hole',
    description:
      'The core collapsed past the neutron degeneracy limit. No known force can stop gravity — spacetime itself folds inward, creating a singularity from which nothing, not even light, escapes.',
  },
};

export function getRemnantForMass(mass: number): RemnantType {
  if (mass >= 40) return 'blackhole';
  if (mass >= 25) return 'magnetar';
  return 'pulsar';
}

export function getRemnantName(remnant: RemnantType): string {
  return REMNANT_INFO[remnant].name;
}

export const PHASES: Record<SimulationPhase, PhaseInfo> = {
  stable: {
    name: 'Stellar Equilibrium',
    description:
      'The star fuses silicon to iron in its core. Radiation pressure balances gravity — for now, the star is in hydrostatic equilibrium.',
    duration: 5,
    color: '#ffdd88',
  },
  collapse: {
    name: 'Core Collapse',
    description:
      "Iron fusion absorbs energy instead of releasing it. The core can no longer support itself and implodes inward at 23% the speed of light, reaching nuclear density in under a second.",
    duration: 3,
    color: '#ff6644',
  },
  ignition: {
    name: 'Neutron Bounce',
    description:
      'The inner core reaches neutron degeneracy pressure and halts. Infalling matter slams into the ultra-dense core at ~70,000 km/s, creating a shockwave that reverses the collapse.',
    duration: 2,
    color: '#ffffaa',
  },
  explosion: {
    name: 'Detonation',
    description:
      'The shockwave tears outward through the star. Neutrinos deposit enormous energy. The outer layers are blown apart with the luminosity of a billion suns — a Type II supernova is born.',
    duration: 4,
    color: '#ff3300',
  },
  expansion: {
    name: 'Ejecta Expansion',
    description:
      'Stellar debris races outward at thousands of km/s, carrying newly forged heavy elements — iron, gold, uranium — into the cosmos. The blast will expand for thousands of years.',
    duration: 8,
    color: '#aa66ff',
  },
  remnant: {
    name: 'Supernova Remnant',
    description:
      'All that remains is an expanding nebula of glowing gas and, at the center, a neutron star or black hole — the densest matter in the observable universe.',
    duration: 6,
    color: '#4488ff',
  },
};

export const PHASE_ORDER: SimulationPhase[] = [
  'stable',
  'collapse',
  'ignition',
  'explosion',
  'expansion',
  'remnant',
];

export function getMassCategory(mass: number): { label: string; color: string } {
  if (mass < 15) return { label: 'Red Supergiant', color: '#ff6644' };
  if (mass < 25) return { label: 'Blue Supergiant', color: '#88aaff' };
  if (mass < 40) return { label: 'Wolf-Rayet Star', color: '#aaccff' };
  return { label: 'Hypergiant', color: '#ffaa44' };
}
