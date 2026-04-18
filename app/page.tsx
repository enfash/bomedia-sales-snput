import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="max-w-md w-full space-y-8 text-center bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500 mx-auto flex items-center justify-center text-white font-bold text-2xl shadow-md">
            B
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Welcome to Broad Options Media
          </h1>
          <p className="text-lg text-gray-500">
            Sales Daily Recording System
          </p>
        </div>

        <div className="pt-8">
          <Link href="/cashier" className="w-full inline-block">
            <Button size="lg" className="w-full text-lg h-14 bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all">
              Start Recording (Cashier)
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
