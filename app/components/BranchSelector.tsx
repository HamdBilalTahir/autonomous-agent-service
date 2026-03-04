"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, GitBranch, Search, Check, Loader2 } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BranchSelectorProps {
  onSelect?: (branch: string) => void;
}

export default function BranchSelector({ onSelect }: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchBranches = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/branches");
        const data = await response.json();
        if (data.branches) {
          setBranches(data.branches);
        }
      } catch (error) {
        console.error("Failed to fetch branches:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranches();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredBranches = branches.filter((branch) =>
    branch.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSelect = (branch: string) => {
    setSelectedBranch(branch);
    setIsOpen(false);
    if (onSelect) {
      onSelect(branch);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        Source Branch
      </label>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 bg-white border rounded-xl shadow-sm transition-all duration-200",
          isOpen
            ? "border-primary ring-2 ring-primary/20 shadow-md"
            : "border-slate-200 hover:border-primary/50 hover:shadow-md",
          "text-left focus:outline-none",
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
            <GitBranch className="w-4 h-4" />
          </div>
          <span
            className={cn(
              "block truncate font-medium",
              !selectedBranch && "text-slate-400",
            )}
          >
            {selectedBranch || "Select a branch..."}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-slate-400 transition-transform duration-200",
            isOpen && "rotate-180 text-primary",
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-primary-mist rounded-xl shadow-[0_8px_30px_rgba(73,34,91,0.12)] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
          <div className="p-3 border-b border-primary-mist/50 bg-primary-surface/30">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/50" />
              <input
                type="text"
                className="w-full pl-9 pr-4 py-2 text-sm border border-primary-mist rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white/80"
                placeholder="Search branches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary" />
                <span className="text-sm">Loading branches...</span>
              </div>
            ) : filteredBranches.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                No branches found
              </div>
            ) : (
              <ul className="py-1">
                {filteredBranches.map((branch) => (
                  <li key={branch}>
                    <button
                      onClick={() => handleSelect(branch)}
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
                            "w-4 h-4",
                            selectedBranch === branch
                              ? "text-primary"
                              : "text-slate-400",
                          )}
                        />
                        <span className="truncate">{branch}</span>
                      </div>
                      {selectedBranch === branch && (
                        <Check className="w-4 h-4 text-primary" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
