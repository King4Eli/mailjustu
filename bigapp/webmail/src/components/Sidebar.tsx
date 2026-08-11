import { useState } from "react";
import {
  Inbox,
  Star,
  Send,
  FileText,
  Archive,
  ShieldAlert,
  Trash2,
  Pencil,
  Mail,
  Plus,
  AtSign,
  ChevronRight,
  ChevronDown,
  Folder,
  X,
  RefreshCw,
  Clock,
  Filter,
  Ban,
} from "lucide-react";
import type { FolderInfo } from "../types";
import type { ApiAlias } from "../api";
import { formatBytes } from "../utils";

const ICONS: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  "\\Inbox": Inbox,
  "\\Sent": Send,
  "\\Drafts": FileText,
  "\\Junk": ShieldAlert,
  "\\Trash": Trash2,
  "\\Archive": Archive,
  starred: Star,
  snoozed: Clock,
};

const PSEUDO_FOLDER_IDS = new Set(["STARRED", "SNOOZED"]);

function isCustomFolder(folder: FolderInfo) {
  return !PSEUDO_FOLDER_IDS.has(folder.id) && !ICONS[folder.icon];
}

interface SidebarProps {
  folders: FolderInfo[];
  activeFolder: string;
  onSelectFolder: (id: string) => void;
  onCompose: () => void;
  open: boolean;
  onClose: () => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (path: string) => void;
  onOpenAliases: () => void;
  onOpenFilters: () => void;
  onOpenBlockList: () => void;
  usage: { usedBytes: number | null; quotaMb: number | null } | null;
  aliases: ApiAlias[];
  activeAlias: string | null;
  onSelectAlias: (source: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export function Sidebar({
  folders,
  activeFolder,
  onSelectFolder,
  onCompose,
  open,
  onClose,
  onCreateFolder,
  onDeleteFolder,
  onOpenAliases,
  onOpenFilters,
  onOpenBlockList,
  usage,
  aliases,
  activeAlias,
  onSelectAlias,
  onRefresh,
  refreshing,
}: SidebarProps) {
  const [customFoldersOpen, setCustomFoldersOpen] = useState(false);
  const [aliasesFilterOpen, setAliasesFilterOpen] = useState(false);

  function handleNewFolder() {
    const name = window.prompt("New folder name");
    if (name && name.trim()) onCreateFolder(name.trim());
  }

  function handleDeleteFolder(folder: FolderInfo) {
    if (folder.messages > 0) {
      window.alert(
        `"${folder.name}" isn't empty (${folder.messages} message${folder.messages === 1 ? "" : "s"}). Move or delete its messages first.`,
      );
      return;
    }
    if (window.confirm(`Delete folder "${folder.name}"?`))
      onDeleteFolder(folder.id);
  }

  function renderFolderRow(folder: FolderInfo) {
    const Icon = ICONS[folder.icon] || Inbox;
    const isActive = folder.id === activeFolder;
    const count = folder.unseen;
    const isCustom = isCustomFolder(folder);
    return (
      <div
        key={folder.id}
        className="group flex items-center rounded-lg"
        style={{ background: isActive ? "var(--bg-selected)" : "transparent" }}
      >
        <button
          onClick={() => {
            onSelectFolder(folder.id);
            onClose();
          }}
          className="flex flex-1 items-center gap-3 px-3 py-2 text-sm transition"
          style={{
            color: isActive ? "var(--accent)" : "var(--text-muted)",
            fontWeight: isActive ? 600 : 500,
          }}
          onMouseEnter={(e) => {
            if (!isActive)
              e.currentTarget.parentElement!.style.background =
                "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (!isActive)
              e.currentTarget.parentElement!.style.background = "transparent";
          }}
        >
          <Icon size={17} />
          <span className="flex-1 truncate text-left">{folder.name}</span>
          {count > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-xs font-semibold"
              style={{
                background: isActive ? "var(--accent)" : "var(--bg-hover)",
                color: isActive ? "white" : "var(--text-muted)",
              }}
            >
              {count}
            </span>
          )}
        </button>
        {isCustom && (
          <button
            onClick={() => handleDeleteFolder(folder)}
            className="hidden pr-2 group-hover:block"
            style={{ color: "var(--text-faint)" }}
            title={`Delete ${folder.name}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    );
  }

  const standardFolders = folders.filter((f) => !isCustomFolder(f));
  const customFolders = folders.filter(isCustomFolder);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed z-40 flex h-full w-64 flex-col gap-1 border-r p-3 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
        }}
      >
        <div className="mb-4 flex items-center gap-2 px-2 py-1">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
            style={{ background: "var(--accent)" }}
          >
            <Mail size={18} />
          </div>
          <span
            className="text-lg font-semibold"
            style={{ color: "var(--text)" }}
          >
            Mailbox
          </span>
          <div className="flex-1" />
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
            className="rounded-lg p-1.5 transition disabled:opacity-50"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--bg-hover)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <button
          onClick={onCompose}
          className="mb-4 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
          style={{ background: "var(--accent)" }}
        >
          <Pencil size={16} />
          Compose
        </button>

        <nav className="flex flex-col gap-0.5 overflow-y-auto">
          {standardFolders.map(renderFolderRow)}

          <div className="mt-2 flex items-center gap-0.5">
            <button
              onClick={() => setCustomFoldersOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {customFoldersOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <Folder size={14} />
              <span className="flex-1 text-left">Folders</span>
              {customFolders.length > 0 && <span>{customFolders.length}</span>}
            </button>
            <button
              onClick={handleNewFolder}
              title="New folder"
              className="rounded-lg p-1.5 transition"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <Plus size={14} />
            </button>
          </div>
          {customFoldersOpen && (
            <div className="flex flex-col gap-0.5 pl-2">
              {customFolders.map(renderFolderRow)}
              {customFolders.length === 0 && (
                <p
                  className="px-3 py-1 text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  No folders yet.
                </p>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-0.5">
            <button
              onClick={() => setAliasesFilterOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              {aliasesFilterOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <AtSign size={14} />
              <span className="flex-1 text-left">Aliases</span>
              {aliases.length > 0 && <span>{aliases.length}</span>}
            </button>
            <button
              onClick={onOpenAliases}
              title="Manage aliases"
              className="rounded-lg p-1.5 transition"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <Plus size={14} />
            </button>
          </div>
          {aliasesFilterOpen && (
            <div className="flex flex-col gap-0.5 pl-2">
              {aliases.map((alias) => {
                const isActive = activeAlias === alias.source;
                return (
                  <button
                    key={alias.id}
                    onClick={() => onSelectAlias(alias.source)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition"
                    style={{
                      background: isActive
                        ? "var(--bg-selected)"
                        : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-muted)",
                      fontWeight: isActive ? 600 : 500,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background = "transparent";
                    }}
                    title={
                      isActive
                        ? `Showing only mail to ${alias.source} -- click to clear`
                        : `Show only mail to ${alias.source}`
                    }
                  >
                    <span className="flex-1 truncate text-left">
                      {alias.source}
                    </span>
                    {isActive && <X size={13} />}
                  </button>
                );
              })}
              {aliases.length === 0 && (
                <p
                  className="px-3 py-1 text-xs"
                  style={{ color: "var(--text-faint)" }}
                >
                  No aliases yet.
                </p>
              )}
            </div>
          )}
        </nav>

        <div
          className="mt-auto flex flex-col gap-2 border-t px-2 pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={onOpenFilters}
            className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            <Filter size={15} />
            <span>Mail filters</span>
          </button>
          <button
            onClick={onOpenBlockList}
            className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            <Ban size={15} />
            <span>Allow &amp; block lists</span>
          </button>
          {usage?.usedBytes != null && (
            <div className="px-1 py-1">
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--text-faint)" }}
              >
                <span>Storage</span>
                <span>
                  {formatBytes(usage.usedBytes)} of {usage.quotaMb ?? "?"} MB
                </span>
              </div>
              <div
                className="mt-1 h-1 overflow-hidden rounded-full"
                style={{ background: "var(--bg-hover)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (usage.usedBytes / ((usage.quotaMb ?? 1024) * 1024 * 1024)) * 100)}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
