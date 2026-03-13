'use client';

import { useState, useEffect, useRef } from 'react';
import { useEmotionEngine } from '@/hooks/useEmotionEngine';
import { useMagneticCursor } from '@/hooks/useMagneticCursor';
import { useSpeech } from '@/hooks/useSpeech';

const SA_TRENDING_NICHES = [
  { id: 'kota', title: 'Township Food & Kotas', icon: '🍔', trend: '+14% viral probability' },
  { id: 'amapiano', title: 'Amapiano Production', icon: '🎹', trend: '+22% engagement rate' },
  { id: 'crypto', title: 'SA Crypto & Arbitrage', icon: '⚡', trend: 'High XRPL conversion' },
  { id: 'tutor', title: 'Matric Online Tutoring', icon: '📚', trend: 'Evergreen demand' },
];

const MOCK_TIMELINE = [
  {
    day: "Day 1",
    type: "TikTok Hook",
    title: "The Controversial Statement",
    hookText: "Stop buying R50 Kotas that taste like cardboard. Here is how we make our secret sauce in Soweto.",
    audioPrompt: "Read this with high energy. Stop buying R 50 Kotas that taste like cardboard. Here is how we make our secret sauce in Soweto."
  },
  {
    day: "Day 2",
    type: "Reels Behind-The-Scenes",
    title: "The Process & Proof",
    hookText: "Watch us clear 100 orders before 12 PM. The hustle never stops.",
    audioPrompt: "Smooth background voice. Watch us clear 100 orders before 12 P M. The hustle never stops."
  },
  {
    day: "Day 3",
    type: "Community Poll",
    title: "The Engagement Trap",
    hookText: "Achar or no Achar? Drop your flag in the comments and let's settle this.",
    audioPrompt: "Casual and playful. Achar or no Achar? Drop your flag in the comments and let's settle this."
  }
];

export default function SentientSocialRoom() {
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const emotion = useEmotionEngine();
  const cursor = useMagneticCursor();
  const { speak } = useSpeech();

  // Sentient entry sequence
  useEffect(() => {
    emotion.transition('awakened');
    const timeout = setTimeout(() => {
      void speak("Welcome to the Creative Resonance Chamber. I have pre-analyzed the South African social algorithms. Select a trending niche, or feed me a custom prompt.");
    }, 1000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNicheSelect = (nicheTitle: string) => {
    setSelectedNiche(nicheTitle);
    setIsGenerating(true);
    emotion.transition('processing');
    void speak(`Synthesizing viral timeline for ${nicheTitle}. Stand by.`);

    // Simulate AI generation time
    setTimeout(() => {
      setIsGenerating(false);
      emotion.transition('resolved');
      void speak("Timeline generated. I recommend starting with the controversial TikTok hook. Play the audio to hear the delivery tone.");
    }, 2500);
  };

  const playAudioHook = (audioPrompt: string) => {
    void speak(audioPrompt);
    emotion.transition('processing');
    setTimeout(() => emotion.transition('resolved'), 3000); // Return to high energy after speaking
  };

  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden font-sans">
      {/* CINEMATIC BACKGROUND */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${
            isGenerating ? 'opacity-80 scale-110 filter blur-sm contrast-150' : 'opacity-30 scale-100 mix-blend-screen'
          }`}
          src="https://cdn.pixabay.com/video/2020/02/24/32890-394436575_large.mp4" // Studio light/abstract motion video
        />
        <div className={`absolute inset-0 transition-all duration-1000 ${
          isGenerating ? 'bg-indigo-950/60' : 'bg-black/60'
        }`} />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 py-12 flex flex-col min-h-screen">
        
        {/* Header */}
        <header className="mb-16">
          <div className="inline-flex items-center gap-3 px-5 py-2 glass rounded-full text-xs tracking-[3px] mb-4 border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-indigo-400 animate-ping' : 'bg-fuchsia-400 animate-pulse'}`} />
            ALGORITHMIC RESONANCE
          </div>
          <h1 className="text-5xl md:text-7xl font-light tracking-tighter">
            {selectedNiche ? 'CONTENT TIMELINE' : 'SELECT YOUR REALITY'}
          </h1>
        </header>

        {/* STATE 1: SELECTION MATRIX */}
        {!selectedNiche && (
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-xl font-light text-white/60 mb-8 max-w-2xl">
              Don&apos;t start from scratch. The AI has mapped current local engagement spikes. Select a high-probability niche to generate a 3-day viral loop.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {SA_TRENDING_NICHES.map((niche) => (
                <button
                  key={niche.id}
                  onClick={() => handleNicheSelect(niche.title)}
                  className="group relative text-left p-8 rounded-[2rem] glass border border-white/10 overflow-hidden hover:bg-white/10 transition-all duration-500 hover:-translate-y-2"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-4xl mb-4 block">{niche.icon}</span>
                  <h3 className="text-xl font-medium mb-2">{niche.title}</h3>
                  <p className="text-sm font-mono text-fuchsia-300">{niche.trend}</p>
                </button>
              ))}
            </div>

            <div className="mt-12 flex items-center gap-4 max-w-2xl">
              <div className="flex-1 h-[1px] bg-white/10" />
              <span className="text-xs font-mono tracking-widest text-white/40">OR ENTER CUSTOM</span>
              <div className="flex-1 h-[1px] bg-white/10" />
            </div>

            {/* Custom Input (Sleek, glassmorphic line instead of a clunky box) */}
            <div className="mt-8 max-w-2xl relative group">
              <input 
                type="text" 
                placeholder="e.g., Freelance Graphic Designer..." 
                className="w-full bg-transparent border-b border-white/20 px-4 py-4 text-xl font-light text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-400 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNicheSelect(e.currentTarget.value);
                }}
              />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 transition-opacity text-xs font-mono text-fuchsia-400">
                PRESS ENTER
              </div>
            </div>
          </div>
        )}

        {/* STATE 2: GENERATING (The Warp Effect) */}
        {isGenerating && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto border-t-2 border-r-2 border-indigo-400 rounded-full animate-spin mb-8" />
              <h2 className="text-3xl font-light tracking-widest text-indigo-200 animate-pulse">
                SYNTHESIZING VIRAL LOOP
              </h2>
            </div>
          </div>
        )}

        {/* STATE 3: THE TIMELINE MATRIX */}
        {selectedNiche && !isGenerating && (
          <div className="flex-1 animate-fade-in-up">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {MOCK_TIMELINE.map((item, index) => (
                <div 
                  key={index} 
                  className="relative group glass p-8 rounded-[2rem] border border-white/10 hover:border-fuchsia-500/50 transition-colors duration-500"
                >
                  <div className="flex justify-between items-start mb-6">
                    <span className="px-4 py-1 rounded-full border border-white/20 text-xs font-mono tracking-widest text-white/60">
                      {item.day}
                    </span>
                    <span className="text-xs font-mono text-fuchsia-400">{item.type}</span>
                  </div>
                  
                  <h3 className="text-2xl font-light mb-4 text-white/90">{item.title}</h3>
                  <p className="text-lg font-light leading-relaxed text-white/70 mb-8">
                    &quot;{item.hookText}&quot;
                  </p>

                  <div className="absolute bottom-8 left-8 right-8">
                    <button 
                      onClick={() => playAudioHook(item.audioPrompt)}
                      className="w-full py-3 rounded-full bg-white/5 hover:bg-fuchsia-500/20 border border-white/10 hover:border-fuchsia-500 transition-all flex items-center justify-center gap-3 text-sm tracking-widest"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      HEAR DELIVERY TONE
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <button 
                onClick={() => setSelectedNiche(null)}
                className="text-xs font-mono text-white/40 hover:text-white transition-colors"
              >
                ← RECALIBRATE ALGORITHM (RESET)
              </button>
            </div>
          </div>
        )}
      </div>
      {/* Cursor state usage to avoid unused variable warning */}
      <div className="hidden">{cursor.isHovering}</div>
    </main>
  );
}
