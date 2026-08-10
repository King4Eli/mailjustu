import type { ReactNode } from "react";
import type { Metadata } from "next";
import "../../webmail/src/index.css";

export const metadata: Metadata = {
  title: "Mailbox",
  icons: { icon: "/webmail/favicon.svg" },
};

export default function WebmailLayout({ children }: { children: ReactNode }) {
  return children;
}
