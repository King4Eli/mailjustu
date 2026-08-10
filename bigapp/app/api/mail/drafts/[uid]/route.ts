import { NextRequest } from "next/server";
import { withImap } from "@/lib/api/imap";
import { requireSession } from "@/lib/api/auth";
import { withApiErrors } from "@/lib/api/handler";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  return withApiErrors(async () => {
    const { email, password } = requireSession(req);
    const folder = req.nextUrl.searchParams.get("folder") || "Drafts";
    const uid = Number((await params).uid);
    await withImap(email, password, async (client) => {
      await client.mailboxOpen(folder);
      await client.messageDelete({ uid }, { uid: true });
    });
    return Response.json({ ok: true });
  });
}
