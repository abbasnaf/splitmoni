import { GroupCreator } from "@/components/group-creator";
import { ThemeToggle } from "@/components/theme-provider";

export default function Page() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <ThemeToggle className="theme-toggle-floating" />
      <div className="mx-auto max-w-3xl">
        <GroupCreator />
      </div>
    </div>
  );
}
