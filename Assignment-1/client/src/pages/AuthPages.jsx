import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AudioLines, Check, Mail, Music2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Notice } from '../components/Shared.jsx';

export function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [values, setValues] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(values);
        navigate('/app/home');
      } else {
        await login(values.email, values.password);
        navigate('/app/home');
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-brand-note"><span className="auth-note-icon"><Music2 size={16} /></span> THE ROOM IS YOURS</div>
      <h1>{isRegister ? 'Make room for good music.' : 'Good to have you back.'}</h1>
      <p className="auth-subtitle">{isRegister ? 'Start a lounge, bring your people, and let the music find its flow.' : 'Pick up where the room left off.'}</p>
      <Notice>{error}</Notice>
      <form className="auth-form" onSubmit={submit}>
        {isRegister && <label>Full name<input name="displayName" autoComplete="name" placeholder="How should we call you?" value={values.displayName} onChange={update} required /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={update} required /></label>
        <label className="password-label"><span>Password</span>{!isRegister && <Link to="/forgot-password">Forgot password?</Link>}<input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="At least 6 characters" value={values.password} onChange={update} required minLength={isRegister ? 6 : 1} /></label>
        {isRegister && <span className="form-hint">Use 6 or more characters. You can update your profile any time.</span>}
        <button className="button button-primary button-full" disabled={loading}>{loading ? 'One moment…' : isRegister ? 'Create account' : 'Log in'} <ArrowRight size={16} /></button>
      </form>
      {isRegister ? (
        <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
      ) : (
        <p className="auth-switch">New to the room? <Link to="/register">Create an account</Link></p>
      )}
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthFrame>
      <Link to="/login" className="back-link"><ArrowLeft size={15} /> Back to login</Link>
      <div className="auth-brand-note"><span className="auth-note-icon"><Mail size={16} /></span> ACCOUNT RECOVERY</div>
      <h1>Reset your password.</h1>
      <p className="auth-subtitle">Password reset is not available because the backend does not currently provide a reset endpoint.</p>
    </AuthFrame>
  );
}

function AuthFrame({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <Link className="brand-lockup" to="/"><span className="brand-mark"><AudioLines size={21} /></span><span>AI DJ<span className="brand-light"> Engine</span></span></Link>
        <div className="auth-art-center">
          <div className="auth-art-rings"><span /><span /><span /><i><AudioLines size={32} /></i></div>
          <div className="eyebrow">YOUR MUSIC. YOUR CROWD.</div>
          <p>A better set is a shared feeling.</p>
        </div>
        <div className="auth-art-footer"><span>01 / 03</span><span>HARMONY IN THE ROOM</span></div>
      </aside>
      <main className="auth-content">
        <div className="auth-topline"><Link className="brand-lockup auth-mobile-brand" to="/"><span className="brand-mark"><AudioLines size={19} /></span><span>AI DJ<span className="brand-light"> Engine</span></span></Link><Link to="/" className="back-link"><ArrowLeft size={14} /> Back to home</Link></div>
        <section className="auth-card">{children}</section>
        <div className="auth-footnote">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</div>
      </main>
    </div>
  );
}
