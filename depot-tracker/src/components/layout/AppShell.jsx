import { Outlet } from "react-router-dom";
import { SideNav } from "./SideNav";

export function AppShell({ openWarnings, onSignOut }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <SideNav openWarnings={openWarnings} onSignOut={onSignOut} />
      <main className="flex-1 p-4 md:p-6">
        <div className="max-w-app mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
