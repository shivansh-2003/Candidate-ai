import VoiceAgent from './components/VoiceAgent';

export default function Home() {
  return (
    <main className="min-h-screen flex items-start md:items-center justify-center px-4 py-10">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="headline gradient-text text-5xl md:text-6xl font-extrabold tracking-tight mb-3 drop-shadow-[0_6px_30px_rgba(56,189,248,0.25)]">
            Candidate AI Assistant
          </h1>
          <p className="subtle text-sm md:text-base opacity-90">
            Powered by LiveKit • Real-time voice interaction for interview preparation
          </p>
        </div>

        <div className="glass rounded-3xl p-4 md:p-6 lg:p-8">
          <VoiceAgent />
        </div>
      </div>
    </main>
  );
}

