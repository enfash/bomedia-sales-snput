import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="max-w-md w-full space-y-8 text-center bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white mx-auto flex items-center justify-center shadow-md overflow-hidden border border-gray-100">
            <Image src="/bomedia-icon.svg" alt="BOMedia Logo" width={64} height={64} className="object-contain" />
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
            <Button size="lg" className="w-full text-lg h-14 bg-brand-700 hover:bg-brand-800 shadow-md transition-all">
              Start Recording (Cashier)
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
