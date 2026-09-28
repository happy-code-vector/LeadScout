import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function CategoriesPage() {
  return (
    <>
      <PageHeader
        title="Categories"
        description="What to search for, and how likely each trade is to buy."
      />
      <Placeholder phase={2} />
    </>
  );
}
