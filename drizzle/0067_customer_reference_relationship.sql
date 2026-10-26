-- New reference metadata is optional; existing customer and contract evidence remains unchanged.
ALTER TABLE public.customers ADD COLUMN reference_relationship varchar(20);
--> statement-breakpoint
ALTER TABLE public.customers ADD CONSTRAINT customers_reference_relationship_check
  CHECK (reference_relationship IS NULL OR reference_relationship IN ('Madre','Padre','Hermano','Hermana','Esposo','Esposa','Otro'));
