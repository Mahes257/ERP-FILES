import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import { VH_LOGO_URI } from '../constants/companyBrand';
import { useNavigate } from "react-router-dom";
import authService, { storeAuth } from '../services/authService';

export default function SignIn() {
  const [email, setEmail] = useState('admin@vishaktech.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError(false);
    setSubmitting(true);
    try {
      const response = await authService.login(email, password);
      const payload = response?.data;
      if (payload?.token) {
        storeAuth(payload.token, payload.refreshToken, {
          email: payload.email,
          fullName: payload.fullName,
          role: payload.role
        });
        navigate('/dashboard', { replace: true });
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      setError(err?.message || 'Invalid Email or Password');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="relative min-h-screen w-full bg-[#050b14] flex flex-col items-center justify-between font-sans text-gray-200 overflow-hidden select-none">
      
      {/* Background Decorative Constellation Network Elements */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-teal-500 rounded-full shadow-[0_0_8px_#14b8a6]"></div>
        <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 bg-teal-500 rounded-full shadow-[0_0_6px_#14b8a6]"></div>
        <div className="absolute bottom-1/3 left-1/3 w-1.5 h-1.5 bg-teal-500 rounded-full shadow-[0_0_6px_#14b8a6]"></div>
        <div className="absolute bottom-1/4 right-1/3 w-2 h-2 bg-teal-500 rounded-full shadow-[0_0_8px_#14b8a6]"></div>
        <svg className="absolute inset-0 w-full h-full stroke-teal-500/10 stroke-[0.5]" xmlns="http://w3.org">
          <line x1="25%" y1="25%" x2="33%" y2="33%" />
          <line x1="33%" y1="33%" x2="33%" y2="66%" />
          <line x1="75%" y1="33%" x2="66%" y2="75%" />
        </svg>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-[440px] px-6 flex-1 flex flex-col justify-center items-center z-10">
        
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="logo-wrapper">
            <img
            src={VH_LOGO_URI}
            alt="Vishak Tech"
            className="company-logo"
            />
            </div>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400 mt-6 mb-2">
              Enterprise Resource Planning
              </h2>
              <div className="inline-block bg-[#0b1b30] border border-gray-800 text-[10px] tracking-wide text-gray-400 px-4 py-1 rounded-full">
                Secure. Reliable. Scalable.
                </div>
                </div>

        {/* Card Component */}
        <div className="login-card w-full bg-[#0d1926]/90 border border-gray-800/80 rounded-2xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <h1 className="text-2xl font-bold text-white mb-1">Sign In</h1>
          <p className="text-xs text-gray-400 mb-6">Sign in to continue.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Email Field */}
            <div className="relative">
              <label className="block text-[11px] font-medium text-gray-400 mb-1.5 pl-1">Email</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-4 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-box w-full bg-[#0a131e] border border-gray-800 focus:border-teal-500/50 rounded-lg pl-11 pr-4 py-3 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors"
                  placeholder="Enter email"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="relative">
              <label className="block text-[11px] font-medium text-gray-400 mb-1.5 pl-1">Password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-4 w-4 h-4 text-gray-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (e.target.value) setError(false);
                  }}
                  className={`input-box w-full bg-[#0a131e] border rounded-lg pl-11 pr-11 py-3 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors ${
                    error ? 'border-red-500' : 'border-gray-800 focus:border-teal-500/50'
                  }`}
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 text-gray-500 hover:text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>

                {/* Simulated native HTML5 form error tooltip popup from target image */}
                {error && (
                  <div className="absolute top-[calc(100%+4px)] right-0 bg-[#fbfbfb] text-gray-900 border border-gray-300 text-xs px-2.5 py-1.5 rounded shadow-lg z-20 flex items-center gap-1.5 animate-fadeIn">
                    <span className="text-[11px]">{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Options Row */}
            <div className="flex items-center justify-between pt-1 pb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={() => setRememberMe(!rememberMe)}
                  className="w-3.5 h-3.5 rounded accent-teal-500 bg-gray-900 border-gray-700 cursor-pointer"
                />
                <span className="text-xs text-gray-400">Remember me</span>
              </label>
              <a href="#forgot" className="text-xs text-teal-500 hover:text-teal-400 transition-colors">
                Forgot Password?
              </a>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="signin-btn w-full bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-slate-950 font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-lg shadow-teal-500/10"
            >
              <LogIn className="w-4 h-4 stroke-[2.5]" />
              <span>Sign In</span>
            </button>

          </form>
        </div>
      </div>

      {/* Footer System Version */}
      <footer className="w-full text-center pb-6 text-[10px] text-gray-600 tracking-wider z-10">
        Version 1.0
      </footer>

    </div>
  );
}
