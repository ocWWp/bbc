import Link from "next/link";
import { TypePicker } from "./type-picker";

export const metadata = { title: "New memory — BBC" };

export default function NewMemoryPage() {
  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
            <span className="sep">/</span>
            <Link href="/memory">memory</Link>
            <span className="sep">/</span>
            <span className="current">new</span>
          </div>
          <h1 className="page-title">create a memory</h1>
          <p className="page-blurb">
            Pick a type. Agents query by type, so this choice shapes how
            and when the item gets used.
          </p>
        </div>
      </header>

      <TypePicker />
    </div>
  );
}
