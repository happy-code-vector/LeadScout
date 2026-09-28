import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Email, postcard, and call script templates with live preview."
      />
      <Placeholder phase={5} />
    </>
  );
}
