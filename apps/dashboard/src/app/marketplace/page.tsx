import { redirect } from "next/navigation";

// Pre-launch audit cleanup: /marketplace was a read-only duplicate of
// the /library Providers tab. After PR #20 wired real yaml into /library,
// keeping both routes was confusing. /marketplace now permanent-redirects
// to /library?tab=providers. Restore as a distinct route only if a
// distinct purpose emerges.
export default function MarketplacePage() {
  redirect("/library?tab=providers");
}
