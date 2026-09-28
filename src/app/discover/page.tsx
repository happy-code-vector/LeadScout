import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function DiscoverPage() {
  return (
    <>
      <PageHeader
        title="Discover"
        description="Find businesses by category and area with the Google Places API."
      />
      <Placeholder phase={2} />
    </>
  );
}
