import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SupernovaSimulation } from '@/supernova/SupernovaSimulation';
import {
  PHASES,
  PHASE_ORDER,
  STAR_PRESETS,
  REMNANT_INFO,
  getRemnantForMass,
  getMassCategory,
  type SimulationPhase,
  type SimulationParams,
  type StarPreset,
  type RemnantType,
} from '@/supernova/types';
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Settings,
  X,
  Camera,
  Atom,
  Activity,
  Gauge,
  ChevronRight,
  Info,
  Star,
  Sun,
  Radio,
  Circle,
} from 'lucide-react';

const DEFAULT_PARAMS: SimulationParams = {
  coreMass: 15,
  explosionEnergy: 1.0,
  particleCount: 30000,
  shockwaveSpeed: 1.0,
  timeScale: 1.0,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SupernovaSimulation | null>(null);

  const [isRunning, setIsRunning] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [currentPhase, setCurrentPhase] = useState<SimulationPhase>('stable');
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [particleCount, setParticleCount] = useState(0);
  const [shockwaveRadius, setShockwaveRadius] = useState(0);
  const [fps, setFps] = useState(60);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showStarPicker, setShowStarPicker] = useState(false);
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [selectedPreset, setSelectedPreset] = useState<StarPreset>(STAR_PRESETS[0]);
  const [remnant, setRemnant] = useState<RemnantType>('pulsar');

  // Auto-set remnant from mass
  const expectedRemnant = useMemo(() => getRemnantForMass(params.coreMass), [params.coreMass]);
  const massCategory = useMemo(() => getMassCategory(params.coreMass), [params.coreMass]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const sim = new SupernovaSimulation(canvasRef.current, DEFAULT_PARAMS, {
      onPhaseChange: (phase) => setCurrentPhase(phase),
      onProgress: (_phase, pProgress, tProgress) => {
        setPhaseProgress(pProgress);
        setTotalProgress(tProgress);
      },
      onStats: (stats) => {
        setParticleCount(stats.particleCount);
        setShockwaveRadius(stats.shockwaveRadius);
        setFps(stats.fps);
        setElapsedTime(stats.elapsedTime);
      },
      onRemnantChange: (r) => setRemnant(r),
    });

    simRef.current = sim;
    sim.start();

    return () => {
      sim.dispose();
      simRef.current = null;
    };
  }, []);

  const togglePlay = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const newRunning = !sim.isRunning();
    sim.setRunning(newRunning);
    setIsRunning(newRunning);
  }, []);

  const reset = useCallback(() => {
    simRef.current?.reset();
    setParams(DEFAULT_PARAMS);
    setSelectedPreset(STAR_PRESETS[0]);
  }, []);

  const toggleAutoRotate = useCallback(() => {
    const newAuto = !autoRotate;
    setAutoRotate(newAuto);
    simRef.current?.setAutoRotate(newAuto);
  }, [autoRotate]);

  const updateParam = useCallback((key: keyof SimulationParams, value: number) => {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      simRef.current?.setParams(next);
      return next;
    });
  }, []);

  const selectPreset = useCallback((preset: StarPreset) => {
    setSelectedPreset(preset);
    const newParams = { ...DEFAULT_PARAMS, coreMass: preset.mass };
    setParams(newParams);
    simRef.current?.setParams(newParams);
    simRef.current?.reset();
    setShowStarPicker(false);
  }, []);

  const jumpToPhase = useCallback((index: number) => {
    simRef.current?.jumpToPhase(index);
  }, []);

  const phaseInfo = PHASES[currentPhase];
  const currentPhaseIndex = PHASE_ORDER.indexOf(currentPhase);
  const remnantInfo = REMNANT_INFO[remnant];
  const isRemnantPhase = currentPhase === 'remnant';

  // Live narration — what's happening right now
  const narration = useMemo(() => {
    if (isRemnantPhase) {
      return remnantInfo.description;
    }
    if (phaseProgress < 0.33) {
      return phaseInfo.description;
    }
    // Mid-phase extra context
    switch (currentPhase) {
      case 'stable':
        return `${selectedPreset.name} burns steadily, fusing heavier and heavier elements in concentric shells — hydrogen, helium, carbon, neon, oxygen, silicon — each layer burning faster than the last.`;
      case 'collapse':
        return `The core is imploding at nearly a quarter the speed of light. In real time, this takes about one second. ${selectedPreset.name} is eating itself from the inside out.`;
      case 'ignition':
        return `The shockwave is born! Nuclear density has been reached — the core is now a ball of neutrons the size of a city but with the mass of the Sun. A torrent of neutrinos carries away 99% of the energy.`;
      case 'explosion':
        return `${selectedPreset.name} is dying in a blaze brighter than an entire galaxy. Heavy elements forged in this blast — gold, platinum, uranium — will seed future worlds.`;
      case 'expansion':
        return `The ejecta is cooling as it expands. In a few years, this will become a visible supernova remnant nebula. The debris carries ${selectedPreset.mass} solar masses of material into the galaxy.`;
      default:
        return phaseInfo.description;
    }
  }, [currentPhase, phaseProgress, isRemnantPhase, remnantInfo, selectedPreset, phaseInfo]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between p-4 md:p-6">
          {/* Logo + star name */}
          <div className="pointer-events-auto flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10">
              <Atom className="w-5 h-5 md:w-6 md:h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm md:text-lg tracking-wide leading-tight">
                SUPERNOVA
              </h1>
              <p className="text-white/50 text-[10px] md:text-xs leading-tight">
                Stellar Collapse Simulator
              </p>
            </div>
          </div>

          {/* Star name badge — center */}
          <button
            onClick={() => setShowStarPicker(!showStarPicker)}
            className="pointer-events-auto hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all group"
          >
            <Star className="w-3.5 h-3.5 text-amber-400" fill="currentColor" />
            <span className="text-white font-medium text-sm">{selectedPreset.name}</span>
            <span className="text-white/30 text-xs font-mono">{selectedPreset.catalog}</span>
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: `${massCategory.color}25`,
                color: massCategory.color,
              }}
            >
              {selectedPreset.mass} M☉
            </span>
            <ChevronRight className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors" />
          </button>

          {/* Right controls */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all"
              title="About"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center justify-center w-10 h-10 rounded-xl backdrop-blur-xl border transition-all ${
                showSettings
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                  : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
              }`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile star picker button */}
        <div className="md:hidden px-4 -mt-1">
          <button
            onClick={() => setShowStarPicker(!showStarPicker)}
            className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 backdrop-blur-xl border border-white/10 w-full"
          >
            <Star className="w-3 h-3 text-amber-400 flex-shrink-0" fill="currentColor" />
            <span className="text-white font-medium text-xs flex-1 text-left">
              {selectedPreset.name}
            </span>
            <span className="text-white/40 text-[10px] font-mono">{selectedPreset.mass} M☉</span>
            <ChevronRight className="w-3 h-3 text-white/30" />
          </button>
        </div>
      </div>

      {/* Live narration panel — left side */}
      <div className="absolute left-4 md:left-6 top-32 md:top-24 z-10 pointer-events-none max-w-sm">
        <div className="pointer-events-auto rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 p-4 md:p-5 max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: phaseInfo.color }}
            />
            <span
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: phaseInfo.color }}
            >
              {phaseInfo.name}
            </span>
          </div>
          <p className="text-white/80 text-xs md:text-sm leading-relaxed">
            {narration}
          </p>

          {/* Remnant badge during remnant phase */}
          {isRemnantPhase && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center gap-2">
                <RemnantIcon type={remnant} />
                <span className="text-white font-medium text-sm">{remnantInfo.name}</span>
                <span className="text-white/40 text-[10px] ml-auto">
                  Final form of {selectedPreset.name}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom control bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="p-4 md:p-6">
          <div className="pointer-events-auto max-w-4xl mx-auto">
            {/* Phase timeline */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-white/90 text-xs md:text-sm font-medium tracking-wide">
                    {selectedPreset.name}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      backgroundColor: `${massCategory.color}20`,
                      color: massCategory.color,
                    }}
                  >
                    {massCategory.label}
                  </span>
                </div>
                <span className="text-white/40 text-[10px] md:text-xs font-mono">
                  Phase {currentPhaseIndex + 1} / {PHASE_ORDER.length}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-300 relative"
                  style={{
                    width: `${totalProgress * 100}%`,
                    background: `linear-gradient(90deg, #ffdd88, #ff6644, #ffffaa, #ff3300, #aa66ff, #4488ff)`,
                  }}
                />
                {PHASE_ORDER.map((_p, i) => (
                  <div
                    key={i}
                    className="absolute top-0 w-px h-full bg-white/20"
                    style={{ left: `${(i / PHASE_ORDER.length) * 100}%` }}
                  />
                ))}
              </div>

              {/* Phase chips — clickable to jump */}
              <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
                {PHASE_ORDER.map((p, i) => (
                  <button
                    key={p}
                    onClick={() => jumpToPhase(i)}
                    className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[10px] md:text-xs font-medium transition-all hover:scale-105 ${
                      i === currentPhaseIndex
                        ? 'text-white border'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                    style={
                      i === currentPhaseIndex
                        ? {
                            backgroundColor: `${PHASES[p].color}20`,
                            borderColor: `${PHASES[p].color}50`,
                          }
                        : {}
                    }
                  >
                    {PHASES[p].name}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between gap-3">
              {/* Left: playback */}
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 backdrop-blur-xl border border-white/15 text-white hover:bg-white/20 transition-all"
                >
                  {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                <button
                  onClick={reset}
                  className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleAutoRotate}
                  className={`flex items-center justify-center w-12 h-12 rounded-xl backdrop-blur-xl border transition-all ${
                    autoRotate
                      ? 'bg-sky-500/15 border-sky-400/30 text-sky-300'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              {/* Right: stats */}
              <div className="flex items-center gap-3 md:gap-4">
                <Stat
                  label="Particles"
                  value={particleCount.toLocaleString()}
                  icon={<Activity className="w-3 h-3" />}
                />
                <Stat
                  label="Shockwave"
                  value={`${shockwaveRadius.toFixed(1)} AU`}
                  icon={<Zap className="w-3 h-3" />}
                />
                <Stat label="FPS" value={fps.toString()} icon={<Gauge className="w-3 h-3" />} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Star picker panel */}
      {showStarPicker && (
        <div className="absolute top-20 md:top-24 left-1/2 -translate-x-1/2 md:left-1/2 md:-translate-x-1/2 z-20 w-[calc(100vw-2rem)] max-w-md">
          <div className="rounded-2xl bg-black/70 backdrop-blur-2xl border border-white/10 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm tracking-wide">CHOOSE A STAR</h2>
              <button
                onClick={() => setShowStarPicker(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto scrollbar-none">
              {STAR_PRESETS.map((preset) => {
                const presetRemnant = getRemnantForMass(preset.mass);
                const cat = getMassCategory(preset.mass);
                const isSelected = preset.name === selectedPreset.name;
                return (
                  <button
                    key={preset.name}
                    onClick={() => selectPreset(preset)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-white/10 border-white/20'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <Star
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: cat.color }}
                        fill="currentColor"
                      />
                      <span className="text-white font-medium text-sm flex-1">{preset.name}</span>
                      <span className="text-white/40 text-[10px] font-mono">{preset.catalog}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                      >
                        {preset.mass} M☉ · {cat.label}
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                        style={{
                          backgroundColor: `${remnantColor(presetRemnant)}20`,
                          color: remnantColor(presetRemnant),
                        }}
                      >
                        <RemnantIcon type={presetRemnant} small />
                        {REMNANT_INFO[presetRemnant].name}
                      </span>
                    </div>
                    <p className="text-white/50 text-[11px] leading-relaxed">{preset.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-white/10">
              <p className="text-white/40 text-[11px] leading-relaxed">
                Stars above 40 solar masses collapse into black holes. Those between 25–40 become
                magnetars. Lighter progenitors leave pulsars — rapidly spinning neutron stars.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute top-16 md:top-20 right-4 md:right-6 z-20 w-80 max-w-[calc(100vw-2rem)]">
          <div className="rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/10 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm tracking-wide">SIMULATION PARAMETERS</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Mass slider with remnant preview */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/70 text-xs font-medium">Stellar Mass</label>
                  <div className="flex items-center gap-2">
                    <span className="text-white/90 text-xs font-mono">{params.coreMass} M☉</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: `${remnantColor(expectedRemnant)}20`,
                        color: remnantColor(expectedRemnant),
                      }}
                    >
                      <RemnantIcon type={expectedRemnant} small />
                      {REMNANT_INFO[expectedRemnant].name}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={8}
                  max={50}
                  step={1}
                  value={params.coreMass}
                  onChange={(e) => updateParam('coreMass', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-amber-400
                    [&::-webkit-slider-thumb]:shadow-lg
                    [&::-webkit-slider-thumb]:shadow-amber-500/30
                    [&::-webkit-slider-thumb]:transition-all
                    [&::-webkit-slider-thumb]:hover:scale-110
                    [&::-moz-range-thumb]:w-4
                    [&::-moz-range-thumb]:h-4
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-amber-400
                    [&::-moz-range-thumb]:border-none
                    [&::-moz-range-thumb]:cursor-pointer"
                />
                {/* Mass threshold markers */}
                <div className="flex justify-between mt-1 text-[9px] text-white/30">
                  <span>8 M☉</span>
                  <span>25 M☉</span>
                  <span>40 M☉</span>
                  <span>50 M☉</span>
                </div>
                <div className="flex justify-between mt-1 text-[9px]">
                  <span style={{ color: '#4488ff' }}>Pulsar</span>
                  <span style={{ color: '#aa44ff' }}>Magnetar</span>
                  <span style={{ color: '#ff6644' }}>Black Hole</span>
                </div>
              </div>

              <SliderControl
                label="Explosion Energy"
                value={params.explosionEnergy}
                min={0.3}
                max={3}
                step={0.1}
                unit="×"
                onChange={(v) => updateParam('explosionEnergy', v)}
              />
              <SliderControl
                label="Time Scale"
                value={params.timeScale}
                min={0.1}
                max={3}
                step={0.1}
                unit="×"
                onChange={(v) => updateParam('timeScale', v)}
              />
              <SliderControl
                label="Particle Density"
                value={params.particleCount}
                min={5000}
                max={60000}
                step={1000}
                unit=""
                onChange={(v) => updateParam('particleCount', v)}
              />
            </div>

            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-white/40 text-[11px] leading-relaxed">
                Higher mass stars produce more violent explosions and denser remnants. Mass changes
                apply immediately and determine the final remnant type.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info panel */}
      {showInfo && (
        <div className="absolute top-16 md:top-20 left-4 md:left-6 z-20 w-96 max-w-[calc(100vw-2rem)]">
          <div className="rounded-2xl bg-black/60 backdrop-blur-2xl border border-white/10 p-5 shadow-2xl max-h-[70vh] overflow-y-auto scrollbar-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold text-sm tracking-wide">ABOUT THIS SIMULATION</h2>
              <button
                onClick={() => setShowInfo(false)}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-white/60 text-xs leading-relaxed">
              <p>
                This interactive simulation visualizes the death of a massive star — a{' '}
                <span className="text-amber-300">Type II core-collapse supernova</span>. Choose from
                real stars like Betelgeuse or R136a1, and watch their final moments unfold across
                six astrophysical phases.
              </p>
              <div className="space-y-2">
                {PHASE_ORDER.map((p, i) => (
                  <button
                    key={p}
                    onClick={() => {
                      jumpToPhase(i);
                      setShowInfo(false);
                    }}
                    className="flex gap-2 w-full text-left hover:bg-white/5 rounded-lg p-1 transition-colors"
                  >
                    <div
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                      style={{
                        backgroundColor: `${PHASES[p].color}25`,
                        color: PHASES[p].color,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <span className="text-white/90 font-medium">{PHASES[p].name}</span>
                      <p className="text-white/40 text-[11px] mt-0.5">{PHASES[p].description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Remnant types */}
              <div className="pt-3 border-t border-white/10">
                <p className="text-white/70 font-medium text-xs mb-2">REMNANT TYPES</p>
                <div className="space-y-2">
                  {(['pulsar', 'magnetar', 'blackhole'] as RemnantType[]).map((r) => (
                    <div key={r} className="flex gap-2">
                      <RemnantIcon type={r} />
                      <div>
                        <span className="text-white/90 font-medium text-xs">{REMNANT_INFO[r].name}</span>
                        <span className="text-white/40 text-[10px] ml-2">
                          {r === 'pulsar' ? '< 25 M☉' : r === 'magnetar' ? '25–40 M☉' : '> 40 M☉'}
                        </span>
                        <p className="text-white/40 text-[11px] mt-0.5">{REMNANT_INFO[r].description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-white/10">
                <p className="text-white/40 text-[11px]">
                  <span className="text-white/70 font-medium">Controls:</span> Drag to orbit · Scroll
                  to zoom · Click phase names to jump · Tap star name to switch stars
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flash overlay for ignition */}
      {currentPhase === 'ignition' && phaseProgress < 0.4 && (
        <div
          className="absolute inset-0 pointer-events-none z-5"
          style={{
            background: `radial-gradient(circle at center, rgba(255,255,240,${
              0.4 * (1 - phaseProgress / 0.4)
            }), transparent 60%)`,
          }}
        />
      )}

      {/* Initial overlay hint */}
      {elapsedTime < 3 && currentPhase === 'stable' && (
        <div className="absolute inset-0 flex items-center justify-center z-5 pointer-events-none">
          <div className="text-center animate-fade-out">
            <p className="text-white/30 text-xs tracking-widest uppercase mb-1">
              Drag to explore · Click phases to jump
            </p>
            <ChevronRight className="w-4 h-4 text-white/20 mx-auto rotate-90" />
          </div>
        </div>
      )}
    </div>
  );
}

function remnantColor(type: RemnantType): string {
  switch (type) {
    case 'pulsar':
      return '#4488ff';
    case 'magnetar':
      return '#aa44ff';
    case 'blackhole':
      return '#ff6644';
  }
}

function RemnantIcon({ type, small }: { type: RemnantType; small?: boolean }) {
  const size = small ? 'w-3 h-3' : 'w-4 h-4';
  const color = remnantColor(type);
  switch (type) {
    case 'pulsar':
      return <Radio className={`${size} flex-shrink-0`} style={{ color }} />;
    case 'magnetar':
      return <Atom className={`${size} flex-shrink-0`} style={{ color }} />;
    case 'blackhole':
      return <Circle className={`${size} flex-shrink-0`} style={{ color }} fill="currentColor" />;
  }
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="text-right">
      <div className="flex items-center gap-1 justify-end text-white/40 text-[10px] uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-white/90 text-xs md:text-sm font-mono font-medium">{value}</div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-white/70 text-xs font-medium">{label}</label>
        <span className="text-white/90 text-xs font-mono">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-amber-400
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-webkit-slider-thumb]:shadow-amber-500/30
          [&::-webkit-slider-thumb]:transition-all
          [&::-webkit-slider-thumb]:hover:scale-110
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-amber-400
          [&::-moz-range-thumb]:border-none
          [&::-moz-range-thumb]:cursor-pointer"
      />
    </div>
  );
}
