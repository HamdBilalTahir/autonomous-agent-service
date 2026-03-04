"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Image from "next/image";
import {
  ChevronDown,
  GitBranch,
  Search,
  Check,
  Loader2,
  Github,
  Book,
  LogOut,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Repo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
}

interface RepoSelectorProps {
  onSelect: (repo: Repo | null, branch: string | null) => void;
}

export default function RepoSelector({ onSelect }: RepoSelectorProps) {
  const { data: session, status, update } = useSession();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [branches, setBranches] = useState<string[]>([]);

  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [defaultBranch, setDefaultBranch] = useState<string | null>(null);

  const [isRepoOpen, setIsRepoOpen] = useState(false);
  const [isBranchOpen, setIsBranchOpen] = useState(false);

  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [branchSearchQuery, setBranchSearchQuery] = useState("");

  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isLoadingMoreRepos, setIsLoadingMoreRepos] = useState(false);
  const [isLoadingMoreBranches, setIsLoadingMoreBranches] = useState(false);

  const [repoError, setRepoError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [reposHasMore, setReposHasMore] = useState(false);
  const [repoPage, setRepoPage] = useState(1);
  const [branchesHasMore, setBranchesHasMore] = useState(false);
  const [branchPage, setBranchPage] = useState(1);

  const repoDropdownRef = useRef<HTMLDivElement>(null);
  const branchDropdownRef = useRef<HTMLDivElement>(null);

  const fetchRepos = useCallback(async (page: number = 1) => {
    if (page === 1) setIsLoadingRepos(true);
    else setIsLoadingMoreRepos(true);
    setRepoError(null);
    try {
      const response = await fetch(`/api/user/repos?page=${page}`);
      if (response.status === 401) {
        setRepoError("session_expired");
        return;
      }
      const data = await response.json();
      if (data.repos) {
        setRepos((prev) =>
          page === 1 ? data.repos : [...prev, ...data.repos],
        );
        setReposHasMore(data.hasMore ?? false);
        setRepoPage(page);
      }
    } catch {
      setRepoError("fetch_failed");
    } finally {
      setIsLoadingRepos(false);
      setIsLoadingMoreRepos(false);
    }
  }, []);

  const fetchBranches = useCallback(async (repo: Repo, page: number = 1) => {
    if (page === 1) setIsLoadingBranches(true);
    else setIsLoadingMoreBranches(true);
    setBranchError(null);
    try {
      const response = await fetch(
        `/api/repos/${repo.owner.login}/${repo.name}/branches?page=${page}`,
      );
      if (response.status === 401) {
        setBranchError("session_expired");
        return;
      }
      const data = await response.json();
      if (data.branches) {
        setBranches((prev) =>
          page === 1 ? data.branches : [...prev, ...data.branches],
        );
        setBranchesHasMore(data.hasMore ?? false);
        setBranchPage(page);
        if (page === 1 && data.defaultBranch) {
          setDefaultBranch(data.defaultBranch);
          setSelectedBranch(data.defaultBranch); // pre-select visually, not confirmed yet
        }
      }
    } catch {
      setBranchError("fetch_failed");
    } finally {
      setIsLoadingBranches(false);
      setIsLoadingMoreBranches(false);
    }
  }, []);

  const openSignInPopup = useCallback(() => {
    const width = 600;
    const height = 700;
    const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - height) / 2);

    const popup = window.open(
      "/auth/signin-popup",
      "github-signin",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      signIn("github");
      return;
    }

    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "GITHUB_AUTH_SUCCESS") {
        window.removeEventListener("message", onMessage);
        popup.close();
        await update();
        fetchRepos(1);
      }
    };

    window.addEventListener("message", onMessage);
  }, [update, fetchRepos]);

  // Fetch repos on auth
  useEffect(() => {
    if (status === "authenticated") {
      fetchRepos(1);
    }
  }, [status, fetchRepos]);

  // Fetch branches when repo changes
  useEffect(() => {
    if (selectedRepo) {
      setBranches([]);
      setSelectedBranch(null);
      setDefaultBranch(null);
      setBranchPage(1);
      fetchBranches(selectedRepo, 1);
    } else {
      setBranches([]);
      setSelectedBranch(null);
      setDefaultBranch(null);
    }
  }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle outside clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        repoDropdownRef.current &&
        !repoDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRepoOpen(false);
      }
      if (
        branchDropdownRef.current &&
        !branchDropdownRef.current.contains(event.target as Node)
      ) {
        setIsBranchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRepoSelect = (repo: Repo) => {
    setSelectedRepo(repo);
    setIsRepoOpen(false);
  };

  const handleBranchSelect = (branch: string) => {
    setSelectedBranch(branch);
    setIsBranchOpen(false);
  };

  const handleConfirm = () => {
    if (selectedRepo && selectedBranch) {
      onSelect(selectedRepo, selectedBranch);
    }
  };

  const filteredRepos = repos.filter((repo) =>
    repo.full_name.toLowerCase().includes(repoSearchQuery.toLowerCase()),
  );

  const filteredBranches = branches.filter((branch) =>
    branch.toLowerCase().includes(branchSearchQuery.toLowerCase()),
  );

  if (status === "loading") {
    return (
      <div className="w-full flex justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="w-full text-center">
        <button
          onClick={() => openSignInPopup()}
          className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-[#24292F] hover:bg-[#24292F]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#24292F] transition-all shadow-md hover:shadow-lg"
        >
          <Github className="w-5 h-5 mr-2" />
          Sign in with GitHub
        </button>
        <p className="mt-3 text-sm text-slate-500">
          Connect your GitHub account to access your repositories.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Image
            src={session?.user?.image || ""}
            alt={session?.user?.name || "User"}
            width={32}
            height={32}
            className="rounded-full border border-slate-200"
          />
          <div className="text-sm">
            <p className="font-medium text-slate-900">{session?.user?.name}</p>
            <p className="text-slate-500 text-xs">{session?.user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="text-xs text-slate-500 hover:text-destructive flex items-center gap-1 transition-colors"
        >
          <LogOut className="w-3 h-3" /> Sign out
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Repo Selector */}
        <div className="relative w-full" ref={repoDropdownRef}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Repository
          </label>
          <button
            onClick={() => setIsRepoOpen(!isRepoOpen)}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 bg-white border rounded-xl shadow-sm transition-all duration-200",
              isRepoOpen
                ? "border-primary ring-2 ring-primary/20 shadow-md"
                : "border-slate-200 hover:border-primary/50 hover:shadow-md",
              "text-left focus:outline-none",
            )}
          >
            <div className="flex items-center gap-3 truncate">
              <div
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  selectedRepo
                    ? "bg-primary/10 text-primary"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                <Book className="w-4 h-4" />
              </div>
              <span
                className={cn(
                  "block truncate font-medium",
                  !selectedRepo && "text-slate-400",
                )}
              >
                {selectedRepo
                  ? selectedRepo.full_name
                  : "Select a repository..."}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-slate-400 transition-transform duration-200",
                isRepoOpen && "rotate-180 text-primary",
              )}
            />
          </button>

          {isRepoOpen && (
            <div className="absolute z-10 w-full mt-2 bg-white border border-primary-mist rounded-xl shadow-[0_8px_30px_rgba(73,34,91,0.12)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
              <div className="p-3 border-b border-primary-mist/50 bg-primary-surface/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                  <input
                    type="text"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-primary-mist rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white/80"
                    placeholder="Search repositories..."
                    value={repoSearchQuery}
                    onChange={(e) => setRepoSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                {isLoadingRepos ? (
                  <div className="flex items-center justify-center py-8 text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary" />
                    <span className="text-sm">Loading repos...</span>
                  </div>
                ) : repoError === "session_expired" ? (
                  <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <p className="text-sm text-slate-600">
                      Session expired. Please reconnect your GitHub account.
                    </p>
                    <button
                      onClick={() => openSignInPopup()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#24292F] rounded-lg hover:bg-[#24292F]/90 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reconnect GitHub
                    </button>
                  </div>
                ) : repoError ? (
                  <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-sm text-slate-600">
                      Failed to load repositories.
                    </p>
                    <button
                      onClick={() => fetchRepos(1)}
                      className="text-sm text-primary hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredRepos.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-sm">
                    No repositories found
                  </div>
                ) : (
                  <>
                    <ul className="py-1">
                      {filteredRepos.map((repo) => (
                        <li key={repo.id}>
                          <button
                            onClick={() => handleRepoSelect(repo)}
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-3 text-sm transition-all border-l-2",
                              selectedRepo?.id === repo.id
                                ? "border-primary bg-primary-surface/50 text-primary-dark font-medium"
                                : "border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-300",
                            )}
                          >
                            <div className="flex items-center gap-3 truncate">
                              <Book
                                className={cn(
                                  "w-4 h-4 flex-shrink-0",
                                  selectedRepo?.id === repo.id
                                    ? "text-primary"
                                    : "text-slate-400",
                                )}
                              />
                              <span className="truncate">{repo.full_name}</span>
                            </div>
                            {selectedRepo?.id === repo.id && (
                              <Check className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {reposHasMore && !repoSearchQuery && (
                      <div className="px-4 py-2 border-t border-slate-100">
                        <button
                          onClick={() => fetchRepos(repoPage + 1)}
                          disabled={isLoadingMoreRepos}
                          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                        >
                          {isLoadingMoreRepos ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                              Loading...
                            </>
                          ) : (
                            "Load more repositories"
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Branch Selector */}
        <div className="relative w-full" ref={branchDropdownRef}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Target Branch
          </label>
          <button
            onClick={() =>
              !(!selectedRepo || isLoadingBranches) &&
              setIsBranchOpen(!isBranchOpen)
            }
            disabled={!selectedRepo || isLoadingBranches}
            className={cn(
              "w-full flex items-center justify-between px-4 py-3 bg-white border rounded-xl shadow-sm transition-all duration-200",
              isBranchOpen
                ? "border-primary ring-2 ring-primary/20 shadow-md"
                : "border-slate-200 hover:border-primary/50 hover:shadow-md",
              "text-left focus:outline-none",
              (!selectedRepo || isLoadingBranches) &&
                "opacity-50 cursor-not-allowed bg-slate-50",
            )}
          >
            <div className="flex items-center gap-3 truncate">
              <div
                className={cn(
                  "p-1.5 rounded-md transition-colors",
                  selectedBranch
                    ? "bg-primary/10 text-primary"
                    : "bg-slate-100 text-slate-500",
                )}
              >
                {isLoadingBranches ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GitBranch className="w-4 h-4" />
                )}
              </div>
              <span
                className={cn(
                  "block truncate font-medium",
                  !selectedBranch && "text-slate-400",
                )}
              >
                {isLoadingBranches
                  ? "Loading branches..."
                  : selectedBranch || "Select a branch..."}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-slate-400 transition-transform duration-200",
                isBranchOpen && "rotate-180 text-primary",
              )}
            />
          </button>

          {isBranchOpen && (
            <div className="absolute z-10 w-full mt-2 bg-white border border-primary-mist rounded-xl shadow-[0_8px_30px_rgba(73,34,91,0.12)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
              <div className="p-3 border-b border-primary-mist/50 bg-primary-surface/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
                  <input
                    type="text"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-primary-mist rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white/80"
                    placeholder="Search branches..."
                    value={branchSearchQuery}
                    onChange={(e) => setBranchSearchQuery(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                {branchError === "session_expired" ? (
                  <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <p className="text-sm text-slate-600">
                      Session expired. Please reconnect your GitHub account.
                    </p>
                    <button
                      onClick={() => openSignInPopup()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#24292F] rounded-lg hover:bg-[#24292F]/90 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reconnect GitHub
                    </button>
                  </div>
                ) : branchError ? (
                  <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-sm text-slate-600">
                      Failed to load branches.
                    </p>
                    <button
                      onClick={() =>
                        selectedRepo && fetchBranches(selectedRepo, 1)
                      }
                      className="text-sm text-primary hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredBranches.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-sm">
                    No branches found
                  </div>
                ) : (
                  <>
                    <ul className="py-1">
                      {filteredBranches.map((branch) => (
                        <li key={branch}>
                          <button
                            onClick={() => handleBranchSelect(branch)}
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-3 text-sm transition-all border-l-2",
                              selectedBranch === branch
                                ? "border-primary bg-primary-surface/50 text-primary-dark font-medium"
                                : "border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-300",
                            )}
                          >
                            <div className="flex items-center gap-3 truncate">
                              <GitBranch
                                className={cn(
                                  "w-4 h-4 flex-shrink-0",
                                  selectedBranch === branch
                                    ? "text-primary"
                                    : "text-slate-400",
                                )}
                              />
                              <span className="truncate">{branch}</span>
                              {branch === defaultBranch && (
                                <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-normal">
                                  default
                                </span>
                              )}
                            </div>
                            {selectedBranch === branch && (
                              <Check className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {branchesHasMore && !branchSearchQuery && (
                      <div className="px-4 py-2 border-t border-slate-100">
                        <button
                          onClick={() =>
                            selectedRepo &&
                            fetchBranches(selectedRepo, branchPage + 1)
                          }
                          disabled={isLoadingMoreBranches}
                          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                        >
                          {isLoadingMoreBranches ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                              Loading...
                            </>
                          ) : (
                            "Load more branches"
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedRepo && selectedBranch && (
        <div className="mt-6">
          <button
            onClick={handleConfirm}
            className="btn-primary w-full py-3 px-6 text-base rounded-xl justify-center"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
