"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  FileText,
  House,
  Link2,
  PenSquare,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const items = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/drafts", label: "Drafts", icon: PenSquare },
  { href: "/curate", label: "URL to Post", icon: Link2 },
  { href: "/scheduler", label: "Scheduler", icon: Calendar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/error-log", label: "Error Log", icon: AlertTriangle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image
              src="/logo.jpeg"
              alt="A to Z Flooring Solutions"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-sm font-bold tracking-tight text-sidebar-foreground group-hover:text-brand-teal transition-colors">
              AtoZ Publisher
            </span>
          </Link>
          <SidebarTrigger />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40">
            Workspace
          </SidebarGroupLabel>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={pathname === item.href}
                  tooltip={item.label}
                  render={
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-brand-jade animate-pulse" />
          <span className="text-[10px] text-sidebar-foreground/50">
            A to Z Flooring Solutions
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
