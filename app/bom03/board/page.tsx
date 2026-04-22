"use client";

import { JobBoard } from "@/components/job-board";

export default function AdminBoardPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Production Board</h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-1 font-medium">Track and manage jobs across production stages.</p>
        </div>
      </div>
      
      <JobBoard isAdmin={true} />
    </div>
  );
}
