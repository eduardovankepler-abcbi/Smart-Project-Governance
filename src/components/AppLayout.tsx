import { Outlet } from "react-router-dom";
import Sidebar from "@/components/Sidebar";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-60 min-h-screen">
        <div className="min-h-screen px-4 py-4 md:px-5 md:py-5">
          <div className="section-shell min-h-[calc(100vh-2rem)] overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
