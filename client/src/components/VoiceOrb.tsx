import type { Phase } from '../hooks/useVoiceAgent';

export function VoiceOrb({ phase, level }: { phase: Phase; level: number }) {
  const active = phase === 'speaking' || phase === 'recording';
  return (
    <div
      className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72"
      aria-hidden="true"
    >
      <div
        className={`absolute inset-0 rounded-full border border-forest/5 ${active ? 'animate-pulse' : ''}`}
      />
      <div className="absolute inset-5 rounded-full border border-forest/5" />
      <div className="absolute inset-10 rounded-full border border-forest/5" />
      <div className="absolute inset-14 rounded-full bg-emerald-800/10 blur-2xl" />
      <div
        className={`relative size-44 overflow-hidden rounded-full bg-[radial-gradient(circle_at_28%_22%,#e3f5bb_0%,#b6d78f_20%,#76a78b_42%,#316e60_68%,#164c43_85%)] shadow-[inset_-10px_-14px_24px_#133e4960,inset_2px_3px_8px_#efffd290,0_22px_45px_-20px_#174e4670] sm:size-48 ${active ? 'animate-pulse' : 'animate-float'}`}
      >
        <div className="absolute -inset-5 rotate-[-32deg] rounded-[45%] border-[15px] border-white/10 blur-[3px]" />
        <div className="absolute -left-8 top-10 h-32 w-72 rotate-[-32deg] rounded-[50%] border-[10px] border-lime/20 blur-[6px]" />
        <div className="absolute -bottom-10 -right-6 h-40 w-52 rotate-[-35deg] rounded-full bg-teal-950/20 blur-xl" />
        <div className="absolute inset-0 flex items-center justify-center gap-1.5">
          {[0.35, 0.7, 1, 0.55, 0.85, 0.45, 0.3].map((height, i) => (
            <span
              key={i}
              className={`w-1 rounded-full bg-white/80 transition-[height] duration-100 ${phase === 'speaking' ? 'animate-pulse' : ''}`}
              style={{
                height: `${6 + height * (phase === 'recording' ? level * 90 : active ? 28 : 16)}px`,
                animationDelay: `${i * 110}ms`,
              }}
            />
          ))}
        </div>
      </div>
      <span className="absolute right-7 top-14 size-2 rounded-full bg-lime" />
      <span className="absolute bottom-16 left-5 size-1.5 rounded-full bg-forest/20" />
    </div>
  );
}
