import type { ReactNode } from "react";
import type { Metadata } from "next";
import "../../admin/src/styles.css";

export const metadata: Metadata = {
  title: "Postmaster — Mail Server Admin",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
