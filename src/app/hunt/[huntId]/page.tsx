import { redirect } from "next/navigation";

// Keep legacy route working but steer users to /hunts for gameplay.
export default async function Page({
  params,
}: {
  params: Promise<{ huntId: string }>;
}) {
  const { huntId } = await params;
  redirect(`/hunts?h=${encodeURIComponent(huntId)}`);
}

