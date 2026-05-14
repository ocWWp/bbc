import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { buildGallery } from "@/lib/studio/gallery";
import GalleryClient from "./GalleryClient";

export const metadata = {
  title: "Gallery · BBC",
};

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const a = await requireActor();
  if (!a.ok) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/gallery")}`);
  }
  return <GalleryClient templates={buildGallery()} />;
}
