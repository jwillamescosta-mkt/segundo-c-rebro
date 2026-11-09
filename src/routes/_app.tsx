import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppProvider } from "@/components/brain/app-context";
import { AppShell } from "@/components/brain/AppShell";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/entrar" });
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </AppProvider>
  );
}
