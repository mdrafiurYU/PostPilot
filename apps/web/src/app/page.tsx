"use client";

import { motion } from "framer-motion";
import { 
  Play, 
  CheckCircle2, 
  BarChart3, 
  Share2, 
  Video, 
  Smartphone, 
  MessageSquare, 
  Sparkles
} from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0A051A] text-white overflow-hidden font-sans selection:bg-purple-500/30">
      
      {/* Background ambient light effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-purple-600/20 to-transparent blur-3xl -z-10 pointer-events-none" />
      <div className="absolute top-[20%] -left-[10%] w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[100px] -z-10 pointer-events-none" />
      <div className="absolute bottom-[10%] -right-[10%] w-[600px] h-[600px] rounded-full bg-purple-700/10 blur-[100px] -z-10 pointer-events-none" />

      {/* Navigation */}
      <nav className="container mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-cyan-400" />
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
            PostPilot
          </span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-300 font-medium">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#solutions" className="hover:text-white transition-colors">Solutions</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>

        <div className="flex items-center gap-4">
          <a href="/login" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
            Login
          </a>
          <a href="/signup" className="px-5 py-2.5 rounded-full text-sm font-medium bg-white/10 border border-white/20 hover:bg-white/20 transition-all backdrop-blur-md">
            Get Started
          </a>
        </div>
      </nav>

      <div className="container mx-auto px-6 pt-20 pb-32">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          {/* Hero Content */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-2xl relative z-10"
          >
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-6">
              Upload Once. <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-purple-400 to-purple-600">
                Publish Everywhere.
              </span>
            </h1>
            
            <p className="text-lg text-gray-400 mb-10 leading-relaxed max-w-xl">
              The AI-powered Creator OS that transforms your single input into optimized content for every platform effortlessly. Save hours of editing and scheduling.
            </p>
            
            <motion.a 
              href="/signup"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:shadow-[0_0_40px_rgba(168,85,247,0.6)] transition-all"
            >
              Start Creating Now
            </motion.a>
          </motion.div>

          {/* Hero Visual Mockup */}
          <div className="relative h-[600px] hidden lg:block">
            {/* Main Central Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl z-20"
            >
              <div className="aspect-video bg-gray-900 rounded-xl mb-4 relative overflow-hidden group">
                <img 
                  src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80" 
                  alt="Video thumbnail" 
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-1" />
                  </div>
                </div>
              </div>
              <h3 className="font-semibold text-lg mb-1">Weekly Vlog #10</h3>
              <p className="text-sm text-gray-400 mb-4">(Original Video)</p>
              
              <div className="flex items-center justify-between text-xs text-gray-500 mb-4 bg-black/20 p-2 rounded-lg">
                <div>
                  <span className="block mb-1">Duration</span>
                  <span className="text-gray-300 font-medium">12:05</span>
                </div>
                <div>
                  <span className="block mb-1">Format</span>
                  <span className="text-gray-300 font-medium">MP4</span>
                </div>
                <div>
                  <span className="block mb-1">Size</span>
                  <span className="text-gray-300 font-medium">450 MB</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-medium text-cyan-400 bg-cyan-400/10 px-3 py-2 rounded-lg border border-cyan-400/20">
                <Sparkles className="w-3 h-3" />
                PostPilot AI Transforming...
              </div>
            </motion.div>

            {/* Platform Branches (Connecting Lines) */}
            <svg className="absolute inset-0 w-full h-full -z-10" style={{ filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.4))' }}>
              <motion.path 
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, delay: 0.5 }}
                d="M 200 300 C 100 300 100 150 50 150" 
                fill="none" 
                stroke="url(#gradient-line)" 
                strokeWidth="2" 
              />
              <motion.path 
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, delay: 0.7 }}
                d="M 200 300 C 100 300 100 450 50 450" 
                fill="none" 
                stroke="url(#gradient-line)" 
                strokeWidth="2" 
              />
              <motion.path 
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, delay: 0.9 }}
                d="M 400 300 C 500 300 500 150 550 150" 
                fill="none" 
                stroke="url(#gradient-line)" 
                strokeWidth="2" 
              />
              <motion.path 
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, delay: 1.1 }}
                d="M 400 300 C 500 300 500 450 550 450" 
                fill="none" 
                stroke="url(#gradient-line)" 
                strokeWidth="2" 
              />
              <defs>
                <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </svg>

            {/* Platform Node: TikTok */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="absolute top-20 -left-10 w-48 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-lg z-10"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-black flex items-center justify-center">
                  <span className="font-bold text-[10px] text-white">TikTok</span>
                </div>
                <span className="text-xs font-medium">Reel Adapted</span>
              </div>
              <div className="aspect-[9/16] bg-gray-800 rounded-lg relative overflow-hidden">
                <img src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&q=80" className="w-full h-full object-cover opacity-50" />
                <div className="absolute bottom-2 left-2 right-2">
                  <div className="h-1 bg-white/20 rounded overflow-hidden">
                    <div className="h-full bg-cyan-400 w-2/3"></div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Platform Node: Instagram */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 1.2 }}
              className="absolute bottom-20 -left-4 w-48 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-lg z-10"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 flex items-center justify-center">
                  <Smartphone className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-medium">Auto-Captioned</span>
              </div>
              <div className="aspect-square bg-gray-800 rounded-lg relative overflow-hidden">
                <img src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&q=80" className="w-full h-full object-cover opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
              </div>
            </motion.div>

            {/* Platform Node: YouTube */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 1.4 }}
              className="absolute top-24 -right-12 w-52 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-lg z-10"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-red-600 flex items-center justify-center">
                  <Video className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-medium">Title & Tags AI</span>
              </div>
              <div className="bg-black/30 rounded-lg p-2 mb-2">
                <div className="h-2 bg-white/20 rounded w-3/4 mb-1.5"></div>
                <div className="h-2 bg-white/20 rounded w-1/2"></div>
              </div>
              <div className="flex gap-1">
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10">#vlog</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10">#creator</span>
              </div>
            </motion.div>

            {/* Platform Node: LinkedIn */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 1.6 }}
              className="absolute bottom-32 -right-4 w-48 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-lg z-10"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded bg-[#0A66C2] flex items-center justify-center">
                  <MessageSquare className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-xs font-medium">Text Post Gen</span>
              </div>
              <div className="bg-black/30 rounded-lg p-2 text-[10px] text-gray-400 leading-relaxed">
                Just dropped my latest vlog! Here are 3 key takeaways I learned this week about content creation...
              </div>
            </motion.div>

          </div>
        </div>
      </div>
      
      {/* Footer minimal */}
      <div className="container mx-auto px-6 py-8 border-t border-white/10 flex justify-between items-center text-xs text-gray-500 relative z-10">
        <p>© 2026 PostPilot. All rights reserved.</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-white transition-colors">Terms</a>
          <a href="#" className="hover:text-white transition-colors">Privacy</a>
        </div>
      </div>

    </main>
  );
}
