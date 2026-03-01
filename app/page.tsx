'use client';

import { useState, useEffect } from 'react';
import RepoSelector from './components/RepoSelector';
import RequirementGathering from './components/RequirementGathering';
import { GitBranch, Sparkles, FolderGit2, RefreshCw, LayoutDashboard, AlertTriangle } from 'lucide-react';

interface Repo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
}

const STORAGE_KEY = 'kuai_repo_selection';

export default function Home() {
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [showChangeWarning, setShowChangeWarning] = useState(false);

  // Restore selection from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { repo, branch } = JSON.parse(saved);
        if (repo && branch) {
          setSelectedRepo(repo);
          setSelectedBranch(branch);
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const handleSelection = (repo: Repo | null, branch: string | null) => {
    setSelectedRepo(repo);
    setSelectedBranch(branch);
    setShowChangeWarning(false);
    if (repo && branch) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ repo, branch }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const handleChangeRepoClick = () => setShowChangeWarning(true);
  const confirmChangeRepo = () => handleSelection(null, null);

  return (
    <main className="h-screen overflow-hidden flex flex-col items-center px-8 pt-6 pb-6">
      <div className={`w-full flex flex-col h-full transition-all duration-500 ${selectedBranch ? 'max-w-7xl' : 'max-w-5xl'}`}>

        {selectedBranch ? (
          /* Compact header when in requirements mode */
          <header className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-primary-dark" />
              <h1 className="text-xl font-extrabold text-primary-dark tracking-tight">Jira Story Creator</h1>
            </div>
            <a
              href="/monitor"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#49225B] bg-[#F5EBFA] hover:bg-[#E7DBEF] rounded-lg transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Monitor
            </a>
          </header>
        ) : (
          /* Full header on landing */
          <header className="text-center space-y-4 py-8 relative flex-shrink-0">
            <div className="inline-flex items-center justify-center p-3 bg-primary-mist/50 rounded-2xl mb-2 backdrop-blur-sm">
              <Sparkles className="w-6 h-6 text-primary-dark mr-2" />
              <span className="text-primary-dark font-medium tracking-wide text-sm uppercase">AI-Powered Workflow</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-primary-dark tracking-tight leading-tight">
              Jira Story Creator
            </h1>
            <p className="text-xl text-primary/80 max-w-2xl mx-auto font-light leading-relaxed">
              Transform your ideas into comprehensive Jira user stories with intelligent automation and precision.
            </p>
            <a
              href="/monitor"
              className="absolute right-0 top-8 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#49225B] bg-[#F5EBFA] hover:bg-[#E7DBEF] rounded-lg transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Monitor
            </a>
          </header>
        )}

        {!selectedBranch ? (
          /* Step 1 — Repo selector */
          <div className="flex-1 flex items-start justify-center">
            <div className="w-full card shadow-[0_8px_30px_rgba(73,34,91,0.12)] border-none ring-1 ring-primary/5">
              <div className="h-1.5 w-full bg-primary-mist/30">
                <div
                  className="h-full bg-gradient-to-r from-primary-light via-primary to-primary-dark transition-all duration-700 ease-out rounded-r-full"
                  style={{ width: '50%' }}
                />
              </div>
              <div className="p-8 md:p-12">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3 mb-8">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#6E3482] text-white text-sm font-bold">1</span>
                  Select Repository &amp; Branch
                </h2>
                <div className="max-w-xl mx-auto py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <RepoSelector onSelect={handleSelection} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Step 2 — Requirements: two-column layout filling remaining height */
          <div className="flex-1 flex gap-6 items-start overflow-hidden min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Left sidebar */}
            <div className="w-56 flex-shrink-0 overflow-y-auto">
              <div className="rounded-xl border border-[#E7DBEF] bg-white shadow-[0_4px_20px_rgba(73,34,91,0.08)] p-5 space-y-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#49225B]/50 mb-3">
                    Active Context
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5">
                      <FolderGit2 className="w-4 h-4 text-[#6E3482] mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Repository</p>
                        <p className="text-sm font-semibold text-slate-800 leading-tight mt-0.5 truncate">{selectedRepo?.name}</p>
                        <p className="text-xs text-slate-400 truncate">{selectedRepo?.owner.login}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <GitBranch className="w-4 h-4 text-[#6E3482] mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Branch</p>
                        <code className="text-sm font-mono text-slate-800 leading-tight mt-0.5 block truncate">{selectedBranch}</code>
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-[#E7DBEF]" />

                {showChangeWarning ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 leading-relaxed">
                        This will clear your current conversation and stories.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={confirmChangeRepo}
                        className="flex-1 px-3 py-2 text-xs font-medium text-white bg-[#6E3482] hover:bg-[#49225B] rounded-lg transition-colors"
                      >
                        Yes, change
                      </button>
                      <button
                        onClick={() => setShowChangeWarning(false)}
                        className="flex-1 px-3 py-2 text-xs font-medium text-[#49225B] bg-[#F5EBFA] hover:bg-[#E7DBEF] rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleChangeRepoClick}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-[#49225B] bg-[#F5EBFA] hover:bg-[#E7DBEF] rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Change Repo
                  </button>
                )}
              </div>
            </div>

            {/* Main content — fills remaining height */}
            <div className="flex-1 min-w-0 h-full flex flex-col min-h-0">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3 mb-5 flex-shrink-0">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#6E3482] text-white text-sm font-bold">2</span>
                Gather Requirements
              </h2>
              <div className="flex-1 min-h-0">
                {selectedRepo && (
                  <RequirementGathering selectedBranch={selectedBranch} selectedRepo={selectedRepo} />
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
