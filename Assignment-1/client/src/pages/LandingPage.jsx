import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, AudioLines, BrainCircuit, Radio, Sparkles, Waves } from 'lucide-react';

const cover = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1400&q=90';

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link className="brand-lockup" to="/">
          <span className="brand-mark"><AudioLines size={21} /></span>
          <span>AI DJ<span className="brand-light"> Engine</span></span>
        </Link>
        <nav className="landing-links">
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="landing-nav-actions">
          <Link className="button button-quiet" to="/login">Log in</Link>
          <Link className="button button-primary button-small" to="/register">Get started <ArrowRight size={15} /></Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-glow" />
          <div className="hero-copy">
            <div className="hero-kicker"><span className="live-dot" /> LIVE COLLABORATIVE MUSIC</div>
            <h1>Your music.<br />Your crowd.<br /><span>Your AI DJ.</span></h1>
            <p>A room that listens back. Build a live queue together while your AI DJ reads the room, finds the flow, and explains every transition.</p>
            <div className="hero-actions">
              <Link to="/register" className="button button-primary">Create your first lounge <ArrowRight size={17} /></Link>
              <a href="#demo" className="button button-quiet">Watch the experience <span className="play-mini">▶</span></a>
            </div>
            <div className="hero-proof"><span>Made for the room, not just the playlist</span></div>
          </div>
          <div className="hero-visual" id="demo">
            <img src={cover} alt="Colorful live DJ performance" />
            <div className="hero-visual-scrim" />
            <div className="hero-live-badge"><span className="live-dot" /> COLLABORATIVE LISTENING</div>
          </div>
          <a href="#features" className="hero-scroll" aria-label="Scroll to features"><ArrowDown size={17} /></a>
        </section>

        <section className="landing-marquee" aria-label="Product capabilities">
          <span><Waves size={16} /> LIVE QUEUE CURATION</span><i>✳</i><span><Radio size={16} /> CROWD SENTIMENT</span><i>✳</i><span><BrainCircuit size={16} /> EXPLAINABLE AI DJ</span><i>✳</i><span><AudioLines size={16} /> HARMONIC MIXING</span>
        </section>

        <section className="landing-section features-section" id="features">
          <div className="landing-section-head"><div className="eyebrow">A BETTER KIND OF LISTENING ROOM</div><h2>The room moves.<br /><span>The music moves with it.</span></h2></div>
          <div className="feature-grid">
            <Feature icon={Waves} number="01" title="A queue with a pulse" text="Every vote moves the shared queue. The room shapes what plays next, together and in real time." />
            <Feature icon={BrainCircuit} number="02" title="An AI that knows why" text="Tempo, Camelot key, energy and crowd mood help the DJ make a segue that feels right — and explain it." />
            <Feature icon={Radio} number="03" title="Bring the whole room" text="Chat, react, submit a challenger and ask about the music without ever leaving the lounge." />
          </div>
        </section>

        <section className="landing-about" id="about">
          <div className="about-visual">
            <div className="about-orbit orbit-one" /><div className="about-orbit orbit-two" />
            <div className="about-core"><AudioLines size={42} /></div>
            <div className="about-orbit-label about-label-one">TEMPO <span>+</span></div>
            <div className="about-orbit-label about-label-two">HARMONY <span>↗</span></div>
            <div className="about-orbit-label about-label-three">ROOM ENERGY</div>
          </div>
          <div className="about-copy">
            <div className="eyebrow">THE HUMAN PART OF THE ALGORITHM</div>
            <h2>More than a queue.<br /><span>A shared feeling.</span></h2>
            <p>AI DJ Engine brings acoustic intelligence and human energy into one live space. Every track has a story; every room has a mood. The best sets make both matter.</p>
            <Link to="/register" className="text-link">Find your flow <ArrowRight size={16} /></Link>
          </div>
        </section>

        <section className="landing-section pricing-section" id="pricing">
          <div className="pricing-card">
            <div><div className="eyebrow">MADE FOR YOUR NEXT GATHERING</div><h2>Good music is better together.</h2><p>Start a room, invite your people, and let the night find its rhythm.</p></div>
            <Link to="/register" className="button button-primary">Get started for free <ArrowRight size={16} /></Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Link className="brand-lockup" to="/"><span className="brand-mark"><AudioLines size={18} /></span><span>AI DJ<span className="brand-light"> Engine</span></span></Link>
        <span>Your Music. Your Crowd. Your AI DJ.</span>
        <div><Link to="/login">Log in</Link><Link to="/register">Get started</Link></div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, number, title, text }) {
  return (
    <article className="feature-card">
      <div className="feature-card-top"><span className="feature-icon"><Icon size={20} /></span><span>{number}</span></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
