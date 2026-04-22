"use client";

import { JobBoard } from "@/components/job-board";

export default function CashierBoardPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Job Board</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 font-medium">Track sales jobs through production.</p>
        </div>
      </div>
      
      <JobBoard isAdmin={false} />
    </div>
  );
}
